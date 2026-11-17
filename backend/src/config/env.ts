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
  /** URL del API Gateway de la plataforma (API_GATEWAY_URL). Pagos invoca a Entradas a través de él. */
  apiGatewayUrl: string;
  /** Base de las llamadas a Entradas: ENTRADAS_BASE_URL o, si no se define, API_GATEWAY_URL. */
  entradasBaseUrl: string;
  /** 'api-gateway' si las llamadas a Entradas pasan por el Gateway (lo exigido); 'directo' si no. */
  entradasVia: 'api-gateway' | 'directo';
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
  /** Cola durable propia enlazada a pago.* para ver los mensajes en la consola de RabbitMQ ('' = no se declara). */
  brokerColaVerificacion: string;
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

function sinBarraFinal(valor: string): string {
  return valor.replace(/\/+$/, '');
}

/** Avisa al arrancar si una dirección de integración apunta a localhost (no sirve entre contenedores ni en workstation). */
function avisarLocalhost(config: Config): void {
  const direcciones: Array<[string, string]> = [
    ['AUTH_BASE_URL', config.authBaseUrl],
    ['API_GATEWAY_URL / ENTRADAS_BASE_URL', config.entradasModo === 'http' ? config.entradasBaseUrl : ''],
    ['BROKER_URL', config.brokerModo === 'rabbitmq' ? config.brokerUrl : ''],
  ];
  for (const [nombre, valor] of direcciones) {
    if (/\/\/(?:[^@/]*@)?(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(valor)) {
      console.warn(`[pagos] Aviso: ${nombre} apunta a localhost. En Docker y en workstation use el nombre del servicio en la red de la plataforma.`);
    }
  }
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
    // Sin valores por defecto con localhost: las direcciones vienen siempre de la configuración.
    apiGatewayUrl: sinBarraFinal(texto('API_GATEWAY_URL', '')),
    entradasBaseUrl: sinBarraFinal(texto('ENTRADAS_BASE_URL', texto('API_GATEWAY_URL', ''))),
    entradasVia: 'api-gateway',
    entradasRutaReserva: texto('ENTRADAS_RUTA_RESERVA', '/api/entradas/reservas/{id_reserva}'),
    // Pasa por el Gateway (un salto más): 1500 ms por defecto, configurable.
    entradasTimeoutMs: entero('ENTRADAS_TIMEOUT_MS', 1500),
    // Orígenes del front (separados por coma). La sesión va en una cookie: se responde con el origen
    // explícito y Access-Control-Allow-Credentials: true (nunca *). "none" = sin CORS (lo resuelve el Gateway).
    corsOrigin: origenesCors(texto('CORS_ORIGIN', 'http://localhost:5173')),
    prefijoGateway: texto('PREFIJO_GATEWAY', '/api/pagos').replace(/\/+$/, ''),
    // URL INTERNA de Auth (no pasa por el Gateway): GET {AUTH_BASE_URL}/internal/validar-sesion
    authBaseUrl: sinBarraFinal(texto('AUTH_BASE_URL', '')),
    authApiKey: texto('AUTH_INTERNAL_API_KEY', ''),
    authTimeoutMs: entero('AUTH_TIMEOUT_MS', 1000),
    brokerModo: opcion('BROKER_MODO', ['mock', 'rabbitmq'] as const, 'mock'),
    // Dirección y credenciales del broker solo por configuración (nada fijo en el código).
    brokerUrl: texto('BROKER_URL', ''),
    // EVENT_EXCHANGE es el nombre que usa el repo del Platform Team; BROKER_EXCHANGE se mantiene por compatibilidad.
    brokerExchange: texto('BROKER_EXCHANGE', texto('EVENT_EXCHANGE', 'ticketu.events')),
    brokerTipoExchange: opcion('BROKER_TIPO_EXCHANGE', ['topic', 'direct', 'fanout'] as const, 'topic'),
    brokerColaVerificacion: process.env.BROKER_COLA_VERIFICACION ?? 'pagos.eventos',
    brokerSeparador: opcion('BROKER_SEPARADOR', ['_', '.'] as const, '.'),
    brokerTimeoutMs: entero('BROKER_TIMEOUT_MS', 2000),
    // Definida pero vacía (BROKER_CLAVE_PROMOCIONES=) desactiva el evento.
    brokerClavePromociones: (process.env.BROKER_CLAVE_PROMOCIONES ?? 'pago.completado').trim(),
  };

  config.entradasVia =
    config.apiGatewayUrl !== '' && config.entradasBaseUrl === config.apiGatewayUrl ? 'api-gateway' : 'directo';

  if (!config.authBaseUrl) {
    throw new Error('Falta AUTH_BASE_URL: la dirección interna de Auth (GET {AUTH_BASE_URL}/internal/validar-sesion)');
  }
  if (config.entradasModo === 'http' && !config.entradasBaseUrl) {
    throw new Error('ENTRADAS_MODO=http requiere API_GATEWAY_URL: Pagos consulta las reservas de Entradas a través del API Gateway');
  }
  if (config.brokerModo === 'rabbitmq' && !config.brokerUrl) {
    throw new Error('BROKER_MODO=rabbitmq requiere BROKER_URL (amqp://usuario:clave@host:5672/vhost)');
  }
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
  avisarLocalhost(config);
  return config;
}
