import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { firmarJwt, JwtInvalidoError, verificarJwt } from './jwt';

/**
 * AUTH SIMULADO — SOLO DESARROLLO Y PRUEBAS. No es parte del microservicio de Pagos.
 *
 * Imita al servicio del equipo Auth tal como lo describe el contrato «Auth ↔ Pagos» v1.3, para
 * poder probar Pagos sin el servicio real. Pagos lo trata igual que a Auth: le reenvía el header
 * Cookie y la x-api-key, y no sabe que es un simulador.
 *
 *   GET /internal/validar-sesion   (Cookie: jwt=...  +  x-api-key)
 *       200 { valido: true, usuario: { id_usuario, nombre_completo, rut, correo_electronico, rol } }
 *       401 { valido: false, codigo_http: 401, error: "unauthorized", mensaje }   sin cookie o token inválido
 *       403 { valido: false, codigo_http: 403, error: "forbidden", mensaje }      x-api-key incorrecta
 *   GET /login?usuario=&rol=&nombre=&volver=
 *       Inicia una sesión de prueba: deja la cookie jwt (HttpOnly, SameSite=Strict) y redirige a `volver`.
 *   GET /token?usuario=&rol=
 *       Devuelve un token de prueba (para Postman o curl: Cookie: jwt=<token>).
 */

export interface OpcionesAuthSimulado {
  /** Clave que debe traer el header x-api-key (la AUTH_INTERNAL_API_KEY de Pagos). */
  apiKey: string;
  /** Secreto propio del simulador para firmar sus tokens. Pagos no lo conoce. */
  secreto: string;
  /** Duración de la sesión (Auth: 2 horas). */
  duracionSegundos?: number;
}

export const SECRETO_SIMULADO_POR_DEFECTO = 'secreto-del-auth-simulado';

const ROLES = ['usuario', 'organizador', 'staff'];

/** Acepta también los nombres de rol antiguos de los tokens de prueba. */
function normalizarRol(valor: unknown): string {
  const rol = String(valor ?? 'usuario').toLowerCase();
  if (rol === 'admin' || rol === 'servicio') return 'staff';
  if (rol === 'comprador') return 'usuario';
  return ROLES.includes(rol) ? rol : 'usuario';
}

function leerCookie(header: string | undefined, nombre: string): string | null {
  for (const parte of (header ?? '').split(';')) {
    const i = parte.indexOf('=');
    if (i !== -1 && parte.slice(0, i).trim() === nombre) return parte.slice(i + 1).trim() || null;
  }
  return null;
}

/** Token de prueba firmado por el simulador. */
export function tokenSimulado(
  secreto: string,
  datos: { id_usuario: string; rol?: string; nombre_completo?: string; rut?: string; correo_electronico?: string },
  duracionSegundos = 2 * 3600,
): string {
  return firmarJwt({ ...datos, rol: normalizarRol(datos.rol) }, secreto, duracionSegundos);
}

export function crearAuthSimulado(opciones: OpcionesAuthSimulado): http.Server {
  const duracion = opciones.duracionSegundos ?? 2 * 3600;
  const json = (res: http.ServerResponse, estado: number, cuerpo: unknown) => {
    res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(cuerpo));
  };
  const error = (res: http.ServerResponse, estado: 401 | 403, mensaje: string) =>
    json(res, estado, { valido: false, codigo_http: estado, error: estado === 401 ? 'unauthorized' : 'forbidden', mensaje });

  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://auth-simulado');

    if (req.method === 'GET' && url.pathname === '/internal/validar-sesion') {
      if (req.headers['x-api-key'] !== opciones.apiKey) return error(res, 403, 'Servicio no autorizado');
      const token = leerCookie(req.headers.cookie, 'jwt');
      if (!token) return error(res, 401, 'Sesión ausente, inválida, expirada o revocada');
      try {
        const p = verificarJwt(token, opciones.secreto);
        const id = String(p.id_usuario ?? p.sub ?? '').trim();
        if (!id) return error(res, 401, 'Sesión ausente, inválida, expirada o revocada');
        return json(res, 200, {
          valido: true,
          usuario: {
            id_usuario: id,
            nombre_completo: typeof p.nombre_completo === 'string' ? p.nombre_completo : 'Comprador De Prueba',
            rut: typeof p.rut === 'string' ? p.rut : '11.111.111-1',
            correo_electronico: typeof p.correo_electronico === 'string' ? p.correo_electronico : `${id}@ticketu.test`,
            rol: normalizarRol(p.rol),
          },
        });
      } catch (e) {
        if (e instanceof JwtInvalidoError) return error(res, 401, 'Sesión ausente, inválida, expirada o revocada');
        return json(res, 500, { valido: false, codigo_http: 500, error: 'internal_error', mensaje: 'Error interno' });
      }
    }

    if (req.method === 'GET' && (url.pathname === '/login' || url.pathname === '/token')) {
      const token = tokenSimulado(
        opciones.secreto,
        {
          id_usuario: url.searchParams.get('usuario') || 'usr-demo-1',
          rol: url.searchParams.get('rol') || 'usuario',
          ...(url.searchParams.get('nombre') ? { nombre_completo: url.searchParams.get('nombre')! } : {}),
        },
        duracion,
      );
      if (url.pathname === '/token') return json(res, 200, { token, cookie: `jwt=${token}` });
      const volver = url.searchParams.get('volver') || 'http://localhost:5173/';
      res.writeHead(302, {
        // Cookie de localhost: el navegador la envía a cualquier puerto de localhost (front, Gateway, Pagos).
        'Set-Cookie': `jwt=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${duracion}`,
        Location: volver,
      });
      return res.end();
    }

    json(res, 404, { error: 'not_found' });
  });
}

/** Levanta el simulador en un puerto libre (pruebas). */
export async function levantarAuthSimulado(opciones: OpcionesAuthSimulado, puerto = 0): Promise<{ url: string; cerrar: () => Promise<void> }> {
  const servidor = crearAuthSimulado(opciones);
  await new Promise<void>((ok) => servidor.listen(puerto, '127.0.0.1', () => ok()));
  const { port } = servidor.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, cerrar: () => new Promise<void>((ok) => servidor.close(() => ok())) };
}
