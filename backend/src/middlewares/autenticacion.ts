import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { errores } from '../errores';
import type { AuthClient, SesionAuth } from '../integraciones/auth.client';

export interface UsuarioAutenticado {
  id_usuario: string;
  /** Rol vigente según Auth: usuario, organizador o staff. */
  rol: string;
  /** true si el rol está en ROLES_PRIVILEGIADOS (por defecto staff). */
  privilegiado: boolean;
  /** Perfil que entrega Auth en validar-sesion (solo para mostrar; no se guarda). */
  perfil: Pick<SesionAuth, 'nombre_completo' | 'rut' | 'correo_electronico'>;
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
 * Contrato Auth ↔ Pagos v1.3: en CADA petición protegida se valida la sesión con Auth
 * (GET /internal/validar-sesion), reenviando intacto el header Cookie (jwt=...) que llegó
 * desde el navegador o desde el backend de Entradas. La identidad y el rol salen de Auth.
 * No se aceptan Authorization: Bearer ni token_sesion.
 */
export function autenticar(auth: AuthClient, rolesPrivilegiados: string[]): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const sesion = await auth.validarSesion(req.header('cookie'));
    const rol = sesion.rol.toLowerCase();
    req.usuario = {
      id_usuario: sesion.id_usuario,
      rol,
      privilegiado: rolesPrivilegiados.includes(rol),
      perfil: { nombre_completo: sesion.nombre_completo, rut: sesion.rut, correo_electronico: sesion.correo_electronico },
    };
    next();
  };
}

/** Obtiene el usuario autenticado (el middleware `autenticar` debe ejecutarse antes). */
export function usuarioDe(req: Request): UsuarioAutenticado {
  if (!req.usuario) throw errores.noAutenticado();
  return req.usuario;
}
