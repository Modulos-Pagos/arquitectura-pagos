import { Lock } from 'lucide-react';
import { calcularTotales, formatoCLP, type Pedido } from '@/lib/pedido';

interface OrderSummaryProps {
  pedido: Pedido;
  /** Pago creado por Entradas: se muestra la reserva y el total informado por el microservicio. */
  existente?: { id_reserva: string; monto: number } | null;
  /** true mientras se carga un pago existente (?id_pago=): no se muestra el pedido de ejemplo. */
  cargando?: boolean;
}

export default function OrderSummary({ pedido, existente = null, cargando = false }: OrderSummaryProps) {
  const { subtotal, cargoServicio, total, cantidadEntradas } = calcularTotales(pedido);

  if (cargando) {
    return (
      <div className="bg-white rounded-xl border border-ticket-border overflow-hidden shadow-tarjeta">
        <div className="bg-ticket-primary text-white p-5">
          <h2 className="font-heading font-bold text-xl">Resumen del pedido</h2>
          <p className="text-xs text-white/85 mt-1">Cargando...</p>
        </div>
        <div className="p-5 flex flex-col gap-3 animate-pulse">
          <div className="h-4 bg-ticket-banner rounded w-3/4" />
          <div className="h-4 bg-ticket-banner rounded w-1/2" />
          <div className="h-14 bg-ticket-card border border-ticket-border rounded-[8px] mt-2" />
        </div>
      </div>
    );
  }

  if (existente) {
    return (
      <div className="bg-white rounded-xl border border-ticket-border overflow-hidden shadow-tarjeta">
        <div className="bg-ticket-primary text-white p-5">
          <h2 className="font-heading font-bold text-xl">Resumen del pedido</h2>
          <p className="text-xs text-white/85 mt-1">Reserva {existente.id_reserva}</p>
        </div>
        <div className="p-5 flex flex-col gap-4 text-sm">
          <div className="flex justify-between items-center bg-ticket-card p-4 rounded-[8px] border border-ticket-border">
            <span className="font-heading font-bold text-ticket-primary">Total a pagar</span>
            <span className="font-heading font-bold text-xl text-ticket-primary">{formatoCLP(existente.monto)}</span>
          </div>
          <div className="flex items-center justify-center gap-1 text-xs text-ticket-secondary">
            <Lock className="w-4 h-4 text-ticket-secondary" />
            <span>Pago seguro con Stripe</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-ticket-border overflow-hidden shadow-tarjeta">
      {/* Cabecera azul */}
      <div className="bg-ticket-primary text-white p-5">
        <h2 className="font-heading font-bold text-xl">Resumen del pedido</h2>
        <p className="text-xs text-white/85 mt-1">
          {cantidadEntradas} {cantidadEntradas === 1 ? 'boleto' : 'boletos'}
        </p>
      </div>

      <div className="p-5 flex flex-col gap-4 text-sm">
        {/* Ítems del pedido */}
        {pedido.items.map((item) => (
          <div key={`${item.evento}-${item.detalle}`} className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold text-sm text-ticket-primary">{item.evento}</h3>
              <p className="text-xs text-ticket-secondary mt-0.5">
                {item.cantidad}× {item.detalle}
              </p>
            </div>
            <span className="font-semibold text-ticket-primary">{formatoCLP(item.cantidad * item.precioUnitario)}</span>
          </div>
        ))}

        <hr className="border-ticket-border my-1" />

        {/* Subtotal */}
        <div className="flex justify-between items-center text-sm">
          <span className="text-ticket-secondary">Subtotal</span>
          <span className="font-semibold text-ticket-primary">{formatoCLP(subtotal)}</span>
        </div>

        {/* Cargo por servicio */}
        <div className="flex justify-between items-center text-sm">
          <span className="text-ticket-secondary">
            Cargo por servicio{' '}
            <span className="bg-ticket-banner text-ticket-primary text-xs font-semibold px-2 py-0.5 rounded-full">{pedido.cargoServicioPct}%</span>
          </span>
          <span className="font-semibold text-ticket-primary">{formatoCLP(cargoServicio)}</span>
        </div>

        {/* Total a pagar */}
        <div className="flex justify-between items-center bg-ticket-card p-4 rounded-[8px] border border-ticket-border mt-1">
          <span className="font-heading font-bold text-ticket-primary">Total a pagar</span>
          <span className="font-heading font-bold text-xl text-ticket-primary">{formatoCLP(total)}</span>
        </div>

        {/* Sellos de seguridad Stripe */}
        <div className="text-center mt-3 flex flex-col items-center gap-2">
          <div className="flex items-center gap-1.5 text-ticket-secondary">
            <span className="bg-[#635BFF] text-white text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded">
              stripe
            </span>
            <span className="text-xs">Procesado por Stripe</span>
          </div>

          <div className="flex items-center gap-1 text-xs text-ticket-secondary">
            <Lock className="w-4 h-4 text-ticket-secondary" />
            <span>Pago seguro con Stripe</span>
          </div>
        </div>
      </div>
    </div>
  );
}
