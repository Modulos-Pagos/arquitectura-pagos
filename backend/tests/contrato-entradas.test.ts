import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Config } from '../src/config/env';
import { configPruebas, levantarApp, llamar, nuevaReserva, reiniciarBase, token, type AppDePrueba } from './helpers';

/**
 * Compatibilidad con el contrato que entregó Entradas/Inventario (v1.0):
 * envían id_reserva, total, cantidad_entradas y el JWT en `token_sesion` (body), sin id_evento.
 */

let config: Config;
let app: AppDePrueba;

before(async () => {
  config = configPruebas();
  await reiniciarBase(config);
  app = await levantarApp(config);
});

after(async () => {
  await app.cerrar();
});

describe('Contrato Entradas v1.0 — request tal como lo envía Entradas', () => {
  it('acepta el request exacto de Entradas (token_sesion en el body, sin id_evento)', async () => {
    const idReserva = nuevaReserva();
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', {
      body: { id_reserva: idReserva, total: 15000, cantidad_entradas: 2, token_sesion: token('usr-entradas-1') },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.id_reserva, idReserva);
    assert.equal(r.body.estado_pago, 'PENDIENTE');
    assert.ok(r.body.id_pago && r.body.fecha_creacion && r.body.url_checkout);
  });

  it('también acepta el header Authorization sin id_evento', async () => {
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', {
      token: token('usr-entradas-2'),
      body: { id_reserva: nuevaReserva(), total: 9000, cantidad_entradas: 1 },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });

  it('el reintento de Entradas con el mismo id_reserva devuelve el mismo pago (200)', async () => {
    const cuerpo = { id_reserva: nuevaReserva(), total: 15000, cantidad_entradas: 2, token_sesion: token('usr-entradas-3') };
    const primero = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', { body: cuerpo });
    const segundo = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', { body: cuerpo });
    assert.equal(primero.status, 201);
    assert.equal(segundo.status, 200);
    assert.equal(segundo.body.id_pago, primero.body.id_pago);
  });

  it('rechaza un token_sesion inválido o ausente (401)', async () => {
    const invalido = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', {
      body: { id_reserva: nuevaReserva(), total: 15000, cantidad_entradas: 2, token_sesion: 'no-es-un-jwt' },
    });
    assert.equal(invalido.status, 401);
    const ausente = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', {
      body: { id_reserva: nuevaReserva(), total: 15000, cantidad_entradas: 2 },
    });
    assert.equal(ausente.status, 401);
  });

  it('si envían id_evento vacío se informa el error (400)', async () => {
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', {
      token: token('usr-entradas-4'),
      body: { id_reserva: nuevaReserva(), id_evento: '', total: 15000, cantidad_entradas: 2 },
    });
    assert.equal(r.status, 400);
  });
});
