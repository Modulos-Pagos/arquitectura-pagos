import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { errores } from '../errores';
import { JwtInvalidoError, verificarJwt } from '../utils/jwt';

export interface UsuarioAutenticado {
  id_usuario: string;
  rol: string;
  /** true si el rol está en ROLES_PRIVILEGIADOS (ADMIN, SERVICIO, ...). */
  privilegiado: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
    }
  }
}

/**
 * Valida el token JWT emitido por Auth (header Authorization: Bearer <token>).
 * Compatibilidad con el contrato de Entradas v1.0: si no viene el header, se acepta
 * el mismo JWT en el campo `token_sesion` del body (se valida igual que el header).
 * Del token se obtiene el id del usuario (claim id_usuario, sub o id) y su rol.
 */
export function autenticar(jwtSecret: string, rolesPrivilegiados: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header('authorization') ?? '';
    let [esquema, token] = header.split(' ');
    const tokenBody = (req.body as { token_sesion?: unknown } | undefined)?.token_sesion;
    if (!header && typeof tokenBody === 'string' && tokenBody.trim() !== '') {
      esquema = 'Bearer';
      token = tokenBody.trim();
      // Se normaliza al header para que la invocación a Entradas reenvíe el mismo token.
      req.headers.authorization = `Bearer ${token}`;
    }
    if (esquema?.toLowerCase() !== 'bearer' || !token) {
      return next(errores.noAutenticado());
    }
    try {
      const payload = verificarJwt(token, jwtSecret);
      const id = payload.id_usuario ?? payload.sub ?? payload.id;
      if ((typeof id !== 'string' && typeof id !== 'number') || String(id).trim() === '') {
        return next(errores.noAutenticado('El token no contiene el id del usuario'));
      }
      const rolCrudo = payload.rol ?? payload.role ?? 'COMPRADOR';
      const rol = String(rolCrudo).toUpperCase();
      req.usuario = { id_usuario: String(id), rol, privilegiado: rolesPrivilegiados.includes(rol) };
      return next();
    } catch (error) {
      if (error instanceof JwtInvalidoError) return next(errores.noAutenticado(error.message));
      return next(error);
    }
  };
}

/** Obtiene el usuario autenticado (el middleware `autenticar` debe ejecutarse antes). */
export function usuarioDe(req: Request): UsuarioAutenticado {
  if (!req.usuario) throw errores.noAutenticado();
  return req.usuario;
}
