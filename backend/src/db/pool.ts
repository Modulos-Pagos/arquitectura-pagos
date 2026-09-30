import { Pool } from 'pg';
import type { Config } from '../config/env';

/**
 * Pool de conexiones a PostgreSQL (local, Docker o Supabase).
 * Supabase exige SSL: usar DATABASE_SSL=true.
 */
export function crearPool(config: Pick<Config, 'databaseUrl' | 'databaseSsl'>): Pool {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    connectionTimeoutMillis: 5000,
  });
  pool.on('error', (error: Error) => console.error('[pagos] Error en conexión inactiva de PostgreSQL:', error.message));
  return pool;
}
