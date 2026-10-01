import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Config } from '../src/config/env';
import type { MockPasarela } from '../src/integraciones/pasarela/mock.pasarela';
import {
  configPruebas,
  eventoStripe,
  levantarApp,
  llamar,
  nuevaReserva,
  reiniciarBase,
  token,
  type AppDePrueba,
} from './helpers';

/**
 * Pruebas funcionales de la API contra PostgreSQL real (BD pagos_test),
 * con la pasarela simulada. Cubren las historias HU 1.1, 1.3, 1.4, 1.6, 3.1, 3.3 y 3.4,
 * más el DELETE de administración (crear, modificar, eliminar y consultar en la BD).
 */

const COMPRADOR = 'usr-comprador-1';
const OTRO = 'usr-otro-2';

let config: Config;
let app: AppDePrueba;

const orden = (idReserva = nuevaReserva()) => ({
  id_reserva: idReserva,
  id_evento: 'evt-fiesta-ici',
  total: 15000,
  cantidad_entradas: 2,
  metodo: 'checkout', // página de Stripe: permite simular sesiones y webhooks de Checkout
});

async function crearPago(idUsuario = COMPRADOR, cuerpo = orden()) {
  const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', { token: token(idUsuario), body: cuerpo });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body as { id_pago: string; url_checkout: string };
}

async function sesionDe(idPago: string): Promise<string> {
  const pago = await app.deps.repo.buscarPorId(idPago);
  assert.ok(pago?.stripe_session_id);
  return pago.stripe_session_id;
}

async function aprobar(idPago: string) {
  const evento = eventoStripe('checkout.session.completed', await sesionDe(idPago), idPago, { payment_status: 'paid' });
  const r = await llamar(app.url, 'POST', '/api/v1/pagos/webhooks/stripe', { body: evento });
  assert.equal(r.status, 200);
  return evento;
}

before(async () => {
  config = configPruebas();
  await reiniciarBase(config);
  app = await levantarApp(config);
});

after(async () => {
  await app.cerrar();
});

describe('Operación', () => {
  it('GET /health informa BD, pasarela y modo de Entradas', async () => {
    const r = await llamar(app.url, 'GET', '/health');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { estado: 'ok', servicio: 'microservicio-pagos', base_datos: 'ok', pasarela: 'mock', entradas: 'mock' });
  });

  it('publica el Swagger propio y el de servicios consumidos', async () => {
    const propio = await llamar(app.url, 'GET', '/api-docs/openapi.json');
    assert.equal(propio.status, 200);
    assert.ok(propio.body.paths['/api/v1/pagos/transacciones']);
    const consumidos = await llamar(app.url, 'GET', '/api-docs/consumidos.json');
    assert.ok(consumidos.body.paths['/api/v1/entradas/reservas/{id_reserva}']);
    const ui = await fetch(`${app.url}/api-docs/`);
    assert.equal(ui.status, 200);
  });
});

