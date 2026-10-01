/**
 * Errores de dominio. El servicio los lanza y el manejador global de app.ts
 * los convierte en respuestas HTTP con el formato:
 *   { "error": "CODIGO", "mensaje": "texto", "detalles": [...] }
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly detalles?: unknown,
  ) {
    super(mensaje);
    this.name = 'AppError';
  }
}

export const errores = {
  validacion: (detalles: string[]) =>
    new AppError(400, 'VALIDACION_FALLIDA', 'Los datos enviados no son válidos', detalles),
  noAutenticado: (mensaje = 'Se requiere un token de autorización válido') =>
    new AppError(401, 'NO_AUTENTICADO', mensaje),
  noAutorizado: (mensaje = 'No tiene permisos para realizar esta operación') =>
    new AppError(403, 'NO_AUTORIZADO', mensaje),
  pagoNoEncontrado: (idPago: string) =>
    new AppError(404, 'PAGO_NO_ENCONTRADO', `No existe un pago con id ${idPago}`),
  conflictoIdempotencia: (idReserva: string) =>
    new AppError(
      409,
      'CONFLICTO_IDEMPOTENCIA',
      `La reserva ${idReserva} ya tiene un pago registrado con datos distintos`,
    ),
  pagoNoReembolsable: (estado: string) =>
    new AppError(409, 'PAGO_NO_REEMBOLSABLE', `Un pago en estado ${estado} no se puede anular ni reembolsar`),
  pagoNoEliminable: (estado: string) =>
    new AppError(
      409,
      'PAGO_NO_ELIMINABLE',
      `Un pago en estado ${estado} no se puede eliminar: solo se eliminan pagos RECHAZADOS o ANULADOS, sin reembolsos`,
    ),
  transicionConcurrente: () =>
    new AppError(409, 'CAMBIO_CONCURRENTE', 'El estado del pago cambió mientras se procesaba la solicitud; reintente'),
  ordenInconsistente: (detalles: string[]) =>
    new AppError(422, 'ORDEN_INCONSISTENTE', 'La orden no coincide con la reserva registrada en Entradas', detalles),
  reservaNoEncontrada: (idReserva: string) =>
    new AppError(422, 'RESERVA_NO_ENCONTRADA', `Entradas no reconoce la reserva ${idReserva}`),
  firmaWebhookInvalida: (mensaje: string) => new AppError(400, 'FIRMA_WEBHOOK_INVALIDA', mensaje),
  pasarela: (mensaje: string) => new AppError(502, 'ERROR_PASARELA', `Error en la pasarela de pago: ${mensaje}`),
  entradasNoDisponible: (mensaje: string) =>
    new AppError(503, 'ENTRADAS_NO_DISPONIBLE', `No fue posible validar la orden con Entradas: ${mensaje}`),
};

/** Código de PostgreSQL para violación de UNIQUE. */
export const PG_UNIQUE_VIOLATION = '23505';

export function esErrorUnico(error: unknown, restriccion?: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { code?: string; constraint?: string };
  return e.code === PG_UNIQUE_VIOLATION && (restriccion === undefined || e.constraint === restriccion);
}
