import crypto from 'node:crypto';
import { errores, esErrorUnico } from '../errores';
import type { EntradasClient } from '../integraciones/entradas.client';
import type { PasarelaPago } from '../integraciones/pasarela/pasarela';
import type { UsuarioAutenticado } from '../middlewares/autenticacion';
import type { CrearTransaccionDto } from './pago.dto';
import type { PagoRepository } from './pago.repository';
import type { EstadoPago, FiltrosListado, OrigenCambio, Pago, Reembolso } from './pago.types';

/**
 * Lógica de negocio del módulo de Pagos. No sabe nada de HTTP.
 *
 * Máquina de estados:
 *   PENDIENTE --(Stripe confirma pago)------------> APROBADO
 *   PENDIENTE --(sesión expira / pago falla)------> RECHAZADO
 *   PENDIENTE --(Entradas anula antes del pago)---> ANULADO
 *   APROBADO  --(Entradas pide reembolso)---------> REEMBOLSADO
 */

const MARGEN_EXPIRACION_MS = 60_000; // Stripe exige >= 30 min al recibir la solicitud
const MAX_EXPIRACION_MS = 24 * 60 * 60 * 1000 - MARGEN_EXPIRACION_MS;

export interface ResultadoCreacion {
  pago: Pago;
  /** false cuando la reserva ya tenía pago (reintento idempotente de Entradas). */
  creado: boolean;
  /** Solo en metodo "formulario" mientras el pago está PENDIENTE: lo usa el front con Stripe Elements. */
  client_secret: string | null;
}

/** Un pago del formulario propio no tiene sesión de Checkout, solo PaymentIntent. */
export function esPagoFormulario(pago: Pago): boolean {
  return !pago.stripe_session_id && !!pago.stripe_payment_intent_id;
}

export interface ResultadoReembolsoPago {
  pago: Pago;
  accion: 'ANULADO' | 'REEMBOLSADO';
  /** true si el pago ya estaba anulado/reembolsado (reintento idempotente). */
  ya_procesado: boolean;
  reembolso: Reembolso | null;
}

export interface ResultadoWebhook {
  id_evento: string;
  duplicado: boolean;
  id_pago: string | null;
  estado_pago: string | null;
}

/** Solo se eliminan pagos que no movieron dinero; APROBADO/REEMBOLSADO se conservan por trazabilidad. */
export const ESTADOS_ELIMINABLES: EstadoPago[] = ['RECHAZADO', 'ANULADO'];

export class PagoService {
  constructor(
    private readonly repo: PagoRepository,
    private readonly pasarela: PasarelaPago,
    private readonly entradas: EntradasClient,
    private readonly opciones: { checkoutExpiracionMin: number; frontendUrl: string },
  ) {}

  // ------------------------------------------------------------------
  // POST /transacciones — crea la intención de pago (idempotente por id_reserva)
  // ------------------------------------------------------------------
  async crearTransaccion(
    dto: CrearTransaccionDto,
    usuario: UsuarioAutenticado,
    authorization?: string,
  ): Promise<ResultadoCreacion> {
    const existente = await this.repo.buscarPorReserva(dto.id_reserva);
    if (existente) return this.respuestaReintento(this.validarReintento(existente, dto, usuario));

    // BE2: se valida la orden contra el servicio de Entradas (fuente oficial del total)
    const orden = await this.entradas.obtenerOrden(dto.id_reserva, authorization);
    if (orden) {
      const diferencias: string[] = [];
      if (orden.total !== dto.total) diferencias.push(`total recibido ${dto.total} ≠ total en Entradas ${orden.total}`);
      if (orden.cantidad_entradas !== dto.cantidad_entradas) {
        diferencias.push(
          `cantidad_entradas recibida ${dto.cantidad_entradas} ≠ cantidad en Entradas ${orden.cantidad_entradas}`,
        );
      }
      if (dto.id_evento && orden.id_evento && orden.id_evento !== dto.id_evento) {
        diferencias.push(`id_evento recibido ${dto.id_evento} ≠ id_evento en Entradas ${orden.id_evento}`);
      }
      if (diferencias.length > 0) throw errores.ordenInconsistente(diferencias);
      if (!dto.id_evento && orden.id_evento) dto = { ...dto, id_evento: orden.id_evento };
    }

    const idPago = crypto.randomUUID();
    if (dto.metodo === 'formulario') return this.crearConFormulario(idPago, dto, usuario);

    const duracion = Math.min(this.opciones.checkoutExpiracionMin * 60_000 + MARGEN_EXPIRACION_MS, MAX_EXPIRACION_MS);
    const sesion = await this.pasarela.crearCheckout({
      id_pago: idPago,
      id_reserva: dto.id_reserva,
      id_evento: dto.id_evento,
      monto: dto.total,
      cantidad_entradas: dto.cantidad_entradas,
      expira_en: new Date(Date.now() + duracion),
    });

    try {
      const pago = await this.repo.crear({
        id_pago: idPago,
        id_reserva: dto.id_reserva,
        id_usuario: usuario.id_usuario,
        monto: dto.total,
        stripe_session_id: sesion.id,
        stripe_payment_intent_id: null,
        url_checkout: sesion.url,
        fecha_expiracion: sesion.expira_en,
      });
      return { pago, creado: true, client_secret: null };
    } catch (error) {
      // Dos solicitudes simultáneas con la misma reserva: gana la primera (UNIQUE en BD).
      if (!esErrorUnico(error, 'uq_pagos_id_reserva')) throw error;
      await this.pasarela.expirarSesion(sesion.id).catch(() => undefined);
      const ganador = await this.repo.buscarPorReserva(dto.id_reserva);
      if (!ganador) throw error;
      return this.respuestaReintento(this.validarReintento(ganador, dto, usuario));
    }
  }

