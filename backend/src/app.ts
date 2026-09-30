import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import type { Dependencias } from './contenedor';
import { autenticar } from './middlewares/autenticacion';
import { cors } from './middlewares/cors';
import { manejarErrores, rutaNoEncontrada } from './middlewares/manejo-errores';
import { PagoController } from './pagos/pago.controller';
import { crearRouterPagos } from './pagos/pago.routes';

const DOCS = path.resolve(__dirname, '..', 'docs');

function leerOpenApi(archivo: string): Record<string, unknown> {
  return YAML.parse(fs.readFileSync(path.join(DOCS, archivo), 'utf8')) as Record<string, unknown>;
}

export function crearApp(deps: Dependencias): Express {
  const { config, servicio, repo, pasarela, entradas } = deps;
  const controlador = new PagoController(servicio);
  const app = express();

  app.disable('x-powered-by');
  app.use(cors(config.corsOrigin));

  // Webhook de Stripe: necesita el body CRUDO para verificar la firma,
  // por eso se registra antes de express.json().
  app.post('/api/v1/pagos/webhooks/stripe', express.raw({ type: '*/*', limit: '1mb' }), controlador.webhookStripe);

  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_req, res) => {
    let baseDatos = 'ok';
    try {
      await repo.ping();
    } catch {
      baseDatos = 'error';
    }
    res.status(baseDatos === 'ok' ? 200 : 503).json({
      estado: baseDatos === 'ok' ? 'ok' : 'degradado',
      servicio: 'microservicio-pagos',
      base_datos: baseDatos,
      pasarela: pasarela.nombre,
      entradas: entradas.modo,
    });
  });

  // Documentación Swagger (BE1/BE3) y servicios consumidos (BE2)
  const openapiPropio = leerOpenApi('openapi.yaml');
  const openapiConsumidos = leerOpenApi('openapi-servicios-consumidos.yaml');
  app.get('/api-docs/openapi.json', (_req, res) => res.json(openapiPropio));
  app.get('/api-docs/consumidos.json', (_req, res) => res.json(openapiConsumidos));
  app.use(
    '/api-docs/consumidos',
    swaggerUi.serveFiles(openapiConsumidos),
    swaggerUi.setup(openapiConsumidos, { customSiteTitle: 'Pagos - servicios consumidos' }),
  );
  app.use('/api-docs', swaggerUi.serveFiles(openapiPropio), swaggerUi.setup(openapiPropio, { customSiteTitle: 'Pagos - API' }));

  app.use('/api/v1/pagos', crearRouterPagos(controlador, autenticar(config.jwtSecret, config.rolesPrivilegiados)));

  app.use(rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}
