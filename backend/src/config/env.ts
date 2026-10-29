import fs from 'node:fs';
import path from 'node:path';

export type ModoPasarela = 'mock' | 'stripe';
export type ModoEntradas = 'mock' | 'http';
export type ModoBroker = 'mock' | 'rabbitmq';

export interface Config {
  port: number;
  entorno: string;
  databaseUrl: string;
  databaseSsl: boolean;
  rolesPrivilegiados: string[];
  pasarela: ModoPasarela;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripeTimeoutMs: number;
  checkoutExpiracionMin: number;
  frontendUrl: string;
  checkoutEmailDefecto: string;
  entradasModo: ModoEntradas;
  entradasBaseUrl: string;
  entradasRutaReserva: string;
  entradasTimeoutMs: number;
  corsOrigin: string;
  /** Prefijo público con el que el API Gateway de la plataforma enruta a Pagos (se conserva el path). */
  prefijoGateway: string;
  authBaseUrl: string;
  /** INTERNAL_API_KEY de Auth (header x-api-key). */
  authApiKey: string;
  authTimeoutMs: number;
  brokerModo: ModoBroker;
  brokerUrl: string;
  brokerExchange: string;
  brokerTipoExchange: string;
  brokerSeparador: '_' | '.';
  /** Routing key del evento para Promociones (contrato v1.0). Vacío = no se publica. */
  brokerClavePromociones: string;
  brokerTimeoutMs: number;
}

let envCargado = false;

/** Carga el archivo .env (si existe) usando el soporte nativo de Node >= 20.12. */
export function cargarArchivoEnv(): void {
  if (envCargado) return;
  envCargado = true;
  const ruta = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(ruta)) process.loadEnvFile(ruta);
}

function texto(nombre: string, porDefecto: string): string {
  const valor = process.env[nombre];
  return valor === undefined || valor.trim() === '' ? porDefecto : valor.trim();
}

/** Con cookies no se puede responder `*`: un `*` heredado de un .env antiguo se cambia por el front local. */
function origenesCors(valor: string): string {
  if (valor.split(',').some((o) => o.trim() === '*')) {
    console.warn('[pagos] CORS_ORIGIN=* no sirve con la cookie de sesión; se usa http://localhost:5173 (ajuste CORS_ORIGIN en .env).');
    return 'http://localhost:5173';
  }
  return valor;
}

function entero(nombre: string, porDefecto: number): number {
  const valor = Number(texto(nombre, String(porDefecto)));
  if (!Number.isInteger(valor) || valor <= 0) {
    throw new Error(`La variable ${nombre} debe ser un entero positivo`);
  }
  return valor;
}

function opcion<T extends string>(nombre: string, permitidos: readonly T[], porDefecto: T): T {
  const valor = texto(nombre, porDefecto) as T;
  if (!permitidos.includes(valor)) {
    throw new Error(`La variable ${nombre} debe ser una de: ${permitidos.join(', ')}`);
  }
  return valor;
}

