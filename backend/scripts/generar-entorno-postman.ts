/**
 * Genera postman/pagos-local.postman_environment.json con tokens firmados
 * con el JWT_SECRET del .env (válidos 1 año). Ejecutar si cambian el secreto.
 *   npm run postman:env
 */
import fs from 'node:fs';
import path from 'node:path';
import { cargarArchivoEnv } from '../src/config/env';
import { firmarJwt } from '../src/utils/jwt';

cargarArchivoEnv();
const secreto = process.env.JWT_SECRET;
if (!secreto) {
  console.error('Falta JWT_SECRET en .env');
  process.exit(1);
}
const unAnio = 365 * 24 * 3600;
const puerto = process.env.PORT ?? '3000';
const valores = [
  { key: 'baseUrl', value: `http://localhost:${puerto}` },
  { key: 'tokenComprador', value: firmarJwt({ id_usuario: 'usr-postman-1', rol: 'COMPRADOR' }, secreto, unAnio) },
  { key: 'tokenOtroUsuario', value: firmarJwt({ id_usuario: 'usr-postman-2', rol: 'COMPRADOR' }, secreto, unAnio) },
  { key: 'tokenServicio', value: firmarJwt({ id_usuario: 'svc-entradas', rol: 'SERVICIO' }, secreto, unAnio) },
];
const entorno = {
  id: 'b7f3c2a1-9d4e-4f6a-8b2c-pagos-local',
  name: 'Pagos TITEC - local',
  values: valores.map((v) => ({ ...v, type: v.key.startsWith('token') ? 'secret' : 'default', enabled: true })),
  _postman_variable_scope: 'environment',
};
const destino = path.resolve(__dirname, '..', 'postman', 'pagos-local.postman_environment.json');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, JSON.stringify(entorno, null, 2) + '\n');
console.log(`Entorno Postman generado en ${path.relative(process.cwd(), destino)}`);
