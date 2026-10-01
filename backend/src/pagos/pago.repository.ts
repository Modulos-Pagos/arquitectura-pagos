import type { Pool, PoolClient } from 'pg';
import type { EstadoPago, EstadoReembolso, FiltrosListado, NuevoPago, OrigenCambio, Pago, Reembolso } from './pago.types';

/**
 * Acceso a datos del módulo. Toda la SQL del microservicio vive aquí
 * (consultas parametrizadas: nunca se concatenan valores del usuario).
 */

type Fila = Record<string, unknown>;

function fecha(valor: unknown): Date {
  return valor instanceof Date ? valor : new Date(String(valor));
}

function fechaONull(valor: unknown): Date | null {
  return valor === null || valor === undefined ? null : fecha(valor);
}

function aPago(f: Fila): Pago {
  return {
    id_pago: String(f.id_pago),
    id_reserva: String(f.id_reserva),
    id_usuario: String(f.id_usuario),
    monto: Number(f.monto),
    moneda: String(f.moneda),
    estado_pago: f.estado_pago as EstadoPago,
    motivo_rechazo: (f.motivo_rechazo as string | null) ?? null,
    stripe_session_id: (f.stripe_session_id as string | null) ?? null,
    stripe_payment_intent_id: (f.stripe_payment_intent_id as string | null) ?? null,
    url_checkout: (f.url_checkout as string | null) ?? null,
    fecha_expiracion: fechaONull(f.fecha_expiracion),
    fecha_creacion: fecha(f.fecha_creacion),
    fecha_actualizacion: fecha(f.fecha_actualizacion),
  };
}

function aReembolso(f: Fila): Reembolso {
  return {
    id_reembolso: String(f.id_reembolso),
    id_pago: String(f.id_pago),
    monto: Number(f.monto),
    motivo: String(f.motivo),
    estado_reembolso: f.estado_reembolso as EstadoReembolso,
    stripe_refund_id: (f.stripe_refund_id as string | null) ?? null,
    fecha_creacion: fecha(f.fecha_creacion),
  };
}

export interface CambioEstado {
  id_pago: string;
  /** Estados desde los cuales se permite la transición (control de concurrencia). */
  desde: EstadoPago[];
  hacia: EstadoPago;
  origen: OrigenCambio;
  detalle?: string;
  motivo_rechazo?: string;
  stripe_payment_intent_id?: string | null;
  reembolso?: { monto: number; motivo: string; estado: EstadoReembolso; stripe_refund_id: string | null };
}

export class PagoRepository {
  constructor(private readonly pool: Pool) {}

  async buscarPorId(idPago: string): Promise<Pago | null> {
    const { rows } = await this.pool.query('SELECT * FROM pagos WHERE id_pago = $1', [idPago]);
    return rows[0] ? aPago(rows[0]) : null;
  }

  async buscarPorReserva(idReserva: string): Promise<Pago | null> {
    const { rows } = await this.pool.query('SELECT * FROM pagos WHERE id_reserva = $1', [idReserva]);
    return rows[0] ? aPago(rows[0]) : null;
  }

  async buscarPorSesion(sessionId: string): Promise<Pago | null> {
    const { rows } = await this.pool.query('SELECT * FROM pagos WHERE stripe_session_id = $1', [sessionId]);
    return rows[0] ? aPago(rows[0]) : null;
  }

  /** Inserta el pago en estado PENDIENTE. */
  async crear(nuevo: NuevoPago): Promise<Pago> {
    const { rows } = await this.pool.query(
      `INSERT INTO pagos (id_pago, id_reserva, id_usuario, monto, estado_pago,
                          stripe_session_id, stripe_payment_intent_id, url_checkout, fecha_expiracion)
       VALUES ($1, $2, $3, $4, 'PENDIENTE', $5, $6, $7, $8)
       RETURNING *`,
      [
        nuevo.id_pago,
        nuevo.id_reserva,
        nuevo.id_usuario,
        nuevo.monto,
        nuevo.stripe_session_id,
        nuevo.stripe_payment_intent_id,
        nuevo.url_checkout,
        nuevo.fecha_expiracion,
      ],
    );
    return aPago(rows[0]);
  }

