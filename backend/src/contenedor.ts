import type { Pool } from 'pg';
import type { Config } from './config/env';
import { crearPool } from './db/pool';
import { EntradasClient } from './integraciones/entradas.client';
import { crearPasarela } from './integraciones/pasarela';
import type { PasarelaPago } from './integraciones/pasarela/pasarela';
import { PagoRepository } from './pagos/pago.repository';
import { PagoService } from './pagos/pago.service';

/** Arma las dependencias del microservicio (permite reemplazarlas en las pruebas). */
export interface Dependencias {
  config: Config;
  pool: Pool;
  repo: PagoRepository;
  pasarela: PasarelaPago;
  entradas: EntradasClient;
  servicio: PagoService;
}

export function crearDependencias(
  config: Config,
  reemplazos: Partial<Pick<Dependencias, 'pool' | 'pasarela' | 'entradas'>> = {},
): Dependencias {
  const pool = reemplazos.pool ?? crearPool(config);
  const repo = new PagoRepository(pool);
  const pasarela = reemplazos.pasarela ?? crearPasarela(config);
  const entradas =
    reemplazos.entradas ??
    new EntradasClient({
      modo: config.entradasModo,
      baseUrl: config.entradasBaseUrl,
      timeoutMs: config.entradasTimeoutMs,
    });
  const servicio = new PagoService(repo, pasarela, entradas, {
    checkoutExpiracionMin: config.checkoutExpiracionMin,
    frontendUrl: config.frontendUrl,
  });
  return { config, pool, repo, pasarela, entradas, servicio };
}
