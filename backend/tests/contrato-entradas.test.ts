import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Config } from '../src/config/env';
import { configPruebas, levantarApp, llamar, nuevaReserva, reiniciarBase, token, type AppDePrueba } from './helpers';

/**
 * Contrato Pagos ↔ Entradas v2.3: Entradas envía id_reserva, total y cantidad_entradas, y reenvía
 * intacto el header Cookie (jwt=...) del comprador. Ya no se aceptan Authorization: Bearer ni token_sesion.
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

const cookie = (t: string) => ({ Cookie: `otra=1; jwt=${t}` });

describe('Contrato Entradas v2.3 — request tal como lo envía Entradas', () => {
  it('acepta el request de Entradas con la cookie jwt reenviada (sin id_evento), por /api/v1 y por el Gateway', async () => {
    for (const base of ['/api/v1/pagos', '/api/pagos']) {
      const idReserva = nuevaReserva();
      const r = await llamar(app.url, 'POST', `${base}/transacciones`, {
        headers: cookie(token('usr-entradas-1')),
        body: { id_reserva: idReserva, total: 15000, cantidad_entradas: 2 },
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.id_reserva, idReserva);
      assert.equal(r.body.estado_pago, 'PENDIENTE');
      assert.ok(r.body.id_pago && r.body.fecha_creacion && r.body.url_checkout);
    }
  });

  it('ya no acepta Authorization: Bearer ni token_sesion (401)', async () => {
    const t = token('usr-entradas-2');
    const bearer = await llamar(app.url, 'POST', '/api/pagos/transacciones', {
      headers: { Authorization: `Bearer ${t}` },
      body: { id_reserva: nuevaReserva(), total: 9000, cantidad_entradas: 1 },
    });
    assert.equal(bearer.status, 401);
    assert.equal(bearer.body.error, 'NO_AUTENTICADO');
    const enBody = await llamar(app.url, 'POST', '/api/pagos/transacciones', {
      body: { id_reserva: nuevaReserva(), total: 9000, cantidad_entradas: 1, token_sesion: t },
    });
    assert.equal(enBody.status, 401);
  });

  it('el reintento de Entradas con el mismo id_reserva devuelve el mismo pago (200)', async () => {
    const cuerpo = { id_reserva: nuevaReserva(), total: 15000, cantidad_entradas: 2 };
    const headers = cookie(token('usr-entradas-3'));
    const primero = await llamar(app.url, 'POST', '/api/pagos/transacciones', { headers, body: cuerpo });
    const segundo = await llamar(app.url, 'POST', '/api/pagos/transacciones', { headers, body: cuerpo });
    assert.equal(primero.status, 201);
    assert.equal(segundo.status, 200);
    assert.equal(segundo.body.id_pago, primero.body.id_pago);
  });

  it('rechaza una cookie jwt inválida o ausente (401)', async () => {
    const invalido = await llamar(app.url, 'POST', '/api/pagos/transacciones', {
      headers: { Cookie: 'jwt=no-es-un-jwt' },
      body: { id_reserva: nuevaReserva(), total: 15000, cantidad_entradas: 2 },
    });
    assert.equal(invalido.status, 401);
    const ausente = await llamar(app.url, 'POST', '/api/pagos/transacciones', {
      headers: { Cookie: 'otra=1' },
      body: { id_reserva: nuevaReserva(), total: 15000, cantidad_entradas: 2 },
    });
    assert.equal(ausente.status, 401);
  });

  it('si envían id_evento vacío se informa el error (400)', async () => {
    const r = await llamar(app.url, 'POST', '/api/pagos/transacciones', {
      token: token('usr-entradas-4'),
      body: { id_reserva: nuevaReserva(), id_evento: '', total: 15000, cantidad_entradas: 2 },
    });
    assert.equal(r.status, 400);
  });
});
