import { errores } from '../errores';
import { ESTADOS_PAGO, type EstadoPago, type FiltrosListado } from './pago.types';

/**
 * DTOs (Data Transfer Objects) y su validación en la frontera HTTP.
 * Si algo no cumple, se responde 400 con la lista de problemas encontrados.
 */

/**
 * formulario = (por defecto) url_checkout apunta al front de Pagos, que cobra con Stripe Elements.
 * checkout   = url_checkout apunta a la página de pago alojada por Stripe (Stripe Checkout).
 */
export const METODOS_PAGO = ['checkout', 'formulario'] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export interface CrearTransaccionDto {
  id_reserva: string;
  /** Opcional (contrato Entradas v1.0): la tabla TITEC solo exige cantidad y total. */
  id_evento: string | null;
  /** Opcional (contrato Promociones v1.0): código de descuento aplicado por Entradas, p. ej. "DESC50". */
  nombre_codigo: string | null;
  total: number;
  cantidad_entradas: number;
  metodo: MetodoPago;
}

export interface ReembolsoDto {
  motivo: string;
}

const MAX_ID = 64;
const MAX_CODIGO = 50;
const MAX_MONTO = 99_999_999;
const MAX_ENTRADAS = 100;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function validarId(valor: unknown, campo: string, problemas: string[]): string {
  if (typeof valor !== 'string' || valor.trim() === '') {
    problemas.push(`${campo} es obligatorio y debe ser un texto`);
    return '';
  }
  if (valor.trim().length > MAX_ID) problemas.push(`${campo} no puede superar ${MAX_ID} caracteres`);
  return valor.trim();
}

function validarEntero(valor: unknown, campo: string, min: number, max: number, problemas: string[]): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor)) {
    problemas.push(`${campo} es obligatorio y debe ser un número entero`);
    return 0;
  }
  if (valor < min || valor > max) problemas.push(`${campo} debe estar entre ${min} y ${max}`);
  return valor;
}

/** Código de descuento opcional: null/ausente/"" = sin código. */
function validarCodigo(valor: unknown, problemas: string[]): string | null {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string' || valor.trim() === '') {
    problemas.push('nombre_codigo debe ser un texto');
    return null;
  }
  const codigo = valor.trim();
  if (codigo.length > MAX_CODIGO) problemas.push(`nombre_codigo no puede superar ${MAX_CODIGO} caracteres`);
  return codigo;
}

export function validarCrearTransaccion(body: unknown): CrearTransaccionDto {
  if (!esObjeto(body)) throw errores.validacion(['El body debe ser un objeto JSON']);
  const problemas: string[] = [];
  const dto: CrearTransaccionDto = {
    id_reserva: validarId(body.id_reserva, 'id_reserva', problemas),
    id_evento:
      body.id_evento === undefined || body.id_evento === null
        ? null
        : validarId(body.id_evento, 'id_evento', problemas),
    nombre_codigo: validarCodigo(body.nombre_codigo, problemas),
    total: validarEntero(body.total, 'total', 1, MAX_MONTO, problemas),
    cantidad_entradas: validarEntero(body.cantidad_entradas, 'cantidad_entradas', 1, MAX_ENTRADAS, problemas),
    metodo: 'formulario',
  };
  if (body.metodo !== undefined) {
    if (typeof body.metodo === 'string' && (METODOS_PAGO as readonly string[]).includes(body.metodo)) {
      dto.metodo = body.metodo as MetodoPago;
    } else {
      problemas.push(`metodo debe ser uno de: ${METODOS_PAGO.join(', ')}`);
    }
  }
  if (problemas.length > 0) throw errores.validacion(problemas);
  return dto;
}

export function validarReembolso(body: unknown): ReembolsoDto {
  if (!esObjeto(body)) throw errores.validacion(['El body debe ser un objeto JSON']);
  const { motivo } = body;
  if (typeof motivo !== 'string' || motivo.trim().length < 3 || motivo.trim().length > 255) {
    throw errores.validacion(['motivo es obligatorio y debe tener entre 3 y 255 caracteres']);
  }
  return { motivo: motivo.trim() };
}

export function validarIdPago(valor: unknown): string {
  if (typeof valor !== 'string' || !UUID_REGEX.test(valor)) {
    throw errores.validacion(['id_pago debe ser un UUID válido']);
  }
  return valor.toLowerCase();
}

