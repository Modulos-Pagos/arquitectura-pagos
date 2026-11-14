import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { cargarConfig } from '../src/config/env';

/**
 * Configuración de las integraciones (Evaluación 3: AU1 d, GW1 c, BR1 d): las direcciones de Auth, del API
 * Gateway y del broker se obtienen solo por configuración, sin valores por defecto con localhost en el código.
 */

const VARIABLES = [
  'AUTH_BASE_URL',
  'AUTH_INTERNAL_API_KEY',
  'API_GATEWAY_URL',
  'ENTRADAS_BASE_URL',
  'ENTRADAS_MODO',
  'BROKER_MODO',
  'BROKER_URL',
  'PASARELA',
  'PREFIJO_GATEWAY',
] as const;

let respaldo: Record<string, string | undefined>;

beforeEach(() => {
  respaldo = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]));
  for (const v of VARIABLES) delete process.env[v];
  process.env.AUTH_INTERNAL_API_KEY = 'clave';
  process.env.PASARELA = 'mock';
});

afterEach(() => {
  for (const v of VARIABLES) {
    if (respaldo[v] === undefined) delete process.env[v];
    else process.env[v] = respaldo[v];
  }
});

describe('Configuración de las integraciones (sin direcciones fijas en el código)', () => {
  it('sin AUTH_BASE_URL no arranca (no hay un Auth por defecto en localhost)', () => {
    assert.throws(() => cargarConfig(), /Falta AUTH_BASE_URL/);
  });

  it('con ENTRADAS_MODO=http exige API_GATEWAY_URL', () => {
    process.env.AUTH_BASE_URL = 'http://auth-service:10000';
    process.env.ENTRADAS_MODO = 'http';
    assert.throws(() => cargarConfig(), /requiere API_GATEWAY_URL/);
  });

  it('con BROKER_MODO=rabbitmq exige BROKER_URL (sin credenciales por defecto)', () => {
    process.env.AUTH_BASE_URL = 'http://auth-service:10000';
    process.env.BROKER_MODO = 'rabbitmq';
    assert.throws(() => cargarConfig(), /requiere BROKER_URL/);
  });

  it('las llamadas a Entradas usan API_GATEWAY_URL y el health las informa como "api-gateway"', () => {
    process.env.AUTH_BASE_URL = 'http://auth-service:10000';
    process.env.ENTRADAS_MODO = 'http';
    process.env.API_GATEWAY_URL = 'http://ticketu-api-gateway:8080/';
    const config = cargarConfig();
    assert.equal(config.entradasBaseUrl, 'http://ticketu-api-gateway:8080');
    assert.equal(config.entradasVia, 'api-gateway');
  });

  it('si ENTRADAS_BASE_URL apunta directo a Entradas, se informa como "directo"', () => {
    process.env.AUTH_BASE_URL = 'http://auth-service:10000';
    process.env.ENTRADAS_MODO = 'http';
    process.env.API_GATEWAY_URL = 'http://ticketu-api-gateway:8080';
    process.env.ENTRADAS_BASE_URL = 'http://entradas-service:3000';
    assert.equal(cargarConfig().entradasVia, 'directo');
  });

  it('avisa al arrancar si una dirección de integración apunta a localhost', () => {
    process.env.AUTH_BASE_URL = 'http://localhost:10000';
    const avisos: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => void avisos.push(args.join(' '));
    try {
      cargarConfig();
    } finally {
      console.warn = original;
    }
    assert.ok(avisos.some((a) => /AUTH_BASE_URL apunta a localhost/.test(a)));
  });
});
