import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { crearApp } from '../src/app';
import { cargarArchivoEnv, cargarConfig, type Config } from '../src/config/env';
import { crearDependencias, type Dependencias } from '../src/contenedor';
import { firmarJwt } from '../src/utils/jwt';
import { inicializarBase } from '../scripts/db-init';

export const JWT_SECRET_TEST = 'secreto-de-pruebas';

/** Config de pruebas: BD de test, pasarela simulada y Entradas en modo mock. */
export function configPruebas(): Config {
  cargarArchivoEnv();
  const url = process.env.DATABASE_URL_TEST ?? 'postgres://postgres:postgres@localhost:5432/pagos_test';
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error('DATABASE_URL_TEST debe apuntar a una BD cuyo nombre contenga "test" (se borra en cada corrida)');
  }
  process.env.DATABASE_URL = url;
  process.env.JWT_SECRET = JWT_SECRET_TEST;
  process.env.PASARELA = 'mock';
  process.env.ENTRADAS_MODO = 'mock';
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
  const deps = crearDependencias(config, reemplazos);
  const servidor: Server = crearApp(deps).listen(0);
  await new Promise<void>((ok) => servidor.once('listening', () => ok()));
  const { port } = servidor.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    deps,
    cerrar: async () => {
      await new Promise<void>((ok) => servidor.close(() => ok()));
      await deps.pool.end();
    },
  };
}

export function token(idUsuario: string, rol = 'COMPRADOR'): string {
  return firmarJwt({ id_usuario: idUsuario, rol }, JWT_SECRET_TEST);
}

export interface Respuesta {
  status: number;
  body: any;
}

export async function llamar(
  url: string,
  metodo: 'GET' | 'POST',
  ruta: string,
  opciones: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Respuesta> {
  const headers: Record<string, string> = { ...(opciones.headers ?? {}) };
  if (opciones.token) headers.Authorization = `Bearer ${opciones.token}`;
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
