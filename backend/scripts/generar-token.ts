/**
 * Genera un JWT de prueba firmado con JWT_SECRET (mismo formato que Auth).
 *   npm run token                      -> comprador usr-demo-1
 *   npm run token -- usr-42 COMPRADOR  -> id y rol a elección
 *   npm run token -- entradas-svc SERVICIO
 *   npm run token -- usr-admin ADMIN       -> para DELETE /api/v1/pagos/{id_pago}
 */
import { cargarArchivoEnv } from '../src/config/env';
import { firmarJwt } from '../src/utils/jwt';

cargarArchivoEnv();
const secreto = process.env.JWT_SECRET;
if (!secreto) {
  console.error('Falta JWT_SECRET en .env');
  process.exit(1);
}
const [idUsuario = 'usr-demo-1', rol = 'COMPRADOR'] = process.argv.slice(2);
const token = firmarJwt({ id_usuario: idUsuario, rol }, secreto, 7 * 24 * 3600);
console.log(`Token para ${idUsuario} (${rol}), válido 7 días:\n`);
console.log(`Bearer ${token}`);
