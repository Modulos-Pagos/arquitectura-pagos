/**
 * Crea las tablas ejecutando db/schema.sql sobre DATABASE_URL.
 *   npm run db:init          -> crea lo que falte (idempotente)
 *   npm run db:reset         -> BORRA las tablas del módulo y las vuelve a crear
 */
import fs from 'node:fs';
import path from 'node:path';
import { cargarArchivoEnv } from '../src/config/env';
import { crearPool } from '../src/db/pool';

const TABLAS = ['eventos_webhook_stripe', 'reembolsos', 'historial_estados_pago', 'pagos'];

export async function inicializarBase(databaseUrl: string, databaseSsl: boolean, reset: boolean): Promise<void> {
  const pool = crearPool({ databaseUrl, databaseSsl });
  try {
    if (reset) await pool.query(`DROP TABLE IF EXISTS ${TABLAS.join(', ')} CASCADE`);
    const sql = fs.readFileSync(path.resolve(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    await pool.query(sql);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  cargarArchivoEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Falta DATABASE_URL');
    process.exit(1);
  }
  const reset = process.argv.includes('--reset');
  inicializarBase(url, process.env.DATABASE_SSL === 'true', reset)
    .then(() => console.log(reset ? 'Tablas recreadas desde db/schema.sql' : 'Esquema aplicado desde db/schema.sql'))
    .catch((error) => {
      console.error('Error al aplicar el esquema:', error.message);
      process.exit(1);
    });
}
