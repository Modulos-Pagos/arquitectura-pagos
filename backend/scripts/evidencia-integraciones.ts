/**
 * Evidencia de las integraciones I1 (Entradas) e I2 (Auth) — Evaluación 2 (BE1, BD1, CA1).
 *
 *   npm run evidencia:integraciones
 *
 * Requiere la plataforma levantada con los servicios REALES (Gateway, Auth, Entradas, RabbitMQ y Pagos en Docker).
 * Deja todo con fecha en docs/evidencias/integraciones/<fecha>/:
 *   00-entorno.txt         estado de Pagos (/api/pagos/health): Entradas en modo http, Auth por validar-sesion
 *   01-bd-antes.txt        consultas SQL antes de ejecutar las pruebas
 *   02-postman.txt/.xml    colección "Integraciones reales" (Newman), casos de éxito y de error
 *   03-bd-despues.txt      consultas SQL después: el pago creado, trazable a Entradas (id_reserva) y Auth (id_usuario)
 *   04-logs-pagos.txt      líneas [integración] del contenedor pagos-service (llamadas a Auth, Entradas y RabbitMQ)
 *   RESUMEN.md             resumen con los resultados
 *
 * Variables (en .env o en la terminal):
 *   EVIDENCIA_GATEWAY_URL      por defecto http://localhost:8080
 *   EVIDENCIA_DATABASE_URL     base de Pagos; con Docker: postgres://postgres:postgres@localhost:5433/pagos_db
 *   EVIDENCIA_AUTH_LOGIN_PATH  ruta del login de Auth por el Gateway (por defecto /api/auth/login)
 *   EVIDENCIA_AUTH_LOGIN_BODY  JSON del login con un usuario de prueba de Auth (NO subirlo a GitHub)
 *   EVIDENCIA_ID_EVENTO        id de un evento pagado existente en Entradas
 *   EVIDENCIA_ID_RESERVA / EVIDENCIA_TOTAL   (opcional) usar una reserva ya creada en Entradas
 *   EVIDENCIA_CONTENEDOR       por defecto pagos-service
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { cargarArchivoEnv } from '../src/config/env';

cargarArchivoEnv();

const inicio = new Date();
const sello = inicio.toISOString().replace(/[:T]/g, '-').slice(0, 16);
const carpeta = path.resolve('docs/evidencias/integraciones', sello);
fs.mkdirSync(carpeta, { recursive: true });

const gateway = (process.env.EVIDENCIA_GATEWAY_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
const urlBd = process.env.EVIDENCIA_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/pagos_db';
const contenedor = process.env.EVIDENCIA_CONTENEDOR ?? 'pagos-service';
const fecha = () => new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
const escribir = (archivo: string, texto: string) => fs.writeFileSync(path.join(carpeta, archivo), texto, 'utf8');

function tabla(filas: Record<string, unknown>[]): string {
  if (filas.length === 0) return '(0 filas)\n';
  const columnas = Object.keys(filas[0]!);
  const valor = (v: unknown) => (v instanceof Date ? v.toISOString() : v === null ? 'NULL' : String(v));
  const anchos = columnas.map((c) => Math.max(c.length, ...filas.map((f) => valor(f[c]).length)));
  const linea = (celdas: string[]) => celdas.map((c, i) => c.padEnd(anchos[i]!)).join(' | ');
  return [linea(columnas), anchos.map((a) => '-'.repeat(a)).join('-+-'), ...filas.map((f) => linea(columnas.map((c) => valor(f[c]))))]
    .join('\n')
    .concat(`\n(${filas.length} ${filas.length === 1 ? 'fila' : 'filas'})\n`);
}

async function consultas(titulo: string, lista: Array<{ nombre: string; sql: string; params?: unknown[] }>): Promise<string> {
  let salida = `${titulo}\nFecha: ${fecha()} (hora de Chile)\nBase de datos: ${urlBd.replace(/:[^:@/]+@/, ':****@')}\n`;
  const cliente = new pg.Client({ connectionString: urlBd, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
  try {
    await cliente.connect();
    for (const c of lista) {
      const sqlConParametros = (c.params ?? []).reduce<string>((s, p, i) => s.replace(`$${i + 1}`, `'${String(p)}'`), c.sql);
      salida += `\n-- ${c.nombre}\n${sqlConParametros.trim()};\n\n`;
      salida += tabla((await cliente.query(c.sql, c.params)).rows);
    }
  } catch (error) {
    salida += `\nNo se pudo consultar la base de datos: ${(error as Error).message}\n(revisar EVIDENCIA_DATABASE_URL)\n`;
  } finally {
    await cliente.end().catch(() => undefined);
  }
  return salida;
}

async function main() {
  console.log(`Evidencia de integraciones → ${path.relative(process.cwd(), carpeta)}`);

  // 0. Entorno: Pagos debe estar verificando con Entradas real y validando con Auth (no mocks).
  let entorno = `Evidencia de integraciones — Pagos (TITEC 2026-2, Evaluación 2)\nFecha: ${fecha()} (hora de Chile)\nGateway: ${gateway}\n\n`;
  let salud: Record<string, unknown> = {};
  try {
    const r = await fetch(`${gateway}/api/pagos/health`, { signal: AbortSignal.timeout(3000) });
    salud = (await r.json()) as Record<string, unknown>;
    entorno += `GET ${gateway}/api/pagos/health → ${r.status}\n${JSON.stringify(salud, null, 2)}\n`;
  } catch (error) {
    entorno += `No se pudo consultar ${gateway}/api/pagos/health: ${(error as Error).message}\n`;
  }
  const avisos: string[] = [];
  if (salud.entradas !== 'http') avisos.push('Pagos NO está verificando contra Entradas (ENTRADAS_MODO debe ser http).');
  if (salud.auth !== 'validar-sesion') avisos.push('Pagos no informa auth=validar-sesion.');
  if (salud.broker !== 'rabbitmq') avisos.push('Pagos no publica en RabbitMQ (BROKER_MODO debe ser rabbitmq).');
  if (avisos.length) entorno += `\nAVISOS:\n${avisos.map((a) => `- ${a}`).join('\n')}\n`;
  escribir('00-entorno.txt', entorno);

  // 1. Base de datos antes.
  escribir(
    '01-bd-antes.txt',
    await consultas('Consultas ANTES de ejecutar las integraciones', [
      { nombre: 'Cantidad de pagos por estado', sql: 'SELECT estado_pago, COUNT(*) AS cantidad FROM pagos GROUP BY estado_pago ORDER BY estado_pago' },
      {
        nombre: 'Últimos 5 pagos',
        sql: 'SELECT id_pago, id_reserva, id_usuario, id_evento, monto, estado_pago, fecha_creacion FROM pagos ORDER BY fecha_creacion DESC LIMIT 5',
      },
    ]),
  );

  // 2. Colección Postman contra los servicios reales.
  const entornoExportado = path.join(carpeta, 'postman-entorno-final.json');
  const envVars: string[] = [`gatewayUrl=${gateway}`];
  const mapa: Record<string, string> = {
    EVIDENCIA_AUTH_LOGIN_PATH: 'authLoginPath',
    EVIDENCIA_AUTH_LOGIN_BODY: 'authLoginBody',
    EVIDENCIA_ID_EVENTO: 'idEvento',
    EVIDENCIA_CANTIDAD: 'cantidad',
    EVIDENCIA_ENTRADAS_CREAR_RESERVA_PATH: 'entradasCrearReservaPath',
    EVIDENCIA_ID_RESERVA: 'idReservaFija',
    EVIDENCIA_TOTAL: 'totalFijo',
  };
  for (const [variable, clave] of Object.entries(mapa)) {
    if (process.env[variable]) envVars.push(`${clave}=${process.env[variable]}`);
  }
  const newman = spawnSync(
    process.execPath,
    [
      require.resolve('newman/bin/newman.js'),
      'run',
      'postman/Integraciones-reales.postman_collection.json',
      '-e',
      'postman/integraciones-reales.postman_environment.json',
      ...envVars.flatMap((v) => ['--env-var', v]),
      '--export-environment',
      entornoExportado,
      '--reporters',
      'cli,junit',
      '--reporter-junit-export',
      path.join(carpeta, '02-postman.junit.xml'),
      '--color',
      'off',
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );
  const textoNewman = `Ejecución: ${fecha()} (hora de Chile)\n\n${newman.stdout ?? ''}${newman.stderr ?? ''}`;
  escribir('02-postman.txt', textoNewman);
  process.stdout.write(newman.stdout ?? '');

  // Variables que dejó la colección (ids de la operación demostrada). La sesión no se guarda.
  const variables: Record<string, string> = {};
  try {
    const exportado = JSON.parse(fs.readFileSync(entornoExportado, 'utf8')) as { values: Array<{ key: string; value: unknown }> };
    for (const v of exportado.values) variables[v.key] = String(v.value ?? '');
  } catch {
    /* sin entorno exportado */
  }
  fs.rmSync(entornoExportado, { force: true });

  // 3. Base de datos después: el pago creado por la integración, trazable a Entradas y Auth.
  const idPago = variables.idPagoI1 ?? '';
  const idReserva = variables.idReservaI1 ?? '';
  escribir(
    '03-bd-despues.txt',
    await consultas('Consultas DESPUÉS de ejecutar las integraciones', [
      { nombre: 'Cantidad de pagos por estado', sql: 'SELECT estado_pago, COUNT(*) AS cantidad FROM pagos GROUP BY estado_pago ORDER BY estado_pago' },
      {
        nombre: 'I1 + I2: pago creado para la reserva de Entradas, a nombre del usuario que validó Auth',
        sql: 'SELECT id_pago, id_reserva, id_usuario, id_evento, monto, moneda, estado_pago, fecha_creacion, fecha_actualizacion FROM pagos WHERE id_reserva = $1',
        params: [idReserva],
      },
      {
        nombre: 'I1: no se creó ningún pago con la reserva inexistente ni con el total alterado (solo existe el pago correcto)',
        sql: "SELECT COUNT(*) AS pagos_de_reservas_inexistentes FROM pagos WHERE id_reserva LIKE 'res-no-existe-%'",
      },
      {
        nombre: 'Solo se guardan identificadores de otros módulos (columnas de la tabla pagos)',
        sql: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pagos' ORDER BY ordinal_position",
      },
    ]),
  );

  // 4. Logs del contenedor de Pagos (llamadas a Auth, Entradas y RabbitMQ).
  const logs = spawnSync('docker', ['logs', '--since', inicio.toISOString(), contenedor], { encoding: 'utf8' });
  const lineas = `${logs.stdout ?? ''}${logs.stderr ?? ''}`.split('\n').filter((l) => l.includes('[integración]'));
  escribir(
    '04-logs-pagos.txt',
    logs.error || logs.status !== 0
      ? `No se pudieron leer los logs de "${contenedor}" (¿Pagos corre en Docker?). Copiar a mano las líneas [integración] de la consola de Pagos.\n`
      : `docker logs --since ${inicio.toISOString()} ${contenedor} | grep "[integración]"\nFecha: ${fecha()}\n\n${lineas.join('\n')}\n`,
  );

  // 5. Resumen.
  const xml = fs.existsSync(path.join(carpeta, '02-postman.junit.xml')) ? fs.readFileSync(path.join(carpeta, '02-postman.junit.xml'), 'utf8') : '';
  const pruebas = (xml.match(/<testcase\b/g) ?? []).length;
  const fallas = (xml.match(/<testcase\b[^>]*>\s*<failure\b/g) ?? []).length;
  const errores = (xml.match(/RequestError/g) ?? []).length;
  const resumen = `# Evidencia de integraciones — ${fecha()} (hora de Chile)

| | |
|---|---|
| Gateway | ${gateway} |
| Pagos (/api/pagos/health) | entradas=${String(salud.entradas ?? '?')}, auth=${String(salud.auth ?? '?')}, broker=${String(salud.broker ?? '?')} |
| Aserciones Postman | ${pruebas - fallas} de ${pruebas} correctas${errores ? ` (${errores} requests sin respuesta)` : ''} |
| Pago creado (I1 + I2) | ${idPago || '—'} |
| Reserva de Entradas | ${idReserva || '—'} |
| Usuario según Auth | ${variables.idUsuarioAuth || '—'} |
${avisos.length ? `\n**Avisos:**\n${avisos.map((a) => `- ${a}`).join('\n')}\n` : ''}
Archivos: \`00-entorno.txt\`, \`01-bd-antes.txt\`, \`02-postman.txt\` y \`02-postman.junit.xml\`, \`03-bd-despues.txt\`, \`04-logs-pagos.txt\`.
`;
  escribir('RESUMEN.md', resumen);
  console.log(`\n${resumen}`);
  if (fallas > 0 || errores > 0 || newman.status !== 0) process.exitCode = 1;
}

void main();
