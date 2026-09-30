/**
 * Cliente del microservicio de Pagos (backend en http://localhost:3000).
 * Endpoints usados:
 *   POST /api/v1/pagos/transacciones  (metodo "formulario" → devuelve client_secret de Stripe)
 *   GET  /api/v1/pagos/{id_pago}/checkout (pago existente: monto + client_secret, cuando se llega con ?id_pago=)
 *   GET  /api/v1/pagos/{id_pago}      (estado del pago)
 */

export const API_PAGOS = (process.env.NEXT_PUBLIC_PAGOS_API_URL ?? 'http://localhost:3000/api/v1/pagos').replace(/\/+$/, '');

/** Token JWT del usuario. Mientras Auth no esté integrado se usa el de `npm run token` del backend. */
const TOKEN = (process.env.NEXT_PUBLIC_PAGOS_TOKEN ?? '').replace(/^Bearer\s+/i, '').trim();

export type EstadoPago = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'ANULADO' | 'REEMBOLSADO';

export interface TransaccionCreada {
  id_pago: string;
  id_reserva: string;
  estado_pago: EstadoPago;
  fecha_creacion: string;
  metodo: 'checkout' | 'formulario';
  client_secret: string | null;
}

export interface Pago {
  id_pago: string;
  id_reserva: string;
  id_usuario: string;
  estado_pago: EstadoPago;
  metodo: 'checkout' | 'formulario';
  monto: number;
  moneda: string;
  motivo_rechazo: string | null;
  fecha_creacion: string;
  fecha_actualizacion: string;
  url_checkout: string | null;
}

export interface DatosCheckout extends Pago {
  client_secret: string | null;
}

export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    public readonly status: number,
    public readonly codigo?: string,
  ) {
    super(mensaje);
  }
}

async function llamar<T>(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<T> {
  if (!TOKEN) {
    throw new ErrorApi('Falta NEXT_PUBLIC_PAGOS_TOKEN en .env.local (genéralo con "npm run token" en el backend).', 401);
  }
  let respuesta: Response;
  try {
    respuesta = await fetch(`${API_PAGOS}${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorApi('No se pudo conectar con el servicio de pagos. ¿Está corriendo el backend en el puerto 3000?', 0);
  }
  const datos = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>;
  if (!respuesta.ok) {
    const detalles = Array.isArray(datos.detalles) ? ` (${(datos.detalles as string[]).join('; ')})` : '';
    throw new ErrorApi(`${String(datos.mensaje ?? 'Error del servicio de pagos')}${detalles}`, respuesta.status, datos.error as string);
  }
  return datos as T;
}

export function crearTransaccion(orden: {
  id_reserva: string;
  id_evento: string;
  total: number;
  cantidad_entradas: number;
}): Promise<TransaccionCreada> {
  return llamar<TransaccionCreada>('POST', '/transacciones', { ...orden, metodo: 'formulario' });
}

/** Pago creado por Entradas: el usuario llega con ?id_pago=... desde url_checkout. */
export function obtenerDatosCheckout(idPago: string): Promise<DatosCheckout> {
  return llamar<DatosCheckout>('GET', `/${encodeURIComponent(idPago)}/checkout`);
}

export function obtenerPago(idPago: string): Promise<Pago> {
  return llamar<Pago>('GET', `/${encodeURIComponent(idPago)}`);
}

/** Consulta el pago hasta que deje de estar PENDIENTE (el backend sincroniza con Stripe en cada consulta). */
export async function esperarEstadoFinal(idPago: string, intentos = 10, esperaMs = 1500): Promise<Pago> {
  let pago = await obtenerPago(idPago);
  for (let i = 1; i < intentos && pago.estado_pago === 'PENDIENTE'; i++) {
    await new Promise((ok) => setTimeout(ok, esperaMs));
    pago = await obtenerPago(idPago);
  }
  return pago;
}
