/**
 * Cliente del microservicio de Pagos.
 *
 * En la plataforma TicketU todo pasa por el API Gateway (http://localhost:8080), que reenvía
 * /api/pagos/** al contenedor pagos-service sin cambiar la ruta. Sin Gateway (desarrollo local)
 * se puede apuntar directo al backend: http://localhost:3004/api/pagos (el backend responde en
 * /api/pagos y en /api/v1/pagos).
 *
 * Endpoints usados:
 *   GET    /comprador/perfil                 datos del comprador (de la sesión validada con Auth)
 *   POST   /transacciones                    crea el pago (metodo "formulario" → client_secret de Stripe)
 *   GET    /{id_pago}/checkout               pago existente (?id_pago= desde url_checkout)
 *   PUT    /{id_pago}/destinatario           la entrada es para otra persona
 *   DELETE /{id_pago}/destinatario           la entrada vuelve a ser para el comprador
 *   GET    /{id_pago}                        estado del pago
 *
 * Sesión (contrato Auth ↔ Pagos v1.3): el JWT viaja SOLO en la cookie jwt (HttpOnly) que pone Auth al iniciar
 * sesión. El front no lee ni envía el token: llama con credentials: 'include' y el navegador adjunta la cookie.
 * Si la sesión no es válida (401) se redirige a la página de login de Auth (NEXT_PUBLIC_LOGIN_URL).
 */

/** Igual que el front común de TicketU: GATEWAY_URL + prefijo del módulo. */
export const GATEWAY_URL = (process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
const BASE_PATH = '/api/pagos';

/** NEXT_PUBLIC_PAGOS_API_URL (opcional) permite apuntar directo al backend sin Gateway, p. ej. http://localhost:3004/api/pagos. */
export const API_PAGOS = (process.env.NEXT_PUBLIC_PAGOS_API_URL || `${GATEWAY_URL}${BASE_PATH}`).replace(/\/+$/, '');

/** Página de inicio de sesión de Auth (contrato Auth ↔ Pagos v1.3: con 401 el front redirige a /login). */
export const URL_LOGIN =
  process.env.NEXT_PUBLIC_LOGIN_URL || `${(process.env.NEXT_PUBLIC_PORTAL_URL ?? '').replace(/\/+$/, '')}/login`;

/** URL de login con `volver` = la página actual, para regresar al checkout después de iniciar sesión. */
export function urlLogin(): string {
  if (typeof window === 'undefined') return URL_LOGIN;
  const separador = URL_LOGIN.includes('?') ? '&' : '?';
  return `${URL_LOGIN}${separador}volver=${encodeURIComponent(window.location.href)}`;
}

/** Sesión ausente, vencida o revocada: se envía al usuario a iniciar sesión en Auth. */
export function irALogin(): void {
  if (typeof window !== 'undefined') window.location.assign(urlLogin());
}

export type EstadoPago = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'ANULADO' | 'REEMBOLSADO';

export interface TransaccionCreada {
  id_pago: string;
  id_reserva: string;
  estado_pago: EstadoPago;
  fecha_creacion: string;
  metodo: 'checkout' | 'formulario';
  client_secret: string | null;
}

/** Persona que recibe la entrada cuando el comprador la compra para otra persona. */
export interface Destinatario {
  nombre: string;
  email: string;
  rut: string | null;
  fecha_registro?: string;
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
  destinatario?: Destinatario | null;
}

export interface DatosCheckout extends Pago {
  client_secret: string | null;
}

/** Perfil de la sesión según Auth (contrato Auth ↔ Pagos v1.3). Solo para mostrar y prellenar. */
export interface PerfilComprador {
  id_usuario: string;
  nombre_completo: string;
  /** Con puntos y guion (21.234.567-8). */
  rut: string;
  correo_electronico: string;
  rol: 'usuario' | 'organizador' | 'staff' | string;
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

async function llamar<T>(metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', ruta: string, cuerpo?: unknown): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${API_PAGOS}${ruta}`, {
      method: metodo,
      credentials: 'include', // envía la cookie jwt de Auth
      headers: cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorApi(`No se pudo conectar con el servicio de pagos (${API_PAGOS}). ¿Están corriendo el Gateway y pagos-service?`, 0);
  }
  const datos = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>;
  if (!respuesta.ok) {
    const detalles = Array.isArray(datos.detalles) ? ` (${(datos.detalles as string[]).join('; ')})` : '';
    if (respuesta.status === 401) {
      irALogin(); // contrato Auth v1.3: con 401 el frontend redirige a /login
      throw new ErrorApi('Tu sesión no es válida o expiró. Te llevamos a iniciar sesión en TicketU…', 401, datos.error as string);
    }
    throw new ErrorApi(`${String(datos.mensaje ?? 'Error del servicio de pagos')}${detalles}`, respuesta.status, datos.error as string);
  }
  return datos as T;
}

export function obtenerPerfil(): Promise<PerfilComprador> {
  return llamar<PerfilComprador>('GET', '/comprador/perfil');
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

export function definirDestinatario(
  idPago: string,
  destinatario: { nombre: string; email: string; rut: string | null },
): Promise<{ id_pago: string; destinatario: Destinatario }> {
  return llamar('PUT', `/${encodeURIComponent(idPago)}/destinatario`, destinatario);
}

export function quitarDestinatario(idPago: string): Promise<{ id_pago: string; destinatario: null }> {
  return llamar('DELETE', `/${encodeURIComponent(idPago)}/destinatario`);
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
