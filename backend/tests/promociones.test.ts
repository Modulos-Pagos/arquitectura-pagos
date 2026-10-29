import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Config } from '../src/config/env';
import { EntradasClient } from '../src/integraciones/entradas.client';
import { construirMensajes, PublicadorMock, type MensajeBroker } from '../src/integraciones/eventos';
import type { Pago } from '../src/pagos/pago.types';
import { configPruebas, eventoStripe, levantarApp, llamar, nuevaReserva, reiniciarBase, token, type AppDePrueba } from './helpers';

/**
 * Contrato «Promociones ↔ Pagos» v1.0 (consumo de cupón):
 *  - Entradas envía el código de descuento (nombre_codigo) al crear el pago; Pagos lo guarda junto al id_evento.
 *  - Al aprobarse el pago, Pagos publica `pago.completado` con { id_pago, id_usuario, id_evento, nombre_codigo }.
 *  - Promociones ignora el evento si nombre_codigo viene null.
 */

const GW = '/api/pagos';
const COMPRADOR = 'usr-promo-1';
let config: Config;
let app: AppDePrueba;
let eventos: PublicadorMock;

const mensajesDe = (idPago: string): MensajeBroker[] => eventos.publicados.filter((m) => m.id_pago === idPago);
const completadoDe = (idPago: string) => mensajesDe(idPago).find((m) => m.tipo === 'pago.completado');

async function crear(a: AppDePrueba, body: Record<string, unknown>) {
  return llamar(a.url, 'POST', `${GW}/transacciones`, {
    token: token(COMPRADOR),
    body: { id_reserva: nuevaReserva(), total: 15000, cantidad_entradas: 2, metodo: 'checkout', ...body },
  });
}

