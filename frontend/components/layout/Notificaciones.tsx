'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';

export interface Notificacion {
  id: string;
  titulo: string;
  detalle?: string;
  /** ISO-8601 */
  fecha?: string;
  leida?: boolean;
  tono?: 'exito' | 'peligro' | 'info';
}

const PUNTO: Record<NonNullable<Notificacion['tono']>, string> = {
  exito: 'bg-ticket-exito',
  peligro: 'bg-ticket-peligro',
  info: 'bg-ticket-primary',
};

/**
 * Campana de notificaciones del header (estándar acordado con el equipo de Notificaciones):
 *  - Visual: círculo azul #2F4374 de 36x36px con ícono outline de campana blanco de 20px y trazo 2px.
 *  - Accesibilidad: área clickeable/táctil de 44x44px; aria-expanded / aria-controls.
 *  - Comportamiento: pop-up que se abre y cierra con la campana; se cierra al hacer clic fuera
 *    o con la tecla Escape (el foco vuelve a la campana).
 * Mientras el módulo de Notificaciones no exponga su API, las notificaciones llegan por props.
 */
export default function Notificaciones({ notificaciones = [] }: { notificaciones?: Notificacion[] }) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const idPanel = useId();
  const sinLeer = notificaciones.filter((n) => !n.leida).length;

  useEffect(() => {
    if (!abierto) return;
    const alClicFuera = (e: MouseEvent | TouchEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    };
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener('mousedown', alClicFuera);
    document.addEventListener('touchstart', alClicFuera);
    document.addEventListener('keydown', alTecla);
    return () => {
      document.removeEventListener('mousedown', alClicFuera);
      document.removeEventListener('touchstart', alClicFuera);
      document.removeEventListener('keydown', alTecla);
    };
  }, [abierto]);

  return (
    <div ref={contenedor} className="relative">
      {/* Área clickeable de 44x44px que envuelve el círculo visual de 36x36px */}
      <button
        ref={boton}
        type="button"
        aria-label={sinLeer > 0 ? `Notificaciones (${sinLeer} sin leer)` : 'Notificaciones'}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={idPanel}
        onClick={() => setAbierto((a) => !a)}
        className="group w-11 h-11 flex items-center justify-center rounded-full"
      >
        <span className="relative w-9 h-9 rounded-full bg-[#2F4374] group-hover:bg-ticket-hover flex items-center justify-center transition-colors">
          <Bell className="w-5 h-5 text-white" strokeWidth={2} aria-hidden="true" />
          {sinLeer > 0 && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-ticket-peligro ring-2 ring-[#2F4374]" aria-hidden="true" />
          )}
        </span>
      </button>

      {abierto && (
        <div
          id={idPanel}
          role="dialog"
          aria-label="Notificaciones"
          className="fixed left-4 right-4 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-80 bg-white text-ticket-primary rounded-xl shadow-modal border border-ticket-border overflow-hidden z-50"
        >
          <div className="px-4 py-3 border-b border-ticket-border flex items-center justify-between">
            <h2 className="font-heading font-semibold text-sm">Notificaciones</h2>
            {sinLeer > 0 && (
              <span className="rounded-full bg-ticket-banner px-2 py-0.5 text-xs font-semibold">{sinLeer} nuevas</span>
            )}
          </div>

          {notificaciones.length === 0 ? (
            <div className="px-4 py-8 flex flex-col items-center gap-2 text-center text-ticket-secondary">
              <BellOff className="w-6 h-6" aria-hidden="true" />
              <p className="text-sm">No tienes notificaciones.</p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-ticket-border">
              {notificaciones.map((n) => (
                <li key={n.id} className={`px-4 py-3 flex gap-3 ${n.leida ? '' : 'bg-ticket-banner/50'}`}>
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${PUNTO[n.tono ?? 'info']}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{n.titulo}</p>
                    {n.detalle && <p className="text-xs text-ticket-secondary mt-0.5">{n.detalle}</p>}
                    {n.fecha && (
                      <p className="text-[11px] text-ticket-secondary mt-1">{new Date(n.fecha).toLocaleString('es-CL')}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
