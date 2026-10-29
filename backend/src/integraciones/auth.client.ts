import { errores } from '../errores';

/**
 * INVOCACIÓN A AUTH — contrato «Auth ↔ Pagos» v1.3 (CONTRATO_INTEGRACION_AUTH.md del equipo Auth).
 *
 *   GET {AUTH_INTERNAL_URL}/internal/validar-sesion
 *   Cookie: <header Cookie original, con jwt=...>      (se reenvía intacto)
 *   x-api-key: <AUTH_INTERNAL_API_KEY>
 *
 *   200 -> { valido: true, usuario: { id_usuario, nombre_completo, rut, correo_electronico, rol } }
 *   401 -> sesión ausente, inválida, vencida o revocada  -> Pagos responde 401
 *   403 -> falta o es inválida la x-api-key              -> Pagos responde 403
 *   500 -> error interno de Auth                          -> Pagos responde 500
 *   timeout (1000 ms), conexión rechazada u otro 5xx     -> Pagos responde 503 (fail-secure)
 *
 * Pagos NO valida el JWT por su cuenta, no lee sus claims y no acepta Authorization: Bearer
 * ni token_sesion: la identidad y el rol vienen de esta respuesta.
 *
 * Para desarrollar sin el servicio real existe un Auth simulado (scripts/auth-simulado, npm run
 * auth:simulado) que expone el mismo endpoint: Pagos lo llama igual, con este mismo código.
 */

/** Roles de Auth (contrato general): usuario, organizador o staff. */
export type RolAuth = 'usuario' | 'organizador' | 'staff';

export interface SesionAuth {
  id_usuario: string;
  nombre_completo: string;
  /** Con puntos y guion, tal como lo entrega Auth (ej. 21.234.567-8). */
  rut: string;
  correo_electronico: string;
  rol: string;
}

export interface OpcionesAuth {
  /** URL interna de Auth (red Docker), p. ej. http://auth-service:10000. No pasa por el Gateway. */
  baseUrl: string;
  /** INTERNAL_API_KEY que entrega Auth (header x-api-key). */
  apiKey: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export const RUTA_VALIDAR_SESION = '/internal/validar-sesion';

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null;
}

export class AuthClient {
  private readonly fetch: typeof fetch;

  constructor(private readonly opciones: OpcionesAuth) {
    this.fetch = opciones.fetchImpl ?? fetch;
  }

  get url(): string {
    return this.opciones.baseUrl;
  }

  /** Valida la sesión del header Cookie y devuelve el perfil del usuario según Auth. */
  async validarSesion(cookieHeader: string | undefined): Promise<SesionAuth> {
    // Regla 1 y 2 del contrato: se llama a Auth en CADA petición protegida y se le reenvía el header
    // Cookie tal como llegó (sin buscar el jwt, sin extraerlo ni reconstruirlo). Si no hay cookie,
    // es Auth quien responde 401.
    const headers: Record<string, string> = { Accept: 'application/json', 'x-api-key': this.opciones.apiKey };
    if (cookieHeader) headers.Cookie = cookieHeader;
    let respuesta: Response;
    try {
      respuesta = await this.fetch(`${this.opciones.baseUrl}${RUTA_VALIDAR_SESION}`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(this.opciones.timeoutMs),
      });
    } catch (error) {
      const nombre = (error as Error).name;
      throw errores.authNoDisponible(nombre === 'TimeoutError' ? 'tiempo de espera agotado' : 'servicio no alcanzable');
    }

    if (respuesta.status === 401) throw errores.noAutenticado('Sesión ausente, inválida, expirada o revocada');
    if (respuesta.status === 403) throw errores.servicioNoAutorizado();
    if (respuesta.status === 500) throw errores.errorAuth();
    if (!respuesta.ok) throw errores.authNoDisponible(`respondió HTTP ${respuesta.status}`);

    let cuerpo: Record<string, unknown>;
    try {
      cuerpo = (await respuesta.json()) as Record<string, unknown>;
    } catch {
      throw errores.authNoDisponible('respuesta sin JSON válido');
    }
    const usuario = (cuerpo.usuario ?? {}) as Record<string, unknown>;
    const id = texto(usuario.id_usuario);
    if (cuerpo.valido !== true || !id) throw errores.noAutenticado('Auth no confirmó la sesión');
    return {
      id_usuario: id,
      nombre_completo: texto(usuario.nombre_completo) ?? '',
      rut: texto(usuario.rut) ?? '',
      correo_electronico: texto(usuario.correo_electronico) ?? '',
      rol: (texto(usuario.rol) ?? 'usuario').toLowerCase(),
    };
  }
}
