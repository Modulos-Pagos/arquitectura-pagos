import crypto from 'node:crypto';

/**
 * Verificación de JWT HS256 (el algoritmo que usa Auth para firmar los tokens).
 * Implementado con node:crypto para no depender de librerías externas.
 */

export interface PayloadJwt {
  [clave: string]: unknown;
  exp?: number;
  nbf?: number;
  iat?: number;
}

export class JwtInvalidoError extends Error {}

function base64url(entrada: Buffer | string): string {
  return Buffer.from(entrada).toString('base64url');
}

function firmar(datos: string, secreto: string): Buffer {
  return crypto.createHmac('sha256', secreto).update(datos).digest();
}

export function firmarJwt(payload: PayloadJwt, secreto: string, expiraEnSegundos = 3600): string {
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const cuerpo = base64url(JSON.stringify({ iat: ahora, exp: ahora + expiraEnSegundos, ...payload }));
  const firma = firmar(`${cabecera}.${cuerpo}`, secreto).toString('base64url');
  return `${cabecera}.${cuerpo}.${firma}`;
}

export function verificarJwt(token: string, secreto: string): PayloadJwt {
  const partes = token.split('.');
  if (partes.length !== 3) throw new JwtInvalidoError('Formato de token inválido');
  const [cabeceraB64, cuerpoB64, firmaB64] = partes;

  let cabecera: { alg?: string };
  let payload: PayloadJwt;
  try {
    cabecera = JSON.parse(Buffer.from(cabeceraB64, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(cuerpoB64, 'base64url').toString('utf8'));
  } catch {
    throw new JwtInvalidoError('Token mal codificado');
  }
  if (cabecera.alg !== 'HS256') throw new JwtInvalidoError('Algoritmo de token no soportado');
  if (typeof payload !== 'object' || payload === null) throw new JwtInvalidoError('Payload inválido');

  const esperada = firmar(`${cabeceraB64}.${cuerpoB64}`, secreto);
  const recibida = Buffer.from(firmaB64, 'base64url');
  if (recibida.length !== esperada.length || !crypto.timingSafeEqual(recibida, esperada)) {
    throw new JwtInvalidoError('Firma de token inválida');
  }

  const ahora = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && ahora >= payload.exp) throw new JwtInvalidoError('Token expirado');
  if (typeof payload.nbf === 'number' && ahora < payload.nbf) throw new JwtInvalidoError('Token aún no válido');
  return payload;
}
