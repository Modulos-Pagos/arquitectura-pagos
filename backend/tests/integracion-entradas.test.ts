import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import type { Config } from '../src/config/env';
import { EntradasClient } from '../src/integraciones/entradas.client';
import { configPruebas, levantarApp, llamar, nuevaReserva, reiniciarBase, token, type AppDePrueba } from './helpers';

/**
 * Prueba de la INVOCACIÓN al servicio de Entradas (BE2) usando un servidor HTTP
 * que simula a Entradas con el contrato de docs/openapi-servicios-consumidos.yaml.
 */

const reservas = new Map<string, { id_reserva: string; id_evento: string; cantidad_entradas: number; total: number }>();
let cookieRecibida: string | undefined;
let entradasFalso: http.Server;
let urlEntradas: string;
let config: Config;
let app: AppDePrueba;

before(async () => {
  entradasFalso = http.createServer((req, res) => {
    cookieRecibida = req.headers.cookie;
    const m = req.url?.match(/^\/api\/entradas\/reservas\/([^/?]+)$/);
    if (req.method !== 'GET' || !m) {
      res.writeHead(404).end();
      return;
    }
    const id = decodeURIComponent(m[1]);
    if (id === 'res-cae') {
      res.writeHead(500).end('error');
      return;
    }
    const reserva = reservas.get(id);
    if (!reserva) {
      res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'NO_EXISTE' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ...reserva, estado: 'RESERVADA' }));
  });
  await new Promise<void>((ok) => entradasFalso.listen(0, '127.0.0.1', () => ok()));
  urlEntradas = `http://127.0.0.1:${(entradasFalso.address() as AddressInfo).port}`;

  config = configPruebas();
  await reiniciarBase(config);
  app = await levantarApp(config, {
    entradas: new EntradasClient({ modo: 'http', baseUrl: urlEntradas, timeoutMs: 500 }),
  });
});

after(async () => {
  await app.cerrar();
  await new Promise<void>((ok) => entradasFalso.close(() => ok()));
});

describe('Invocación a Entradas/Inventario (BE2)', () => {
  it('si la orden coincide con Entradas se crea el pago y se reenvía la cookie de sesión', async () => {
    const id = nuevaReserva();
    reservas.set(id, { id_reserva: id, id_evento: 'evt-1', cantidad_entradas: 2, total: 15000 });
    const t = token('usr-1');
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', {
      token: t,
      body: { id_reserva: id, id_evento: 'evt-1', total: 15000, cantidad_entradas: 2 },
    });
    assert.equal(r.status, 201);
    assert.equal(cookieRecibida, `jwt=${t}`);
  });

  it('si el total fue alterado responde 422 ORDEN_INCONSISTENTE y no crea el pago', async () => {
    const id = nuevaReserva();
    reservas.set(id, { id_reserva: id, id_evento: 'evt-1', cantidad_entradas: 2, total: 15000 });
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', {
      token: token('usr-1'),
      body: { id_reserva: id, id_evento: 'evt-1', total: 100, cantidad_entradas: 2 },
    });
    assert.equal(r.status, 422);
    assert.equal(r.body.error, 'ORDEN_INCONSISTENTE');
    assert.match(r.body.detalles[0], /total/);
    assert.equal(await app.deps.repo.buscarPorReserva(id), null);
  });

  it('si Entradas no conoce la reserva responde 422 RESERVA_NO_ENCONTRADA', async () => {
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', {
      token: token('usr-1'),
      body: { id_reserva: 'res-inexistente', id_evento: 'evt-1', total: 15000, cantidad_entradas: 2 },
    });
    assert.equal(r.status, 422);
    assert.equal(r.body.error, 'RESERVA_NO_ENCONTRADA');
  });

  it('si Entradas falla responde 503 ENTRADAS_NO_DISPONIBLE', async () => {
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', {
      token: token('usr-1'),
      body: { id_reserva: 'res-cae', id_evento: 'evt-1', total: 15000, cantidad_entradas: 2 },
    });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, 'ENTRADAS_NO_DISPONIBLE');
  });

  it('si Entradas no responde a tiempo, corta a los 500 ms (respeta el SLA de 2000 ms)', async () => {
    const lento = http.createServer(() => {
      /* nunca responde */
    });
    await new Promise<void>((ok) => lento.listen(0, '127.0.0.1', () => ok()));
    const cliente = new EntradasClient({
      modo: 'http',
      baseUrl: `http://127.0.0.1:${(lento.address() as AddressInfo).port}`,
      timeoutMs: 300,
    });
    const inicio = Date.now();
    await assert.rejects(cliente.obtenerOrden('res-x'), (e: { codigo?: string }) => e.codigo === 'ENTRADAS_NO_DISPONIBLE');
    assert.ok(Date.now() - inicio < 1500);
    lento.closeAllConnections();
    await new Promise<void>((ok) => lento.close(() => ok()));
  });

  it('lee también los nombres de campos del API de reservas de Entradas (monto_total, cantidad_entrada, hold_id)', async () => {
    const respuestas = [
      { hold_id: 'hold-AB12', id_evento: 7, cantidad_entrada: 2, monto_total: 15000, estado_reserva: 'RESERVADO' },
      { data: { id_reserva: 'hold-AB12', id_evento: 'evt-7', cantidad_entradas: 2, total: 15000 } },
    ];
    for (const cuerpo of respuestas) {
      const cliente = new EntradasClient({
        modo: 'http',
        baseUrl: 'http://entradas.test',
        timeoutMs: 300,
        fetchImpl: (async () => new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch,
      });
      const orden = await cliente.obtenerOrden('hold-AB12');
      assert.equal(orden?.total, 15000);
      assert.equal(orden?.cantidad_entradas, 2);
      assert.equal(orden?.id_reserva, 'hold-AB12');
      assert.ok(orden?.id_evento === '7' || orden?.id_evento === 'evt-7');
    }
  });

  it('deja una línea de log por llamada, sin la cookie ni el token (evidencia BE1)', async () => {
    const anterior = process.env.LOG_INTEGRACIONES;
    process.env.LOG_INTEGRACIONES = 'true';
    const lineas: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => void lineas.push(args.join(' '));
    try {
      const cliente = new EntradasClient({
        modo: 'http',
        baseUrl: 'http://entradas.test',
        timeoutMs: 300,
        fetchImpl: (async () => new Response('{}', { status: 404 })) as typeof fetch,
      });
      await assert.rejects(cliente.obtenerOrden('res-404', 'jwt=token-secreto'));
    } finally {
      console.log = original;
      process.env.LOG_INTEGRACIONES = anterior;
    }
    assert.equal(lineas.length, 1);
    assert.match(
      lineas[0]!,
      /\[integración\] \d{4}-\d{2}-\d{2}T.* Entradas GET \/api\/entradas\/reservas\/res-404 \(vía API Gateway, requestId=[0-9a-f-]{36}\) → 404 → 422 RESERVA_NO_ENCONTRADA/,
    );
    assert.doesNotMatch(lineas[0]!, /token-secreto|jwt=/);
  });
});

