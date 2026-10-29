import type { RequestHandler } from 'express';

/**
 * CORS para el front. La sesión viaja en la cookie jwt (contrato Auth v1.3), así que el navegador
 * exige el origen EXPLÍCITO y Access-Control-Allow-Credentials: true (no sirve *).
 *  - CORS_ORIGIN=http://localhost:5173,http://localhost:3000  -> se responde solo a esos orígenes
 *  - CORS_ORIGIN=none -> sin cabeceras (todo pasa por el API Gateway, que resuelve CORS con CORS_ORIGINS)
 */
export function cors(configuracion: string): RequestHandler {
  if (configuracion.toLowerCase() === 'none') return (_req, _res, next) => next();
  const permitidos = configuracion
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o) => o && o !== '*');

  return (req, res, next) => {
    const origen = req.header('origin');
    if (origen && permitidos.includes(origen)) {
      res.setHeader('Access-Control-Allow-Origin', origen);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
