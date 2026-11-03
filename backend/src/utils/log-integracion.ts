/**
 * Registro de las llamadas a otros módulos (evidencia BE1 de la Evaluación 2).
 *
 * Una línea por llamada, con fecha, contraparte, operación, resultado y duración:
 *   [pagos] [integración] 2026-11-03T21:10:05.123Z Entradas GET /api/entradas/reservas/res-1 → 200 (34 ms)
 *
 * Contrato Auth v1.3/v1.4 (regla 8): nunca se registran el token, la cookie ni datos personales
 * (nombre, RUT, correo). Solo identificadores de referencia, códigos HTTP y tiempos.
 * Se desactiva con LOG_INTEGRACIONES=false.
 */
export function registrarIntegracion(contraparte: string, operacion: string, resultado: string, inicio: number): void {
  if ((process.env.LOG_INTEGRACIONES ?? 'true').toLowerCase() === 'false') return;
  const ms = Math.round(performance.now() - inicio);
  console.log(`[pagos] [integración] ${new Date().toISOString()} ${contraparte} ${operacion} → ${resultado} (${ms} ms)`);
}
