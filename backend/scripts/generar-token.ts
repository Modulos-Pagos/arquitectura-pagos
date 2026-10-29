/**
 * SOLO DESARROLLO: token de una sesión de prueba del Auth simulado (npm run auth:simulado).
 * Con el servicio real de Auth estos tokens reciben 401: hay que iniciar sesión en Auth.
 *   npm run token                       -> usuario usr-demo-1
 *   npm run token -- usr-42 organizador -> id y rol a elección (usuario, organizador o staff)
 *   npm run token -- usr-staff staff    -> staff: ve, anula y elimina pagos de cualquier usuario
 */
import { cargarArchivoEnv } from '../src/config/env';
import { SECRETO_SIMULADO_POR_DEFECTO, tokenSimulado } from './auth-simulado/servidor';

cargarArchivoEnv();
const secreto = process.env.AUTH_SIMULADO_SECRETO || SECRETO_SIMULADO_POR_DEFECTO;
const [idUsuario = 'usr-demo-1', rol = 'usuario'] = process.argv.slice(2);
const token = tokenSimulado(secreto, { id_usuario: idUsuario, rol }, 7 * 24 * 3600);
console.log(`Sesión de prueba del Auth simulado para ${idUsuario} (${rol}), válida 7 días.\n`);
console.log(`Cookie: jwt=${token}`);
