import crypto from 'node:crypto';
import https from 'node:https';
import { errores } from '../../errores';
import { registrarIntegracion } from '../../utils/log-integracion';
import {
  interpretarEventoStripe,
  type ConsultaIntento,
  type ConsultaSesion,
  type DatosCheckout,
  type DatosIntento,
  type IntentoPago,
  type EventoPasarela,
  type PasarelaPago,
  type ResultadoReembolso,
  type SesionCheckout,
} from './pasarela';

/**
 * INVOCACIÓN A SERVICIO EXTERNO: API REST de Stripe (https://docs.stripe.com/api).
 *
 * Endpoints de Stripe que consume este microservicio:
 *   POST /v1/checkout/sessions               -> crear el checkout (url que ve el usuario)
 *   GET  /v1/checkout/sessions/{id}          -> consultar si se pagó (polling de respaldo)
 *   POST /v1/checkout/sessions/{id}/expire   -> anular un checkout aún no pagado
 *   POST /v1/refunds                         -> reembolsar un pago aprobado
 *   POST /v1/payment_intents                 -> cobro con el formulario propio del front (Elements)
 *   GET  /v1/payment_intents/{id}            -> consultar si el cobro del formulario se completó
 *   POST /v1/payment_intents/{id}/cancel     -> anular un cobro del formulario aún no pagado
 * Y recibe el webhook firmado (header Stripe-Signature).
 *
 * Importante: CLP es una moneda sin decimales en Stripe, por eso unit_amount = monto
 * (NO se multiplica por 100).
 *
 * Cada llamada queda en el log ([integración] Stripe …) con su resultado y duración. Las creaciones llevan
 * Idempotency-Key, así que ante una falla de red o un tiempo de espera agotado se reintentan una vez sin
 * riesgo de cobro doble. Un monto que Stripe no acepta (p. ej. menor al mínimo de ~50 centavos de dólar)
 * responde 422 MONTO_NO_PERMITIDO en vez de 502.
 *
 * Latencia: Entradas espera a lo más 2000 ms por POST /transacciones (contrato), y desde el workstation abrir una
 * conexión TLS nueva con Stripe toma ~1 s. Por eso la conexión con Stripe se mantiene abierta (keep-alive) y se
 * "calienta" al arrancar y cada 20 s: así crear el PaymentIntent tarda lo que procesa Stripe, no el saludo TLS.
 */

type Fetch = typeof fetch;

/** Conexiones persistentes con Stripe (se reutiliza el saludo TCP/TLS entre llamadas). */
const agenteStripe = new https.Agent({ keepAlive: true, keepAliveMsecs: 15_000, maxSockets: 20 });

/** fetch mínimo sobre node:https con keep-alive (el fetch global cierra la conexión tras ~4 s sin uso). */
export function fetchConConexionPersistente(agente: https.Agent = agenteStripe): Fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const cuerpo = init?.body == null ? undefined : String(init.body);
    const headers: Record<string, string | number> = { ...((init?.headers ?? {}) as Record<string, string>) };
    if (cuerpo !== undefined) headers['Content-Length'] = Buffer.byteLength(cuerpo);
    return new Promise<Response>((resolve, reject) => {
      const req = https.request(
        new URL(String(url)),
        { method: init?.method ?? 'GET', headers, agent: agente, signal: init?.signal ?? undefined },
        (res) => {
          const partes: Buffer[] = [];
          res.on('data', (c: Buffer) => partes.push(c));
          res.on('error', reject);
          res.on('end', () =>
            resolve(
              new Response(Buffer.concat(partes), {
                status: res.statusCode ?? 502,
                headers: { 'Content-Type': String(res.headers['content-type'] ?? 'application/json') },
              }),
            ),
          );
        },
      );
      req.on('error', reject);
      if (cuerpo !== undefined) req.write(cuerpo);
      req.end();
    });
  }) as Fetch;
}

