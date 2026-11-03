# Evidencia de las integraciones (Evaluación 2)

Cada ejecución de `npm run evidencia:integraciones` (desde `backend/`, con la plataforma y los servicios **reales** de
Auth y Entradas levantados) crea aquí una carpeta con la fecha y hora, por ejemplo `2026-11-04-10-30/`, con:

| Archivo | Qué muestra | Ítem |
|---|---|---|
| `00-entorno.txt` | Estado de Pagos: Entradas en modo `http`, Auth por `validar-sesion`, broker `rabbitmq` | BE1 (a) |
| `01-bd-antes.txt` | Consultas SQL antes de ejecutar | BD1 |
| `02-postman.txt`, `02-postman.junit.xml` | Colección `Integraciones-reales`: casos de éxito y de error de I1 e I2, con resultado esperado | CA1, BE1 (b) |
| `03-bd-despues.txt` | Consultas SQL después: pago trazable a la reserva de Entradas y al usuario de Auth | BD1 |
| `04-logs-pagos.txt` | Líneas `[integración]` del log de Pagos (llamadas a Auth, Entradas y RabbitMQ, con fecha) | BE1 (a) |
| `RESUMEN.md` | Resumen de la ejecución | — |

Consultas de referencia para mostrar en vivo: [`../consultas-integraciones.sql`](../consultas-integraciones.sql).
Las capturas de pantalla de la demo (interfaz, base de datos, RabbitMQ) se pueden agregar en la misma carpeta de la fecha.