  /**
   * Cambia el estado de un pago solo si su estado actual está en `desde`
   * (bloquea la fila con SELECT ... FOR UPDATE). Si corresponde, registra
   * el reembolso en la misma transacción.
   * Devuelve null si el pago ya no estaba en un estado permitido.
   */
  async cambiarEstado(cambio: CambioEstado): Promise<Pago | null> {
    return this.enTransaccion(async (cliente) => {
      const actual = await cliente.query('SELECT estado_pago FROM pagos WHERE id_pago = $1 FOR UPDATE', [
        cambio.id_pago,
      ]);
      const estadoAnterior = actual.rows[0]?.estado_pago as EstadoPago | undefined;
      if (!estadoAnterior || !cambio.desde.includes(estadoAnterior)) return null;

      const { rows } = await cliente.query(
        `UPDATE pagos
            SET estado_pago = $2,
                motivo_rechazo = COALESCE($3, motivo_rechazo),
                stripe_payment_intent_id = COALESCE($4, stripe_payment_intent_id)
          WHERE id_pago = $1
          RETURNING *`,
        [cambio.id_pago, cambio.hacia, cambio.motivo_rechazo ?? null, cambio.stripe_payment_intent_id ?? null],
      );
      if (cambio.reembolso) {
        await cliente.query(
          `INSERT INTO reembolsos (id_pago, monto, motivo, estado_reembolso, stripe_refund_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            cambio.id_pago,
            cambio.reembolso.monto,
            cambio.reembolso.motivo,
            cambio.reembolso.estado,
            cambio.reembolso.stripe_refund_id,
          ],
        );
      }
      return aPago(rows[0]);
    });
  }

  /**
   * Elimina un pago que no movió dinero (DELETE de la BD).
   * En la misma transacción: bloquea la fila, verifica el estado permitido y que no tenga reembolsos,
   * desvincula los eventos de webhook (quedan como evidencia con id_pago NULL) y borra el pago.
   */
  async eliminar(
    idPago: string,
    estadosPermitidos: EstadoPago[],
  ): Promise<{ resultado: 'eliminado' | 'no_existe' | 'no_permitido'; estado?: EstadoPago }> {
    return this.enTransaccion(async (cliente) => {
      const actual = await cliente.query('SELECT estado_pago FROM pagos WHERE id_pago = $1 FOR UPDATE', [idPago]);
      const estado = actual.rows[0]?.estado_pago as EstadoPago | undefined;
      if (!estado) return { resultado: 'no_existe' };
      const reembolsos = await cliente.query('SELECT 1 FROM reembolsos WHERE id_pago = $1 LIMIT 1', [idPago]);
      if (!estadosPermitidos.includes(estado) || (reembolsos.rowCount ?? 0) > 0) {
        return { resultado: 'no_permitido', estado };
      }
      await cliente.query('UPDATE eventos_webhook_stripe SET id_pago = NULL WHERE id_pago = $1', [idPago]);
      await cliente.query('DELETE FROM pagos WHERE id_pago = $1', [idPago]);
      return { resultado: 'eliminado', estado };
    });
  }

  async listar(filtros: FiltrosListado): Promise<{ datos: Pago[]; total: number }> {
    const condiciones: string[] = [];
    const valores: unknown[] = [];
    const agregar = (columna: string, valor: unknown) => {
      if (valor === undefined) return;
      valores.push(valor);
      condiciones.push(`${columna} = $${valores.length}`);
    };
    agregar('id_usuario', filtros.id_usuario);
    agregar('id_reserva', filtros.id_reserva);
    agregar('estado_pago', filtros.estado_pago);
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const total = await this.pool.query(`SELECT COUNT(*) AS total FROM pagos ${where}`, valores);
    const { rows } = await this.pool.query(
      `SELECT * FROM pagos ${where}
        ORDER BY fecha_creacion DESC, id_pago
        LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, filtros.limite, (filtros.pagina - 1) * filtros.limite],
    );
    return { datos: rows.map(aPago), total: Number(total.rows[0].total) };
  }

  async reembolsosDe(idPago: string): Promise<Reembolso[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM reembolsos WHERE id_pago = $1 ORDER BY fecha_creacion',
      [idPago],
    );
    return rows.map(aReembolso);
  }

  async eventoWebhookExiste(idEvento: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'SELECT 1 FROM eventos_webhook_stripe WHERE id_evento_stripe = $1',
      [idEvento],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Registra el evento recibido. Devuelve false si ya estaba registrado (reintento de Stripe). */
  async registrarEventoWebhook(idEvento: string, tipo: string, idPago: string | null, payload: unknown): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `INSERT INTO eventos_webhook_stripe (id_evento_stripe, tipo_evento, id_pago, payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id_evento_stripe) DO NOTHING`,
      [idEvento, tipo, idPago, JSON.stringify(payload)],
    );
    return (rowCount ?? 0) > 0;
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  private async enTransaccion<T>(trabajo: (cliente: PoolClient) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      const resultado = await trabajo(cliente);
      await cliente.query('COMMIT');
      return resultado;
    } catch (error) {
      await cliente.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      cliente.release();
    }
  }
}
