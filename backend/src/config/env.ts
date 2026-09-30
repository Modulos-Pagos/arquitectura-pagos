import fs from 'node:fs';
import path from 'node:path';

export type ModoPasarela = 'mock' | 'stripe';
export type ModoEntradas = 'mock' | 'http';

export interface Config {
  port: number;
  entorno: string;
  databaseUrl: string;
  databaseSsl: boolean;
  jwtSecret: string;
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
  entradasTimeoutMs: number;
  corsOrigin: string;
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
    port: entero('PORT', 3000),
    entorno: texto('NODE_ENV', 'development'),
    databaseUrl: texto('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/pagos_db'),
    databaseSsl: texto('DATABASE_SSL', 'false') === 'true',
    jwtSecret: texto('JWT_SECRET', ''),
    rolesPrivilegiados: texto('ROLES_PRIVILEGIADOS', 'ADMIN,SERVICIO')
      .split(',')
      .map((r) => r.trim().toUpperCase())
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
    entradasTimeoutMs: entero('ENTRADAS_TIMEOUT_MS', 500),
    corsOrigin: texto('CORS_ORIGIN', '*'),
  };

  if (!config.jwtSecret) {
    throw new Error('Falta JWT_SECRET (debe ser el mismo secreto con el que Auth firma los tokens)');
  }
  if (config.checkoutExpiracionMin < 30 || config.checkoutExpiracionMin > 1440) {
    throw new Error('CHECKOUT_EXPIRACION_MIN debe estar entre 30 y 1440 (límite de Stripe)');
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
