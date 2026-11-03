'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Elements } from '@stripe/react-stripe-js';
import { AlertCircle, Loader2 } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import BannerPasos from '@/components/layout/BannerPasos';
import CheckoutForm, { type EstadoPerfil, type PagoExistente } from '@/components/checkout/CheckoutForm';
import OrderSummary from '@/components/checkout/OrderSummary';
import Confirmacion from '@/components/checkout/Confirmacion';
import {
  crearTransaccion,
  ErrorApi,
  obtenerDatosCheckout,
  obtenerPago,
  obtenerPerfil,
  type Destinatario,
  type Pago,
  URL_ENTRADAS,
} from '@/lib/api';
import { formatoCLP, iniciales, PEDIDO_DEMO } from '@/lib/pedido';
import type { Notificacion } from '@/components/layout/Notificaciones';
import { stripePromise } from '@/lib/stripe';

type Carga =
  | { estado: 'cargando' }
  | { estado: 'listo'; existente: PagoExistente | null; destinatario?: Destinatario | null }
  | { estado: 'error'; mensaje: string; urlStripe?: string | null; volverAEntradas?: boolean };

/** Reserva que llega desde el módulo Entradas: /pagos?idReserva=...&total=...&cantidad=...&idEvento=... */
interface ReservaEntradas {
  id_reserva: string;
  total: number;
  cantidad_entradas: number;
  id_evento?: string;
}

function leerReserva(params: URLSearchParams): ReservaEntradas | 'invalida' | null {
  const id = params.get('idReserva') ?? params.get('id_reserva');
  if (!id) return null;
  const total = Number(params.get('total'));
  const cantidad = Number(params.get('cantidad') ?? params.get('cantidad_entradas'));
  if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(cantidad) || cantidad <= 0) return 'invalida';
  const idEvento = params.get('idEvento') ?? params.get('id_evento');
  return { id_reserva: id, total, cantidad_entradas: cantidad, ...(idEvento ? { id_evento: idEvento } : {}) };
}

/**
 * Flujo del módulo de Pagos:
 *   - Con ?id_pago=... (url_checkout que entrega el backend a Entradas): se cobra ese pago existente.
 *   - Con ?idReserva=...&total=...&cantidad=... (botón "Ir a pagar" del módulo Entradas): el front crea el pago
 *     y el backend verifica la reserva contra Entradas (integración I1) antes de cobrar.
 *   - Sin parámetros: demo con el pedido de ejemplo (el front crea el pago).
 *   Paso 1 (Pago) → datos del comprador (Auth, vía Pagos), "¿Para quién es la entrada?" y formulario
 *   con Stripe Elements. Paso 2 (Confirmación) → resultado del microservicio.
 *   Todas las llamadas van al API Gateway: /api/pagos/**.
 */
