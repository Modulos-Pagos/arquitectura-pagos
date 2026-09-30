'use client';

import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { EstadoPago, Pago } from '@/lib/api';
import { formatoCLP } from '@/lib/pedido';

const TEXTOS: Record<EstadoPago, { titulo: string; detalle: string }> = {
  APROBADO: { titulo: '¡Pago confirmado!', detalle: 'Tu compra fue procesada. Recibirás tus entradas con código QR.' },
  PENDIENTE: {
    titulo: 'Pago en proceso',
    detalle: 'Stripe aún está confirmando tu pago. Te avisaremos apenas se apruebe.',
  },
  RECHAZADO: { titulo: 'Pago rechazado', detalle: 'No se realizó ningún cobro. Puedes intentarlo nuevamente.' },
  ANULADO: { titulo: 'Pago anulado', detalle: 'La compra fue anulada y no se realizó ningún cobro.' },
  REEMBOLSADO: { titulo: 'Pago reembolsado', detalle: 'El monto fue devuelto a tu tarjeta.' },
};

/** Colores de estado del estándar (filas 5 y 18): éxito, peligro e información. */
const TONO: Record<EstadoPago, { icono: string; badge: string }> = {
  APROBADO: { icono: 'text-ticket-exito', badge: 'text-ticket-exito bg-ticket-exito-bg' },
  PENDIENTE: { icono: 'text-ticket-info', badge: 'text-ticket-info bg-ticket-info-bg' },
  REEMBOLSADO: { icono: 'text-ticket-info', badge: 'text-ticket-info bg-ticket-info-bg' },
  RECHAZADO: { icono: 'text-ticket-peligro', badge: 'text-ticket-peligro bg-ticket-peligro-bg' },
  ANULADO: { icono: 'text-ticket-peligro', badge: 'text-ticket-peligro bg-ticket-peligro-bg' },
};

export default function Confirmacion({ pago }: { pago: Pago }) {
  const texto = TEXTOS[pago.estado_pago];
  const tono = TONO[pago.estado_pago];
  const Icono = pago.estado_pago === 'APROBADO' ? CheckCircle2 : pago.estado_pago === 'PENDIENTE' ? Clock : XCircle;

  const filas: Array<[string, string]> = [
    ['Monto', `${formatoCLP(pago.monto)} ${pago.moneda}`],
    ['ID de pago', pago.id_pago],
    ['Reserva', pago.id_reserva],
    ['Fecha', new Date(pago.fecha_creacion).toLocaleString('es-CL')],
  ];
  if (pago.motivo_rechazo) filas.push(['Motivo', pago.motivo_rechazo]);

  return (
    <section className="bg-white border border-ticket-border rounded-xl shadow-tarjeta p-8 flex flex-col items-center text-center gap-4">
      <Icono className={`w-16 h-16 ${tono.icono}`} />
      <h1 className="font-heading font-bold text-[28px] text-ticket-primary">{texto.titulo}</h1>
      <p className="text-sm text-ticket-secondary max-w-md">{texto.detalle}</p>

      {/* Badge de estado (pill, radio 999px) */}
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tono.badge}`}>{pago.estado_pago}</span>

      <dl className="w-full max-w-md mt-2 divide-y divide-ticket-border border border-ticket-border rounded-lg text-sm text-left">
        {filas.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-ticket-secondary">{etiqueta}</dt>
            <dd className="font-semibold text-ticket-primary break-all text-right">{valor}</dd>
          </div>
        ))}
      </dl>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 h-10 px-6 bg-ticket-primary text-white text-sm font-semibold rounded-lg hover:bg-ticket-hover transition-colors"
      >
        {pago.estado_pago === 'APROBADO' ? 'Hacer otra compra' : 'Volver a intentar'}
      </button>
    </section>
  );
}
