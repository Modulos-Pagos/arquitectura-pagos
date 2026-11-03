import { errores } from '../errores';
import { registrarIntegracion } from '../utils/log-integracion';

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
    const operacion = `GET ${ruta}`;
    const inicio = performance.now();
    let respuesta: Response;
    try {
      respuesta = await this.fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        signal: AbortSignal.timeout(this.opciones.timeoutMs),
      });
    } catch (error) {
      const nombre = (error as Error).name;
      const motivo = nombre === 'TimeoutError' ? 'tiempo de espera agotado' : 'servicio no alcanzable';
      registrarIntegracion('Entradas', operacion, `sin respuesta: ${motivo} → 503 ENTRADAS_NO_DISPONIBLE`, inicio);
      throw errores.entradasNoDisponible(motivo);
    }

    if (respuesta.status === 404) {
      registrarIntegracion('Entradas', operacion, '404 → 422 RESERVA_NO_ENCONTRADA', inicio);
      throw errores.reservaNoEncontrada(idReserva);
    }
    if (!respuesta.ok) {
      registrarIntegracion('Entradas', operacion, `${respuesta.status} → 503 ENTRADAS_NO_DISPONIBLE`, inicio);
      throw errores.entradasNoDisponible(`respondió HTTP ${respuesta.status}`);
    }

    let cuerpo: Record<string, unknown>;
    try {
      cuerpo = (await respuesta.json()) as Record<string, unknown>;
    } catch {
      registrarIntegracion('Entradas', operacion, `${respuesta.status} sin JSON → 503 ENTRADAS_NO_DISPONIBLE`, inicio);
      throw errores.entradasNoDisponible('respuesta sin JSON válido');
    }
    // Algunas respuestas vienen envueltas: { data: {...} } o { reserva: {...} }.
    const interno = (cuerpo.data ?? cuerpo.reserva) as Record<string, unknown> | undefined;
    if (interno && typeof interno === 'object' && !Array.isArray(interno)) cuerpo = { ...cuerpo, ...interno };

    // Lector tolerante (Tolerant Reader): acepta los nombres del contrato y los que usa el módulo
    // Entradas en su API de reservas (monto_total, cantidad_entrada, hold_id, estado_reserva).
    const total = Number(cuerpo.total ?? cuerpo.monto_total ?? cuerpo.monto);
    const cantidad = Number(cuerpo.cantidad_entradas ?? cuerpo.cantidad_entrada ?? cuerpo.cantidad);
    if (!Number.isFinite(total) || !Number.isFinite(cantidad)) {
      registrarIntegracion('Entradas', operacion, `${respuesta.status} incompleta → 503 ENTRADAS_NO_DISPONIBLE`, inicio);
      throw errores.entradasNoDisponible('la respuesta no trae total y cantidad_entradas');
    }
    registrarIntegracion('Entradas', operacion, `${respuesta.status} (total ${total}, cantidad ${cantidad})`, inicio);
    const estado = cuerpo.estado ?? cuerpo.estado_reserva;
    return {
      id_reserva: String(cuerpo.id_reserva ?? cuerpo.hold_id ?? idReserva),
      id_evento: cuerpo.id_evento === undefined || cuerpo.id_evento === null ? '' : String(cuerpo.id_evento),
      cantidad_entradas: cantidad,
      total,
      estado: typeof estado === 'string' ? estado : undefined,
      nombre_codigo:
        typeof (cuerpo.nombre_codigo ?? cuerpo.codigo) === 'string' && String(cuerpo.nombre_codigo ?? cuerpo.codigo).trim() !== ''
          ? String(cuerpo.nombre_codigo ?? cuerpo.codigo).trim()
          : null,
    };
  }
}
