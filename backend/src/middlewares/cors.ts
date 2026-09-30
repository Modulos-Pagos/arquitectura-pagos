import type { RequestHandler } from 'express';

/** CORS mínimo para que el front del equipo (y el de otros módulos) pueda llamar a la API. */
export function cors(origen: string): RequestHandler {
  return (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    if (origen !== '*') res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
