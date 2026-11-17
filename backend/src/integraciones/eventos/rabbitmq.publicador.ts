import { registrarIntegracion } from '../../utils/log-integracion';
import amqp from 'amqplib';
import type { MensajeBroker, PublicadorEventos } from './eventos';

type Conexion = Awaited<ReturnType<typeof amqp.connect>>;
type CanalConfirmado = Awaited<ReturnType<Conexion['createConfirmChannel']>>;

export interface OpcionesRabbitMQ {
  /** URL AMQP dentro de Docker, p. ej. amqp://guest:guest@rabbitmq:5672 (nunca localhost entre contenedores). */
  url: string;
  exchange: string;
  tipoExchange: string;
  /** Tiempo máximo para conectar y confirmar una publicación. */
  timeoutMs: number;
  /**
   * Cola durable propia de Pagos enlazada a `pago.*` (BROKER_COLA_VERIFICACION, por defecto `pagos.eventos`).
   * Deja visible en la consola de RabbitMQ cada mensaje publicado aunque ningún consumidor esté conectado
   * (en un exchange topic sin colas enlazadas el mensaje se descarta). Vacío = no se declara.
   */
  colaVerificacion?: string;
}

/** Máximo de mensajes que guarda la cola de verificación (los más antiguos se descartan). */
const MAXIMO_COLA_VERIFICACION = 1000;

/**
 * Publica los eventos de Pagos en el RabbitMQ compartido.
 * - Conexión perezosa: se abre en la primera publicación y se reabre si se cae.
 * - Canal con confirmación: la publicación termina cuando el broker la acepta.
 * - Mensajes persistentes en JSON, con messageId = id_mensaje (para deduplicar en el consumidor).
 */
export class PublicadorRabbitMQ implements PublicadorEventos {
  readonly modo = 'rabbitmq' as const;
  private conexion: Conexion | null = null;
  private canal: Promise<CanalConfirmado> | null = null;

  constructor(private readonly opciones: OpcionesRabbitMQ) {}

  private obtenerCanal(): Promise<CanalConfirmado> {
    if (!this.canal) {
      this.canal = (async () => {
        const conexion = await amqp.connect(this.opciones.url, { timeout: this.opciones.timeoutMs });
        conexion.on('error', (error: Error) => console.warn('[pagos] RabbitMQ:', error.message));
        conexion.on('close', () => {
          this.conexion = null;
          this.canal = null;
        });
        this.conexion = conexion;
        const canal = await conexion.createConfirmChannel();
        await canal.assertExchange(this.opciones.exchange, this.opciones.tipoExchange, { durable: true });
        const cola = this.opciones.colaVerificacion;
        if (cola && this.opciones.tipoExchange === 'topic') {
          await canal.assertQueue(cola, { durable: true, arguments: { 'x-max-length': MAXIMO_COLA_VERIFICACION } });
          await canal.bindQueue(cola, this.opciones.exchange, 'pago.*');
        }
        return canal;
      })().catch((error) => {
        this.canal = null;
        throw error;
      });
    }
    return this.canal;
  }

  async publicar(evento: MensajeBroker): Promise<void> {
    const inicio = performance.now();
    let canal: CanalConfirmado;
    try {
      canal = await this.obtenerCanal();
    } catch (error) {
      // Broker caído o credenciales inválidas: queda en la traza y el pago sigue su curso (no se cae Pagos).
      registrarIntegracion('RabbitMQ', `publicar ${evento.tipo}`, `error: broker no disponible (${(error as Error).message})`, inicio);
      throw error;
    }
    await new Promise<void>((ok, falla) => {
      const temporizador = setTimeout(() => falla(new Error('el broker no confirmó la publicación a tiempo')), this.opciones.timeoutMs);
      canal.publish(
        this.opciones.exchange,
        evento.tipo,
        Buffer.from(JSON.stringify(evento)),
        {
          persistent: true,
          contentType: 'application/json',
          messageId: evento.id_mensaje,
          type: evento.tipo,
          appId: 'microservicio-pagos',
          timestamp: Math.floor(Date.now() / 1000),
        },
        (error) => {
          clearTimeout(temporizador);
          if (error) {
            registrarIntegracion('RabbitMQ', `publicar ${evento.tipo}`, `error: ${String((error as Error)?.message ?? error)}`, inicio);
            falla(error instanceof Error ? error : new Error(String(error)));
          } else {
            const idPago = (evento as { id_pago?: string }).id_pago ?? '';
            registrarIntegracion('RabbitMQ', `publicar ${evento.tipo}`, `confirmado (exchange ${this.opciones.exchange}, id_pago ${idPago}, id_mensaje ${evento.id_mensaje})`, inicio);
            ok();
          }
        },
      );
    });
  }

  async cerrar(): Promise<void> {
    const conexion = this.conexion;
    this.conexion = null;
    this.canal = null;
    if (conexion) await conexion.close().catch(() => undefined);
  }
}
