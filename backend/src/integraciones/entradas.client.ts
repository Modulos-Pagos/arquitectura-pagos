import { errores } from '../errores';

/**
 * INVOCACIÓN A SERVICIO DE OTRO SQUAD — Entradas/Inventario (ítem BE2).
 *
 * Según la tabla de dependencias TITEC 2026-2, Pagos RECIBE de Entradas la
 * "orden de compra (cantidad de entradas, total)". Además de recibirla en el
 * POST /transacciones, la verificamos contra la fuente oficial invocando:
 *
 *   GET {ENTRADAS_BASE_URL}/api/entradas/reservas/{id_reserva}
 *   (prefijo /api/entradas que exige el API Gateway del Platform Team, que no reescribe el path;
 *   si Entradas usa otra ruta se cambia con ENTRADAS_RUTA_RESERVA sin tocar el código)
 *   Cookie: <el mismo header Cookie (jwt=...) que llegó a Pagos>
 *   200 -> { id_reserva, id_evento, cantidad_entradas, total, estado, nombre_codigo? }
 *   404 -> la reserva no existe
 *
 * Así nadie puede alterar el monto entre Entradas y Pagos.
 * Contrato documentado en docs/openapi-servicios-consumidos.yaml
 * (ver issue de integración INT-01).
 *
 * ENTRADAS_MODO=mock desactiva la invocación mientras Entradas no esté disponible.
 */

export interface OrdenCompraEntradas {
  id_reserva: string;
  id_evento: string;
  cantidad_entradas: number;
  total: number;
  estado?: string;
  /** Código de descuento de Promociones aplicado a la reserva (opcional). */
  nombre_codigo?: string | null;
}

export interface OpcionesEntradas {
  modo: 'mock' | 'http';
  baseUrl: string;
  timeoutMs: number;
  /** Ruta del servicio de Entradas; {id_reserva} se reemplaza por el id. */
  rutaReserva?: string;
  fetchImpl?: typeof fetch;
}

export const RUTA_RESERVA_POR_DEFECTO = '/api/entradas/reservas/{id_reserva}';

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
  async obtenerOrden(idReserva: string, cookie?: string): Promise<OrdenCompraEntradas | null> {
    if (this.opciones.modo === 'mock') return null;

    const ruta = (this.opciones.rutaReserva ?? RUTA_RESERVA_POR_DEFECTO).replace('{id_reserva}', encodeURIComponent(idReserva));
    const url = `${this.opciones.baseUrl}${ruta}`;
    let respuesta: Response;
    try {
      respuesta = await this.fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
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
      nombre_codigo:
        typeof (cuerpo.nombre_codigo ?? cuerpo.codigo) === 'string' && String(cuerpo.nombre_codigo ?? cuerpo.codigo).trim() !== ''
          ? String(cuerpo.nombre_codigo ?? cuerpo.codigo).trim()
          : null,
    };
  }
}