describe('POST /transacciones — crear pago (HU 1.1, HU 1.3)', () => {
  it('crea el pago PENDIENTE con url_checkout y lo guarda en la BD', async () => {
    const cuerpo = orden();
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', { token: token(COMPRADOR), body: cuerpo });
    assert.equal(r.status, 201);
    assert.equal(r.body.estado_pago, 'PENDIENTE');
    assert.equal(r.body.id_reserva, cuerpo.id_reserva);
    assert.match(r.body.id_pago, /^[0-9a-f-]{36}$/);
    assert.match(r.body.url_checkout, /^https:\/\//);
    assert.ok(!Number.isNaN(Date.parse(r.body.fecha_creacion)));
    assert.ok(Date.parse(r.body.fecha_expiracion) - Date.now() >= 30 * 60 * 1000, 'la sesión dura al menos 30 min');

    const guardado = await app.deps.repo.buscarPorId(r.body.id_pago);
    assert.equal(guardado?.id_usuario, COMPRADOR, 'el id_usuario sale del token');
    assert.equal(guardado?.monto, 15000);
    assert.equal(guardado?.estado_pago, 'PENDIENTE');
    assert.equal(guardado?.url_checkout, r.body.url_checkout, 'guarda la url para reenviarla en reintentos');
  });

  it('es idempotente: el reintento de Entradas devuelve 200 con el mismo pago', async () => {
    const cuerpo = orden();
    const primero = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', { token: token(COMPRADOR), body: cuerpo });
    const segundo = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', { token: token(COMPRADOR), body: cuerpo });
    assert.equal(primero.status, 201);
    assert.equal(segundo.status, 200);
    assert.equal(segundo.body.id_pago, primero.body.id_pago);
    assert.equal(segundo.body.url_checkout, primero.body.url_checkout);
    const { total } = await app.deps.repo.listar({ id_reserva: cuerpo.id_reserva, pagina: 1, limite: 10 });
    assert.equal(total, 1, 'no se crea un segundo cobro');
  });

  it('solicitudes simultáneas con la misma reserva generan un único pago', async () => {
    const cuerpo = orden();
    const respuestas = await Promise.all(
      Array.from({ length: 5 }, () => llamar(app.url, 'POST', '/api/v1/pagos/transacciones', { token: token(COMPRADOR), body: cuerpo })),
    );
    assert.deepEqual(respuestas.map((r) => r.status).sort(), [200, 200, 200, 200, 201]);
    assert.equal(new Set(respuestas.map((r) => r.body.id_pago)).size, 1);
  });

  it('responde 409 si la misma reserva llega con otro monto', async () => {
    const cuerpo = orden();
    await crearPago(COMPRADOR, cuerpo);
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', {
      token: token(COMPRADOR),
      body: { ...cuerpo, total: 1000 },
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'CONFLICTO_IDEMPOTENCIA');
  });

  it('responde 400 con el detalle de los campos inválidos', async () => {
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', {
      token: token(COMPRADOR),
      body: { id_reserva: '', total: -5 },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'VALIDACION_FALLIDA');
    assert.ok(r.body.detalles.length >= 3);
  });

  it('responde 400 si el body no es JSON', async () => {
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', {
      token: token(COMPRADOR),
      body: '{ esto no es json',
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'JSON_INVALIDO');
  });

  it('responde 401 sin token o con token inválido', async () => {
    const sin = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', { body: orden() });
    assert.equal(sin.status, 401);
    const malo = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', { token: 'abc.def.ghi', body: orden() });
    assert.equal(malo.status, 401);
    assert.equal(malo.body.error, 'NO_AUTENTICADO');
  });
});

