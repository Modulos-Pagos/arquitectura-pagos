import { Ticket } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-ticket-primary text-white py-6 px-4 md:px-6 mt-12 border-t border-ticket-primary">
      <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-white/85">
        
        {/* Zona del Logo y Copyright */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-white">
            <Ticket className="w-5 h-5" />
            <span className="font-heading font-bold tracking-widest mt-0.5">
              TICKETAZUL
            </span>
          </div>
          <span aria-hidden className="text-white/40">|</span>
          <span>© 2026</span>
        </div>
        
        {/* Enlaces legales */}
        <div className="flex flex-wrap justify-center gap-6">
          <a href="#" className="hover:text-white transition-colors">Términos de uso</a>
          <a href="#" className="hover:text-white transition-colors">Privacidad</a>
          <a href="#" className="hover:text-white transition-colors">Soporte</a>
          <a href="#" className="hover:text-white transition-colors">Reembolsos</a>
        </div>

      </div>
    </footer>
  );
}