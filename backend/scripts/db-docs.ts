/**
 * Genera, LEYENDO LA BASE DE DATOS (catálogo de PostgreSQL), la documentación de BD:
 *   docs/base-de-datos/diagrama-relacional.md   (diagrama ER en Mermaid; GitHub lo dibuja)
 *   docs/base-de-datos/diccionario-datos.md     (tablas, columnas, tipos, nulos, llaves, descripciones)
 *
 * Uso: npm run db:docs   (usa DATABASE_URL)
 */
import fs from 'node:fs';
import path from 'node:path';
import { cargarArchivoEnv } from '../src/config/env';
import { crearPool } from '../src/db/pool';

interface Columna {
  tabla: string;
  columna: string;
  tipo: string;
  nulo: boolean;
  defecto: string | null;
  descripcion: string | null;
  orden: number;
}

interface Restriccion {
  tabla: string;
  nombre: string;
  tipo: 'p' | 'u' | 'f' | 'c';
  definicion: string;
  columnas: string[];
  tabla_ref: string | null;
}

function tipoCorto(tipo: string): string {
  return tipo
    .replace('character varying', 'varchar')
    .replace('timestamp with time zone', 'timestamptz')
    .replace(/^character\(/, 'char(');
}

async function main() {
  cargarArchivoEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL');
  const pool = crearPool({ databaseUrl: url, databaseSsl: process.env.DATABASE_SSL === 'true' });

  try {
    const tablas = (
      await pool.query(
        `SELECT c.relname AS tabla, obj_description(c.oid, 'pg_class') AS descripcion
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r'
          ORDER BY CASE c.relname WHEN 'pagos' THEN 0 ELSE 1 END, c.relname`,
      )
    ).rows as { tabla: string; descripcion: string | null }[];

    const columnas = (
      await pool.query(
        `SELECT c.relname AS tabla, a.attname AS columna, a.attnum AS orden,
                format_type(a.atttypid, a.atttypmod) AS tipo, NOT a.attnotnull AS nulo,
                pg_get_expr(d.adbin, d.adrelid) AS defecto,
                col_description(c.oid, a.attnum) AS descripcion,
                a.attidentity AS identidad
           FROM pg_attribute a
           JOIN pg_class c ON c.oid = a.attrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
          WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
          ORDER BY c.relname, a.attnum`,
      )
    ).rows.map((f) => ({
      tabla: String(f.tabla),
      columna: String(f.columna),
      orden: Number(f.orden),
      tipo: tipoCorto(String(f.tipo)),
      nulo: Boolean(f.nulo),
      defecto: f.identidad === 'a' ? 'GENERATED ALWAYS AS IDENTITY' : ((f.defecto as string | null) ?? null),
      descripcion: (f.descripcion as string | null) ?? null,
    })) as Columna[];

    const restricciones = (
      await pool.query(
        `SELECT cl.relname AS tabla, co.conname AS nombre, co.contype AS tipo,
                pg_get_constraintdef(co.oid) AS definicion,
                ARRAY(SELECT a.attname FROM unnest(co.conkey) k
                        JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = k)::text[] AS columnas,
                ref.relname AS tabla_ref
           FROM pg_constraint co
           JOIN pg_class cl ON cl.oid = co.conrelid
           JOIN pg_namespace n ON n.oid = cl.relnamespace
           LEFT JOIN pg_class ref ON ref.oid = co.confrelid
          WHERE n.nspname = 'public' AND co.contype IN ('p', 'u', 'f', 'c')
          ORDER BY cl.relname, co.contype, co.conname`,
      )
    ).rows.map((f) => ({
      tabla: String(f.tabla),
      nombre: String(f.nombre),
      tipo: f.tipo as Restriccion['tipo'],
      definicion: String(f.definicion),
      columnas: Array.isArray(f.columnas) ? f.columnas.map(String) : String(f.columnas).replace(/[{}]/g, '').split(','),
      tabla_ref: (f.tabla_ref as string | null) ?? null,
    })) as Restriccion[];

    if (tablas.length === 0) throw new Error('No hay tablas: ejecute primero npm run db:init');

    const llaves = (tabla: string, columna: string) => {
      const marcas: string[] = [];
      for (const r of restricciones.filter((x) => x.tabla === tabla && x.columnas.includes(columna))) {
        if (r.tipo === 'p') marcas.push('PK');
        if (r.tipo === 'f') marcas.push('FK');
        if (r.tipo === 'u') marcas.push('UK');
      }
      return [...new Set(marcas)];
    };

    const generado = new Date().toISOString();
    const salida = path.resolve(__dirname, '..', 'docs', 'base-de-datos');
    fs.mkdirSync(salida, { recursive: true });

    // ---------------- Diagrama relacional (Mermaid) ----------------
    const er: string[] = ['erDiagram'];
    for (const t of tablas) {
      er.push(`    ${t.tabla} {`);
      for (const c of columnas.filter((x) => x.tabla === t.tabla)) {
        const tipo = c.tipo.replace(/\s+/g, '_').replace(/[(),]/g, (m) => (m === '(' ? '_' : m === ')' ? '' : '_'));
        const marcas = llaves(t.tabla, c.columna).join(',');
        const nota = c.nulo ? 'NULL' : 'NOT NULL';
        er.push(`        ${tipo} ${c.columna}${marcas ? ` ${marcas}` : ''} "${nota}"`);
      }
      er.push('    }');
    }
    for (const fk of restricciones.filter((r) => r.tipo === 'f' && r.tabla_ref)) {
      const nula = fk.columnas.some((col) => columnas.find((c) => c.tabla === fk.tabla && c.columna === col)?.nulo);
      er.push(`    ${fk.tabla_ref} ${nula ? '|o' : '||'}--o{ ${fk.tabla} : "${fk.columnas.join(', ')}"`);
    }

    const diagrama = [
      '# Diagrama relacional — Microservicio de Pagos',
      '',
      `> Generado automáticamente desde la base de datos con \`npm run db:docs\` (${generado}).`,
      '> GitHub dibuja el diagrama a partir del bloque Mermaid. Para una imagen: DBeaver/pgAdmin > ER Diagram,',
      '> o en Supabase: Database > Schema Visualizer.',
      '',
      '```mermaid',
      ...er,
      '```',
      '',
      '## Referencias a otros módulos (sin llave foránea)',
      '',
      'Por el patrón *Database per Service*, estos identificadores apuntan a datos de otros microservicios.',
      'Se guardan solo como referencia; no se replican datos de negocio de otros squads (ítem BD2).',
      '',
      '| Columna | Módulo dueño del dato |',
      '|---|---|',
      '| `pagos.id_reserva` | Entradas/Inventario |',
      '| `pagos.id_evento` | Panel organizador / Catálogo |',
      '| `pagos.id_usuario` | Auth |',
      '',
      '## Relaciones',
      '',
      '| Restricción | Tabla hija | Columna | Tabla padre |',
      '|---|---|---|---|',
      ...restricciones
        .filter((r) => r.tipo === 'f')
        .map((r) => `| \`${r.nombre}\` | ${r.tabla} | ${r.columnas.join(', ')} | ${r.tabla_ref} |`),
      '',
      'Todas las llaves foráneas apuntan a `pagos`: el diseño no tiene ciclos.',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(salida, 'diagrama-relacional.md'), diagrama);

    // ---------------- Diccionario de datos ----------------
    const dic: string[] = [
      '# Diccionario de datos — Microservicio de Pagos',
      '',
      `> Generado automáticamente desde los comentarios (\`COMMENT ON\`) de la base de datos con \`npm run db:docs\` (${generado}).`,
      '> Fuente: [`db/schema.sql`](../../db/schema.sql).',
      '',
      '## Convenciones de nomenclatura',
      '',
      '- Tablas y columnas en `snake_case`, en español; tablas en plural.',
      '- Llave primaria `id_<entidad>`; la llave foránea usa el mismo nombre que la PK referenciada.',
      '- Fechas con prefijo `fecha_` y tipo `timestamptz` (UTC). Montos `integer` en CLP (sin decimales).',
      '- Restricciones: `pk_<tabla>`, `fk_<tabla>_<tabla_ref>`, `uq_<tabla>_<columna>`, `ck_<tabla>_<columna>`, `idx_<tabla>_<columna>`.',
      '',
    ];
    for (const t of tablas) {
      dic.push(`## Tabla \`${t.tabla}\``, '', t.descripcion ?? '_(sin descripción)_', '');
      dic.push('| # | Columna | Tipo | Nulo | Por defecto | Llave | Descripción |', '|---|---|---|---|---|---|---|');
      for (const c of columnas.filter((x) => x.tabla === t.tabla)) {
        const defecto = c.defecto ? `\`${c.defecto}\`` : '';
        dic.push(
          `| ${c.orden} | \`${c.columna}\` | ${c.tipo} | ${c.nulo ? 'Sí' : 'No'} | ${defecto} | ${llaves(t.tabla, c.columna).join(', ')} | ${(c.descripcion ?? '').replace(/\|/g, '\\|')} |`,
        );
      }
      const propias = restricciones.filter((r) => r.tabla === t.tabla);
      if (propias.length) {
        dic.push('', '**Restricciones**', '', '| Nombre | Tipo | Definición |', '|---|---|---|');
        const nombreTipo = { p: 'PRIMARY KEY', u: 'UNIQUE', f: 'FOREIGN KEY', c: 'CHECK' } as const;
        for (const r of propias) {
          dic.push(`| \`${r.nombre}\` | ${nombreTipo[r.tipo]} | \`${r.definicion.replace(/\|/g, '\\|')}\` |`);
        }
      }
      dic.push('');
    }
    fs.writeFileSync(path.join(salida, 'diccionario-datos.md'), dic.join('\n'));
    fs.writeFileSync(path.join(salida, 'diagrama-relacional.mmd'), er.join('\n') + '\n');

    console.log(`Documentación generada en ${path.relative(process.cwd(), salida)}/`);
    console.log(`  ${tablas.length} tablas, ${columnas.length} columnas, ${restricciones.length} restricciones`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Error generando la documentación:', error.message);
  process.exit(1);
});
