import { errores } from '../errores';

/**
 * INVOCACIÓN A SERVICIO DE OTRO SQUAD — Entradas/Inventario (ítem BE2).
 *
 * Según la tabla de dependencias TITEC 2026-2, Pagos RECIBE de Entradas la
 * "orden de compra (cantidad de entradas, total)". Además de recibirla en el
 * POST /transacciones, la verificamos contra la fuente oficial invocando:
 *
 *   GET {ENTRADAS_BASE_URL}/api/v1/entradas/reservas/{id_reserva}
 *   Authorization: <mismo token recibido>
 *   200 -> { id_reserva, id_evento, cantidad_entradas, total, estado }
 *   404 -> la reserva no existe
 *
 * Así nadie puede alterar el monto entre Entradas y Pagos.
 * Contrato documentado en docs/openapi-servicios-consumidos.yaml
 * (ruta a confirmar con el equipo Entradas; ver issue de integración INT-01).
 *
 * ENTRADAS_MODO=mock desactiva la invocación mientras Entradas no esté disponible.
 */

export interface OrdenCompraEntradas {
  id_reserva: string;
  id_evento: string;
  cantidad_entradas: number;
  total: number;
  estado?: string;
}

export interface OpcionesEntradas {
  modo: 'mock' | 'http';
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export class EntradasClient {
  private readonly fetch: typeof fetch;

  constructor(private readonly opciones: OpcionesEntradas) {
    this.fetch = opciones.fetchImpl ?? fetch;
  }

  get modo(): 'mock' | 'http' {
    return this.opciones.modo;
  }

  /**
   * Obtiene la orden de compra asociada a una reserva.
   * Devuelve null en modo mock (no hay verificación contra Entradas).
   */
  async obtenerOrden(idReserva: string, authorization?: string): Promise<OrdenCompraEntradas | null> {
    if (this.opciones.modo === 'mock') return null;

    const url = `${this.opciones.baseUrl}/api/v1/entradas/reservas/${encodeURIComponent(idReserva)}`;
    let respuesta: Response;
    try {
      respuesta = await this.fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
        signal: AbortSignal.timeout(this.opciones.timeoutMs),
      });
    } catch (error) {
      const nombre = (error as Error).name;
      throw errores.entradasNoDisponible(nombre === 'TimeoutError' ? 'tiempo de espera agotado' : 'servicio no alcanzable');
    }

    if (respuesta.status === 404) throw errores.reservaNoEncontrada(idReserva);
    if (!respuesta.ok) throw errores.entradasNoDisponible(`respondió HTTP ${respuesta.status}`);

    let cuerpo: Record<string, unknown>;
    try {
      cuerpo = (await respuesta.json()) as Record<string, unknown>;
    } catch {
      throw errores.entradasNoDisponible('respuesta sin JSON válido');
    }

    // Lector tolerante (Tolerant Reader): acepta nombres alternativos de campos.
    const total = Number(cuerpo.total ?? cuerpo.monto);
    const cantidad = Number(cuerpo.cantidad_entradas ?? cuerpo.cantidad);
    if (!Number.isFinite(total) || !Number.isFinite(cantidad)) {
      throw errores.entradasNoDisponible('la respuesta no trae total y cantidad_entradas');
    }
    return {
      id_reserva: String(cuerpo.id_reserva ?? idReserva),
      id_evento: String(cuerpo.id_evento ?? ''),
      cantidad_entradas: cantidad,
      total,
      estado: typeof cuerpo.estado === 'string' ? cuerpo.estado : undefined,
    };
  }
}
