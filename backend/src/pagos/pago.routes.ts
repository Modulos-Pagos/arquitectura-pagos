import { Router, type RequestHandler } from 'express';
import type { PagoController } from './pago.controller';

/**
 * Rutas del recurso /api/v1/pagos (documentadas en docs/openapi.yaml).
 * El webhook de Stripe se monta aparte en app.ts porque necesita el body crudo.
 *
 * | Método | Ruta                      | Consumidor              | Historias      |
 * |--------|---------------------------|-------------------------|----------------|
 * | POST   | /transacciones            | Entradas                | HU 1.1, HU 1.3 |
 * | GET    | /:id_pago                 | Entradas (polling), UI  | HU 1.4, HU 1.6 |
 * | POST   | /:id_pago/reembolso       | Entradas                | HU 3.1, HU 3.3 |
 * | GET    | /:id_pago/checkout        | Front de Pagos          | HU 1.1         |
 * | GET    | /                         | Promociones, UI         | HU 3.4         |
 * | DELETE | /:id_pago                 | Administración (staff)  | Operación BD   |
 * | GET    | /comprador/perfil         | Front (sesión de Auth)  | HU 1.1, HU 1.5 |
 * | PUT    | /:id_pago/destinatario    | Front de Pagos          | HU 1.1         |
 * | DELETE | /:id_pago/destinatario    | Front de Pagos          | HU 1.1         |
 *
 * Todas exigen la cookie jwt validada con Auth (middleware autenticar, contrato Auth v1.3).
 * El mismo router se monta en /api/v1/pagos y en el prefijo del API Gateway (/api/pagos).
 */
export function crearRouterPagos(controlador: PagoController, autenticar: RequestHandler): Router {
  const router = Router();
  router.use(autenticar);
  router.get('/', controlador.listar);
  router.post('/transacciones', controlador.crear);
  router.get('/comprador/perfil', controlador.perfilComprador);
  router.get('/:id_pago', controlador.obtener);
  router.get('/:id_pago/checkout', controlador.checkout);
  router.post('/:id_pago/reembolso', controlador.reembolsar);
  router.put('/:id_pago/destinatario', controlador.definirDestinatario);
  router.delete('/:id_pago/destinatario', controlador.quitarDestinatario);
  router.delete('/:id_pago', controlador.eliminar);
  return router;
}
