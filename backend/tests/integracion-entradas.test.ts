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
let authorizationRecibido: string | undefined;
let entradasFalso: http.Server;
let urlEntradas: string;
let config: Config;
let app: AppDePrueba;

before(async () => {
  entradasFalso = http.createServer((req, res) => {
    authorizationRecibido = req.headers.authorization;
    const m = req.url?.match(/^\/api\/v1\/entradas\/reservas\/([^/?]+)$/);
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
  it('si la orden coincide con Entradas se crea el pago y se reenvía el token', async () => {
    const id = nuevaReserva();
    reservas.set(id, { id_reserva: id, id_evento: 'evt-1', cantidad_entradas: 2, total: 15000 });
    const t = token('usr-1');
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', {
      token: t,
      body: { id_reserva: id, id_evento: 'evt-1', total: 15000, cantidad_entradas: 2 },
    });
    assert.equal(r.status, 201);
    assert.equal(authorizationRecibido, `Bearer ${t}`);
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
});