  /** Modo formulario: PaymentIntent de Stripe que el front confirma con Stripe Elements. */
  private async crearConFormulario(
    idPago: string,
    dto: CrearTransaccionDto,
    usuario: UsuarioAutenticado,
  ): Promise<ResultadoCreacion> {
    const intento = await this.pasarela.crearIntento({
      id_pago: idPago,
      id_reserva: dto.id_reserva,
      id_evento: dto.id_evento,
      monto: dto.total,
      cantidad_entradas: dto.cantidad_entradas,
    });
    try {
      const pago = await this.repo.crear({
        id_pago: idPago,
        id_reserva: dto.id_reserva,
        id_usuario: usuario.id_usuario,
        monto: dto.total,
        stripe_session_id: null,
        stripe_payment_intent_id: intento.id,
        // Entradas redirige al usuario a la pantalla de pago del front de Pagos
        url_checkout: `${this.opciones.frontendUrl}/?id_pago=${idPago}`,
        fecha_expiracion: null,
      });
      return { pago, creado: true, client_secret: intento.client_secret };
    } catch (error) {
      if (!esErrorUnico(error, 'uq_pagos_id_reserva')) throw error;
      await this.pasarela.cancelarIntento(intento.id).catch(() => undefined);
      const ganador = await this.repo.buscarPorReserva(dto.id_reserva);
      if (!ganador) throw error;
      return this.respuestaReintento(this.validarReintento(ganador, dto, usuario));
    }
  }

  /** Reintento idempotente: si es un pago del formulario aún pendiente, se recupera su client_secret. */
  private async respuestaReintento(pago: Pago): Promise<ResultadoCreacion> {
    let clientSecret: string | null = null;
    if (pago.estado_pago === 'PENDIENTE' && esPagoFormulario(pago) && pago.stripe_payment_intent_id) {
      clientSecret = (await this.pasarela.consultarIntento(pago.stripe_payment_intent_id)).client_secret;
    }
    return { pago, creado: false, client_secret: clientSecret };
  }

  private validarReintento(existente: Pago, dto: CrearTransaccionDto, usuario: UsuarioAutenticado): Pago {
    const mismoPedido = existente.monto === dto.total && existente.id_usuario === usuario.id_usuario;
    if (!mismoPedido) throw errores.conflictoIdempotencia(dto.id_reserva);
    return existente;
  }

  // ------------------------------------------------------------------
  // GET /{id_pago} — polling de estado (Entradas)
  // ------------------------------------------------------------------
  async obtenerPago(idPago: string, usuario: UsuarioAutenticado): Promise<Pago> {
    const pago = await this.buscarAutorizado(idPago, usuario);
    if (pago.estado_pago !== 'PENDIENTE') return pago;
    try {
      return await this.sincronizarConPasarela(pago, 'POLLING');
    } catch (error) {
      // Si Stripe no responde, el polling igual devuelve el último estado conocido.
      console.warn(`[pagos] No se pudo sincronizar ${idPago} con la pasarela:`, (error as Error).message);
      return pago;
    }
  }