describe('POST /transacciones con metodo "formulario" (Stripe Elements del front)', () => {
  const ordenFormulario = () => ({ ...orden(), metodo: 'formulario' });

  it('es el método por defecto: url_checkout lleva al front de Pagos y devuelve client_secret', async () => {
    const { metodo: _m, ...sinMetodo } = ordenFormulario();
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', { token: token(COMPRADOR), body: sinMetodo });
    assert.equal(r.status, 201);
    assert.equal(r.body.metodo, 'formulario');
    assert.equal(r.body.estado_pago, 'PENDIENTE');
    assert.equal(r.body.url_checkout, `http://localhost:5173/?id_pago=${r.body.id_pago}`);
    assert.match(r.body.client_secret, /^pi_.+_secret_/);
    const guardado = await app.deps.repo.buscarPorId(r.body.id_pago);
    assert.equal(guardado?.stripe_session_id, null);
    assert.match(guardado?.stripe_payment_intent_id ?? '', /^pi_/);
  });

  it('el reintento devuelve el mismo pago y vuelve a entregar el client_secret', async () => {
    const cuerpo = ordenFormulario();
    const a = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', { token: token(COMPRADOR), body: cuerpo });
    const b = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', { token: token(COMPRADOR), body: cuerpo });
    assert.equal(b.status, 200);
    assert.equal(b.body.id_pago, a.body.id_pago);
    assert.equal(b.body.client_secret, a.body.client_secret);
  });

  it('después de confirmar la tarjeta, el polling consulta el PaymentIntent y aprueba el pago', async () => {
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', { token: token(COMPRADOR), body: ordenFormulario() });
    const pago = await app.deps.repo.buscarPorId(r.body.id_pago);
    (app.deps.pasarela as MockPasarela).simularEstado(pago!.stripe_payment_intent_id!, 'PAGADA');
    const g = await llamar(app.url, 'GET', `/api/v1/pagos/${r.body.id_pago}`, { token: token(COMPRADOR) });
    assert.equal(g.body.estado_pago, 'APROBADO');
    assert.equal(g.body.metodo, 'formulario');
  });

  it('el webhook payment_intent.succeeded aprueba el pago', async () => {
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', { token: token(COMPRADOR), body: ordenFormulario() });
    const pago = await app.deps.repo.buscarPorId(r.body.id_pago);
    const evento = {
      id: `evt_pi_${Date.now()}`,
      type: 'payment_intent.succeeded',
      data: { object: { id: pago!.stripe_payment_intent_id, object: 'payment_intent', metadata: { id_pago: pago!.id_pago } } },
    };
    const w = await llamar(app.url, 'POST', '/api/v1/pagos/webhooks/stripe', { body: evento });
    assert.equal(w.body.estado_pago, 'APROBADO');
  });

  it('anular un pago del formulario PENDIENTE cancela el PaymentIntent (ANULADO) y uno aprobado se reembolsa', async () => {
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', { token: token(COMPRADOR), body: ordenFormulario() });
    const anular = await llamar(app.url, 'POST', `/api/v1/pagos/${r.body.id_pago}/reembolso`, {
      token: token(COMPRADOR),
      body: { motivo: 'Cambio de planes' },
    });
    assert.equal(anular.body.accion, 'ANULADO');

    const r2 = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', { token: token(COMPRADOR), body: ordenFormulario() });
    const p2 = await app.deps.repo.buscarPorId(r2.body.id_pago);
    (app.deps.pasarela as MockPasarela).simularEstado(p2!.stripe_payment_intent_id!, 'PAGADA');
    const reemb = await llamar(app.url, 'POST', `/api/v1/pagos/${r2.body.id_pago}/reembolso`, {
      token: token(COMPRADOR),
      body: { motivo: 'Evento suspendido' },
    });
    assert.equal(reemb.body.accion, 'REEMBOLSADO');
  });

  it('GET /{id_pago}/checkout entrega al front el monto y el client_secret; sin secreto si ya se pagó', async () => {
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', { token: token(COMPRADOR), body: ordenFormulario() });
    const c = await llamar(app.url, 'GET', `/api/v1/pagos/${r.body.id_pago}/checkout`, { token: token(COMPRADOR) });
    assert.equal(c.status, 200);
    assert.equal(c.body.monto, 15000);
    assert.equal(c.body.client_secret, r.body.client_secret);
    const ajeno = await llamar(app.url, 'GET', `/api/v1/pagos/${r.body.id_pago}/checkout`, { token: token(OTRO) });
    assert.equal(ajeno.status, 403);
    const pago = await app.deps.repo.buscarPorId(r.body.id_pago);
    (app.deps.pasarela as MockPasarela).simularEstado(pago!.stripe_payment_intent_id!, 'PAGADA');
    const pagado = await llamar(app.url, 'GET', `/api/v1/pagos/${r.body.id_pago}/checkout`, { token: token(COMPRADOR) });
    assert.equal(pagado.body.estado_pago, 'APROBADO');
    assert.equal(pagado.body.client_secret, null);
  });

  it('rechaza un metodo desconocido (400)', async () => {
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/transacciones', {
      token: token(COMPRADOR),
      body: { ...orden(), metodo: 'efectivo' },
    });
    assert.equal(r.status, 400);
  });
});

describe('GET /{id_pago} — polling de estado (HU 1.4, HU 1.6)', () => {
  it('el dueño consulta su pago PENDIENTE', async () => {
    const { id_pago } = await crearPago();
    const r = await llamar(app.url, 'GET', `/api/v1/pagos/${id_pago}`, { token: token(COMPRADOR) });
    assert.equal(r.status, 200);
    assert.equal(r.body.estado_pago, 'PENDIENTE');
    assert.equal(r.body.monto, 15000);
  });

  it('otro comprador recibe 403; un servicio (rol SERVICIO) sí puede consultar', async () => {
    const { id_pago } = await crearPago();
    const otro = await llamar(app.url, 'GET', `/api/v1/pagos/${id_pago}`, { token: token(OTRO) });
    assert.equal(otro.status, 403);
    const servicio = await llamar(app.url, 'GET', `/api/v1/pagos/${id_pago}`, { token: token('svc-entradas', 'SERVICIO') });
    assert.equal(servicio.status, 200);
  });

  it('responde 404 si no existe y 400 si el id no es UUID', async () => {
    const r404 = await llamar(app.url, 'GET', '/api/v1/pagos/00000000-0000-4000-8000-000000000000', { token: token(COMPRADOR) });
    assert.equal(r404.status, 404);
    assert.equal(r404.body.error, 'PAGO_NO_ENCONTRADO');
    const r400 = await llamar(app.url, 'GET', '/api/v1/pagos/pay-112233', { token: token(COMPRADOR) });
    assert.equal(r400.status, 400);
  });

  it('si el webhook no llegó, el polling consulta a la pasarela y aprueba el pago', async () => {
    const { id_pago } = await crearPago();
    (app.deps.pasarela as MockPasarela).simularEstado(await sesionDe(id_pago), 'PAGADA');
    const r = await llamar(app.url, 'GET', `/api/v1/pagos/${id_pago}`, { token: token(COMPRADOR) });
    assert.equal(r.body.estado_pago, 'APROBADO');
    assert.equal(r.body.url_checkout, null);
    const guardado = await app.deps.repo.buscarPorId(id_pago);
    assert.equal(guardado?.estado_pago, 'APROBADO', 'el estado queda actualizado en la BD');
  });

  it('si la sesión expiró, el polling devuelve RECHAZADO con motivo', async () => {
    const { id_pago } = await crearPago();
    (app.deps.pasarela as MockPasarela).simularEstado(await sesionDe(id_pago), 'EXPIRADA');
    const r = await llamar(app.url, 'GET', `/api/v1/pagos/${id_pago}`, { token: token(COMPRADOR) });
    assert.equal(r.body.estado_pago, 'RECHAZADO');
    assert.match(r.body.motivo_rechazo, /expir/);
  });
});

