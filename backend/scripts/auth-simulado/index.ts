/**
 * SOLO DESARROLLO: levanta el Auth simulado (contrato Auth ↔ Pagos v1.3) mientras el equipo Auth
 * no entregue su servicio o su clave.  npm run auth:simulado
 *
 * En backend/.env de Pagos:   AUTH_BASE_URL=http://localhost:3001   AUTH_INTERNAL_API_KEY=<la misma clave>
 * Iniciar sesión de prueba:   http://localhost:3001/login?usuario=usr-demo-1&rol=usuario&volver=http://localhost:5173/
 * Token para Postman/curl:    http://localhost:3001/token?usuario=usr-staff&rol=staff
 */
import { cargarArchivoEnv } from '../../src/config/env';
import { crearAuthSimulado, SECRETO_SIMULADO_POR_DEFECTO } from './servidor';

cargarArchivoEnv();
const puerto = Number(process.env.AUTH_SIMULADO_PUERTO ?? 3001);
const apiKey = process.env.AUTH_INTERNAL_API_KEY ?? '';
if (!apiKey) {
  console.error('Falta AUTH_INTERNAL_API_KEY en .env (la misma clave que Pagos envía en x-api-key).');
  process.exit(1);
}
const secreto = process.env.AUTH_SIMULADO_SECRETO || SECRETO_SIMULADO_POR_DEFECTO;

crearAuthSimulado({ apiKey, secreto }).listen(puerto, () => {
  console.log(`[auth-simulado] SOLO DESARROLLO — imita a Auth (contrato v1.3) en http://localhost:${puerto}`);
  console.log(`[auth-simulado] Iniciar sesión: http://localhost:${puerto}/login?usuario=usr-demo-1&rol=usuario&volver=http://localhost:5173/`);
  console.log(`[auth-simulado] Token (Postman): http://localhost:${puerto}/token?usuario=usr-staff&rol=staff`);
});