  // ------------------------------------------------------------------
  // GET /{id_pago}/checkout — datos para que el front de Pagos cobre un pago existente
  // ------------------------------------------------------------------
  async obtenerDatosCheckout(
    idPago: string,
    usuario: UsuarioAutenticado,
  ): Promise<{ pago: Pago; client_secret: string | null }> {
    const pago = await this.obtenerPago(idPago, usuario); // sincroniza con Stripe si sigue PENDIENTE
    let clientSecret: string | null = null;
    if (pago.estado_pago === 'PENDIENTE' && esPagoFormulario(pago) && pago.stripe_payment_intent_id) {
      clientSecret = (await this.pasarela.consultarIntento(pago.stripe_payment_intent_id)).client_secret;
    }
    return { pago, client_secret: clientSecret };
  }

  // ------------------------------------------------------------------
  // GET / — listado (Promociones y usuario)
  // ------------------------------------------------------------------
  async listarPagos(
    filtros: FiltrosListado,
    usuario: UsuarioAutenticado,
  ): Promise<{ datos: Pago[]; total: number; filtros: FiltrosListado }> {
    const efectivos = { ...filtros };
    if (!usuario.privilegiado) {
      if (efectivos.id_usuario && efectivos.id_usuario !== usuario.id_usuario) {
        throw errores.noAutorizado('Solo puede consultar sus propios pagos');
      }
      efectivos.id_usuario = usuario.id_usuario;
    }
    const { datos, total } = await this.repo.listar(efectivos);
    return { datos, total, filtros: efectivos };
  }

  // ------------------------------------------------------------------
  // POST /{id_pago}/reembolso — anular (PENDIENTE) o reembolsar (APROBADO)
  // ------------------------------------------------------------------
  async reembolsar(idPago: string, motivo: string, usuario: UsuarioAutenticado): Promise<ResultadoReembolsoPago> {
    let pago = await this.buscarAutorizado(idPago, usuario);

    if (pago.estado_pago === 'ANULADO' || pago.estado_pago === 'REEMBOLSADO') {
      const reembolsos = await this.repo.reembolsosDe(idPago);
      return { pago, accion: pago.estado_pago, ya_procesado: true, reembolso: reembolsos.at(-1) ?? null };
    }

    // Antes de anular, confirmar con Stripe que el usuario no pagó justo ahora.
    if (pago.estado_pago === 'PENDIENTE') pago = await this.sincronizarConPasarela(pago, 'REEMBOLSO');

    if (pago.estado_pago === 'PENDIENTE') {
      if (pago.stripe_session_id) await this.pasarela.expirarSesion(pago.stripe_session_id);
      else if (pago.stripe_payment_intent_id) await this.pasarela.cancelarIntento(pago.stripe_payment_intent_id);
      const anulado = await this.repo.cambiarEstado({
        id_pago: idPago,
        desde: ['PENDIENTE'],
        hacia: 'ANULADO',
        origen: 'REEMBOLSO',
        detalle: `Anulado antes del pago: ${motivo}`,
      });
      if (!anulado) throw errores.transicionConcurrente();
      return { pago: anulado, accion: 'ANULADO', ya_procesado: false, reembolso: null };
    }

    if (pago.estado_pago === 'APROBADO') {
      if (!pago.stripe_payment_intent_id) throw errores.pasarela('El pago no tiene PaymentIntent asociado');
      const resultado = await this.pasarela.reembolsar({
        payment_intent_id: pago.stripe_payment_intent_id,
        monto: pago.monto,
        id_pago: idPago,
      });
      const reembolsado = await this.repo.cambiarEstado({
        id_pago: idPago,
        desde: ['APROBADO'],
        hacia: 'REEMBOLSADO',
        origen: 'REEMBOLSO',
        detalle: `Reembolso ${resultado.id}: ${motivo}`,
        reembolso: { monto: pago.monto, motivo, estado: resultado.estado, stripe_refund_id: resultado.id },
      });
      if (!reembolsado) throw errores.transicionConcurrente();
      const reembolsos = await this.repo.reembolsosDe(idPago);
      return { pago: reembolsado, accion: 'REEMBOLSADO', ya_procesado: false, reembolso: reembolsos.at(-1) ?? null };
    }

    throw errores.pagoNoReembolsable(pago.estado_pago);
  }

