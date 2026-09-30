import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errores';

export const rutaNoEncontrada: RequestHandler = (req, res) => {
  res.status(404).json({ error: 'RUTA_NO_ENCONTRADA', mensaje: `No existe ${req.method} ${req.path}` });
};

export const manejarErrores: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    const cuerpo: Record<string, unknown> = { error: err.codigo, mensaje: err.message };
    if (err.detalles !== undefined) cuerpo.detalles = err.detalles;
    res.status(err.status).json(cuerpo);
    return;
  }
  // JSON mal formado en el body (lanzado por express.json)
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'JSON_INVALIDO', mensaje: 'El cuerpo de la solicitud no es un JSON válido' });
    return;
  }
  console.error('[pagos] Error no controlado:', err);
  res.status(500).json({ error: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' });
};
