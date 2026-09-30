import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import { AppError } from '../src/errores';
import { codificarFormulario, StripePasarela } from '../src/integraciones/pasarela/stripe.pasarela';
import { validarCrearTransaccion, validarFiltrosListado, validarIdPago, validarReembolso } from '../src/pagos/pago.dto';
import { firmarJwt, verificarJwt } from '../src/utils/jwt';

function codigoDe(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.codigo : (error as Error).message;
  }
  return undefined;
}

describe('Validación de DTOs', () => {
  it('acepta una orden de compra válida', () => {
    const dto = validarCrearTransaccion({ id_reserva: ' res-1 ', id_evento: 'evt-1', total: 15000, cantidad_entradas: 2 });
    assert.deepEqual(dto, { id_reserva: 'res-1', id_evento: 'evt-1', total: 15000, cantidad_entradas: 2, metodo: 'formulario' });
    const sinEvento = validarCrearTransaccion({ id_reserva: 'res-2', total: 15000, cantidad_entradas: 2 });
    assert.equal(sinEvento.id_evento, null);
  });

  it('rechaza total negativo, decimal o como texto', () => {
    for (const total of [-1, 0, 10.5, '15000']) {
      assert.equal(
        codigoDe(() => validarCrearTransaccion({ id_reserva: 'r', id_evento: 'e', total, cantidad_entradas: 1 })),
        'VALIDACION_FALLIDA',
        `total=${String(total)}`,
      );
    }
  });

  it('informa todos los campos obligatorios faltantes a la vez (id_evento es opcional)', () => {
    try {
      validarCrearTransaccion({});
      assert.fail('debió lanzar error');
    } catch (error) {
      assert.ok(error instanceof AppError);
      assert.equal((error.detalles as string[]).length, 3);
    }
  });

  it('exige motivo de 3 a 255 caracteres para reembolsar', () => {
    assert.equal(codigoDe(() => validarReembolso({ motivo: 'no' })), 'VALIDACION_FALLIDA');
    assert.deepEqual(validarReembolso({ motivo: 'Hold vencido' }), { motivo: 'Hold vencido' });
  });

  it('valida que id_pago sea un UUID', () => {
    assert.equal(codigoDe(() => validarIdPago('pay-112233')), 'VALIDACION_FALLIDA');
    const id = crypto.randomUUID();
    assert.equal(validarIdPago(id.toUpperCase()), id);
  });

  it('aplica valores por defecto y valida filtros del listado', () => {
    assert.deepEqual(validarFiltrosListado({ estado: 'aprobado' }), {
      id_usuario: undefined,
      id_reserva: undefined,
      estado_pago: 'APROBADO',
      pagina: 1,
      limite: 20,
    });
    assert.equal(codigoDe(() => validarFiltrosListado({ limite: '500' })), 'VALIDACION_FALLIDA');
    assert.equal(codigoDe(() => validarFiltrosListado({ estado: 'PAGADO' })), 'VALIDACION_FALLIDA');
  });
});

describe('JWT (tokens de Auth)', () => {
  it('verifica un token válido y devuelve sus claims', () => {
    const t = firmarJwt({ id_usuario: 'usr-1', rol: 'COMPRADOR' }, 'secreto');
    const payload = verificarJwt(t, 'secreto');
    assert.equal(payload.id_usuario, 'usr-1');
  });

  it('rechaza firma alterada, secreto distinto y token expirado', () => {
    const t = firmarJwt({ id_usuario: 'usr-1' }, 'secreto');
    const [h, p] = t.split('.');
    const alterado = `${h}.${Buffer.from(JSON.stringify({ id_usuario: 'admin', rol: 'ADMIN' })).toString('base64url')}.${t.split('.')[2]}`;
    assert.throws(() => verificarJwt(alterado, 'secreto'), /Firma/);
    assert.throws(() => verificarJwt(t, 'otro-secreto'), /Firma/);
    assert.throws(() => verificarJwt(`${h}.${p}`, 'secreto'), /Formato/);
    const expirado = firmarJwt({ id_usuario: 'usr-1' }, 'secreto', -10);
    assert.throws(() => verificarJwt(expirado, 'secreto'), /expirado/);
  });
});

