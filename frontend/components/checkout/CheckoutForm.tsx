'use client';

import { useRef, useState, type FormEvent } from 'react';
import { CardCvcElement, CardExpiryElement, CardNumberElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { StripeCardNumberElementOptions, StripeElementChangeEvent } from '@stripe/stripe-js';
import { AlertCircle, CreditCard, Info, Loader2, LogIn, RotateCw, ShieldCheck, User } from 'lucide-react';
import {
  crearTransaccion,
  definirDestinatario,
  ErrorApi,
  esperarEstadoFinal,
  quitarDestinatario,
  type Destinatario,
  type Pago,
  type PerfilComprador,
  type TransaccionCreada,
  urlLogin,
} from '@/lib/api';
import { calcularTotales, formatoCLP, iniciales, type Pedido } from '@/lib/pedido';
import {
  aCuerpoDestinatario,
  formatoRut,
  validarDestinatario,
  type CampoDestinatario,
  type SeleccionDestinatario,
} from '@/lib/destinatario';
import { STRIPE_PUBLISHABLE_KEY } from '@/lib/stripe';
import ParaQuien from '@/components/checkout/ParaQuien';

/** Estilo del texto dentro de los campos seguros de Stripe (iframes). Párrafo 14px, colores del estándar. */
const ESTILO_CAMPO: StripeCardNumberElementOptions['style'] = {
  base: {
    fontSize: '14px',
    color: '#2F4374',
    fontFamily: 'Inter, system-ui, sans-serif',
    '::placeholder': { color: '#6B7A9A' },
  },
  invalid: { color: '#B3261E' },
};

/** Inputs del estándar (fila 17): alto 40px, radio 8px, borde #D8DFF0. */
const CLASE_CAMPO = 'w-full h-10 border rounded-lg px-3 py-[10px] transition-all bg-white';
const CLASE_LABEL = 'block text-xs font-semibold text-ticket-secondary uppercase tracking-wider mb-2';

type Campo = 'numero' | 'titular' | 'vencimiento' | 'cvc';
const MENSAJE_VACIO: Record<Campo, string> = {
  numero: 'Ingresa el número de tarjeta.',
  titular: 'Ingresa el nombre del titular de la tarjeta.',
  vencimiento: 'Ingresa la fecha de vencimiento.',
  cvc: 'Ingresa el código de seguridad (CVC).',
};

/** Mensaje de error de validación (fila 32): #B3261E, 12px, debajo del campo, con ícono de alerta. */
function ErrorCampo({ id, mensaje }: { id: string; mensaje?: string }) {
  if (!mensaje) return null;
  return (
    <p id={id} className="mt-1 flex items-center gap-1 text-xs text-ticket-peligro">
      <AlertCircle className="w-4 h-4 shrink-0" /> {mensaje}
    </p>
  );
}

/** Pago ya creado (llegando desde url_checkout con ?id_pago=): no se crea otro. */
export interface PagoExistente {
  id_pago: string;
  id_reserva: string;
  monto: number;
  client_secret: string;
}

/** Sesión del comprador validada con Auth (a través de Pagos, contrato Auth v1.3). */
export type EstadoPerfil =
  | { estado: 'cargando' }
  | { estado: 'listo'; perfil: PerfilComprador }
  /** status 401 = sin sesión o vencida (ir a /login); 503 = Auth no disponible (no se puede cobrar). */
  | { estado: 'error'; mensaje: string; status: number };

interface CheckoutFormProps {
  pedido: Pedido;
  existente?: PagoExistente | null;
  perfil: EstadoPerfil;
  onReintentarPerfil: () => void;
  /** Destinatario ya guardado en el pago (al volver a un pago existente). */
  destinatarioInicial?: Destinatario | null;
  /** Se llama cuando el pago terminó (APROBADO u otro estado final). */
  onFinalizado: (pago: Pago) => void;
}

export default function CheckoutForm({
  pedido,
  existente = null,
  perfil,
  onReintentarPerfil,
  destinatarioInicial = null,
  onFinalizado,
}: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const totales = calcularTotales(pedido);
  const total = existente ? existente.monto : totales.total;
  const cantidadEntradas = totales.cantidadEntradas;

  // Se prellena con el nombre de la sesión de Auth; el comprador puede corregirlo (contrato Auth v1.3).
  const [titularEditado, setTitular] = useState<string | null>(null);
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [etapa, setEtapa] = useState('');
  const [completos, setCompletos] = useState<Record<'numero' | 'vencimiento' | 'cvc', boolean>>({
    numero: false,
    vencimiento: false,
    cvc: false,
  });

  // Se conserva entre reintentos (tarjeta rechazada): mismo pago, mismo client_secret, sin cobros dobles.
  const transaccion = useRef<TransaccionCreada | null>(
    existente
      ? {
          id_pago: existente.id_pago,
          id_reserva: existente.id_reserva,
          estado_pago: 'PENDIENTE',
          fecha_creacion: '',
          metodo: 'formulario',
          client_secret: existente.client_secret,
        }
      : null,
  );
  // En el sistema completo la reserva la crea el módulo Entradas.
  const idReserva = useRef<string | null>(null);

  // ¿Para quién es la entrada? (Para mí / Para otra persona)
  const [paraQuien, setParaQuien] = useState<SeleccionDestinatario>(
    destinatarioInicial
      ? {
          para: 'otra',
          nombre: destinatarioInicial.nombre,
          email: destinatarioInicial.email,
          rut: formatoRut(destinatarioInicial.rut),
        }
      : { para: 'mi' },
  );
  const [erroresDestinatario, setErroresDestinatario] = useState<Partial<Record<CampoDestinatario, string>>>({});
  // Lo que ya está guardado en el backend, para no repetir PUT/DELETE en cada reintento.
  const destinatarioGuardado = useRef<string | null>(
    destinatarioInicial ? JSON.stringify(aCuerpoDestinatario({ ...destinatarioInicial, rut: destinatarioInicial.rut ?? '' })) : null,
  );
  const datosPerfil = perfil.estado === 'listo' ? perfil.perfil : null;
  const nombreComprador = datosPerfil?.nombre_completo ?? '';
  const titular = titularEditado ?? nombreComprador.toUpperCase();
  // Fail-secure: sin sesión validada por Auth no se puede cobrar.
  const sinSesion = perfil.estado !== 'listo';

  /** Deja el destinatario del pago igual a lo elegido en pantalla (antes de cobrar). */
  async function sincronizarDestinatario(idPago: string) {
    if (paraQuien.para === 'otra') {
      const cuerpo = aCuerpoDestinatario(paraQuien);
      const clave = JSON.stringify(cuerpo);
      if (clave === destinatarioGuardado.current) return;
      setEtapa('Guardando los datos de quien recibe la entrada...');
      await definirDestinatario(idPago, cuerpo);
      destinatarioGuardado.current = clave;
    } else if (destinatarioGuardado.current !== null) {
      setEtapa('Actualizando el destinatario...');
      await quitarDestinatario(idPago);
      destinatarioGuardado.current = null;
    }
  }

  const sinStripe = !STRIPE_PUBLISHABLE_KEY;

  /** Stripe informa en cada cambio si el campo está completo o tiene un error. */
  const alCambiarCampoStripe = (campo: 'numero' | 'vencimiento' | 'cvc') => (e: StripeElementChangeEvent) => {
    setCompletos((prev) => ({ ...prev, [campo]: e.complete }));
    setErrores((prev) => ({ ...prev, [campo]: e.error?.message }));
  };

  const claseBorde = (campo: Campo) => (errores[campo] ? 'border-ticket-peligro' : 'border-ticket-border');

  async function pagar(evento: FormEvent) {
    evento.preventDefault();
    setErrorGeneral(null);
    if (!stripe || !elements) return;

    // Validación de campos (mensajes debajo de cada campo)
    const nuevos: Partial<Record<Campo, string>> = { ...errores };
    (['numero', 'vencimiento', 'cvc'] as const).forEach((c) => {
      if (!completos[c] && !nuevos[c]) nuevos[c] = MENSAJE_VACIO[c];
    });
    nuevos.titular = titular.trim().length < 3 ? MENSAJE_VACIO.titular : undefined;
    setErrores(nuevos);
    const nuevosDestinatario = paraQuien.para === 'otra' ? validarDestinatario(paraQuien) : {};
    if (paraQuien.para === 'otra' && datosPerfil && paraQuien.email.trim().toLowerCase() === datosPerfil.correo_electronico.toLowerCase()) {
      nuevosDestinatario.email = 'Ese es tu propio correo: elige «Para mí».';
    }
    setErroresDestinatario(nuevosDestinatario);
    if (Object.values(nuevos).some(Boolean) || Object.values(nuevosDestinatario).some(Boolean)) return;

    const tarjeta = elements.getElement(CardNumberElement);
    if (!tarjeta) return;

    setEnviando(true);
    try {
      // 1. Crear (o recuperar) el pago en el microservicio → client_secret de Stripe
      if (!transaccion.current) {
        setEtapa('Creando el pago...');
        idReserva.current ??= `res-${Date.now()}`;
        transaccion.current = await crearTransaccion({
          id_reserva: idReserva.current,
          id_evento: pedido.idEvento,
          total,
          cantidad_entradas: cantidadEntradas,
        });
      }
      const trx = transaccion.current;

      if (trx.estado_pago === 'PENDIENTE') {
        if (!trx.client_secret) throw new ErrorApi('El servicio de pagos no entregó el client_secret.', 500);

        // 2a. Guardar para quién es la entrada (Entradas la emite a su nombre con el evento pago.realizado)
        await sincronizarDestinatario(trx.id_pago);

        // 2b. Confirmar la tarjeta directamente con Stripe (los datos nunca pasan por nuestro backend)
        setEtapa('Procesando la tarjeta...');
        const resultado = await stripe.confirmCardPayment(trx.client_secret, {
          payment_method: { card: tarjeta, billing_details: { name: titular.trim() } },
        });
        if (resultado.error && resultado.error.payment_intent?.status !== 'succeeded') {
          setErrorGeneral(resultado.error.message ?? 'La tarjeta fue rechazada. Intenta con otra.');
          return;
        }
      }

      // 3. Confirmar el estado final con el microservicio (consulta a Stripe y actualiza la BD)
      setEtapa('Confirmando el pago...');
      const pago = await esperarEstadoFinal(trx.id_pago);
      onFinalizado(pago);
    } catch (e) {
      if (!existente && e instanceof ErrorApi && e.codigo === 'CONFLICTO_IDEMPOTENCIA') {
        transaccion.current = null;
        idReserva.current = null;
      }
      setErrorGeneral(e instanceof Error ? e.message : 'Ocurrió un error inesperado.');
    } finally {
      setEnviando(false);
      setEtapa('');
    }
  }

  return (
    <form onSubmit={pagar} className="flex flex-col gap-6" noValidate>
      {/* Título de la página: H1 28px */}
      <div>
        <h1 className="font-heading font-bold text-[28px] text-ticket-primary mb-2">Datos de pago</h1>
        <p className="text-sm text-ticket-secondary">Completa tu información para confirmar la compra</p>
      </div>

      {/* Tarjeta: Información de contacto */}
      <section className="bg-white border border-ticket-border rounded-xl shadow-tarjeta">
        <div className="flex items-center gap-3 p-4 border-b border-ticket-border">
          <div className="w-8 h-8 bg-ticket-banner rounded-lg flex items-center justify-center shrink-0">
            <User className="text-ticket-primary w-5 h-5" />
          </div>
          <h2 className="font-heading font-semibold text-base text-ticket-primary">Información de contacto</h2>
        </div>
        <div className="p-6">
          {perfil.estado === 'cargando' && (
            <div className="flex items-center gap-2 text-sm text-ticket-secondary">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando tus datos...
            </div>
          )}
          {perfil.estado === 'listo' && (
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-ticket-primary text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                {iniciales(nombreComprador || perfil.perfil.correo_electronico)}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-ticket-primary text-sm">{nombreComprador || 'Comprador'}</p>
                <p className="text-xs text-ticket-secondary break-all">{perfil.perfil.correo_electronico}</p>
                {perfil.perfil.rut && <p className="text-xs text-ticket-secondary">RUT {perfil.perfil.rut}</p>}
              </div>
            </div>
          )}
          {perfil.estado === 'error' && perfil.status === 401 && (
            <div role="alert" className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm text-ticket-peligro">
              <span className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                {perfil.mensaje}
              </span>
              <a
                href={urlLogin()}
                className="h-8 px-3 shrink-0 bg-ticket-primary text-white rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-ticket-hover"
              >
                <LogIn className="w-3.5 h-3.5" /> Iniciar sesión
              </a>
            </div>
          )}
          {perfil.estado === 'error' && perfil.status !== 401 && (
            <div role="alert" className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm text-ticket-secondary">
              <span className="flex items-start gap-2">
                <Info className="w-5 h-5 shrink-0 text-ticket-info" />
                No pudimos validar tu sesión ({perfil.mensaje}). Por seguridad no se puede pagar hasta que se valide.
              </span>
              <button
                type="button"
                onClick={onReintentarPerfil}
                className="h-8 px-3 shrink-0 border border-ticket-border rounded-lg text-xs font-semibold text-ticket-primary flex items-center gap-1 hover:bg-ticket-banner"
              >
                <RotateCw className="w-3.5 h-3.5" /> Reintentar
              </button>
            </div>
          )}
        </div>
      </section>

      <ParaQuien
        valor={paraQuien}
        onChange={setParaQuien}
        errores={erroresDestinatario}
        onLimpiarError={(campo) => setErroresDestinatario((prev) => ({ ...prev, [campo]: undefined }))}
        perfil={datosPerfil}
        deshabilitado={enviando}
      />

      {sinStripe && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-ticket-border bg-ticket-info-bg p-4 text-sm text-ticket-info">
          <Info className="w-5 h-5 shrink-0" />
          <span>
            <strong>Falta la llave de Stripe.</strong> Agrega <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> (pk_test_...) en
            <code> .env.local</code> y reinicia <code>npm run dev</code>.
          </span>
        </div>
      )}

      {/* Tarjeta: Método de pago */}
      <section className="bg-white border border-ticket-border rounded-xl shadow-tarjeta">
        <div className="flex items-center justify-between p-4 border-b border-ticket-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-ticket-banner rounded-lg flex items-center justify-center shrink-0">
              <CreditCard className="text-ticket-primary w-5 h-5" />
            </div>
            <h2 className="font-heading font-semibold text-base text-ticket-primary">Método de pago</h2>
          </div>
          <span className="bg-[#635BFF] text-white text-xs uppercase font-bold tracking-wider px-2 py-1 rounded">stripe</span>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {/* Número de tarjeta (campo seguro de Stripe) */}
          <div>
            <label className={CLASE_LABEL}>Número de tarjeta</label>
            <div className="relative">
              <CardNumberElement
                className={`${CLASE_CAMPO} ${claseBorde('numero')} pr-10`}
                options={{ style: ESTILO_CAMPO, placeholder: '1234 1234 1234 1234', disableLink: true }}
                onChange={alCambiarCampoStripe('numero')}
              />
              <CreditCard className="absolute right-3 top-2.5 w-5 h-5 text-ticket-secondary pointer-events-none" />
            </div>
            <ErrorCampo id="error-numero" mensaje={errores.numero} />
          </div>

          {/* Nombre del titular */}
          <div>
            <label htmlFor="titular" className={CLASE_LABEL}>
              Nombre del titular
            </label>
            <input
              id="titular"
              type="text"
              autoComplete="cc-name"
              placeholder="NOMBRE APELLIDO"
              value={titular}
              aria-invalid={!!errores.titular}
              aria-describedby={errores.titular ? 'error-titular' : undefined}
              onChange={(e) => {
                setTitular(e.target.value.toUpperCase());
                if (errores.titular) setErrores((prev) => ({ ...prev, titular: undefined }));
              }}
              className={`${CLASE_CAMPO} ${claseBorde('titular')} text-sm text-ticket-primary placeholder:text-ticket-secondary focus:outline-none focus:border-ticket-primary focus:ring-2 focus:ring-ticket-primary`}
            />
            <ErrorCampo id="error-titular" mensaje={errores.titular} />
          </div>

          {/* Vencimiento y CVC (campos seguros de Stripe) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={CLASE_LABEL}>Vencimiento</label>
              <CardExpiryElement
                className={`${CLASE_CAMPO} ${claseBorde('vencimiento')}`}
                options={{ style: ESTILO_CAMPO, placeholder: 'MM / AA' }}
                onChange={alCambiarCampoStripe('vencimiento')}
              />
              <ErrorCampo id="error-vencimiento" mensaje={errores.vencimiento} />
            </div>
            <div>
              <label className={CLASE_LABEL}>CVC</label>
              <div className="relative">
                <CardCvcElement
                  className={`${CLASE_CAMPO} ${claseBorde('cvc')} pr-10`}
                  options={{ style: ESTILO_CAMPO, placeholder: 'CVC' }}
                  onChange={alCambiarCampoStripe('cvc')}
                />
                <CreditCard className="absolute right-3 top-2.5 w-5 h-5 text-ticket-secondary pointer-events-none" />
              </div>
              <ErrorCampo id="error-cvc" mensaje={errores.cvc} />
            </div>
          </div>

          <p className="flex items-center gap-2 text-xs text-ticket-secondary">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            Los datos de tu tarjeta van directo a Stripe y nunca pasan por nuestros servidores.
          </p>
        </div>
      </section>

      {/* Error general (tarjeta rechazada, servicio no disponible): colores de peligro del estándar */}
      {errorGeneral && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-ticket-peligro bg-ticket-peligro-bg p-4 text-sm text-ticket-peligro">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorGeneral}</span>
        </div>
      )}

      {/* Botón principal (fila 16 y 34): alto 40px, radio 8px, hover 10% más oscuro, disabled 40% */}
      <button
        type="submit"
        disabled={!stripe || enviando || sinStripe || sinSesion}
        className="w-full h-10 bg-ticket-primary text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 hover:bg-ticket-hover disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-ticket-primary"
      >
        {enviando ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" /> {etapa || 'Procesando...'}
          </>
        ) : (
          <>
            <ShieldCheck className="w-5 h-5" /> Confirmar y pagar {formatoCLP(total)}
          </>
        )}
      </button>
    </form>
  );
}
