import crypto from 'node:crypto';
import { errores } from '../../errores';
import {
  interpretarEventoStripe,
  type ConsultaIntento,
  type ConsultaSesion,
  type DatosCheckout,
  type DatosIntento,
  type IntentoPago,
  type EstadoSesion,
  type EventoPasarela,
  type PasarelaPago,
  type ResultadoReembolso,
  type SesionCheckout,
} from './pasarela';

/**
 * Pasarela SIMULADA (PASARELA=mock). Solo para desarrollo, pruebas automáticas
 * y la colección Postman: no cobra nada ni llama a Stripe.
 * El webhook acepta eventos con formato Stripe SIN firma, para poder simular
 * "el usuario pagó" desde Postman.
 */
export class MockPasarela implements PasarelaPago {
  readonly nombre = 'mock' as const;
  private readonly sesiones = new Map<string, { estado: EstadoSesion; intent: string | null }>();

  async crearCheckout(datos: DatosCheckout): Promise<SesionCheckout> {
    const id = `cs_mock_${crypto.randomUUID().replace(/-/g, '')}`;
    this.sesiones.set(id, { estado: 'ABIERTA', intent: null });
    return { id, url: `https://pasarela-simulada.local/checkout/${id}`, expira_en: datos.expira_en };
  }

  async consultarSesion(sesionId: string): Promise<ConsultaSesion> {
    const sesion = this.sesiones.get(sesionId);
    return { estado: sesion?.estado ?? 'ABIERTA', payment_intent_id: sesion?.intent ?? null };
  }

  async expirarSesion(sesionId: string): Promise<void> {
    const sesion = this.sesiones.get(sesionId);
    if (sesion?.estado === 'PAGADA') throw errores.pasarela('La sesión ya fue pagada');
    this.sesiones.set(sesionId, { estado: 'EXPIRADA', intent: sesion?.intent ?? null });
  }

  async crearIntento(_datos: DatosIntento): Promise<IntentoPago> {
    const id = `pi_mock_${crypto.randomUUID().replace(/-/g, '')}`;
    this.sesiones.set(id, { estado: 'ABIERTA', intent: id });
    return { id, client_secret: `${id}_secret_mock` };
  }

  async consultarIntento(intentoId: string): Promise<ConsultaIntento> {
    const intento = this.sesiones.get(intentoId);
    return { estado: intento?.estado ?? 'ABIERTA', payment_intent_id: intentoId, client_secret: `${intentoId}_secret_mock` };
  }

  async cancelarIntento(intentoId: string): Promise<void> {
    const intento = this.sesiones.get(intentoId);
    if (intento?.estado === 'PAGADA') throw errores.pasarela('El PaymentIntent ya fue pagado');
    this.sesiones.set(intentoId, { estado: 'EXPIRADA', intent: intentoId });
  }

  async reembolsar(_datos: { payment_intent_id: string; monto: number; id_pago: string }): Promise<ResultadoReembolso> {
    return { id: `re_mock_${crypto.randomUUID().replace(/-/g, '')}`, estado: 'EXITOSO' };
  }

  construirEvento(cuerpoCrudo: Buffer, _firma: string | undefined): EventoPasarela {
    let json: unknown;
    try {
      json = JSON.parse(cuerpoCrudo.toString('utf8'));
    } catch {
      throw errores.firmaWebhookInvalida('El cuerpo del webhook no es JSON');
    }
    const evento = interpretarEventoStripe(json as Parameters<typeof interpretarEventoStripe>[0]);
    if (!evento.id) throw errores.firmaWebhookInvalida('El evento no tiene id');
    if (evento.payment_intent_id && evento.payment_intent_id.startsWith('pi_mock_') && !evento.sesion_id) {
      if (evento.tipo === 'PAGO_APROBADO') this.sesiones.set(evento.payment_intent_id, { estado: 'PAGADA', intent: evento.payment_intent_id });
    }
    if (evento.sesion_id) {
      const intent = evento.payment_intent_id ?? `pi_mock_${crypto.randomUUID().replace(/-/g, '')}`;
      if (evento.tipo === 'PAGO_APROBADO') this.sesiones.set(evento.sesion_id, { estado: 'PAGADA', intent });
      if (evento.tipo === 'SESION_EXPIRADA') this.sesiones.set(evento.sesion_id, { estado: 'EXPIRADA', intent: null });
      if (evento.tipo === 'PAGO_APROBADO' && !evento.payment_intent_id) evento.payment_intent_id = intent;
    }
    return evento;
  }

  /** Solo para pruebas: fuerza el estado de una sesión simulada. */
  simularEstado(sesionId: string, estado: EstadoSesion): void {
    const esIntento = sesionId.startsWith('pi_mock_');
    this.sesiones.set(sesionId, {
      estado,
      intent: esIntento ? sesionId : estado === 'PAGADA' ? `pi_mock_${crypto.randomUUID().replace(/-/g, '')}` : null,
    });
  }
}
