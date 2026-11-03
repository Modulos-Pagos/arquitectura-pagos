-- =====================================================================================
-- Consultas de evidencia BD1 — Evaluación 2 (Interoperabilidad), módulo Pagos
-- Ejecutar ANTES y DESPUÉS de cada integración y guardar la captura con fecha.
--   Docker:  docker exec -it pagos-db psql -U postgres -d pagos_db
--   (o con cualquier cliente: postgres://postgres:postgres@localhost:5433/pagos_db)
-- Reemplazar :'id_reserva' e :'id_usuario' por los valores de la operación demostrada, o en psql:
--   \set id_reserva 'hold-ABC123'
--   \set id_usuario '3f1e2c1a-...'
-- =====================================================================================

-- Fecha y hora de la consulta (queda en la captura)
SELECT now() AT TIME ZONE 'America/Santiago' AS fecha_consulta;

-- ---------------------------------------------------------------- ANTES (ambas integraciones)
-- La reserva todavía no tiene pago.
SELECT COUNT(*) AS pagos_de_la_reserva FROM pagos WHERE id_reserva = :'id_reserva';
SELECT estado_pago, COUNT(*) AS cantidad FROM pagos GROUP BY estado_pago ORDER BY estado_pago;

-- ---------------------------------------------------------------- DESPUÉS — I1 (Entradas)
-- (a) La operación dejó un pago persistido para la reserva de Entradas.
-- (b) Trazable: id_reserva (referencia a Entradas), estado y fechas.
-- (c) Consistente con la respuesta de Entradas: monto = total de la reserva; id_evento = el que informó Entradas.
SELECT id_pago, id_reserva, id_evento, monto, moneda, estado_pago, fecha_creacion, fecha_actualizacion
FROM pagos
WHERE id_reserva = :'id_reserva';

-- Los intentos rechazados (total alterado, reserva inexistente) no dejan pagos.
SELECT COUNT(*) AS pagos_rechazados_creados FROM pagos WHERE id_reserva LIKE 'res-no-existe-%';

-- ---------------------------------------------------------------- DESPUÉS — I2 (Auth)
-- (a)/(b) El pago quedó a nombre del id_usuario que entregó Auth en validar-sesion.
-- (c) Coincide con el id_usuario de la respuesta de Auth (ver GET /api/pagos/comprador/perfil o el log [integración]).
SELECT id_pago, id_usuario, id_reserva, estado_pago, fecha_creacion
FROM pagos
WHERE id_usuario = :'id_usuario'
ORDER BY fecha_creacion DESC
LIMIT 5;

-- ---------------------------------------------------------------- (d) Solo identificadores de otros módulos
-- La tabla pagos guarda id_reserva, id_usuario e id_evento como referencias (sin FK, Database per Service).
-- No hay columnas con nombre, RUT ni correo del comprador (Auth es la fuente de verdad).
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'pagos'
ORDER BY ordinal_position;

-- ---------------------------------------------------------------- Después de pagar (opcional)
-- El pago pasa a APROBADO y Pagos publica pago.realizado (Entradas) y pago.completado (Promociones).
SELECT id_pago, id_reserva, estado_pago, fecha_creacion, fecha_actualizacion
FROM pagos
WHERE id_reserva = :'id_reserva';