export interface OpcionesStripe {
  secretKey: string;
  webhookSecret: string;
  timeoutMs: number;
  urlExito: string;
  urlCancelacion: string;
  /** Correo que se muestra ya completado en el checkout (CHECKOUT_EMAIL_DEFECTO). */
  emailPorDefecto?: string;
  /** Tolerancia de la marca de tiempo del webhook, en segundos (Stripe recomienda 300). */
  toleranciaWebhookSeg?: number;
  fetchImpl?: Fetch;
  apiBase?: string;
  /** false = no mantener la conexión caliente (por defecto se mantiene). */
  mantenerConexion?: boolean;
}

/** Codifica objetos anidados con la notación de formularios de Stripe: a[b][0][c]=valor */
export function codificarFormulario(datos: Record<string, unknown>, prefijo = ''): string[] {
  const pares: string[] = [];
  for (const [clave, valor] of Object.entries(datos)) {
    if (valor === undefined || valor === null) continue;
    const nombre = prefijo ? `${prefijo}[${clave}]` : clave;
    if (Array.isArray(valor)) {
      valor.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) {
          pares.push(...codificarFormulario(item as Record<string, unknown>, `${nombre}[${i}]`));
        } else {
          pares.push(`${encodeURIComponent(`${nombre}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof valor === 'object') {
      pares.push(...codificarFormulario(valor as Record<string, unknown>, nombre));
    } else {
      pares.push(`${encodeURIComponent(nombre)}=${encodeURIComponent(String(valor))}`);
    }
  }
  return pares;
}

export class StripePasarela implements PasarelaPago {
  readonly nombre = 'stripe' as const;
  private readonly fetch: Fetch;
  private readonly apiBase: string;

  constructor(private readonly opciones: OpcionesStripe) {
    this.fetch = opciones.fetchImpl ?? fetchConConexionPersistente();
    this.apiBase = opciones.apiBase ?? 'https://api.stripe.com/v1';
    if (!opciones.fetchImpl && opciones.mantenerConexion !== false) {
      // Deja lista la conexión TLS al arrancar y la mantiene abierta (petición sin llave: Stripe responde 401 sin costo).
      const calentar = () =>
        this.fetch(this.apiBase, { method: 'GET', signal: AbortSignal.timeout(5000) })
          .then((r) => r.arrayBuffer())
          .catch(() => undefined);
      void calentar();
      setInterval(calentar, 20_000).unref();
    }
  }

  async crearCheckout(datos: DatosCheckout): Promise<SesionCheckout> {
    const sesion = await this.llamar('POST', '/checkout/sessions', {
      mode: 'payment',
      customer_email: this.opciones.emailPorDefecto || undefined,
      client_reference_id: datos.id_pago,
      expires_at: Math.floor(datos.expira_en.getTime() / 1000),
      success_url: `${this.opciones.urlExito}?id_pago=${datos.id_pago}`,
      cancel_url: `${this.opciones.urlCancelacion}?id_pago=${datos.id_pago}`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'clp',
            unit_amount: datos.monto,
            product_data: {
              name: `Entradas TicketU (${datos.cantidad_entradas})`,
              description: datos.id_evento ? `Evento ${datos.id_evento} - reserva ${datos.id_reserva}` : `Reserva ${datos.id_reserva}`,
            },
          },
        },
      ],
      metadata: { id_pago: datos.id_pago, id_reserva: datos.id_reserva, id_evento: datos.id_evento ?? undefined },
      payment_intent_data: { metadata: { id_pago: datos.id_pago, id_reserva: datos.id_reserva } },
    }, `pagos-checkout-${datos.id_pago}`);
    if (typeof sesion.id !== 'string' || typeof sesion.url !== 'string') {
      throw errores.pasarela('Stripe no devolvió la URL de checkout');
    }
    const expira = typeof sesion.expires_at === 'number' ? new Date(sesion.expires_at * 1000) : datos.expira_en;
    return { id: sesion.id, url: sesion.url, expira_en: expira };
  }

  async consultarSesion(sesionId: string): Promise<ConsultaSesion> {
    const sesion = await this.llamar('GET', `/checkout/sessions/${encodeURIComponent(sesionId)}`);
    const intent = typeof sesion.payment_intent === 'string' ? sesion.payment_intent : null;
    if (sesion.status === 'complete' && sesion.payment_status === 'paid') {
      return { estado: 'PAGADA', payment_intent_id: intent };
    }
    if (sesion.status === 'expired') return { estado: 'EXPIRADA', payment_intent_id: intent };
    return { estado: 'ABIERTA', payment_intent_id: intent };
  }

  async expirarSesion(sesionId: string): Promise<void> {
    await this.llamar('POST', `/checkout/sessions/${encodeURIComponent(sesionId)}/expire`, {});
  }

  async crearIntento(datos: DatosIntento): Promise<IntentoPago> {
    const intento = await this.llamar('POST', '/payment_intents', {
      amount: datos.monto,
      currency: 'clp',
      payment_method_types: ['card'],
      description: `Entradas TicketU (${datos.cantidad_entradas})${datos.id_evento ? ` - evento ${datos.id_evento}` : ''} - reserva ${datos.id_reserva}`,
      receipt_email: this.opciones.emailPorDefecto || undefined,
      metadata: { id_pago: datos.id_pago, id_reserva: datos.id_reserva, id_evento: datos.id_evento ?? undefined },
    }, `pagos-intento-${datos.id_pago}`);
    if (typeof intento.id !== 'string' || typeof intento.client_secret !== 'string') {
      throw errores.pasarela('Stripe no devolvió el client_secret del PaymentIntent');
    }
    return { id: intento.id, client_secret: intento.client_secret };
  }

  async consultarIntento(intentoId: string): Promise<ConsultaIntento> {
    const intento = await this.llamar('GET', `/payment_intents/${encodeURIComponent(intentoId)}`);
    const clientSecret = typeof intento.client_secret === 'string' ? intento.client_secret : null;
    if (intento.status === 'succeeded') return { estado: 'PAGADA', payment_intent_id: intentoId, client_secret: clientSecret };
    if (intento.status === 'canceled') return { estado: 'EXPIRADA', payment_intent_id: intentoId, client_secret: clientSecret };
    return { estado: 'ABIERTA', payment_intent_id: intentoId, client_secret: clientSecret };
  }

  async cancelarIntento(intentoId: string): Promise<void> {
    await this.llamar('POST', `/payment_intents/${encodeURIComponent(intentoId)}/cancel`, {});
  }

  async reembolsar(datos: { payment_intent_id: string; monto: number; id_pago: string }): Promise<ResultadoReembolso> {
    const reembolso = await this.llamar('POST', '/refunds', {
      payment_intent: datos.payment_intent_id,
      amount: datos.monto,
      reason: 'requested_by_customer',
      metadata: { id_pago: datos.id_pago },
    }, `pagos-reembolso-${datos.id_pago}`);
    if (reembolso.status === 'failed' || reembolso.status === 'canceled') {
      throw errores.pasarela(`El reembolso quedó en estado ${String(reembolso.status)}`);
    }
    return { id: String(reembolso.id), estado: reembolso.status === 'succeeded' ? 'EXITOSO' : 'PENDIENTE' };
  }

  /** Verificación de firma según https://docs.stripe.com/webhooks#verify-manually */
  construirEvento(cuerpoCrudo: Buffer, firma: string | undefined): EventoPasarela {
    if (!firma) throw errores.firmaWebhookInvalida('Falta el header Stripe-Signature');
    const partes = firma.split(',').map((p) => p.trim().split('='));
    const marca = partes.find(([k]) => k === 't')?.[1];
    const firmasV1 = partes.filter(([k]) => k === 'v1').map(([, v]) => v);
    if (!marca || firmasV1.length === 0) throw errores.firmaWebhookInvalida('Header Stripe-Signature mal formado');

    const esperada = crypto
      .createHmac('sha256', this.opciones.webhookSecret)
      .update(`${marca}.${cuerpoCrudo.toString('utf8')}`)
      .digest();
    const valida = firmasV1.some((v) => {
      const recibida = Buffer.from(v, 'hex');
      return recibida.length === esperada.length && crypto.timingSafeEqual(recibida, esperada);
    });
    if (!valida) throw errores.firmaWebhookInvalida('La firma del webhook no coincide');

    const tolerancia = this.opciones.toleranciaWebhookSeg ?? 300;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(marca)) > tolerancia) {
      throw errores.firmaWebhookInvalida('El webhook está fuera de la ventana de tiempo permitida');
    }

    let evento: unknown;
    try {
      evento = JSON.parse(cuerpoCrudo.toString('utf8'));
    } catch {
      throw errores.firmaWebhookInvalida('El cuerpo del webhook no es JSON');
    }
    return interpretarEventoStripe(evento as Parameters<typeof interpretarEventoStripe>[0]);
  }

  private async llamar(
    metodo: 'GET' | 'POST',
    ruta: string,
    cuerpo?: Record<string, unknown>,
    claveIdempotencia?: string,
  ): Promise<Record<string, unknown>> {
    // GET y POST con Idempotency-Key se pueden repetir sin efectos dobles: un reintento ante falla de red.
    const intentos = metodo === 'GET' || claveIdempotencia ? 2 : 1;
    const operacion = `${metodo} ${ruta.replace(/\/(pi|cs|re)_[A-Za-z0-9_]+/g, '/$1_…')}`;
    let ultimoError: Error | null = null;
    for (let intento = 1; intento <= intentos; intento++) {
      const inicio = performance.now();
      let respuesta: Response;
      try {
        respuesta = await this.fetch(`${this.apiBase}${ruta}`, {
          method: metodo,
          headers: {
            Authorization: `Bearer ${this.opciones.secretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(claveIdempotencia ? { 'Idempotency-Key': claveIdempotencia } : {}),
          },
          body: metodo === 'POST' ? codificarFormulario(cuerpo ?? {}).join('&') : undefined,
          signal: AbortSignal.timeout(this.opciones.timeoutMs),
        });
      } catch (error) {
        const causa = (error as { cause?: { name?: string } }).cause;
        const tiempo = (error as Error).name === 'TimeoutError' || causa?.name === 'TimeoutError';
        const motivo = tiempo
          ? `Stripe no respondió en ${this.opciones.timeoutMs} ms (STRIPE_TIMEOUT_MS)`
          : `No se pudo contactar a Stripe (${(error as Error).message || 'sin red'})`;
        registrarIntegracion('Stripe', operacion, `sin respuesta: ${motivo}${intento < intentos ? ' → reintento' : ''}`, inicio);
        ultimoError = errores.pasarela(motivo);
        continue;
      }
      let json: Record<string, unknown> = {};
      try {
        json = (await respuesta.json()) as Record<string, unknown>;
      } catch {
        /* respuesta sin JSON */
      }
      if (respuesta.ok) {
        registrarIntegracion('Stripe', operacion, String(respuesta.status), inicio);
        return json;
      }
      const error = (json.error ?? {}) as { message?: string; code?: string; type?: string };
      const detalle = error.message ?? `HTTP ${respuesta.status}`;
      registrarIntegracion('Stripe', operacion, `${respuesta.status} ${error.code ?? error.type ?? ''}: ${detalle}`.replace(/sk_(test|live)_[A-Za-z0-9]+/g, 'sk_…'), inicio);
      if (error.code === 'amount_too_small' || error.code === 'amount_too_large') {
        throw errores.montoNoPermitido(detalle);
      }
      if (respuesta.status === 401) {
        throw errores.pasarela('Stripe rechazó la llave secreta (revise STRIPE_SECRET_KEY)');
      }
      throw errores.pasarela(detalle.replace(/sk_(test|live)_[A-Za-z0-9]+/g, 'sk_…'));
    }
    throw ultimoError ?? errores.pasarela('No se pudo contactar a Stripe');
  }
}