  // ------------------------------------------------------------------
  // POST /webhooks/stripe — aviso asíncrono de la pasarela
  // ------------------------------------------------------------------
  async procesarWebhook(cuerpoCrudo: Buffer, firma: string | undefined): Promise<ResultadoWebhook> {
    const evento = this.pasarela.construirEvento(cuerpoCrudo, firma);
    if (await this.repo.eventoWebhookExiste(evento.id)) {
      return { id_evento: evento.id, duplicado: true, id_pago: evento.id_pago, estado_pago: null };
    }

    let pago: Pago | null = null;
    if (evento.id_pago && /^[0-9a-f-]{36}$/i.test(evento.id_pago)) pago = await this.repo.buscarPorId(evento.id_pago);
    if (!pago && evento.sesion_id) pago = await this.repo.buscarPorSesion(evento.sesion_id);

    if (pago) {
      const detalle = `Evento Stripe ${evento.id} (${evento.tipo_original})`;
      let actualizado: Pago | null = null;
      if (evento.tipo === 'PAGO_APROBADO') {
        actualizado = await this.repo.cambiarEstado({
          id_pago: pago.id_pago,
          desde: ['PENDIENTE'],
          hacia: 'APROBADO',
          origen: 'WEBHOOK',
          detalle,
          stripe_payment_intent_id: evento.payment_intent_id,
        });
      } else if (evento.tipo === 'PAGO_RECHAZADO' || evento.tipo === 'SESION_EXPIRADA') {
        actualizado = await this.repo.cambiarEstado({
          id_pago: pago.id_pago,
          desde: ['PENDIENTE'],
          hacia: 'RECHAZADO',
          origen: 'WEBHOOK',
          detalle,
          motivo_rechazo:
            evento.tipo === 'SESION_EXPIRADA'
              ? 'La sesión de pago expiró sin completarse'
              : 'La pasarela rechazó el pago',
        });
      }
      pago = actualizado ?? pago;
    }

    const nuevo = await this.repo.registrarEventoWebhook(evento.id, evento.tipo_original, pago?.id_pago ?? null, evento.payload);
    return {
      id_evento: evento.id,
      duplicado: !nuevo,
      id_pago: pago?.id_pago ?? null,
      estado_pago: pago?.estado_pago ?? null,
    };
  }

  // ------------------------------------------------------------------
  // DELETE /{id_pago} — eliminar un pago que no movió dinero (solo ADMIN)
  // ------------------------------------------------------------------
  async eliminarPago(idPago: string, usuario: UsuarioAutenticado): Promise<{ id_pago: string; estado_pago: string }> {
    if (usuario.rol !== 'ADMIN') throw errores.noAutorizado('Solo un usuario con rol ADMIN puede eliminar pagos');
    const { resultado, estado } = await this.repo.eliminar(idPago, ESTADOS_ELIMINABLES);
    if (resultado === 'no_existe') throw errores.pagoNoEncontrado(idPago);
    if (resultado === 'no_permitido') throw errores.pagoNoEliminable(estado ?? 'desconocido');
    return { id_pago: idPago, estado_pago: estado as string };
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  /** Política de autorización: el dueño del pago o un rol privilegiado (ADMIN/SERVICIO). */
  private async buscarAutorizado(idPago: string, usuario: UsuarioAutenticado): Promise<Pago> {
    const pago = await this.repo.buscarPorId(idPago);
    if (!pago) throw errores.pagoNoEncontrado(idPago);
    if (!usuario.privilegiado && pago.id_usuario !== usuario.id_usuario) {
      throw errores.noAutorizado('El pago pertenece a otro usuario');
    }
    return pago;
  }

  /**
   * Respaldo del webhook: consulta a Stripe el estado de la sesión y actualiza el pago.
   * Permite que el polling funcione aunque el servidor no reciba webhooks (sin URL pública).
   */
  private async sincronizarConPasarela(pago: Pago, origen: OrigenCambio): Promise<Pago> {
    let consulta;
    if (pago.stripe_session_id) consulta = await this.pasarela.consultarSesion(pago.stripe_session_id);
    else if (pago.stripe_payment_intent_id) consulta = await this.pasarela.consultarIntento(pago.stripe_payment_intent_id);
    else return pago;
    if (consulta.estado === 'PAGADA') {
      const aprobado = await this.repo.cambiarEstado({
        id_pago: pago.id_pago,
        desde: ['PENDIENTE'],
        hacia: 'APROBADO',
        origen,
        detalle: 'Pago confirmado al consultar la pasarela',
        stripe_payment_intent_id: consulta.payment_intent_id,
      });
      return aprobado ?? (await this.repo.buscarPorId(pago.id_pago)) ?? pago;
    }
    if (consulta.estado === 'EXPIRADA') {
      const rechazado = await this.repo.cambiarEstado({
        id_pago: pago.id_pago,
        desde: ['PENDIENTE'],
        hacia: 'RECHAZADO',
        origen,
        detalle: 'Sesión expirada o cobro cancelado según la pasarela',
        motivo_rechazo: pago.stripe_session_id
          ? 'La sesión de pago expiró sin completarse'
          : 'El cobro fue cancelado en la pasarela',
      });
      return rechazado ?? (await this.repo.buscarPorId(pago.id_pago)) ?? pago;
    }
    return pago;
  }
}
