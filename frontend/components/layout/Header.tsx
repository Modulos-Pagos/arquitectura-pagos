import { Lock, Ticket } from 'lucide-react';

/**
 * Header del checkout. Mantiene el formato del header estándar TicketAzul (fila 15 del
 * checklist de consistencia visual: azul marino, alto 64px, sticky, logo a la izquierda),
 * pero SIN navegación ni buscador/carrito: el pago es un flujo cerrado al que el usuario
 * llega desde Entradas (excepción acordada para Pagos). Al centro muestra los pasos del pago.
 */
export default function Header({ paso = 1 }: { paso?: 1 | 2 }) {
  const pasos: Array<[1 | 2, string]> = [
    [1, 'Pago'],
    [2, 'Confirmación'],
  ];

  return (
    <header className="bg-ticket-primary text-white h-16 sticky top-0 z-50 shadow-tarjeta">
      <div className="max-w-[1200px] h-full mx-auto px-4 md:px-6 flex items-center justify-between gap-6">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Ticket className="w-5 h-5" />
          <span className="font-heading font-bold text-xl tracking-widest">TICKETAZUL</span>
        </div>

        {/* Indicador de pasos */}
        <ol className="hidden md:flex items-center gap-4 text-sm font-semibold">
          {pasos.map(([numero, nombre], i) => {
            const activo = numero === paso;
            return (
              <li key={numero} className="flex items-center gap-4">
                {i > 0 && <span aria-hidden className="w-8 h-px bg-white/40" />}
                <span
                  aria-current={activo ? 'step' : undefined}
                  className={`flex items-center gap-2 ${activo ? 'text-white' : 'text-white/70'}`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                      activo ? 'bg-white text-ticket-primary' : 'bg-white/20 text-white'
                    }`}
                  >
                    {numero}
                  </span>
                  {nombre}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Sello de seguridad */}
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Lock className="w-5 h-5" /> Pago seguro
        </span>
      </div>
    </header>
  );
}
