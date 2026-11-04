# Evidencia de integraciones — 03-11-2026, 10:48:31 p. m. (hora de Chile)

| | |
|---|---|
| Gateway | http://localhost:8080 |
| Pagos (/api/pagos/health) | entradas=http, auth=validar-sesion, broker=rabbitmq |
| Aserciones Postman | 27 de 27 correctas |
| Pago creado (I1 + I2) | d61d56d9-8cd8-4423-affb-799ce6fe4c10 |
| Reserva de Entradas | hold-a063217a |
| Usuario según Auth | 8638892e-5296-4a37-aa3d-65de4f6556bd |

Archivos: `00-entorno.txt`, `01-bd-antes.txt`, `02-postman.txt` y `02-postman.junit.xml`, `03-bd-despues.txt`, `04-logs-pagos.txt`.