export function cargarConfig(): Config {
  cargarArchivoEnv();

  const config: Config = {
    port: entero('PORT', 3004),
    entorno: texto('NODE_ENV', 'development'),
    databaseUrl: texto('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/pagos_db'),
    databaseSsl: texto('DATABASE_SSL', 'false') === 'true',
    // Roles de Auth (contrato v1.3): usuario, organizador, staff. Solo staff opera sobre pagos ajenos.
    rolesPrivilegiados: texto('ROLES_PRIVILEGIADOS', 'staff')
      .split(',')
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean),
    pasarela: opcion('PASARELA', ['mock', 'stripe'] as const, 'mock'),
    stripeSecretKey: texto('STRIPE_SECRET_KEY', ''),
    stripeWebhookSecret: texto('STRIPE_WEBHOOK_SECRET', ''),
    stripeTimeoutMs: entero('STRIPE_TIMEOUT_MS', 1200),
    checkoutExpiracionMin: entero('CHECKOUT_EXPIRACION_MIN', 30),
    frontendUrl: texto('FRONTEND_URL', 'http://localhost:5173').replace(/\/+$/, ''),
    checkoutEmailDefecto: texto('CHECKOUT_EMAIL_DEFECTO', ''),
    entradasModo: opcion('ENTRADAS_MODO', ['mock', 'http'] as const, 'mock'),
    entradasBaseUrl: texto('ENTRADAS_BASE_URL', 'http://localhost:3003').replace(/\/+$/, ''),
    entradasRutaReserva: texto('ENTRADAS_RUTA_RESERVA', '/api/entradas/reservas/{id_reserva}'),
    entradasTimeoutMs: entero('ENTRADAS_TIMEOUT_MS', 500),
    // Orígenes del front (separados por coma). La sesión va en una cookie: se responde con el origen
    // explícito y Access-Control-Allow-Credentials: true (nunca *). "none" = sin CORS (lo resuelve el Gateway).
    corsOrigin: origenesCors(texto('CORS_ORIGIN', 'http://localhost:5173')),
    prefijoGateway: texto('PREFIJO_GATEWAY', '/api/pagos').replace(/\/+$/, ''),
    // URL INTERNA de Auth (no pasa por el Gateway): GET {AUTH_BASE_URL}/internal/validar-sesion
    authBaseUrl: texto('AUTH_BASE_URL', 'http://localhost:3001').replace(/\/+$/, ''),
    authApiKey: texto('AUTH_INTERNAL_API_KEY', ''),
    authTimeoutMs: entero('AUTH_TIMEOUT_MS', 1000),
    brokerModo: opcion('BROKER_MODO', ['mock', 'rabbitmq'] as const, 'mock'),
    brokerUrl: texto('BROKER_URL', 'amqp://ticketu:ticketu_dev@ticketu-rabbitmq:5672/ticketu'),
    // EVENT_EXCHANGE es el nombre que usa el repo del Platform Team; BROKER_EXCHANGE se mantiene por compatibilidad.
    brokerExchange: texto('BROKER_EXCHANGE', texto('EVENT_EXCHANGE', 'ticketu.events')),
    brokerTipoExchange: opcion('BROKER_TIPO_EXCHANGE', ['topic', 'direct', 'fanout'] as const, 'topic'),
    brokerSeparador: opcion('BROKER_SEPARADOR', ['_', '.'] as const, '.'),
    brokerTimeoutMs: entero('BROKER_TIMEOUT_MS', 2000),
    // Definida pero vacía (BROKER_CLAVE_PROMOCIONES=) desactiva el evento.
    brokerClavePromociones: (process.env.BROKER_CLAVE_PROMOCIONES ?? 'pago.completado').trim(),
  };

  if (!config.authApiKey) {
    throw new Error('Falta AUTH_INTERNAL_API_KEY: la clave x-api-key que entrega Auth (contrato Auth ↔ Pagos v1.3)');
  }
  if (config.checkoutExpiracionMin < 30 || config.checkoutExpiracionMin > 1440) {
    throw new Error('CHECKOUT_EXPIRACION_MIN debe estar entre 30 y 1440 (límite de Stripe)');
  }
  if (!/^\/[a-z0-9/_-]+$/i.test(config.prefijoGateway) || config.prefijoGateway === '/api/v1/pagos') {
    throw new Error('PREFIJO_GATEWAY debe ser una ruta como /api/pagos (distinta de /api/v1/pagos)');
  }
  if (config.pasarela === 'stripe') {
    if (!config.stripeSecretKey.startsWith('sk_')) {
      throw new Error('PASARELA=stripe requiere STRIPE_SECRET_KEY (sk_test_...)');
    }
    if (!config.stripeWebhookSecret.startsWith('whsec_')) {
      throw new Error('PASARELA=stripe requiere STRIPE_WEBHOOK_SECRET (whsec_...)');
    }
  }
  return config;
}
