'use client';

import { AlertCircle, Gift, User } from 'lucide-react';
import type { PerfilComprador } from '@/lib/api';
import {
  DESTINATARIO_VACIO,
  type CampoDestinatario,
  type DatosDestinatario,
  type SeleccionDestinatario,
} from '@/lib/destinatario';

const CLASE_CAMPO =
  'w-full h-10 border rounded-lg px-3 py-[10px] transition-all text-sm text-ticket-primary bg-white placeholder:text-ticket-secondary focus:outline-none focus:border-ticket-primary focus:ring-2 focus:ring-ticket-primary';
const CLASE_LABEL = 'block text-xs font-semibold text-ticket-secondary uppercase tracking-wider mb-2';

interface ParaQuienProps {
  valor: SeleccionDestinatario;
  onChange: (valor: SeleccionDestinatario) => void;
  errores: Partial<Record<CampoDestinatario, string>>;
  onLimpiarError: (campo: CampoDestinatario) => void;
  perfil: PerfilComprador | null;
  deshabilitado?: boolean;
}

function ErrorCampo({ id, mensaje }: { id: string; mensaje?: string }) {
  if (!mensaje) return null;
  return (
    <p id={id} className="mt-1 flex items-center gap-1 text-xs text-ticket-peligro">
      <AlertCircle className="w-4 h-4 shrink-0" /> {mensaje}
    </p>
  );
}

/**
 * Tarjeta "¿Para quién es la entrada?".
 *  - Para mí: la entrada queda a nombre del comprador (datos de su sesión de Auth).
 *  - Para otra persona: se escriben su correo, nombre y RUT. Auth (contrato v1.3) no expone búsqueda
 *    de usuarios, así que no se consulta si tiene cuenta: la entrada le llega a ese correo.
 */
export default function ParaQuien({ valor, onChange, errores, onLimpiarError, perfil, deshabilitado = false }: ParaQuienProps) {
  const datos: DatosDestinatario = valor.para === 'otra' ? valor : DESTINATARIO_VACIO;
  const actualizar = (campo: CampoDestinatario, texto: string) => {
    onChange({ para: 'otra', ...datos, [campo]: texto });
    onLimpiarError(campo);
  };

  const opcion = (para: 'mi' | 'otra', titulo: string, detalle: string, Icono: typeof User) => {
    const activo = valor.para === para;
    return (
      <label
        className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
          activo ? 'border-ticket-primary bg-ticket-banner' : 'border-ticket-border bg-white hover:border-ticket-secondary'
        } ${deshabilitado ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        <input
          type="radio"
          name="para-quien"
          className="mt-1 accent-[#2F4374]"
          checked={activo}
          disabled={deshabilitado}
          onChange={() => onChange(para === 'mi' ? { para: 'mi' } : { para: 'otra', ...datos })}
        />
        <Icono className="w-5 h-5 text-ticket-primary shrink-0 mt-0.5" />
        <span>
          <span className="block text-sm font-semibold text-ticket-primary">{titulo}</span>
          <span className="block text-xs text-ticket-secondary mt-0.5">{detalle}</span>
        </span>
      </label>
    );
  };

  const campo = (
    nombre: CampoDestinatario,
    etiqueta: React.ReactNode,
    props: React.InputHTMLAttributes<HTMLInputElement>,
    transformar: (t: string) => string = (t) => t,
  ) => (
    <div>
      <label htmlFor={`dest-${nombre}`} className={CLASE_LABEL}>
        {etiqueta}
      </label>
      <input
        id={`dest-${nombre}`}
        autoComplete="off"
        value={datos[nombre]}
        disabled={deshabilitado}
        aria-invalid={!!errores[nombre]}
        aria-describedby={errores[nombre] ? `error-dest-${nombre}` : undefined}
        onChange={(e) => actualizar(nombre, transformar(e.target.value))}
        className={`${CLASE_CAMPO} ${errores[nombre] ? 'border-ticket-peligro' : 'border-ticket-border'}`}
        {...props}
      />
      <ErrorCampo id={`error-dest-${nombre}`} mensaje={errores[nombre]} />
    </div>
  );

  return (
    <section className="bg-white border border-ticket-border rounded-xl shadow-tarjeta">
      <div className="flex items-center gap-3 p-4 border-b border-ticket-border">
        <div className="w-8 h-8 bg-ticket-banner rounded-lg flex items-center justify-center shrink-0">
          <Gift className="text-ticket-primary w-5 h-5" />
        </div>
        <h2 className="font-heading font-semibold text-base text-ticket-primary">¿Para quién es la entrada?</h2>
      </div>

      <div className="p-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="¿Para quién es la entrada?">
          {opcion('mi', 'Para mí', perfil?.correo_electronico ? `La recibes en ${perfil.correo_electronico}` : 'La entrada queda a tu nombre', User)}
          {opcion('otra', 'Para otra persona', 'Se la enviamos a su correo, a su nombre', Gift)}
        </div>

        {valor.para === 'otra' && (
          <div className="flex flex-col gap-4">
            {campo('email', 'Correo de quien recibe la entrada', { type: 'email', placeholder: 'nombre@correo.cl' })}
            {campo('nombre', 'Nombre completo', { type: 'text', placeholder: 'Nombre y apellido' })}
            {campo(
              'rut',
              <>
                RUT <span className="normal-case font-normal tracking-normal">(opcional, para validar la entrada en el acceso)</span>
              </>,
              { type: 'text', placeholder: '12.345.678-5' },
              (t) => t.toUpperCase(),
            )}
          </div>
        )}
      </div>
    </section>
  );
}
