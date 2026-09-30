import { crearApp } from './app';
import { cargarConfig } from './config/env';
import { crearDependencias } from './contenedor';

async function main() {
  const config = cargarConfig();
  const deps = crearDependencias(config);

  try {
    await deps.repo.ping();
  } catch (error) {
    console.error('[pagos] No se pudo conectar a PostgreSQL. Revise DATABASE_URL:', (error as Error).message);
    process.exit(1);
  }

  if (deps.pasarela.nombre === 'mock') {
    console.warn('[pagos] PASARELA=mock: pagos SIMULADOS (no se llama a Stripe). Usar PASARELA=stripe para la demo real.');
  }
  if (deps.entradas.modo === 'mock') {
    console.warn('[pagos] ENTRADAS_MODO=mock: la orden no se valida contra el servicio de Entradas.');
  }

  const app = crearApp(deps);
  const servidor = app.listen(config.port, () => {
    console.log(`[pagos] Microservicio de Pagos escuchando en http://localhost:${config.port}`);
    console.log(`[pagos] Swagger:              http://localhost:${config.port}/api-docs`);
    console.log(`[pagos] Servicios consumidos: http://localhost:${config.port}/api-docs/consumidos`);
  });

  const cerrar = () => {
    console.log('[pagos] Cerrando...');
    servidor.close(() => {
      deps.pool.end().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
}

main().catch((error) => {
  console.error('[pagos] Error al iniciar:', error);
  process.exit(1);
});