describe('Integración Stripe (sin red)', () => {
  const secretoWebhook = 'whsec_prueba123';

  function pasarelaConFetch(respuestas: Array<{ status: number; body: unknown }>, llamadas: Array<{ url: string; init?: RequestInit }>) {
    const fetchFalso = (async (url: string | URL | Request, init?: RequestInit) => {
      llamadas.push({ url: String(url), init });
      const r = respuestas.shift() ?? { status: 500, body: {} };
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    return new StripePasarela({
      secretKey: 'sk_test_x',
      webhookSecret: secretoWebhook,
      timeoutMs: 1000,
      urlExito: 'http://front/pagos/exito',
      urlCancelacion: 'http://front/pagos/cancelado',
      fetchImpl: fetchFalso,
    });
  }

  it('codifica objetos anidados como formulario de Stripe', () => {
    const pares = codificarFormulario({ a: 1, line_items: [{ price_data: { currency: 'clp' } }], metadata: { id_pago: 'x' } });
    assert.deepEqual(pares.map(decodeURIComponent), ['a=1', 'line_items[0][price_data][currency]=clp', 'metadata[id_pago]=x']);
  });

  it('crea el checkout en CLP sin multiplicar por 100', async () => {
    const llamadas: Array<{ url: string; init?: RequestInit }> = [];
    const pasarela = pasarelaConFetch(
      [{ status: 200, body: { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1', expires_at: 1900000000 } }],
      llamadas,
    );
    const sesion = await pasarela.crearCheckout({
      id_pago: 'pago-1',
      id_reserva: 'res-1',
      id_evento: 'evt-1',
      monto: 15000,
      cantidad_entradas: 2,
      expira_en: new Date(1900000000 * 1000),
    });
    assert.equal(sesion.url, 'https://checkout.stripe.com/c/pay/cs_test_1');
    assert.equal(llamadas[0].url, 'https://api.stripe.com/v1/checkout/sessions');
    const cuerpo = decodeURIComponent(String(llamadas[0].init?.body));
    assert.match(cuerpo, /line_items\[0\]\[price_data\]\[unit_amount\]=15000(&|$)/);
    assert.match(cuerpo, /line_items\[0\]\[price_data\]\[currency\]=clp/);
    assert.match(cuerpo, /metadata\[id_pago\]=pago-1/);
    assert.equal((llamadas[0].init?.headers as Record<string, string>).Authorization, 'Bearer sk_test_x');
  });

  it('crea el PaymentIntent del formulario en CLP y traduce su estado', async () => {
    const llamadas: Array<{ url: string; init?: RequestInit }> = [];
    const pasarela = pasarelaConFetch(
      [
        { status: 200, body: { id: 'pi_1', client_secret: 'pi_1_secret_x' } },
        { status: 200, body: { id: 'pi_1', status: 'succeeded', client_secret: 'pi_1_secret_x' } },
        { status: 200, body: { id: 'pi_2', status: 'requires_payment_method', client_secret: 'pi_2_secret_x' } },
      ],
      llamadas,
    );
    const intento = await pasarela.crearIntento({ id_pago: 'p1', id_reserva: 'r1', id_evento: 'e1', monto: 5054, cantidad_entradas: 3 });
    assert.deepEqual(intento, { id: 'pi_1', client_secret: 'pi_1_secret_x' });
    assert.equal(llamadas[0].url, 'https://api.stripe.com/v1/payment_intents');
    const cuerpo = decodeURIComponent(String(llamadas[0].init?.body));
    assert.match(cuerpo, /(^|&)amount=5054(&|$)/);
    assert.match(cuerpo, /currency=clp/);
    assert.match(cuerpo, /payment_method_types\[0\]=card/);
    assert.match(cuerpo, /metadata\[id_pago\]=p1/);
    assert.equal((await pasarela.consultarIntento('pi_1')).estado, 'PAGADA');
    assert.equal((await pasarela.consultarIntento('pi_2')).estado, 'ABIERTA');
  });

  it('traduce el estado de la sesión y los errores de Stripe', async () => {
    const pasarela = pasarelaConFetch(
      [
        { status: 200, body: { status: 'complete', payment_status: 'paid', payment_intent: 'pi_1' } },
        { status: 200, body: { status: 'expired', payment_status: 'unpaid', payment_intent: null } },
        { status: 400, body: { error: { message: 'No such checkout.session' } } },
      ],
      [],
    );
    assert.deepEqual(await pasarela.consultarSesion('cs_1'), { estado: 'PAGADA', payment_intent_id: 'pi_1' });
    assert.deepEqual(await pasarela.consultarSesion('cs_2'), { estado: 'EXPIRADA', payment_intent_id: null });
    await assert.rejects(pasarela.consultarSesion('cs_3'), (e: AppError) => e.codigo === 'ERROR_PASARELA' && /No such/.test(e.message));
  });

  it('acepta un webhook con firma válida y rechaza firmas inválidas o antiguas', () => {
    const pasarela = pasarelaConFetch([], []);
    const cuerpo = JSON.stringify({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', object: 'checkout.session', payment_status: 'paid', payment_intent: 'pi_1', metadata: { id_pago: 'p1' } } },
    });
    const firmar = (t: number) =>
      `t=${t},v1=${crypto.createHmac('sha256', secretoWebhook).update(`${t}.${cuerpo}`).digest('hex')}`;
    const ahora = Math.floor(Date.now() / 1000);

    const evento = pasarela.construirEvento(Buffer.from(cuerpo), firmar(ahora));
    assert.equal(evento.tipo, 'PAGO_APROBADO');
    assert.equal(evento.id_pago, 'p1');
    assert.equal(evento.payment_intent_id, 'pi_1');

    assert.throws(() => pasarela.construirEvento(Buffer.from(cuerpo), undefined), /Stripe-Signature/);
    assert.throws(() => pasarela.construirEvento(Buffer.from(cuerpo.replace('paid', 'unpaid')), firmar(ahora)), /no coincide/);
    assert.throws(() => pasarela.construirEvento(Buffer.from(cuerpo), firmar(ahora - 3600)), /ventana/);
  });
});