/** Respuestas del API Gateway del Platform Team (FWizav/backendticketU) para probar el manejo de errores (GW1 d). */
function clienteCon(status: number, cuerpo: unknown, capturar?: (init?: RequestInit) => void): EntradasClient {
  return new EntradasClient({
    modo: 'http',
    baseUrl: 'http://ticketu-api-gateway:8080',
    timeoutMs: 300,
    fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
      capturar?.(init);
      return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch,
  });
}

describe('Invocación a Entradas a través del API Gateway (Evaluación 3, tipo B)', () => {
  it('envía un x-request-id para correlacionar la llamada con el log del Gateway', async () => {
    let headers: Record<string, string> = {};
    const cliente = clienteCon(200, { id_reserva: 'hold-1', id_evento: 'evt-1', cantidad_entradas: 1, total: 6000 }, (init) => {
      headers = init?.headers as Record<string, string>;
    });
    await cliente.obtenerOrden('hold-1');
    assert.match(headers['x-request-id'] ?? '', /^[0-9a-f-]{36}$/);
  });

  it('un 404 ROUTE_NOT_FOUND del Gateway no se confunde con una reserva inexistente: 503', async () => {
    const cliente = clienteCon(404, { error: 'ROUTE_NOT_FOUND', message: 'Ruta no registrada en el API Gateway.' });
    await assert.rejects(cliente.obtenerOrden('hold-1'), (e: { codigo?: string; message?: string }) =>
      e.codigo === 'ENTRADAS_NO_DISPONIBLE' && /no está publicada en el API Gateway/.test(e.message ?? ''),
    );
  });

  it('un 404 de Entradas (sin código del Gateway) sigue siendo RESERVA_NO_ENCONTRADA', async () => {
    const cliente = clienteCon(404, { detail: 'Reserva no encontrada' });
    await assert.rejects(cliente.obtenerOrden('hold-x'), (e: { codigo?: string }) => e.codigo === 'RESERVA_NO_ENCONTRADA');
  });

  it('502 BAD_GATEWAY y 503 SERVICE_NOT_CONFIGURED del Gateway → 503 ENTRADAS_NO_DISPONIBLE', async () => {
    for (const [status, error] of [
      [502, 'BAD_GATEWAY'],
      [503, 'SERVICE_NOT_CONFIGURED'],
    ] as const) {
      await assert.rejects(clienteCon(status, { error }).obtenerOrden('hold-1'), (e: { codigo?: string }) => e.codigo === 'ENTRADAS_NO_DISPONIBLE');
    }
  });

  it('401 o 403 de Entradas → 503 ENTRADAS_NO_DISPONIBLE con un motivo comprensible (no se cobra)', async () => {
    for (const status of [401, 403]) {
      await assert.rejects(clienteCon(status, { detail: 'No autenticado' }).obtenerOrden('hold-1'), (e: { codigo?: string; message?: string }) =>
        e.codigo === 'ENTRADAS_NO_DISPONIBLE' && /rechazó la sesión/.test(e.message ?? ''),
      );
    }
  });
});
