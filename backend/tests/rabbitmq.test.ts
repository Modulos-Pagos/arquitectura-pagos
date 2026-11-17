import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import amqp from 'amqplib';
import { PublicadorRabbitMQ } from '../src/integraciones/eventos/rabbitmq.publicador';
import { configPruebas, eventoStripe, levantarApp, llamar, nuevaReserva, reiniciarBase, token, type AppDePrueba } from './helpers';

/**
 * Prueba contra un RabbitMQ REAL (se omite si no está definida RABBITMQ_URL_TEST).
 *   RABBITMQ_URL_TEST=amqp://ticketu:ticketu_dev@localhost:5672/ticketu npm test
 * (mismo usuario, contraseña y vhost que el event-broker del Platform Team).
 * Simula al consumidor (Entradas): crea su propia cola, la enlaza a ticketu.events con
 * la routing key pago.realizado y verifica que el mensaje llega cuando Stripe confirma el pago.
 */

const URL_RABBIT = process.env.RABBITMQ_URL_TEST;
const EXCHANGE = 'ticketu.events';

describe('RabbitMQ real: Pagos publica y otro servicio consume', { skip: !URL_RABBIT && 'sin RABBITMQ_URL_TEST' }, () => {
  let app: AppDePrueba;
  let conexion: Awaited<ReturnType<typeof amqp.connect>>;
  let canal: Awaited<ReturnType<(typeof conexion)['createChannel']>>;
  let cola: string;
  const recibidos: Record<string, unknown>[] = [];

  before(async () => {
    const config = configPruebas();
    await reiniciarBase(config);
    const eventos = new PublicadorRabbitMQ({ url: URL_RABBIT!, exchange: EXCHANGE, tipoExchange: 'topic', timeoutMs: 3000 });
    app = await levantarApp(config, { eventos });

    conexion = await amqp.connect(URL_RABBIT!);
    canal = await conexion.createChannel();
    await canal.assertExchange(EXCHANGE, 'topic', { durable: true });
    cola = (await canal.assertQueue('', { exclusive: true })).queue;
    await canal.bindQueue(cola, EXCHANGE, 'pago.realizado'); // como Entradas
    await canal.bindQueue(cola, EXCHANGE, 'pago.completado'); // como Promociones
    await canal.consume(cola, (msg) => {
      if (!msg) return;
      recibidos.push({ ...JSON.parse(msg.content.toString()), _routingKey: msg.fields.routingKey, _messageId: msg.properties.messageId });
      canal.ack(msg);
    });
  });

  after(async () => {
    await app?.cerrar();
    await app?.deps.eventos.cerrar();
    await conexion?.close();
  });

  it('al aprobarse el pago, la cola del consumidor recibe pago.realizado', async () => {
    const r = await llamar(app.url, 'POST', '/api/pagos/transacciones', {
      token: token('usr-rabbit'),
      body: { id_reserva: nuevaReserva(), id_evento: 'evt-123', total: 15000, cantidad_entradas: 2, metodo: 'checkout', nombre_codigo: 'DESC50' },
    });
    const idPago = r.body.id_pago as string;
    const pago = await app.deps.repo.buscarPorId(idPago);
    const evento = eventoStripe('checkout.session.completed', pago!.stripe_session_id!, idPago, { payment_status: 'paid' });
    await llamar(app.url, 'POST', '/api/pagos/webhooks/stripe', { body: evento });

    for (let i = 0; i < 50 && recibidos.filter((m) => m.id_pago === idPago).length < 2; i++) await new Promise((ok) => setTimeout(ok, 100));
    const mensaje = recibidos.find((m) => m.id_pago === idPago && m._routingKey === 'pago.realizado');
    assert.ok(mensaje, 'no llegó el mensaje a la cola');
    assert.equal(mensaje._routingKey, 'pago.realizado');
    assert.equal(mensaje.tipo, 'pago.realizado');
    assert.equal(mensaje.estado_pago, 'APROBADO');
    assert.equal(mensaje.monto, 15000);
    assert.equal(mensaje._messageId, mensaje.id_mensaje);
    // Sobre del ejemplo del Platform Team
    assert.equal(mensaje.eventName, 'pago.realizado');
    assert.equal(mensaje.source, 'pagos-service');
    assert.equal((mensaje.data as Record<string, unknown>).id_pago, idPago);

    const promociones = recibidos.find((m) => m.id_pago === idPago && m._routingKey === 'pago.completado');
    assert.ok(promociones, 'no llegó pago.completado');
    assert.equal(promociones.nombre_codigo, 'DESC50');
    assert.equal(promociones.id_evento, 'evt-123');
    assert.equal(promociones.id_usuario, 'usr-rabbit');
  });
});

describe('RabbitMQ real: cola de verificación pagos.eventos (Evaluación 3, BR1)', { skip: !URL_RABBIT && 'sin RABBITMQ_URL_TEST' }, () => {
  it('cada publicación queda en la cola durable pagos.eventos aunque no haya consumidores', async () => {
    const COLA = 'pagos.eventos';
    const admin = await amqp.connect(URL_RABBIT!);
    const ch = await admin.createChannel();
    await ch.deleteQueue(COLA).catch(() => undefined);
    const publicador = new PublicadorRabbitMQ({
      url: URL_RABBIT!, exchange: EXCHANGE, tipoExchange: 'topic', timeoutMs: 3000, colaVerificacion: COLA,
    });
    try {
      await publicador.publicar({
        tipo: 'pago.realizado', version: 1, id_mensaje: 'msg-verif-1', fecha_evento: new Date().toISOString(),
        id_pago: 'pago-verif-1', id_reserva: 'hold-verif', id_usuario: 'usr-verif', id_evento: 'evt-1',
        estado_pago: 'APROBADO', monto: 12000, moneda: 'CLP', motivo: null, nombre_codigo: null, destinatario: null,
      } as never);
      const msg = await ch.get(COLA, { noAck: true });
      assert.ok(msg, 'la cola pagos.eventos tiene el mensaje');
      assert.equal(msg.fields.routingKey, 'pago.realizado');
      assert.equal(msg.properties.messageId, 'msg-verif-1');
      assert.equal(JSON.parse(msg.content.toString()).id_pago, 'pago-verif-1');
    } finally {
      await publicador.cerrar();
      await ch.deleteQueue(COLA).catch(() => undefined);
      await admin.close();
    }
  });
});
