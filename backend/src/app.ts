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
  const { config, servicio, repo, pasarela, entradas, auth, eventos } = deps;
  const controlador = new PagoController(servicio);
  const rutasPagos = ['/api/v1/pagos', config.prefijoGateway];
  const app = express();

  app.disable('x-powered-by');
  app.use(cors(config.corsOrigin));

  // Webhook de Stripe: necesita el body CRUDO para verificar la firma,
  // por eso se registra antes de express.json().
  // Se acepta en /api/v1/pagos y en el prefijo del API Gateway (/api/pagos): el Gateway no reescribe el path.
  for (const base of rutasPagos) {
    app.post(`${base}/webhooks/stripe`, express.raw({ type: '*/*', limit: '1mb' }), controlador.webhookStripe);
  }

  app.use(express.json({ limit: '100kb' }));

  const health: express.RequestHandler = async (_req, res) => {
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
      auth: 'validar-sesion',
      broker: eventos.modo,
    });
  };
  app.get('/health', health);
  app.get(`${config.prefijoGateway}/health`, health);

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

  const router = crearRouterPagos(controlador, autenticar(auth, config.rolesPrivilegiados));
  for (const base of rutasPagos) app.use(base, router);

  app.use(rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}
