import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { crearApp } from '../src/app';
import { cargarArchivoEnv, cargarConfig, type Config } from '../src/config/env';
import { crearDependencias, type Dependencias } from '../src/contenedor';
import { AuthClient } from '../src/integraciones/auth.client';
import { inicializarBase } from '../scripts/db-init';
import { levantarAuthSimulado, tokenSimulado } from '../scripts/auth-simulado/servidor';

/** Secreto del Auth simulado de las pruebas (Pagos no lo conoce: valida la sesión preguntándole a Auth). */
export const SECRETO_AUTH_PRUEBAS = 'secreto-auth-de-pruebas';
export const API_KEY_PRUEBAS = 'clave-interna-de-pruebas';

/**
 * Config de pruebas: BD de test, pasarela simulada y Entradas en modo mock. La sesión SIEMPRE se valida
 * por HTTP con GET /internal/validar-sesion contra un Auth simulado (contrato Auth ↔ Pagos v1.3).
 */
export function configPruebas(): Config {
  cargarArchivoEnv();
  const url = process.env.DATABASE_URL_TEST ?? 'postgres://postgres:postgres@localhost:5432/pagos_test';
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error('DATABASE_URL_TEST debe apuntar a una BD cuyo nombre contenga "test" (se borra en cada corrida)');
  }
  process.env.DATABASE_URL = url;
  process.env.AUTH_INTERNAL_API_KEY = API_KEY_PRUEBAS;
  process.env.PASARELA = 'mock';
  process.env.ENTRADAS_MODO = 'mock';
  process.env.BROKER_MODO = 'mock';
  process.env.PREFIJO_GATEWAY = '/api/pagos';
  process.env.DATABASE_SSL = 'false';
  return cargarConfig();
}

export async function reiniciarBase(config: Config): Promise<void> {
  await inicializarBase(config.databaseUrl, config.databaseSsl, true);
}

export interface AppDePrueba {
  url: string;
  deps: Dependencias;
  cerrar: () => Promise<void>;
}

export async function levantarApp(
  config: Config,
  reemplazos: Parameters<typeof crearDependencias>[1] = {},
): Promise<AppDePrueba> {
  // Sin un Auth propio de la prueba, se levanta el Auth simulado y Pagos lo llama por HTTP.
  const authSimulado = reemplazos.auth
    ? null
    : await levantarAuthSimulado({ apiKey: API_KEY_PRUEBAS, secreto: SECRETO_AUTH_PRUEBAS });
  const auth =
    reemplazos.auth ?? new AuthClient({ baseUrl: authSimulado!.url, apiKey: API_KEY_PRUEBAS, timeoutMs: config.authTimeoutMs });
  const deps = crearDependencias(config, { ...reemplazos, auth });
  const servidor: Server = crearApp(deps).listen(0);
  await new Promise<void>((ok) => servidor.once('listening', () => ok()));
  const { port } = servidor.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    deps,
    cerrar: async () => {
      await new Promise<void>((ok) => servidor.close(() => ok()));
      await deps.pool.end();
      await authSimulado?.cerrar();
    },
  };
}

/** Sesión de prueba emitida por el Auth simulado (roles usuario, organizador o staff). */
export function token(idUsuario: string, rol = 'usuario'): string {
  return tokenSimulado(SECRETO_AUTH_PRUEBAS, { id_usuario: idUsuario, rol });
}

export interface Respuesta {
  status: number;
  body: any;
}

export async function llamar(
  url: string,
  metodo: 'GET' | 'POST' | 'PUT' | 'DELETE',
  ruta: string,
  opciones: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Respuesta> {
  const headers: Record<string, string> = { ...(opciones.headers ?? {}) };
  // Contrato Auth v1.3: la sesión viaja solo en la cookie jwt; Pagos se la reenvía a Auth.
  if (opciones.token) headers.Cookie = `jwt=${opciones.token}`;
  if (opciones.body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers,
    body: opciones.body === undefined ? undefined : typeof opciones.body === 'string' ? opciones.body : JSON.stringify(opciones.body),
  });
  const texto = await r.text();
  let body: unknown = texto;
  try {
    body = JSON.parse(texto);
  } catch {
    /* no JSON */
  }
  return { status: r.status, body };
}

let contador = 0;
export function nuevaReserva(): string {
  contador += 1;
  return `res-test-${Date.now()}-${contador}`;
}

/** Evento con formato Stripe para el webhook de la pasarela simulada. */
export function eventoStripe(tipo: string, sesionId: string, idPago: string, extra: Record<string, unknown> = {}) {
  return {
    id: `evt_test_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    type: tipo,
    data: {
      object: {
        id: sesionId,
        object: 'checkout.session',
        client_reference_id: idPago,
        metadata: { id_pago: idPago },
        ...extra,
      },
    },
  };
}
