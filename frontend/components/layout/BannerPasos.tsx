import { Lock } from 'lucide-react';

/**
 * Banner de contexto (#EEF1F8, checklist de consistencia visual) bajo el header:
 * título de la página, pasos del pago (1 Pago — 2 Confirmación) y sello de pago seguro.
 */
export default function BannerPasos({ paso = 1 }: { paso?: 1 | 2 }) {
  const pasos: Array<[1 | 2, string]> = [
    [1, 'Pago'],
    [2, 'Confirmación'],
  ];

  return (
    <section aria-label="Progreso del pago" className="bg-ticket-banner border-b border-ticket-border">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <p className="font-heading font-bold text-xl text-ticket-primary">Pago de tus entradas</p>

        <ol className="flex items-center gap-3 text-sm font-semibold">
          {pasos.map(([numero, nombre], i) => {
            const activo = numero === paso;
            return (
              <li key={numero} className="flex items-center gap-3">
                {i > 0 && <span aria-hidden className="w-8 h-px bg-ticket-border" />}
                <span
                  aria-current={activo ? 'step' : undefined}
                  className={`flex items-center gap-2 ${activo ? 'text-ticket-primary' : 'text-ticket-primary/75'}`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                      activo ? 'bg-ticket-primary text-white' : 'bg-white border border-ticket-border text-ticket-primary'
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

        <span className="hidden md:flex items-center gap-2 text-sm font-semibold text-ticket-exito">
          <Lock className="w-4 h-4" /> Pago seguro
        </span>
      </div>
    </section>
  );
}
