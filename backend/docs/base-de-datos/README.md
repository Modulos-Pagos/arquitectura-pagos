# Base de datos de Pagos

| Archivo | Qué es |
|---|---|
| [`../../db/schema.sql`](../../db/schema.sql) | Script de creación (tablas, llaves, restricciones y `COMMENT ON` de cada tabla y columna). Docker lo ejecuta al crear `pagos-db`. |
| [`diagrama-relacional.md`](diagrama-relacional.md) | Diagrama relacional en Mermaid (GitHub lo dibuja), generado leyendo el catálogo de PostgreSQL. |
| [`diagrama-relacional.png`](diagrama-relacional.png) | El mismo diagrama como imagen. |
| [`diccionario-datos.md`](diccionario-datos.md) | Diccionario de datos: tablas, columnas, tipos, nulos, llaves, restricciones y convenciones de nombres. |

## Generar el diagrama desde la base del workstation (BD1–BD4)

El diagrama y el diccionario **se generan leyendo la base que está corriendo** (no se dibujan a mano). En el
workstation no hace falta tener Node instalado: el comando usa un contenedor `node:22-alpine` conectado a la red
interna de Pagos (`pagos-interna`) y lee `pagos-db`.

En la terminal de VS Code del workstation, dentro de `pagos\backend`, escribir `cmd` y pegar:

```bat
docker run --rm --network pagos-interna -v "%cd%:/app" -v pagos-docs-modulos:/app/node_modules -w /app -e DATABASE_URL=postgres://postgres:postgres@pagos-db:5432/pagos_db -e DB_DOCS_SALIDA=docs/base-de-datos/workstation node:22-alpine sh -c "npm ci --no-audit --no-fund --loglevel=error && npx tsx scripts/db-docs.ts"
start docs\base-de-datos\workstation\diagrama-relacional.html
```

- La primera vez tarda 1–2 minutos (instala dependencias en un volumen de Docker, no en la carpeta).
- Se abre en el navegador el diagrama **con el origen `pagos-db:5432/pagos_db` y la hora**, más las filas que tiene
  cada tabla en ese momento.
- Los archivos quedan en `docs/base-de-datos/workstation/`, que git ignora: así la instalación no queda con
  cambios locales y `git pull` sigue funcionando.

## Datos que dejan las operaciones e integraciones

Con el flujo ya ejecutado (front común o colección de pruebas), en `cmd`:

```bat
docker exec pagos-db psql -U postgres -d pagos_db -c "SELECT id_pago, id_reserva, id_usuario, id_evento, monto, estado_pago, stripe_payment_intent_id IS NOT NULL AS cobro_stripe, fecha_creacion, fecha_actualizacion FROM pagos ORDER BY fecha_creacion DESC LIMIT 5;"
docker exec pagos-db psql -U postgres -d pagos_db -c "SELECT estado_pago, count(*) FROM pagos GROUP BY estado_pago ORDER BY 1;"
docker exec pagos-db psql -U postgres -d pagos_db -c "SELECT id_pago, nombre, rut, fecha_registro FROM destinatarios_pago ORDER BY fecha_registro DESC LIMIT 5;"
```

Qué muestran:

- `id_reserva` (Entradas), `id_usuario` (Auth), `id_evento` y `nombre_codigo` (los envía Entradas) son **solo
  identificadores de referencia**, sin llave foránea: Pagos no copia datos de negocio de otros módulos (BD2).
- `monto` coincide con el total que Entradas devolvió al verificar la reserva (I2).
- `estado_pago = APROBADO` y `cobro_stripe = t` después de pagar con la tarjeta de prueba: ese cambio es el que
  publica `pago.realizado` y `pago.completado` en RabbitMQ (I3).
- Las pruebas de error (total alterado, reserva inexistente) **no dejan filas**.

Más consultas, con variables de psql: [`../evidencias/consultas-integraciones.sql`](../evidencias/consultas-integraciones.sql).