describe('POST /webhooks/stripe — aviso de la pasarela (HU 1.3, HU 1.4)', () => {
  it('checkout.session.completed aprueba el pago y guarda el evento', async () => {
    const { id_pago } = await crearPago();
    const evento = await aprobar(id_pago);
    const pago = await app.deps.repo.buscarPorId(id_pago);
    assert.equal(pago?.estado_pago, 'APROBADO');
    assert.ok(pago?.stripe_payment_intent_id, 'guarda el PaymentIntent para poder reembolsar');
    assert.equal(await app.deps.repo.eventoWebhookExiste(evento.id), true);
  });

  it('un evento repetido por Stripe se ignora (duplicado: true)', async () => {
    const { id_pago } = await crearPago();
    const evento = eventoStripe('checkout.session.completed', await sesionDe(id_pago), id_pago, { payment_status: 'paid' });
    const primero = await llamar(app.url, 'POST', '/api/v1/pagos/webhooks/stripe', { body: evento });
    const repetido = await llamar(app.url, 'POST', '/api/v1/pagos/webhooks/stripe', { body: evento });
    assert.equal(primero.body.duplicado, false);
    assert.equal(repetido.status, 200);
    assert.equal(repetido.body.duplicado, true);
    const guardado = await app.deps.repo.buscarPorId(id_pago);
    assert.equal(guardado?.estado_pago, 'APROBADO');
  });

  it('checkout.session.expired rechaza el pago', async () => {
    const { id_pago } = await crearPago();
    const evento = eventoStripe('checkout.session.expired', await sesionDe(id_pago), id_pago);
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/webhooks/stripe', { body: evento });
    assert.equal(r.body.estado_pago, 'RECHAZADO');
  });

  it('no permite volver atrás: un expired tras aprobar no cambia el estado', async () => {
    const { id_pago } = await crearPago();
    await aprobar(id_pago);
    const evento = eventoStripe('checkout.session.expired', await sesionDe(id_pago), id_pago);
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/webhooks/stripe', { body: evento });
    assert.equal(r.body.estado_pago, 'APROBADO');
  });

  it('responde 400 si el cuerpo no es JSON', async () => {
    const r = await llamar(app.url, 'POST', '/api/v1/pagos/webhooks/stripe', { body: 'xx' });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'FIRMA_WEBHOOK_INVALIDA');
  });
});

