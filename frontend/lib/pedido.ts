/**
 * Pedido de ejemplo. En el sistema completo estos datos llegan desde el módulo
 * Entradas (reserva: evento, ítems y total) y desde Auth (comprador).
 */

export interface ItemPedido {
  evento: string;
  detalle: string;
  cantidad: number;
  precioUnitario: number;
}

export interface Pedido {
  idEvento: string;
  comprador: { nombre: string; rut: string };
  items: ItemPedido[];
  cargoServicioPct: number;
}

export const PEDIDO_DEMO: Pedido = {
  idEvento: 'evt-2026-festival-jazz',
  comprador: { nombre: 'María González', rut: '12.345.678-9' },
  items: [
    { evento: 'Festival Internacional de Jazz', detalle: 'Zona VIP', cantidad: 2, precioUnitario: 1850 },
    { evento: 'Teatro: El Lago de los Cisnes', detalle: 'Orquesta Central', cantidad: 1, precioUnitario: 980 },
  ],
  cargoServicioPct: 8,
};

export function calcularTotales(pedido: Pedido) {
  const subtotal = pedido.items.reduce((suma, item) => suma + item.cantidad * item.precioUnitario, 0);
  const cargoServicio = Math.round((subtotal * pedido.cargoServicioPct) / 100);
  const cantidadEntradas = pedido.items.reduce((suma, item) => suma + item.cantidad, 0);
  return { subtotal, cargoServicio, total: subtotal + cargoServicio, cantidadEntradas };
}

/** Pesos chilenos sin decimales: 5054 → "$5.054". */
export function formatoCLP(monto: number): string {
  return `$${monto.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`;
}

export function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
