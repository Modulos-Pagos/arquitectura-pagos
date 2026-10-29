export const ESTADOS_PAGO = ['PENDIENTE', 'APROBADO', 'RECHAZADO', 'ANULADO', 'REEMBOLSADO'] as const;
export type EstadoPago = (typeof ESTADOS_PAGO)[number];

export const ORIGENES_CAMBIO = ['API', 'WEBHOOK', 'POLLING', 'REEMBOLSO'] as const;
export type OrigenCambio = (typeof ORIGENES_CAMBIO)[number];

export type EstadoReembolso = 'PENDIENTE' | 'EXITOSO' | 'FALLIDO';

/** Fila de la tabla `pagos`. */
export interface Pago {
  id_pago: string;
  id_reserva: string;
  id_usuario: string;
  /** Referencia al evento (sin FK); la envía Entradas. */
  id_evento: string | null;
  /** Código de descuento de Promociones aplicado a la compra (sin FK); null si no hubo. */
  nombre_codigo: string | null;
  monto: number;
  moneda: string;
  estado_pago: EstadoPago;
  motivo_rechazo: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  url_checkout: string | null;
  fecha_expiracion: Date | null;
  fecha_creacion: Date;
  fecha_actualizacion: Date;
}

export interface NuevoPago {
  id_pago: string;
  id_reserva: string;
  id_usuario: string;
  id_evento: string | null;
  nombre_codigo: string | null;
  monto: number;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  url_checkout: string | null;
  fecha_expiracion: Date | null;
}

/** Fila de la tabla `reembolsos`. */
export interface Reembolso {
  id_reembolso: string;
  id_pago: string;
  monto: number;
  motivo: string;
  estado_reembolso: EstadoReembolso;
  stripe_refund_id: string | null;
  fecha_creacion: Date;
}

/** Fila de la tabla `destinatarios_pago`: a quién se le emite la entrada si el comprador compra para otra persona. */
export interface Destinatario {
  id_pago: string;
  nombre: string;
  email: string;
  rut: string | null;
  fecha_registro: Date;
}

export interface NuevoDestinatario {
  nombre: string;
  email: string;
  rut: string | null;
}

export interface FiltrosListado {
  id_usuario?: string;
  id_reserva?: string;
  estado_pago?: EstadoPago;
  pagina: number;
  limite: number;
}