describe('POST /{id_pago}/reembolso — anular o reembolsar (HU 3.1, HU 3.3)', () => {
  it('un pago PENDIENTE queda ANULADO (no se cobra)', async () => {
    const { id_pago } = await crearPago();
    const r = await llamar(app.url, 'POST', `/api/v1/pagos/${id_pago}/reembolso`, {
      token: token('svc-entradas', 'SERVICIO'),
      body: { motivo: 'Hold de la reserva vencido' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.accion, 'ANULADO');
    assert.equal(r.body.estado_pago, 'ANULADO');
    assert.equal(r.body.reembolso, null);
  });

  it('un pago APROBADO queda REEMBOLSADO y se registra el reembolso', async () => {
    const { id_pago } = await crearPago();
    await aprobar(id_pago);
    const r = await llamar(app.url, 'POST', `/api/v1/pagos/${id_pago}/reembolso`, {
      token: token('svc-entradas', 'SERVICIO'),
      body: { motivo: 'El usuario pagó después de que venció la reserva' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.accion, 'REEMBOLSADO');
    assert.equal(r.body.reembolso.monto, 15000);
    assert.equal(r.body.reembolso.estado_reembolso, 'EXITOSO');
    const reembolsos = await app.deps.repo.reembolsosDe(id_pago);
    assert.equal(reembolsos.length, 1);
  });

  it('el reintento del reembolso es idempotente (ya_procesado: true)', async () => {
    const { id_pago } = await crearPago();
    await aprobar(id_pago);
    const cuerpo = { motivo: 'Reserva liberada' };
    const t = token('svc-entradas', 'SERVICIO');
    await llamar(app.url, 'POST', `/api/v1/pagos/${id_pago}/reembolso`, { token: t, body: cuerpo });
    const r = await llamar(app.url, 'POST', `/api/v1/pagos/${id_pago}/reembolso`, { token: t, body: cuerpo });
    assert.equal(r.status, 200);
    assert.equal(r.body.ya_procesado, true);
    assert.equal((await app.deps.repo.reembolsosDe(id_pago)).length, 1, 'no se devuelve dos veces');
  });

  it('si el usuario pagó justo antes de anular, se reembolsa en vez de anular', async () => {
    const { id_pago } = await crearPago();
    (app.deps.pasarela as MockPasarela).simularEstado(await sesionDe(id_pago), 'PAGADA');
    const r = await llamar(app.url, 'POST', `/api/v1/pagos/${id_pago}/reembolso`, {
      token: token('svc-entradas', 'SERVICIO'),
      body: { motivo: 'Hold vencido' },
    });
    assert.equal(r.body.accion, 'REEMBOLSADO');
  });

  it('un pago RECHAZADO no se puede reembolsar (409)', async () => {
    const { id_pago } = await crearPago();
    await llamar(app.url, 'POST', '/api/v1/pagos/webhooks/stripe', {
      body: eventoStripe('checkout.session.expired', await sesionDe(id_pago), id_pago),
    });
    const r = await llamar(app.url, 'POST', `/api/v1/pagos/${id_pago}/reembolso`, {
      token: token(COMPRADOR),
      body: { motivo: 'Quiero mi dinero' },
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'PAGO_NO_REEMBOLSABLE');
  });

  it('otro comprador no puede anular un pago ajeno (403) y el motivo es obligatorio (400)', async () => {
    const { id_pago } = await crearPago();
    const ajeno = await llamar(app.url, 'POST', `/api/v1/pagos/${id_pago}/reembolso`, {
      token: token(OTRO),
      body: { motivo: 'Intento indebido' },
    });
    assert.equal(ajeno.status, 403);
    const sinMotivo = await llamar(app.url, 'POST', `/api/v1/pagos/${id_pago}/reembolso`, { token: token(COMPRADOR), body: {} });
    assert.equal(sinMotivo.status, 400);
  });
});

describe('GET /api/v1/pagos — listado para Promociones e historial del usuario (HU 3.4)', () => {
  const sufijo = Date.now();
  const COMPRADOR_A = `usr-promo-a-${sufijo}`;
  const COMPRADOR_B = `usr-promo-b-${sufijo}`;
  let aprobadoA = '';

  beforeEach(async () => {
    if (aprobadoA) return;
    const a = await crearPago(COMPRADOR_A);
    await crearPago(COMPRADOR_A); // queda PENDIENTE
    const b = await crearPago(COMPRADOR_B);
    await aprobar(a.id_pago);
    await aprobar(b.id_pago);
    aprobadoA = a.id_pago;
  });

  it('Promociones (rol SERVICIO) obtiene los id_pago APROBADOS de un usuario', async () => {
    const r = await llamar(app.url, 'GET', `/api/v1/pagos?id_usuario=${COMPRADOR_A}&estado=APROBADO`, {
      token: token('svc-promociones', 'SERVICIO'),
    });
    assert.equal(r.status, 200);
    assert.deepEqual(
      r.body.datos.map((p: { id_pago: string }) => p.id_pago),
      [aprobadoA],
    );
    assert.equal(r.body.paginacion.total, 1);
  });

  it('un comprador solo ve sus propios pagos', async () => {
    const r = await llamar(app.url, 'GET', '/api/v1/pagos', { token: token(COMPRADOR_B) });
    assert.equal(r.status, 200);
    assert.ok(r.body.datos.length > 0);
    assert.ok(r.body.datos.every((p: { id_usuario: string }) => p.id_usuario === COMPRADOR_B));
    const ajeno = await llamar(app.url, 'GET', `/api/v1/pagos?id_usuario=${COMPRADOR_A}`, { token: token(COMPRADOR_B) });
    assert.equal(ajeno.status, 403);
  });

  it('pagina los resultados y valida los filtros', async () => {
    const r = await llamar(app.url, 'GET', `/api/v1/pagos?id_usuario=${COMPRADOR_A}&limite=1&pagina=2`, {
      token: token('svc-promociones', 'SERVICIO'),
    });
    assert.equal(r.body.datos.length, 1);
    assert.deepEqual(r.body.paginacion, { pagina: 2, limite: 1, total: 2, total_paginas: 2 });
    const malo = await llamar(app.url, 'GET', '/api/v1/pagos?estado=PAGADO', { token: token(COMPRADOR) });
    assert.equal(malo.status, 400);
  });
});

describe('DELETE /{id_pago} — eliminar un pago de la BD (solo ADMIN)', () => {
  const admin = () => token('usr-admin', 'ADMIN');

  async function anular(idPago: string) {
    const r = await llamar(app.url, 'POST', `/api/v1/pagos/${idPago}/reembolso`, {
      token: token('svc-entradas', 'SERVICIO'),
      body: { motivo: 'Reserva liberada por Entradas' },
    });
    assert.equal(r.body.estado_pago, 'ANULADO');
  }

  it('ADMIN elimina un pago ANULADO y deja de existir en la BD (404 al consultarlo)', async () => {
    const { id_pago } = await crearPago();
    await anular(id_pago);
    const r = await llamar(app.url, 'DELETE', `/api/v1/pagos/${id_pago}`, { token: admin() });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { id_pago, estado_pago: 'ANULADO', eliminado: true });
    assert.equal(await app.deps.repo.buscarPorId(id_pago), null);
    const consulta = await llamar(app.url, 'GET', `/api/v1/pagos/${id_pago}`, { token: admin() });
    assert.equal(consulta.status, 404);
  });

  it('un pago RECHAZADO con eventos de webhook se elimina y los eventos quedan como evidencia', async () => {
    const { id_pago } = await crearPago();
    const evento = eventoStripe('checkout.session.expired', await sesionDe(id_pago), id_pago);
    await llamar(app.url, 'POST', '/api/v1/pagos/webhooks/stripe', { body: evento });
    const r = await llamar(app.url, 'DELETE', `/api/v1/pagos/${id_pago}`, { token: admin() });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.estado_pago, 'RECHAZADO');
    assert.equal(await app.deps.repo.eventoWebhookExiste(evento.id), true);
  });

  it('no elimina pagos PENDIENTES, APROBADOS ni REEMBOLSADOS (409 PAGO_NO_ELIMINABLE)', async () => {
    const pendiente = await crearPago();
    const aprobado = await crearPago();
    await aprobar(aprobado.id_pago);
    const reembolsado = await crearPago();
    await aprobar(reembolsado.id_pago);
    await llamar(app.url, 'POST', `/api/v1/pagos/${reembolsado.id_pago}/reembolso`, {
      token: token('svc-entradas', 'SERVICIO'),
      body: { motivo: 'Reembolso de prueba' },
    });
    for (const { id_pago } of [pendiente, aprobado, reembolsado]) {
      const r = await llamar(app.url, 'DELETE', `/api/v1/pagos/${id_pago}`, { token: admin() });
      assert.equal(r.status, 409, JSON.stringify(r.body));
      assert.equal(r.body.error, 'PAGO_NO_ELIMINABLE');
      assert.ok(await app.deps.repo.buscarPorId(id_pago), 'el pago sigue en la BD');
    }
  });

  it('solo ADMIN: el dueño y el rol SERVICIO reciben 403; sin token 401; id inexistente 404', async () => {
    const { id_pago } = await crearPago();
    await anular(id_pago);
    const dueno = await llamar(app.url, 'DELETE', `/api/v1/pagos/${id_pago}`, { token: token(COMPRADOR) });
    assert.equal(dueno.status, 403);
    const servicio = await llamar(app.url, 'DELETE', `/api/v1/pagos/${id_pago}`, { token: token('svc', 'SERVICIO') });
    assert.equal(servicio.status, 403);
    const sinToken = await llamar(app.url, 'DELETE', `/api/v1/pagos/${id_pago}`);
    assert.equal(sinToken.status, 401);
    const noExiste = await llamar(app.url, 'DELETE', '/api/v1/pagos/00000000-0000-4000-8000-000000000000', { token: admin() });
    assert.equal(noExiste.status, 404);
  });
});