function textoOpcional(valor: unknown, campo: string, problemas: string[]): string | undefined {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'string' || valor.trim() === '' || valor.length > MAX_ID) {
    problemas.push(`${campo} debe ser un texto de 1 a ${MAX_ID} caracteres`);
    return undefined;
  }
  return valor.trim();
}

function enteroOpcional(valor: unknown, campo: string, porDefecto: number, max: number, problemas: string[]): number {
  if (valor === undefined) return porDefecto;
  const numero = Number(valor);
  if (typeof valor !== 'string' || !Number.isInteger(numero) || numero < 1 || numero > max) {
    problemas.push(`${campo} debe ser un entero entre 1 y ${max}`);
    return porDefecto;
  }
  return numero;
}

export function validarFiltrosListado(query: unknown): FiltrosListado {
  const q = esObjeto(query) ? query : {};
  const problemas: string[] = [];
  let estado: EstadoPago | undefined;
  if (q.estado !== undefined) {
    if (typeof q.estado === 'string' && (ESTADOS_PAGO as readonly string[]).includes(q.estado.toUpperCase())) {
      estado = q.estado.toUpperCase() as EstadoPago;
    } else {
      problemas.push(`estado debe ser uno de: ${ESTADOS_PAGO.join(', ')}`);
    }
  }
  const filtros: FiltrosListado = {
    id_usuario: textoOpcional(q.id_usuario, 'id_usuario', problemas),
    id_reserva: textoOpcional(q.id_reserva, 'id_reserva', problemas),
    estado_pago: estado,
    pagina: enteroOpcional(q.pagina, 'pagina', 1, 100_000, problemas),
    limite: enteroOpcional(q.limite, 'limite', 20, 100, problemas),
  };
  if (problemas.length > 0) throw errores.validacion(problemas);
  return filtros;
}

// ------------------------------------------------------------------
// Destinatario (comprar la entrada para otra persona)
// ------------------------------------------------------------------

/** Datos que ingresa el comprador (Auth v1.3 no expone búsqueda de usuarios: siempre se escriben a mano). */
export interface DestinatarioDto {
  nombre: string;
  email: string;
  rut: string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarEmail(valor: unknown, problemas: string[], campo = 'email'): string {
  if (typeof valor !== 'string' || !EMAIL_REGEX.test(valor.trim()) || valor.trim().length > 254) {
    problemas.push(`${campo} debe ser un correo válido (hasta 254 caracteres)`);
    return '';
  }
  return valor.trim().toLowerCase();
}

/** Normaliza un RUT chileno (quita puntos, K mayúscula) y verifica su dígito verificador. */
export function normalizarRut(valor: string): string | null {
  const limpio = valor.replace(/\./g, '').replace(/\s/g, '').toUpperCase();
  const m = /^(\d{7,8})-?([\dK])$/.exec(limpio);
  if (!m) return null;
  const [, cuerpo, dv] = m;
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return esperado === dv ? `${cuerpo}-${dv}` : null;
}

/**
 * Formato oficial del RUT en TicketU (contrato general de Auth v1.1): con puntos y guion,
 * ej. "12345678-5" -> "12.345.678-5". Pagos guarda el RUT sin puntos y lo entrega así hacia afuera
 * (respuestas y eventos), igual que Auth entrega el RUT del comprador.
 */
export function formatearRut(rut: string | null | undefined): string | null {
  if (!rut) return null;
  const [cuerpo, dv] = rut.replace(/\./g, '').split('-');
  if (!cuerpo || !dv || !/^\d+$/.test(cuerpo)) return rut;
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv.toUpperCase()}`;
}

export function validarDestinatario(body: unknown): DestinatarioDto {
  if (!esObjeto(body)) throw errores.validacion(['El body debe ser un objeto JSON']);
  const problemas: string[] = [];

  let nombre = '';
  if (typeof body.nombre !== 'string' || body.nombre.trim().length < 2 || body.nombre.trim().length > 120) {
    problemas.push('nombre es obligatorio y debe tener entre 2 y 120 caracteres');
  } else {
    nombre = body.nombre.trim().replace(/\s+/g, ' ');
  }

  const email = validarEmail(body.email, problemas);

  let rut: string | null = null;
  if (body.rut !== undefined && body.rut !== null && body.rut !== '') {
    rut = typeof body.rut === 'string' ? normalizarRut(body.rut) : null;
    if (!rut) problemas.push('rut debe tener el formato 12345678-9 y un dígito verificador válido');
  }

  if (problemas.length > 0) throw errores.validacion(problemas);
  return { nombre, email, rut };
}