async function aprobar(a: AppDePrueba, idPago: string) {
  const pago = await a.deps.repo.buscarPorId(idPago);
  assert.ok(pago?.stripe_session_id);
  const evento = eventoStripe('checkout.session.completed', pago.stripe_session_id, idPago, { payment_status: 'paid' });
  const r = await llamar(a.url, 'POST', `${GW}/webhooks/stripe`, { body: evento });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

before(async () => {
  config = configPruebas();
  await reiniciarBase(config);
  eventos = new PublicadorMock();
  app = await levantarApp(config, { eventos });
});

beforeEach(() => {
  eventos.publicados.length = 0;
});

after(async () => {
  await app.cerrar();
});

describe('Promociones ↔ Pagos: código de descuento y evento pago.completado', () => {
  it('guarda id_evento y nombre_codigo y los devuelve al consultar el pago', async () => {
    const r = await crear(app, { id_evento: 'evt-123', nombre_codigo: ' DESC50 ' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const pago = await llamar(app.url, 'GET', `${GW}/${r.body.id_pago}`, { token: token(COMPRADOR) });
    assert.equal(pago.body.id_evento, 'evt-123');
    assert.equal(pago.body.nombre_codigo, 'DESC50');
  });

  it('al aprobarse publica pago.realizado (Entradas) y pago.completado (Promociones) con los campos del contrato', async () => {
    const r = await crear(app, { id_evento: 'evt-123', nombre_codigo: 'DESC50' });
    await aprobar(app, r.body.id_pago);
    assert.deepEqual(mensajesDe(r.body.id_pago).map((m) => m.tipo), ['pago.realizado', 'pago.completado']);

    const completado = completadoDe(r.body.id_pago)!;
    assert.equal(completado.id_pago, r.body.id_pago);
    assert.equal(completado.id_usuario, COMPRADOR);
    assert.equal(completado.id_evento, 'evt-123');
    assert.equal(completado.nombre_codigo, 'DESC50');
    assert.equal(completado.version, 1);
    assert.match(completado.id_mensaje, /^[0-9a-f-]{36}$/);
    // pago.realizado también lleva el código (útil para Entradas y Notificaciones)
    assert.equal(mensajesDe(r.body.id_pago)[0].nombre_codigo, 'DESC50');
  });

  it('sin código igual se publica pago.completado, con nombre_codigo null (Promociones lo ignora)', async () => {
    const r = await crear(app, { id_evento: 'evt-9' });
    await aprobar(app, r.body.id_pago);
    const completado = completadoDe(r.body.id_pago);
    assert.ok(completado);
    assert.equal(completado.nombre_codigo, null);
    assert.equal(completado.id_evento, 'evt-9');
  });

  it('un pago rechazado o anulado no publica pago.completado (no se consume el cupón)', async () => {
    const r = await crear(app, { nombre_codigo: 'DESC50' });
    await llamar(app.url, 'POST', `${GW}/${r.body.id_pago}/reembolso`, { token: token('svc', 'staff'), body: { motivo: 'Reserva vencida' } });
    assert.deepEqual(mensajesDe(r.body.id_pago).map((m) => m.tipo), ['pago.anulado']);
  });

  it('valida nombre_codigo (texto de hasta 50 caracteres); vacío o null = sin código', async () => {
    const numero = await crear(app, { nombre_codigo: 50 });
    assert.equal(numero.status, 400);
    assert.ok(numero.body.detalles.some((d: string) => d.includes('nombre_codigo')));
    const largo = await crear(app, { nombre_codigo: 'X'.repeat(51) });
    assert.equal(largo.status, 400);
    const vacio = await crear(app, { nombre_codigo: '' });
    assert.equal(vacio.status, 201);
    const pago = await llamar(app.url, 'GET', `${GW}/${vacio.body.id_pago}`, { token: token(COMPRADOR) });
    assert.equal(pago.body.nombre_codigo, null);
  });

  it('idempotencia: reintentar sin código devuelve el mismo pago; con otro código es conflicto (409)', async () => {
    const reserva = nuevaReserva();
    const primero = await crear(app, { id_reserva: reserva, nombre_codigo: 'DESC50' });
    const sinCodigo = await crear(app, { id_reserva: reserva });
    assert.equal(sinCodigo.status, 200);
    assert.equal(sinCodigo.body.id_pago, primero.body.id_pago);
    const otroCodigo = await crear(app, { id_reserva: reserva, nombre_codigo: 'OTRO10' });
    assert.equal(otroCodigo.status, 409);
  });

  it('con BROKER_CLAVE_PROMOCIONES vacío no se publica el evento para Promociones', () => {
    const pago = {
      id_pago: 'p', id_reserva: 'r', id_usuario: 'u', id_evento: 'e', nombre_codigo: 'DESC50',
      monto: 1, moneda: 'CLP', estado_pago: 'APROBADO', motivo_rechazo: null,
    } as Pago;
    assert.deepEqual(construirMensajes(pago, null, { separador: '_', clavePromociones: '' }).map((m) => m.tipo), ['pago_realizado']);
    assert.deepEqual(
      construirMensajes(pago, null, { separador: '.', clavePromociones: 'pagos.cupon_usado' }).map((m) => m.tipo),
      ['pago.realizado', 'pagos.cupon_usado'],
    );
  });
});

describe('Promociones ↔ Pagos: el código también puede venir desde Entradas', () => {
  let entradasFalso: http.Server;
  let conEntradas: AppDePrueba;
  const reservas = new Map<string, Record<string, unknown>>();

  before(async () => {
    entradasFalso = http.createServer((req, res) => {
      const id = decodeURIComponent(req.url?.split('/').pop() ?? '');
      const reserva = reservas.get(id);
      if (!reserva) {
        res.writeHead(404).end('{}');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(reserva));
    });
    await new Promise<void>((ok) => entradasFalso.listen(0, '127.0.0.1', () => ok()));
    const url = `http://127.0.0.1:${(entradasFalso.address() as AddressInfo).port}`;
    conEntradas = await levantarApp(config, { eventos, entradas: new EntradasClient({ modo: 'http', baseUrl: url, timeoutMs: 500 }) });
  });

  after(async () => {
    await conEntradas.cerrar();
    await new Promise<void>((ok) => entradasFalso.close(() => ok()));
  });

  it('si Entradas informa el código en la reserva, Pagos lo guarda aunque no venga en el body', async () => {
    const id = nuevaReserva();
    reservas.set(id, { id_reserva: id, id_evento: 'evt-77', cantidad_entradas: 2, total: 15000, nombre_codigo: 'VERANO20' });
    const r = await crear(conEntradas, { id_reserva: id });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const pago = await conEntradas.deps.repo.buscarPorId(r.body.id_pago);
    assert.equal(pago?.nombre_codigo, 'VERANO20');
    assert.equal(pago?.id_evento, 'evt-77');
  });

  it('si el código del body no coincide con el de Entradas responde 422 ORDEN_INCONSISTENTE', async () => {
    const id = nuevaReserva();
    reservas.set(id, { id_reserva: id, id_evento: 'evt-77', cantidad_entradas: 2, total: 15000, nombre_codigo: 'VERANO20' });
    const r = await crear(conEntradas, { id_reserva: id, nombre_codigo: 'DESC50' });
    assert.equal(r.status, 422);
    assert.equal(r.body.error, 'ORDEN_INCONSISTENTE');
  });
});
