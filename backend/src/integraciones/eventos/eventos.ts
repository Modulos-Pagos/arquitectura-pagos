import crypto from 'node:crypto';
import { formatearRut } from '../../pagos/pago.dto';
import type { Destinatario, EstadoPago, Pago } from '../../pagos/pago.types';

/**
 * EVENTOS DE PAGOS EN EL BROKER COMÚN (RabbitMQ del Platform Team).
 *
 * Sigue la guía del Platform Team (repo FWizav/backendticketU): exchange compartido
 * `ticketu.events` (topic, durable) en `ticketu-rabbitmq:5672`, vhost `ticketu`, y nombres
 * `<recurso>.<hecho-en-pasado>`. Cada vez que un pago cambia de estado se publica:
 *
 *   PENDIENTE -> APROBADO     pago.realizado     (Entradas emite las entradas, Notificaciones)
 *   PENDIENTE -> RECHAZADO    pago.rechazado     (Entradas libera la reserva, Notificaciones)
 *   PENDIENTE -> ANULADO      pago.anulado
 *   APROBADO  -> REEMBOLSADO  pago.reembolsado
 *
 * La routing key y el campo `tipo` son el mismo texto (BROKER_SEPARADOR="_" da pago_realizado).
 *
 * Cada mensaje trae los campos del contrato en el primer nivel (id_pago, id_usuario...) y,
 * además, el sobre del ejemplo del Platform Team: { eventId, eventName, occurredAt, source, data },
 * para que funcione con un consumidor que lea cualquiera de los dos formatos.
 *
 * Además, al aprobarse un pago se publica `pago.completado` (contrato «Promociones ↔ Pagos» v1.0):
 *   { id_pago, id_usuario, id_evento, nombre_codigo }
 * Promociones descuenta un uso del código; si nombre_codigo es null, ignora el evento.
 * La clave se configura con BROKER_CLAVE_PROMOCIONES (vacío = no se publica).
 *
 * Todo mensaje lleva `id_mensaje` (UUID), que también va en la propiedad AMQP messageId
 * para que el consumidor descarte duplicados. `id_evento` es el evento de la compra (concierto, fiesta...).
 */

export type ModoBroker = 'mock' | 'rabbitmq';
export type AccionEventoPago = 'realizado' | 'rechazado' | 'anulado' | 'reembolsado';

const ACCION_POR_ESTADO: Partial<Record<EstadoPago, AccionEventoPago>> = {
  APROBADO: 'realizado',
  RECHAZADO: 'rechazado',
  ANULADO: 'anulado',
  REEMBOLSADO: 'reembolsado',
};

/** Campos comunes a todo mensaje que Pagos publica en el broker. */
export interface MensajeBase {
  /** Igual a la routing key, p. ej. "pago.realizado" o "pago.completado". */
  tipo: string;
  version: 1;
  /** Id único del mensaje (UUID); también va como messageId AMQP para deduplicar. */
  id_mensaje: string;
  fecha_evento: string;
  id_pago: string;
  /** Comprador (quien paga). */
  id_usuario: string;
  /** Evento de la compra (referencia, sin FK); null si Entradas no lo envió. */
  id_evento: string | null;
  /** Código de descuento de Promociones aplicado; null si no hubo. */
  nombre_codigo: string | null;
  // Sobre del ejemplo del Platform Team (event-broker/src/publisher.js)
  eventId: string;
  eventName: string;
  occurredAt: string;
  source: 'pagos-service';
  /** Copia de los campos del contrato (sin el sobre). */
  data: Record<string, unknown>;
}

type SinSobre<T> = Omit<T, 'eventId' | 'eventName' | 'occurredAt' | 'source' | 'data'>;

/** Agrega el sobre { eventId, eventName, occurredAt, source, data } a los campos del contrato. */
function conSobre<T extends SinSobre<MensajeBase>>(m: T): T & Pick<MensajeBase, 'eventId' | 'eventName' | 'occurredAt' | 'source' | 'data'> {
  return { ...m, eventId: m.id_mensaje, eventName: m.tipo, occurredAt: m.fecha_evento, source: 'pagos-service', data: { ...m } };
}

