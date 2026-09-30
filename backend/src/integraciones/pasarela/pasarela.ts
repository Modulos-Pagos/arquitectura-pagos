/**
 * Contrato interno con la pasarela de pago. Hay dos implementaciones:
 *  - StripePasarela: invoca la API REST de Stripe (modo test en el curso).
 *  - MockPasarela:   simula la pasarela para desarrollo, tests y Postman.
 * El servicio de pagos solo conoce esta interfaz, así se puede cambiar
 * de pasarela sin tocar la lógica de negocio.
 */

export interface DatosCheckout {
  id_pago: string;
  id_reserva: string;
  id_evento: string | null;
  monto: number;
  cantidad_entradas: number;
  expira_en: Date;
}

/** Datos para cobrar con el formulario propio del front (Stripe Elements / PaymentIntent). */
export type DatosIntento = Omit<DatosCheckout, 'expira_en'>;

export interface IntentoPago {
  id: string;
  /** Secreto que el front usa con stripe.confirmCardPayment(). No se guarda en la BD. */
  client_secret: string;
}

export interface SesionCheckout {
  id: string;
  url: string;
  expira_en: Date;
}

export type EstadoSesion = 'ABIERTA' | 'PAGADA' | 'EXPIRADA';

export interface ConsultaSesion {
  estado: EstadoSesion;
  payment_intent_id: string | null;
}

export interface ConsultaIntento extends ConsultaSesion {
  client_secret: string | null;
}

export interface ResultadoReembolso {
  id: string;
  estado: 'PENDIENTE' | 'EXITOSO';
}

export type TipoEventoPasarela = 'PAGO_APROBADO' | 'PAGO_RECHAZADO' | 'SESION_EXPIRADA' | 'IGNORADO';

export interface EventoPasarela {
  id: string;
  tipo_original: string;
  tipo: TipoEventoPasarela;
  sesion_id: string | null;
  id_pago: string | null;
  payment_intent_id: string | null;
  payload: unknown;
}

export interface PasarelaPago {
  readonly nombre: 'stripe' | 'mock';
  crearCheckout(datos: DatosCheckout): Promise<SesionCheckout>;
  consultarSesion(sesionId: string): Promise<ConsultaSesion>;
  expirarSesion(sesionId: string): Promise<void>;
  /** Modo formulario: crea un PaymentIntent y devuelve su client_secret. */
  crearIntento(datos: DatosIntento): Promise<IntentoPago>;
  consultarIntento(intentoId: string): Promise<ConsultaIntento>;
  cancelarIntento(intentoId: string): Promise<void>;
  reembolsar(datos: { payment_intent_id: string; monto: number; id_pago: string }): Promise<ResultadoReembolso>;
  /** Verifica la firma del webhook y lo traduce a un evento de dominio. */
  construirEvento(cuerpoCrudo: Buffer, firma: string | undefined): EventoPasarela;
}

/** Traduce un evento con formato Stripe (también usado por la pasarela simulada). */
export function interpretarEventoStripe(evento: {
  id?: unknown;
  type?: unknown;
  data?: { object?: Record<string, unknown> };
}): EventoPasarela {
  const objeto = evento.data?.object ?? {};
  const metadata = (objeto.metadata ?? {}) as Record<string, unknown>;
  const tipoOriginal = String(evento.type ?? '');
  const esSesion = objeto.object === 'checkout.session' || tipoOriginal.startsWith('checkout.session.');
  const esIntento = objeto.object === 'payment_intent' || tipoOriginal.startsWith('payment_intent.');

  let tipo: TipoEventoPasarela = 'IGNORADO';
  if (tipoOriginal === 'checkout.session.completed') {
    tipo = objeto.payment_status === 'paid' ? 'PAGO_APROBADO' : 'IGNORADO';
  } else if (tipoOriginal === 'checkout.session.async_payment_succeeded') {
    tipo = 'PAGO_APROBADO';
  } else if (tipoOriginal === 'checkout.session.async_payment_failed') {
    tipo = 'PAGO_RECHAZADO';
  } else if (tipoOriginal === 'checkout.session.expired') {
    tipo = 'SESION_EXPIRADA';
  } else if (tipoOriginal === 'payment_intent.succeeded') {
    tipo = 'PAGO_APROBADO';
  } else if (tipoOriginal === 'payment_intent.canceled') {
    tipo = 'PAGO_RECHAZADO';
  }

  const idPago = metadata.id_pago ?? objeto.client_reference_id;
  return {
    id: String(evento.id ?? ''),
    tipo_original: tipoOriginal,
    tipo,
    sesion_id: esSesion && typeof objeto.id === 'string' ? objeto.id : null,
    id_pago: typeof idPago === 'string' ? idPago : null,
    payment_intent_id:
      esIntento && typeof objeto.id === 'string'
        ? objeto.id
        : typeof objeto.payment_intent === 'string'
          ? objeto.payment_intent
          : null,
    payload: evento,
  };
}
