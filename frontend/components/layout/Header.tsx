import { Menu, Search, ShoppingCart, Ticket } from 'lucide-react';

/**
 * Header estándar TicketAzul (checklist de consistencia visual, fila 15):
 * azul marino, alto 64px, sticky; logo a la izquierda + menú
 * (Inicio / Mis eventos / Promociones / Configuración / Mi cuenta);
 * buscar + carrito + avatar a la derecha.
 *
 * Los enlaces apuntan al portal común (NEXT_PUBLIC_PORTAL_URL); mientras no exista, a "#".
 * En pantallas chicas el menú se despliega con el botón de hamburguesa (<details>, sin JS).
 */
const PORTAL = process.env.NEXT_PUBLIC_PORTAL_URL ?? '';

const MENU: Array<{ nombre: string; ruta: string }> = [
  { nombre: 'Inicio', ruta: '/' },
  { nombre: 'Mis eventos', ruta: '/mis-eventos' },
  { nombre: 'Promociones', ruta: '/promociones' },
  { nombre: 'Configuración', ruta: '/configuracion' },
  { nombre: 'Mi cuenta', ruta: '/mi-cuenta' },
];

const enlace = (ruta: string) => (PORTAL ? `${PORTAL}${ruta}` : '#');

const CLASE_ICONO =
  'w-10 h-10 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors';

export default function Header({ iniciales = 'MG' }: { iniciales?: string }) {
  return (
    <header className="bg-ticket-primary text-white h-16 sticky top-0 z-50 shadow-tarjeta">
      <div className="max-w-[1200px] h-full mx-auto px-4 md:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          {/* Menú en móvil */}
          <details className="lg:hidden relative">
            <summary aria-label="Abrir menú" className={`${CLASE_ICONO} list-none cursor-pointer`}>
              <Menu className="w-5 h-5" />
            </summary>
            <nav
              aria-label="Menú principal"
              className="absolute left-0 top-12 w-56 bg-white text-ticket-primary rounded-lg shadow-modal border border-ticket-border py-2"
            >
              {MENU.map((item) => (
                <a
                  key={item.ruta}
                  href={enlace(item.ruta)}
                  className="block px-4 py-2 text-sm font-semibold hover:bg-ticket-banner"
                >
                  {item.nombre}
                </a>
              ))}
            </nav>
          </details>

          {/* Logo */}
          <a href={enlace('/')} className="flex items-center gap-2">
            <Ticket className="w-5 h-5" />
            <span className="font-heading font-bold text-xl tracking-widest">TICKETAZUL</span>
          </a>

          {/* Menú en escritorio */}
          <nav aria-label="Menú principal" className="hidden lg:flex items-center gap-6 text-sm font-semibold">
            {MENU.map((item) => (
              <a key={item.ruta} href={enlace(item.ruta)} className="text-white/85 hover:text-white transition-colors">
                {item.nombre}
              </a>
            ))}
          </nav>
        </div>

        {/* Buscar + carrito + avatar */}
        <div className="flex items-center gap-2">
          <a href={enlace('/buscar')} aria-label="Buscar eventos" className={`${CLASE_ICONO} hidden sm:flex`}>
            <Search className="w-5 h-5" />
          </a>
          <a href={enlace('/carrito')} aria-label="Carrito" className={CLASE_ICONO}>
            <ShoppingCart className="w-5 h-5" />
          </a>
          <a
            href={enlace('/mi-cuenta')}
            aria-label="Mi cuenta"
            className="w-9 h-9 ml-1 rounded-full bg-white text-ticket-primary flex items-center justify-center text-xs font-bold"
          >
            {iniciales}
          </a>
        </div>
      </div>
    </header>
  );
}