export default function CheckoutPage() {
  const pedido = PEDIDO_DEMO;
  const params = useSearchParams();
  const idPago = params.get('id_pago');
  const claveReserva = idPago ? null : params.toString();
  const [pago, setPago] = useState<Pago | null>(null);
  const [carga, setCarga] = useState<Carga>(() => {
    if (idPago) return { estado: 'cargando' };
    const reserva = leerReserva(params);
    if (reserva === 'invalida') {
      return { estado: 'error', mensaje: 'No recibimos bien los datos de tu reserva. Vuelve a elegir tus entradas.', volverAEntradas: true };
    }
    return reserva ? { estado: 'cargando' } : { estado: 'listo', existente: null };
  });
  const [perfil, setPerfil] = useState<EstadoPerfil>({ estado: 'cargando' });

  // Sesión y datos del comprador: Pagos los valida con Auth (contrato Auth ↔ Pagos v1.3).
  const pedirPerfil = useCallback(
    () =>
      obtenerPerfil()
        .then((datos) => setPerfil({ estado: 'listo', perfil: datos }))
        .catch((e: unknown) =>
          setPerfil({
            estado: 'error',
            mensaje: e instanceof Error ? e.message : 'Auth no disponible',
            status: e instanceof ErrorApi ? e.status : 0,
          }),
        ),
    [],
  );
  const reintentarPerfil = () => {
    setPerfil({ estado: 'cargando' });
    void pedirPerfil();
  };

  useEffect(() => {
    void pedirPerfil();
  }, [pedirPerfil]);

  useEffect(() => {
    if (!idPago) return;
    let cancelado = false;
    obtenerDatosCheckout(idPago)
      .then((datos) => {
        if (cancelado) return;
        if (datos.estado_pago !== 'PENDIENTE') {
          setPago(datos);
          setCarga({ estado: 'listo', existente: null });
        } else if (!datos.client_secret) {
          setCarga({
            estado: 'error',
            mensaje: 'Este pago se completa en la página de Stripe.',
            urlStripe: datos.url_checkout,
          });
        } else {
          setCarga({
            estado: 'listo',
            existente: {
              id_pago: datos.id_pago,
              id_reserva: datos.id_reserva,
              monto: datos.monto,
              client_secret: datos.client_secret,
            },
            destinatario: datos.destinatario ?? null,
          });
        }
      })
      .catch((e: unknown) => {
        if (!cancelado) setCarga({ estado: 'error', mensaje: e instanceof Error ? e.message : 'No se pudo cargar el pago.' });
      });
    return () => {
      cancelado = true;
    };
  }, [idPago]);

  // Llegada desde Entradas con la reserva: se crea (o recupera, es idempotente) el pago. El backend de Pagos
  // consulta la reserva en Entradas y rechaza el cobro si el total o la cantidad no coinciden (I1).
  useEffect(() => {
    if (claveReserva === null) return;
    const reserva = leerReserva(new URLSearchParams(claveReserva));
    if (!reserva) return;
    if (reserva === 'invalida') return; // el estado inicial ya muestra el error
    let cancelado = false;
    crearTransaccion(reserva)
      .then(async (trx) => {
        if (cancelado) return;
        if (trx.estado_pago !== 'PENDIENTE') {
          const final = await obtenerPago(trx.id_pago);
          if (!cancelado) {
            setPago(final);
            setCarga({ estado: 'listo', existente: null });
          }
        } else if (!trx.client_secret) {
          setCarga({ estado: 'error', mensaje: 'No pudimos preparar el pago. Inténtalo de nuevo en unos minutos.', volverAEntradas: true });
        } else {
          setCarga({
            estado: 'listo',
            existente: {
              id_pago: trx.id_pago,
              id_reserva: trx.id_reserva,
              monto: reserva.total,
              client_secret: trx.client_secret,
              cantidad: reserva.cantidad_entradas,
            },
          });
        }
      })
      .catch((e: unknown) => {
        if (cancelado || (e instanceof ErrorApi && e.status === 401)) return; // 401: ya se redirige al login
        setCarga({
          estado: 'error',
          mensaje: e instanceof Error ? e.message : 'No pudimos preparar el pago.',
          volverAEntradas: true,
        });
      });
    return () => {
      cancelado = true;
    };
  }, [claveReserva]);

  const reservaUrl = claveReserva === null ? null : leerReserva(new URLSearchParams(claveReserva));
  const cantidadReserva = reservaUrl && reservaUrl !== 'invalida' ? reservaUrl.cantidad_entradas : undefined;
  const existente = carga.estado === 'listo' ? carga.existente : null;
  const destinatarioInicial = carga.estado === 'listo' ? (carga.destinatario ?? null) : null;
  // Aviso local del resultado del pago en la campana (hasta que Notificaciones exponga su API).
  const notificaciones: Notificacion[] = pago ? [notificacionDePago(pago)] : [];
  const nombreComprador = perfil.estado === 'listo' ? perfil.perfil.nombre_completo : '';

  let contenido: React.ReactNode;
  if (pago) {
    contenido = <Confirmacion pago={pago} />;
  } else if (carga.estado === 'cargando') {
    contenido = (
      <div className="flex items-center gap-2 text-ticket-secondary py-16 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" /> Cargando el pago...
      </div>
    );
  } else if (carga.estado === 'error') {
    contenido = (
      <div role="alert" className="flex flex-col gap-3 rounded-xl border border-ticket-peligro bg-ticket-peligro-bg p-6 text-sm text-ticket-peligro">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{carga.mensaje}</span>
        </div>
        {carga.urlStripe && (
          <a href={carga.urlStripe} className="font-semibold underline">
            Ir a pagar en Stripe
          </a>
        )}
        {carga.volverAEntradas && (
          <a href={URL_ENTRADAS} className="font-semibold underline">
            Volver a Entradas
          </a>
        )}
      </div>
    );
  } else {
    contenido = (
      <Elements stripe={stripePromise} options={{ locale: 'es' }}>
        <CheckoutForm
          pedido={pedido}
          existente={existente}
          perfil={perfil}
          onReintentarPerfil={reintentarPerfil}
          destinatarioInicial={destinatarioInicial}
          onFinalizado={setPago}
        />
      </Elements>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-ticket-bg">
      <Header iniciales={nombreComprador ? iniciales(nombreComprador) : undefined} notificaciones={notificaciones} />
      <BannerPasos paso={pago ? 2 : 1} />
      {/* Contenido: 1200px máx., grid de 12 columnas, gutters de 24px (fila 13) */}
      <main className="flex-grow w-full max-w-[1200px] mx-auto px-4 md:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 xl:col-span-8">{contenido}</div>
          {/* Si la reserva de Entradas no se pudo validar, no se muestra un resumen que no corresponde. */}
          {!(carga.estado === 'error' && carga.volverAEntradas) && (
            <div className="lg:col-span-5 xl:col-span-4 sticky top-24">
              <OrderSummary
                pedido={pedido}
                existente={existente ?? (pago ? { id_reserva: pago.id_reserva, monto: pago.monto, cantidad: cantidadReserva } : null)}
                cargando={carga.estado === 'cargando' && !pago}
              />
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function notificacionDePago(pago: Pago): Notificacion {
  const para = pago.destinatario ? ` La entrada se enviará a ${pago.destinatario.nombre}.` : '';
  const base = { id: `pago-${pago.id_pago}-${pago.estado_pago}`, fecha: pago.fecha_actualizacion, leida: false };
  switch (pago.estado_pago) {
    case 'APROBADO':
      return { ...base, tono: 'exito', titulo: 'Pago aprobado', detalle: `Pagaste ${formatoCLP(pago.monto)}.${para}` };
    case 'PENDIENTE':
      return { ...base, tono: 'info', titulo: 'Pago en proceso', detalle: 'Stripe aún está confirmando tu pago.' };
    case 'REEMBOLSADO':
      return { ...base, tono: 'info', titulo: 'Pago reembolsado', detalle: `Se devolvieron ${formatoCLP(pago.monto)}.` };
    default:
      return { ...base, tono: 'peligro', titulo: `Pago ${pago.estado_pago.toLowerCase()}`, detalle: 'No se realizó ningún cobro.' };
  }
}
