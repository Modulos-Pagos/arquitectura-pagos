import type { Request, Response } from 'express';
import { usuarioDe } from '../middlewares/autenticacion';
import { validarCrearTransaccion, validarFiltrosListado, validarIdPago, validarReembolso } from './pago.dto';
import { esPagoFormulario, type PagoService } from './pago.service';
import type { Pago, Reembolso } from './pago.types';

/**
 * Frontera HTTP: lee el request, valida con los DTOs, llama al servicio
 * y arma la respuesta. Los errores se propagan al manejador global
 * (Express 5 captura automáticamente los errores de funciones async).
 */

const iso = (fecha: Date | null) => (fecha ? fecha.toISOString() : null);

export function aRespuestaPago(p: Pago) {
  return {
    id_pago: p.id_pago,
    id_reserva: p.id_reserva,
    id_usuario: p.id_usuario,
    estado_pago: p.estado_pago,
    metodo: esPagoFormulario(p) ? 'formulario' : 'checkout',
    monto: p.monto,
    moneda: p.moneda,
    motivo_rechazo: p.motivo_rechazo,
    url_checkout: p.estado_pago === 'PENDIENTE' ? p.url_checkout : null,
    fecha_creacion: iso(p.fecha_creacion),
    fecha_actualizacion: iso(p.fecha_actualizacion),
    fecha_expiracion: iso(p.fecha_expiracion),
  };
}

function aRespuestaReembolso(r: Reembolso | null) {
  if (!r) return null;
  return {
    id_reembolso: r.id_reembolso,
    monto: r.monto,
    motivo: r.motivo,
    estado_reembolso: r.estado_reembolso,
    fecha_creacion: iso(r.fecha_creacion),
  };
}

export class PagoController {
  constructor(private readonly servicio: PagoService) {}

  /** POST /api/v1/pagos/transacciones */
  crear = async (req: Request, res: Response) => {
    const dto = validarCrearTransaccion(req.body);
    const { pago, creado, client_secret } = await this.servicio.crearTransaccion(
      dto,
      usuarioDe(req),
      req.header('authorization'),
    );
    res.status(creado ? 201 : 200).json({
      id_pago: pago.id_pago,
      id_reserva: pago.id_reserva,
      estado_pago: pago.estado_pago,
      fecha_creacion: iso(pago.fecha_creacion),
      metodo: esPagoFormulario(pago) ? 'formulario' : 'checkout',
      url_checkout: pago.estado_pago === 'PENDIENTE' ? pago.url_checkout : null,
      client_secret,
      fecha_expiracion: iso(pago.fecha_expiracion),
    });
  };

  /** GET /api/v1/pagos/{id_pago} */
  obtener = async (req: Request, res: Response) => {
    const idPago = validarIdPago(req.params.id_pago);
    const pago = await this.servicio.obtenerPago(idPago, usuarioDe(req));
    res.json(aRespuestaPago(pago));
  };

  /** GET /api/v1/pagos/{id_pago}/checkout — usado por el front de Pagos para cobrar un pago existente */
  checkout = async (req: Request, res: Response) => {
    const idPago = validarIdPago(req.params.id_pago);
    const { pago, client_secret } = await this.servicio.obtenerDatosCheckout(idPago, usuarioDe(req));
    res.json({ ...aRespuestaPago(pago), client_secret });
  };

  /** GET /api/v1/pagos?id_usuario=&id_reserva=&estado=&pagina=&limite= */
  listar = async (req: Request, res: Response) => {
    const filtros = validarFiltrosListado(req.query);
    const { datos, total, filtros: efectivos } = await this.servicio.listarPagos(filtros, usuarioDe(req));
    res.json({
      datos: datos.map(aRespuestaPago),
      paginacion: {
        pagina: efectivos.pagina,
        limite: efectivos.limite,
        total,
        total_paginas: Math.ceil(total / efectivos.limite),
      },
    });
  };

  /** POST /api/v1/pagos/{id_pago}/reembolso */
  reembolsar = async (req: Request, res: Response) => {
    const idPago = validarIdPago(req.params.id_pago);
    const { motivo } = validarReembolso(req.body);
    const resultado = await this.servicio.reembolsar(idPago, motivo, usuarioDe(req));
    res.status(200).json({
      id_pago: resultado.pago.id_pago,
      estado_pago: resultado.pago.estado_pago,
      accion: resultado.accion,
      ya_procesado: resultado.ya_procesado,
      reembolso: aRespuestaReembolso(resultado.reembolso),
      fecha_actualizacion: iso(resultado.pago.fecha_actualizacion),
    });
  };

  /** POST /api/v1/pagos/webhooks/stripe (body crudo, sin JWT: se valida la firma de Stripe) */
  webhookStripe = async (req: Request, res: Response) => {
    const cuerpo = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const resultado = await this.servicio.procesarWebhook(cuerpo, req.header('stripe-signature'));
    res.status(200).json({ recibido: true, ...resultado });
  };
}
