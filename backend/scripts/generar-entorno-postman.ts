/**
 * Genera postman/pagos-local.postman_environment.json con sesiones de prueba del Auth simulado
 * (npm run auth:simulado; válidas 1 año). Con el servicio real de Auth hay que reemplazarlas por cookies jwt de Auth.
 *   npm run postman:env
 */
import fs from 'node:fs';
import path from 'node:path';
import { cargarArchivoEnv } from '../src/config/env';
import { SECRETO_SIMULADO_POR_DEFECTO, tokenSimulado } from './auth-simulado/servidor';

cargarArchivoEnv();
const secreto = process.env.AUTH_SIMULADO_SECRETO || SECRETO_SIMULADO_POR_DEFECTO;
const firmarJwt = (d: { id_usuario: string; rol: string }, _s: string, segundos: number) => tokenSimulado(secreto, d, segundos);
const unAnio = 365 * 24 * 3600;
const puerto = process.env.PORT ?? '3004';
const valores = [
  { key: 'baseUrl', value: `http://localhost:${puerto}` },
  // Roles de Auth (contrato v1.3): usuario, organizador, staff. Se envían como Cookie: jwt=<token>.
  { key: 'tokenComprador', value: firmarJwt({ id_usuario: 'usr-postman-1', rol: 'usuario' }, secreto, unAnio) },
  { key: 'tokenOtroUsuario', value: firmarJwt({ id_usuario: 'usr-postman-2', rol: 'usuario' }, secreto, unAnio) },
  { key: 'tokenOrganizador', value: firmarJwt({ id_usuario: 'usr-organizador', rol: 'organizador' }, secreto, unAnio) },
  { key: 'tokenStaff', value: firmarJwt({ id_usuario: 'usr-staff', rol: 'staff' }, secreto, unAnio) },
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
