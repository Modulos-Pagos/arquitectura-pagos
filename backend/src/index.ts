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

  console.log(`[pagos] Sesión: Auth ${deps.auth.url}/internal/validar-sesion en cada petición (cookie jwt + x-api-key).`);
  if (deps.eventos.modo === 'mock') {
    console.warn('[pagos] BROKER_MODO=mock: los eventos pago.* no se publican en RabbitMQ (solo se muestran en el log).');
  } else {
    console.log(`[pagos] Eventos: RabbitMQ ${config.brokerExchange} (routing keys pago${config.brokerSeparador}realizado, pago${config.brokerSeparador}rechazado, ... y pago.completado)`);
  }

  const app = crearApp(deps);
  const servidor = app.listen(config.port, () => {
    console.log(`[pagos] Microservicio de Pagos escuchando en http://localhost:${config.port}`);
    console.log(`[pagos] Swagger:              http://localhost:${config.port}/api-docs`);
    console.log(`[pagos] Rutas del Gateway:    ${config.prefijoGateway}/... (además de /api/v1/pagos/...)`);
    console.log(`[pagos] Servicios consumidos: http://localhost:${config.port}/api-docs/consumidos`);
  });

  const cerrar = () => {
    console.log('[pagos] Cerrando...');
    servidor.close(() => {
      Promise.allSettled([deps.eventos.cerrar(), deps.pool.end()]).finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
}

main().catch((error) => {
  console.error('[pagos] Error al iniciar:', error);
  process.exit(1);
});
