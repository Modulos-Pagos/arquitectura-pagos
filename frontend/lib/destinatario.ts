/**
 * "¿Para quién es la entrada?" — estado del formulario y validaciones (las mismas reglas que el backend).
 */

/** Se escriben a mano: Auth (contrato v1.3) no expone búsqueda de usuarios por correo. */
export interface DatosDestinatario {
  nombre: string;
  email: string;
  rut: string;
}

export type SeleccionDestinatario = { para: 'mi' } | ({ para: 'otra' } & DatosDestinatario);

export const DESTINATARIO_VACIO: DatosDestinatario = { nombre: '', email: '', rut: '' };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailValido(email: string): boolean {
  return EMAIL_REGEX.test(email.trim()) && email.trim().length <= 254;
}

/** "12.345.678-5" → "12345678-5"; null si el formato o el dígito verificador no son válidos. */
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

/** "12345678-5" o "12.345.678-5" → "12.345.678-5" (solo para mostrar). */
export function formatoRut(rut: string | null | undefined): string {
  if (!rut) return '';
  const [cuerpo, dv] = rut.split('-');
  if (!cuerpo || !dv) return rut;
  const digitos = cuerpo.replace(/\./g, '');
  if (!/^\d+$/.test(digitos)) return rut;
  return `${digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}

export type CampoDestinatario = 'nombre' | 'email' | 'rut';

export function validarDestinatario(d: DatosDestinatario): Partial<Record<CampoDestinatario, string>> {
  const errores: Partial<Record<CampoDestinatario, string>> = {};
  const nombre = d.nombre.trim();
  if (nombre.length < 2 || nombre.length > 120) errores.nombre = 'Ingresa el nombre de quien recibirá la entrada.';
  if (!emailValido(d.email)) errores.email = 'Ingresa un correo válido: ahí le llegará la entrada.';
  if (d.rut.trim() && !normalizarRut(d.rut)) errores.rut = 'RUT no válido. Usa el formato 12.345.678-5.';
  return errores;
}

/** Cuerpo para PUT /{id_pago}/destinatario. */
export function aCuerpoDestinatario(d: DatosDestinatario) {
  return {
    nombre: d.nombre.trim().replace(/\s+/g, ' '),
    email: d.email.trim().toLowerCase(),
    rut: d.rut.trim() ? normalizarRut(d.rut) : null,
  };
}