/** pago.realizado / pago.rechazado / pago.anulado / pago.reembolsado (Entradas, Notificaciones). */
export interface EventoPago extends MensajeBase {
  id_reserva: string;
  estado_pago: EstadoPago;
  monto: number;
  moneda: string;
  /** Motivo de rechazo o de reembolso/anulación; null si no aplica. */
  motivo: string | null;
  /** A quién se le emite la entrada cuando el comprador compra para otra persona; null = para el comprador. */
  destinatario: {
    nombre: string;
    email: string;
    rut: string | null;
  } | null;
}

/** pago.completado — contrato «Promociones ↔ Pagos» v1.0 (solo se publica al aprobarse el pago). */
export type EventoPagoCompletado = MensajeBase;

export type MensajeBroker = EventoPago | EventoPagoCompletado;

export interface PublicadorEventos {
  readonly modo: ModoBroker;
  publicar(mensaje: MensajeBroker): Promise<void>;
  cerrar(): Promise<void>;
}

export const CLAVE_PROMOCIONES_POR_DEFECTO = 'pago.completado';

/** Devuelve el evento que corresponde al estado del pago, o null si ese estado no se publica. */
export function construirEvento(
  pago: Pago,
  destinatario: Destinatario | null,
  separador: '_' | '.',
  motivo: string | null = null,
): EventoPago | null {
  const accion = ACCION_POR_ESTADO[pago.estado_pago];
  if (!accion) return null;
  return conSobre({
    tipo: `pago${separador}${accion}`,
    version: 1,
    id_mensaje: crypto.randomUUID(),
    fecha_evento: new Date().toISOString(),
    id_pago: pago.id_pago,
    id_reserva: pago.id_reserva,
    id_usuario: pago.id_usuario,
    id_evento: pago.id_evento ?? null,
    nombre_codigo: pago.nombre_codigo ?? null,
    estado_pago: pago.estado_pago,
    monto: pago.monto,
    moneda: pago.moneda,
    motivo: motivo ?? pago.motivo_rechazo ?? null,
    destinatario: destinatario
      ? {
          nombre: destinatario.nombre,
          email: destinatario.email,
          rut: formatearRut(destinatario.rut),
        }
      : null,
  });
}

/** pago.completado para Promociones; null si el pago no está APROBADO o la clave está desactivada. */
export function construirEventoPromociones(pago: Pago, clave: string = CLAVE_PROMOCIONES_POR_DEFECTO): EventoPagoCompletado | null {
  if (pago.estado_pago !== 'APROBADO' || !clave) return null;
  return conSobre({
    tipo: clave,
    version: 1,
    id_mensaje: crypto.randomUUID(),
    fecha_evento: new Date().toISOString(),
    id_pago: pago.id_pago,
    id_usuario: pago.id_usuario,
    id_evento: pago.id_evento ?? null,
    nombre_codigo: pago.nombre_codigo ?? null,
  });
}

/** Todos los mensajes que corresponden al nuevo estado del pago (en el orden en que se publican). */
export function construirMensajes(
  pago: Pago,
  destinatario: Destinatario | null,
  opciones: { separador: '_' | '.'; clavePromociones?: string },
  motivo: string | null = null,
): MensajeBroker[] {
  const mensajes: MensajeBroker[] = [];
  const evento = construirEvento(pago, destinatario, opciones.separador, motivo);
  if (evento) mensajes.push(evento);
  const promociones = construirEventoPromociones(pago, opciones.clavePromociones ?? CLAVE_PROMOCIONES_POR_DEFECTO);
  if (promociones) mensajes.push(promociones);
  return mensajes;
}

/** Modo mock: no se conecta a RabbitMQ; guarda los eventos en memoria (útil en pruebas y en desarrollo). */
export class PublicadorMock implements PublicadorEventos {
  readonly modo = 'mock' as const;
  readonly publicados: MensajeBroker[] = [];

  async publicar(mensaje: MensajeBroker): Promise<void> {
    this.publicados.push(mensaje);
    if (process.env.NODE_ENV !== 'test') {
      const codigo = mensaje.nombre_codigo ? ` (código ${mensaje.nombre_codigo})` : '';
      console.log(`[pagos] (broker mock) evento ${mensaje.tipo} del pago ${mensaje.id_pago}${codigo}`);
    }
  }

  async cerrar(): Promise<void> {}
}
