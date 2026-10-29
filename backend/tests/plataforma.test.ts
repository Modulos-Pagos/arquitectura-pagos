import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Config } from '../src/config/env';
import { AuthClient } from '../src/integraciones/auth.client';
import { construirEvento, PublicadorMock, type EventoPago, type PublicadorEventos } from '../src/integraciones/eventos';
import { formatearRut, normalizarRut } from '../src/pagos/pago.dto';
import type { Pago } from '../src/pagos/pago.types';
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
 * Integración con la plataforma TicketU (Avance 2):
 *  - rutas bajo el prefijo del API Gateway (/api/pagos, el Gateway no reescribe el path),
 *  - eventos pago.* publicados en el broker (RabbitMQ; aquí con el publicador mock),
 *  - contrato Auth ↔ Pagos v1.3: sesión por cookie jwt validada con Auth y destinatario (comprar para otra persona).
 */

const COMPRADOR = 'usr-comprador-1';
const OTRO = 'usr-otro-2';
const GW = '/api/pagos';

let config: Config;
let app: AppDePrueba;
let eventos: PublicadorMock;

const orden = (idReserva = nuevaReserva()) => ({
  id_reserva: idReserva,
  total: 15000,
  cantidad_entradas: 2,
  metodo: 'checkout',
});

async function crearPago(idUsuario = COMPRADOR) {
  const r = await llamar(app.url, 'POST', `${GW}/transacciones`, { token: token(idUsuario), body: orden() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.id_pago as string;
}

async function webhook(a: AppDePrueba, tipo: string, idPago: string, extra: Record<string, unknown> = {}) {
  const pago = await a.deps.repo.buscarPorId(idPago);
  assert.ok(pago?.stripe_session_id);
  const evento = eventoStripe(tipo, pago.stripe_session_id, idPago, extra);
  const r = await llamar(a.url, 'POST', `${GW}/webhooks/stripe`, { body: evento });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return evento;
}

const aprobar = (idPago: string, a = app) => webhook(a, 'checkout.session.completed', idPago, { payment_status: 'paid' });
/** Solo los eventos pago.* (Entradas); pago.completado para Promociones se prueba en promociones.test.ts. */
const eventosDe = (idPago: string): EventoPago[] =>
  eventos.publicados.filter((e): e is EventoPago => e.id_pago === idPago && 'estado_pago' in e);

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

describe('Rutas del API Gateway (/api/pagos)', () => {
  it('las operaciones responden igual bajo /api/pagos y /api/v1/pagos', async () => {
    const idPago = await crearPago();
    const gw = await llamar(app.url, 'GET', `${GW}/${idPago}`, { token: token(COMPRADOR) });
    const v1 = await llamar(app.url, 'GET', `/api/v1/pagos/${idPago}`, { token: token(COMPRADOR) });
    assert.equal(gw.status, 200);
    assert.equal(gw.body.id_pago, idPago);
    assert.deepEqual(gw.body, v1.body);
    const lista = await llamar(app.url, 'GET', `${GW}?id_reserva=no-existe`, { token: token('svc', 'staff') });
    assert.equal(lista.status, 200);
    assert.deepEqual(lista.body.datos, []);
  });

  it('GET /api/pagos/health responde sin token (para probar a través del Gateway)', async () => {
    const r = await llamar(app.url, 'GET', `${GW}/health`);
    assert.equal(r.status, 200);
    assert.equal(r.body.estado, 'ok');
  });

  it('el webhook de Stripe también se recibe en /api/pagos/webhooks/stripe', async () => {
    const idPago = await crearPago();
    await aprobar(idPago);
    const r = await llamar(app.url, 'GET', `${GW}/${idPago}`, { token: token(COMPRADOR) });
    assert.equal(r.body.estado_pago, 'APROBADO');
  });
});

describe('Eventos en el broker (pago.*)', () => {
  it('al aprobarse publica pago.realizado con los datos que necesita Entradas', async () => {
    const idPago = await crearPago();
    await aprobar(idPago);
    const [evento] = eventosDe(idPago);
    assert.equal(eventosDe(idPago).length, 1);
    assert.equal(evento.tipo, 'pago.realizado');
    assert.equal(evento.version, 1);
    assert.equal(evento.estado_pago, 'APROBADO');
    assert.equal(evento.id_usuario, COMPRADOR);
    assert.equal(evento.monto, 15000);
    assert.equal(evento.moneda, 'CLP');
    assert.match(evento.id_reserva, /^res-test-/);
    assert.match(evento.id_mensaje, /^[0-9a-f-]{36}$/);
    assert.equal(evento.id_evento, null);
    assert.equal(evento.nombre_codigo, null);
    assert.equal(evento.destinatario, null);
  });

  it('un webhook repetido por Stripe no vuelve a publicar el evento', async () => {
    const idPago = await crearPago();
    const evento = await aprobar(idPago);
    const r = await llamar(app.url, 'POST', `${GW}/webhooks/stripe`, { body: evento });
    assert.equal(r.body.duplicado, true);
    assert.equal(eventosDe(idPago).length, 1);
  });

  it('publica pago.rechazado (sesión expirada), pago.anulado y pago.reembolsado con su motivo', async () => {
    const expirado = await crearPago();
    await webhook(app, 'checkout.session.expired', expirado);
    assert.equal(eventosDe(expirado)[0].tipo, 'pago.rechazado');
    assert.equal(eventosDe(expirado)[0].motivo, 'La sesión de pago expiró sin completarse');

    const anulado = await crearPago();
    await llamar(app.url, 'POST', `${GW}/${anulado}/reembolso`, { token: token('svc', 'staff'), body: { motivo: 'Reserva vencida' } });
    assert.equal(eventosDe(anulado)[0].tipo, 'pago.anulado');
    assert.equal(eventosDe(anulado)[0].motivo, 'Reserva vencida');

    const reembolsado = await crearPago();
    await aprobar(reembolsado);
    const r = await llamar(app.url, 'POST', `${GW}/${reembolsado}/reembolso`, {
      token: token('svc', 'staff'),
      body: { motivo: 'Sin stock' },
    });
    assert.equal(r.body.accion, 'REEMBOLSADO');
    assert.deepEqual(eventosDe(reembolsado).map((e) => e.tipo), ['pago.realizado', 'pago.reembolsado']);
    assert.equal(eventosDe(reembolsado)[1].motivo, 'Sin stock');
  });

  it('por defecto la routing key es pago.realizado (guía del Platform Team); con BROKER_SEPARADOR="_" es pago_realizado', () => {
    const pago = { id_pago: 'p', id_reserva: 'r', id_usuario: 'u', monto: 1, moneda: 'CLP', estado_pago: 'APROBADO', motivo_rechazo: null } as Pago;
    assert.equal(construirEvento(pago, null, '.')?.tipo, 'pago.realizado');
    assert.equal(construirEvento(pago, null, '_')?.tipo, 'pago_realizado');
    assert.equal(construirEvento({ ...pago, estado_pago: 'PENDIENTE' }, null, '_'), null);
  });

  it('si el broker está caído el pago igual se aprueba (la publicación no bloquea el negocio)', async () => {
    const caido: PublicadorEventos = {
      modo: 'rabbitmq',
      publicar: async () => {
        throw new Error('ECONNREFUSED');
      },
      cerrar: async () => {},
    };
    const otra = await levantarApp(config, { eventos: caido });
    try {
      const r = await llamar(otra.url, 'POST', `${GW}/transacciones`, { token: token(COMPRADOR), body: orden() });
      await aprobar(r.body.id_pago, otra);
      const pago = await otra.deps.repo.buscarPorId(r.body.id_pago);
      assert.equal(pago?.estado_pago, 'APROBADO');
    } finally {
      await otra.cerrar();
    }
  });
});

describe('Auth ↔ Pagos v1.3: validar sesión (cookie jwt + x-api-key)', () => {
  /** Auth falso con el contrato v1.3: GET /internal/validar-sesion. */
  async function conAuthFalso(responder: (req: http.IncomingMessage, res: http.ServerResponse) => void, prueba: (a: AppDePrueba, recibido: { cookie?: string; apiKey?: string }) => Promise<void>) {
    const recibido: { cookie?: string; apiKey?: string } = {};
    const authFalso = http.createServer((req, res) => {
      recibido.cookie = req.headers.cookie;
      recibido.apiKey = req.headers['x-api-key'] as string | undefined;
      res.setHeader('Content-Type', 'application/json');
      responder(req, res);
    });
    await new Promise<void>((ok) => authFalso.listen(0, ok));
    const { port } = authFalso.address() as AddressInfo;
    const otra = await levantarApp(config, {
      auth: new AuthClient({ baseUrl: `http://127.0.0.1:${port}`, apiKey: 'clave-interna', timeoutMs: 1000 }),
    });
    try {
      await prueba(otra, recibido);
    } finally {
      await otra.cerrar();
      authFalso.close();
    }
  }

  const sesionValida = (id: string, rol = 'usuario') =>
    JSON.stringify({ valido: true, usuario: { id_usuario: id, nombre_completo: 'Javier Romero', rut: '21.234.567-8', correo_electronico: 'javier@ejemplo.cl', rol } });

  it('reenvía el header Cookie intacto y la x-api-key; usa el id y el rol que entrega Auth', async () => {
    await conAuthFalso(
      (req, res) => {
        if (req.url !== '/internal/validar-sesion') {
          res.statusCode = 404;
          res.end('{}');
          return;
        }
        res.setHeader('Cache-Control', 'no-store');
        res.end(sesionValida('3f1e2c1a-4b8d-4a2e-9c3f-7d1e2f9b2d4a'));
      },
      async (otra, recibido) => {
        const cookie = 'tema=oscuro; jwt=token-emitido-por-auth';
        const r = await llamar(otra.url, 'POST', `${GW}/transacciones`, { headers: { Cookie: cookie }, body: orden() });
        assert.equal(r.status, 201, JSON.stringify(r.body));
        assert.equal(recibido.cookie, cookie);
        assert.equal(recibido.apiKey, 'clave-interna');
        const pago = await otra.deps.repo.buscarPorId(r.body.id_pago);
        assert.equal(pago?.id_usuario, '3f1e2c1a-4b8d-4a2e-9c3f-7d1e2f9b2d4a');

        const perfil = await llamar(otra.url, 'GET', `${GW}/comprador/perfil`, { headers: { Cookie: cookie } });
        assert.equal(perfil.status, 200);
        assert.deepEqual(perfil.body, {
          id_usuario: '3f1e2c1a-4b8d-4a2e-9c3f-7d1e2f9b2d4a',
          nombre_completo: 'Javier Romero',
          rut: '21.234.567-8',
          correo_electronico: 'javier@ejemplo.cl',
          rol: 'usuario',
        });
      },
    );
  });

  it('si Auth rechaza la sesión (401), Pagos responde 401', async () => {
    await conAuthFalso(
      (_req, res) => {
        res.statusCode = 401;
        res.end(JSON.stringify({ valido: false, codigo_http: 401, error: 'unauthorized', mensaje: 'Sesión ausente, inválida, expirada o revocada' }));
      },
      async (otra) => {
        const r = await llamar(otra.url, 'GET', `${GW}/comprador/perfil`, { token: token(COMPRADOR) });
        assert.equal(r.status, 401);
        assert.equal(r.body.error, 'NO_AUTENTICADO');
      },
    );
  });

  it('x-api-key rechazada (403 de Auth) → 403; error interno de Auth (500) → 500', async () => {
    let estado = 403;
    await conAuthFalso(
      (_req, res) => {
        res.statusCode = estado;
        res.end('{}');
      },
      async (otra) => {
        const r403 = await llamar(otra.url, 'GET', `${GW}/comprador/perfil`, { headers: { Cookie: 'jwt=x' } });
        assert.equal(r403.status, 403);
        assert.equal(r403.body.error, 'SERVICIO_NO_AUTORIZADO');
        estado = 500;
        const r500 = await llamar(otra.url, 'GET', `${GW}/comprador/perfil`, { headers: { Cookie: 'jwt=x' } });
        assert.equal(r500.status, 500);
      },
    );
  });

  it('el rol staff de Auth puede operar sobre pagos ajenos; organizador no', async () => {
    const idPago = await crearPago();
    let rol = 'staff';
    await conAuthFalso(
      (_req, res) => res.end(sesionValida('usr-de-auth', rol)),
      async (otra) => {
        const staff = await llamar(otra.url, 'GET', `${GW}/${idPago}`, { headers: { Cookie: 'jwt=x' } });
        assert.equal(staff.status, 200);
        rol = 'organizador';
        const org = await llamar(otra.url, 'GET', `${GW}/${idPago}`, { headers: { Cookie: 'jwt=x' } });
        assert.equal(org.status, 403);
      },
    );
  });

  it('fail-secure: si Auth no responde, 503 AUTH_NO_DISPONIBLE y no se crea el pago', async () => {
    const otra = await levantarApp(config, {
      auth: new AuthClient({ baseUrl: 'http://127.0.0.1:9', apiKey: 'k', timeoutMs: 300 }),
    });
    try {
      const reserva = nuevaReserva();
      const r = await llamar(otra.url, 'POST', `${GW}/transacciones`, { headers: { Cookie: 'jwt=x' }, body: orden(reserva) });
      assert.equal(r.status, 503);
      assert.equal(r.body.error, 'AUTH_NO_DISPONIBLE');
      assert.equal(await otra.deps.repo.buscarPorReserva(reserva), null);
    } finally {
      await otra.cerrar();
    }
  });

  it('en cada petición consulta a Auth, aunque no venga cookie o venga un Bearer: Auth decide (401)', async () => {
    const recibidas: Array<string | undefined> = [];
    await conAuthFalso(
      (req, res) => {
        recibidas.push(req.headers.cookie);
        res.statusCode = 401;
        res.end(JSON.stringify({ valido: false, codigo_http: 401, error: 'unauthorized', mensaje: 'Sesión ausente, inválida, expirada o revocada' }));
      },
      async (otra) => {
        const sinCookie = await llamar(otra.url, 'GET', `${GW}/comprador/perfil`, { headers: { Cookie: 'otra=1' } });
        assert.equal(sinCookie.status, 401);
        const bearer = await llamar(otra.url, 'GET', `${GW}/comprador/perfil`, { headers: { Authorization: 'Bearer abc' } });
        assert.equal(bearer.status, 401);
        // El header Cookie se reenvía tal cual llegó (o no se envía si no vino); el Bearer nunca se convierte en cookie.
        assert.deepEqual(recibidas, ['otra=1', undefined]);
      },
    );
  });

  it('staff consulta y reembolsa pagos ajenos, pero no los paga ni elige el destinatario', async () => {
    const idPago = await crearPago();
    await conAuthFalso(
      (_req, res) => res.end(sesionValida('usr-staff-auth', 'staff')),
      async (otra) => {
        const destinatario = await llamar(otra.url, 'PUT', `${GW}/${idPago}/destinatario`, {
          headers: { Cookie: 'jwt=x' },
          body: { nombre: 'Ana Pérez', email: 'ana@uv.cl' },
        });
        assert.equal(destinatario.status, 403);
        const checkout = await llamar(otra.url, 'GET', `${GW}/${idPago}/checkout`, { headers: { Cookie: 'jwt=x' } });
        assert.equal(checkout.status, 403);
        const reembolso = await llamar(otra.url, 'POST', `${GW}/${idPago}/reembolso`, {
          headers: { Cookie: 'jwt=x' },
          body: { motivo: 'Hold de la reserva vencido' },
        });
        assert.equal(reembolso.status, 200, JSON.stringify(reembolso.body));
        assert.equal(reembolso.body.estado_pago, 'ANULADO');
      },
    );
  });
});

describe('Comprar para otra persona (destinatario)', () => {
  it('la búsqueda por correo se retiró (Auth v1.3 no la expone): 404 de ruta', async () => {
    const r = await llamar(app.url, 'GET', `${GW}/comprador/destinatario?email=a@b.cl`, { token: token(COMPRADOR) });
    assert.notEqual(r.status, 200);
  });

  it('el dueño registra un destinatario ingresado a mano; queda en el pago y en el evento pago.realizado', async () => {
    const idPago = await crearPago();
    const r = await llamar(app.url, 'PUT', `${GW}/${idPago}/destinatario`, {
      token: token(COMPRADOR),
      body: { nombre: '  Ana   Pérez ', email: 'Ana.Perez@Uv.cl', rut: '11.111.111-1' },
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.destinatario.nombre, 'Ana Pérez');
    assert.equal(r.body.destinatario.email, 'ana.perez@uv.cl');
    assert.equal(r.body.destinatario.rut, '11.111.111-1');
    assert.equal('id_usuario' in r.body.destinatario, false);

    const pago = await llamar(app.url, 'GET', `${GW}/${idPago}`, { token: token('svc', 'staff') });
    assert.equal(pago.body.destinatario.email, 'ana.perez@uv.cl');

    await aprobar(idPago);
    assert.equal(eventosDe(idPago)[0].destinatario?.nombre, 'Ana Pérez');
  });

  it('valida los datos (RUT con dígito verificador) y solo lo permite al dueño con el pago PENDIENTE', async () => {
    const idPago = await crearPago();
    const rutMalo = await llamar(app.url, 'PUT', `${GW}/${idPago}/destinatario`, {
      token: token(COMPRADOR),
      body: { nombre: 'Ana Pérez', email: 'ana@uv.cl', rut: '11111111-2' },
    });
    assert.equal(rutMalo.status, 400);

    const ajeno = await llamar(app.url, 'PUT', `${GW}/${idPago}/destinatario`, {
      token: token(OTRO),
      body: { nombre: 'Ana Pérez', email: 'ana@uv.cl' },
    });
    assert.equal(ajeno.status, 403);

    const organizador = await llamar(app.url, 'PUT', `${GW}/${idPago}/destinatario`, {
      token: token('org-1', 'organizador'),
      body: { nombre: 'Ana Pérez', email: 'ana@uv.cl' },
    });
    assert.equal(organizador.status, 403);

    await aprobar(idPago);
    const tarde = await llamar(app.url, 'PUT', `${GW}/${idPago}/destinatario`, {
      token: token(COMPRADOR),
      body: { nombre: 'Ana Pérez', email: 'ana@uv.cl' },
    });
    assert.equal(tarde.status, 409);
    assert.equal(tarde.body.error, 'PAGO_NO_EDITABLE');
  });

  it('DELETE /{id_pago}/destinatario vuelve la entrada al comprador', async () => {
    const idPago = await crearPago();
    await llamar(app.url, 'PUT', `${GW}/${idPago}/destinatario`, { token: token(COMPRADOR), body: { nombre: 'Ana Pérez', email: 'ana@uv.cl' } });
    const r = await llamar(app.url, 'DELETE', `${GW}/${idPago}/destinatario`, { token: token(COMPRADOR) });
    assert.equal(r.status, 200);
    const pago = await llamar(app.url, 'GET', `${GW}/${idPago}`, { token: token(COMPRADOR) });
    assert.equal(pago.body.destinatario, null);
  });

  it('normaliza y verifica RUT chilenos', () => {
    assert.equal(normalizarRut('11.111.111-1'), '11111111-1');
    assert.equal(normalizarRut('12.345.678-5'), '12345678-5');
    assert.equal(normalizarRut('7654321-6'), '7654321-6');
    assert.equal(normalizarRut('12345678-9'), null);
    assert.equal(formatearRut('11111111-1'), '11.111.111-1');
    assert.equal(formatearRut('7654321-k'), '7.654.321-K');
    assert.equal(formatearRut('12.345.678-5'), '12.345.678-5');
    assert.equal(formatearRut(null), null);
  });
});
