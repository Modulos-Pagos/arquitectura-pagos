import crypto from 'node:crypto';
import { errores } from '../../errores';
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
 */

type Fetch = typeof fetch;

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
    this.fetch = opciones.fetchImpl ?? fetch;
    this.apiBase = opciones.apiBase ?? 'https://api.stripe.com/v1';
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
    });
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
    });
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
    });
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
  ): Promise<Record<string, unknown>> {
    let respuesta: Response;
    try {
      respuesta = await this.fetch(`${this.apiBase}${ruta}`, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${this.opciones.secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: metodo === 'POST' ? codificarFormulario(cuerpo ?? {}).join('&') : undefined,
        signal: AbortSignal.timeout(this.opciones.timeoutMs),
      });
    } catch (error) {
      const nombre = (error as Error).name;
      throw errores.pasarela(nombre === 'TimeoutError' ? 'Stripe no respondió a tiempo' : 'No se pudo contactar a Stripe');
    }
    let json: Record<string, unknown> = {};
    try {
      json = (await respuesta.json()) as Record<string, unknown>;
    } catch {
      /* respuesta sin JSON */
    }
    if (!respuesta.ok) {
      const detalle = (json.error as { message?: string } | undefined)?.message ?? `HTTP ${respuesta.status}`;
      throw errores.pasarela(detalle);
    }
    return json;
  }
}
