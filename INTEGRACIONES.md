# Integraciones declaradas — Módulo Pagos (TITEC 2026-2, Evaluación 2)

Se evalúan **I1** e **I2**, de tipos distintos (A y C). Ambas se ejecutan contra los servicios reales de los módulos
contraparte, a través de la plataforma TicketU (API Gateway y red Docker `plataforma-eventos-net`).

| Integración | Tipo (A, B o C) | Módulo contraparte | Servicio, endpoint o tópico | Contrato (ruta en el repo) | Ítem en GitHub |
|---|---|---|---|---|---|
| **I1** | **A.** Servicio consumido | Entradas/Inventario | `GET /api/entradas/reservas/{id_reserva}` (Pagos lo invoca al recibir `POST /api/pagos/transacciones`) | [`docs/contratos/Contrato_Pagos_Entradas_v2.5.docx`](docs/contratos/Contrato_Pagos_Entradas_v2.5.docx), operación 6 · [`backend/docs/openapi-servicios-consumidos.yaml`](backend/docs/openapi-servicios-consumidos.yaml) | [INT-01 (#29)](https://github.com/Modulos-Pagos/arquitectura-pagos/issues/29) |
| **I2** | **C.** Autenticación | Auth | `GET /internal/validar-sesion` (cookie `jwt` + `x-api-key`), en cada petición protegida | [`docs/contratos/Contrato_Auth_Pagos_v1.4.docx`](docs/contratos/Contrato_Auth_Pagos_v1.4.docx) · [`backend/docs/openapi-servicios-consumidos.yaml`](backend/docs/openapi-servicios-consumidos.yaml) | [INT-06](https://github.com/Modulos-Pagos/arquitectura-pagos/issues?q=INT-06) |

Ambas corresponden a la tabla de dependencias o a un contrato acordado:
**I1** es la fila de Pagos *"Orden de compra: cantidad de entradas y total (Entradas)"*; **I2** es el acuerdo del contrato
Auth ↔ Pagos v1.4 (Auth entrega usuario, id y rol a los módulos).

Otras integraciones implementadas (no se evalúan): eventos `pago.realizado`, `pago.rechazado`, `pago.anulado` y
`pago.reembolsado` para Entradas, y `pago.completado` para Promociones, en RabbitMQ (`ticketu.events`, tipo C;
contratos [`Contrato_Pagos_Entradas_v2.5.docx`](docs/contratos/Contrato_Pagos_Entradas_v2.5.docx) operación 5 y
[`Contrato_Promociones_Pagos_v1.1.docx`](docs/contratos/Contrato_Promociones_Pagos_v1.1.docx)).

---

## I1 — Pagos consume la reserva de Entradas (tipo A)

**Historia de usuario:** como comprador, al pulsar "Ir a pagar" en Entradas llego a la pantalla de pago con el total de
mi reserva, y Pagos solo me cobra si ese total coincide con la reserva registrada en Entradas.

**Flujo:** Entradas (front común) → `/pagos?idReserva=…&total=…&cantidad=…` → el front de Pagos llama
`POST /api/pagos/transacciones` → **Pagos invoca `GET /api/entradas/reservas/{id_reserva}` reenviando la cookie del
comprador** → compara total, cantidad, evento y código de descuento → crea el pago (201) o lo rechaza (422) → el pago guarda
la referencia `id_reserva` y el `id_evento` informado por Entradas.

| Elemento | Dónde |
|---|---|
| Código de invocación | [`backend/src/integraciones/entradas.client.ts`](backend/src/integraciones/entradas.client.ts) (cliente) y [`backend/src/pagos/pago.service.ts`](backend/src/pagos/pago.service.ts) (`crearTransaccion`: usa la respuesta en la lógica de negocio) |
| Configuración (sin datos fijos en el código) | `ENTRADAS_MODO=http`, `ENTRADAS_BASE_URL`, `ENTRADAS_RUTA_RESERVA`, `ENTRADAS_TIMEOUT_MS` ([`backend/.env.example`](backend/.env.example), [`backend/docker-compose.yml`](backend/docker-compose.yml)); la cookie es la del propio comprador |
| Manejo de errores de la contraparte | Entradas responde 404 → 422 `RESERVA_NO_ENCONTRADA`; no responde en 500 ms, 5xx o respuesta inválida → 503 `ENTRADAS_NO_DISPONIBLE`; total distinto → 422 `ORDEN_INCONSISTENTE`. En ningún caso se crea el pago |
| Contrato | Contrato Pagos ↔ Entradas v2.5 (operaciones 2 y 6) y Swagger de servicios consumidos |
| Datos que deja (BD) | Tabla `pagos`: `id_reserva` (referencia a Entradas), `id_evento`, `monto`, `estado_pago`, `fecha_creacion` |
| Interfaz | Front común, `/pagos` (módulo `src/modules/pagos/` de FrontendTitec): resumen con la cantidad y el total de la reserva, mensajes comprensibles si Entradas falla y botón "Ver mis entradas" de vuelta al módulo Entradas |
| Pruebas | Colección [`backend/postman/Integraciones-reales.postman_collection.json`](backend/postman/Integraciones-reales.postman_collection.json), carpeta I1 (éxito, total alterado, reserva inexistente, reintento idempotente) y pruebas automáticas [`backend/tests/integracion-entradas.test.ts`](backend/tests/integracion-entradas.test.ts) |
| Evidencia de ejecución | [`backend/docs/evidencias/integraciones/`](backend/docs/evidencias/integraciones) (resultado de Postman, consultas SQL antes y después y logs, con fecha) |

## I2 — Pagos delega la autenticación en Auth (tipo C)

**Historia de usuario:** como comprador con sesión iniciada en TicketU, al abrir la pantalla de pago veo mis datos
(nombre, RUT y correo) sin volver a iniciar sesión; si mi sesión no es válida, se me lleva al login y luego vuelvo al pago.

**Flujo:** cada petición protegida a Pagos → **Pagos invoca `GET /internal/validar-sesion` de Auth reenviando el header
`Cookie` tal como llegó y su `x-api-key`** → usa el `id_usuario` y el `rol` que responde Auth (nunca del body ni del JWT)
→ el pago queda a nombre de ese `id_usuario`; el perfil se muestra en la pantalla de pago.

| Elemento | Dónde |
|---|---|
| Código de invocación | [`backend/src/integraciones/auth.client.ts`](backend/src/integraciones/auth.client.ts) y middleware [`backend/src/middlewares/autenticacion.ts`](backend/src/middlewares/autenticacion.ts) |
| Configuración | `AUTH_BASE_URL` (Docker: `http://auth-service:10000`; con Auth corriendo en el mismo PC fuera de Docker, `http://host.docker.internal:10000`), `AUTH_INTERNAL_API_KEY` (la misma `INTERNAL_API_KEY` de Auth, no se sube a GitHub), `AUTH_TIMEOUT_MS` |
| Manejo de errores de la contraparte | 401 → 401 `NO_AUTENTICADO` (el front redirige al login); 403 → 403 `SERVICIO_NO_AUTORIZADO`; 500 → 500; sin respuesta en 1000 ms, conexión rechazada u otro código → 503 `AUTH_NO_DISPONIBLE` (fail-secure: no se cobra) |
| Contrato | Contrato Auth ↔ Pagos v1.4 y Swagger de servicios consumidos (`/internal/validar-sesion`) |
| Datos que deja (BD) | Tabla `pagos`: `id_usuario` que entregó Auth. No se guardan nombre, RUT ni correo del comprador |
| Interfaz | Pantalla de pago: datos del comprador desde Auth; sin sesión redirige al login de Auth con `?volver=` y regresa al pago; si Auth no responde, mensaje comprensible y no se permite pagar |
| Pruebas | Colección `Integraciones-reales`, carpeta I2 (sesión válida, sin sesión, token no emitido por Auth, Bearer rechazado) y pruebas automáticas [`backend/tests/plataforma.test.ts`](backend/tests/plataforma.test.ts) |
| Evidencia de ejecución | [`backend/docs/evidencias/integraciones/`](backend/docs/evidencias/integraciones) |

---

## Cómo generar la evidencia (BE1, BD1, CA1)

Con la plataforma levantada con los servicios **reales** (Gateway, RabbitMQ, Auth, Entradas y Pagos en Docker; paso a paso
en [`docs/gestion/levantar-y-probar-windows.md`](docs/gestion/levantar-y-probar-windows.md)):

```bash
cd backend
# Usuario de prueba de Auth y un evento pagado de Entradas (no subir credenciales a GitHub)
export EVIDENCIA_AUTH_LOGIN_BODY='{"email":"...","password":"..."}'
export EVIDENCIA_ID_EVENTO=<id de un evento pagado en Entradas>
export EVIDENCIA_DATABASE_URL=postgres://postgres:postgres@localhost:5433/pagos_db
npm run evidencia:integraciones
```

En PowerShell: `$env:EVIDENCIA_ID_EVENTO="..."` en vez de `export`.

Deja en `backend/docs/evidencias/integraciones/<fecha>/`: el estado de Pagos (Entradas en modo `http`, Auth por
`validar-sesion`), las consultas SQL antes y después, el resultado de Postman (`.txt` y JUnit), las líneas
`[integración]` del log de Pagos y un `RESUMEN.md`. La ruta del login de Auth y la de creación de reservas de Entradas se
cambian con `EVIDENCIA_AUTH_LOGIN_PATH` y `EVIDENCIA_ENTRADAS_CREAR_RESERVA_PATH`; para usar una reserva ya creada:
`EVIDENCIA_ID_RESERVA` y `EVIDENCIA_TOTAL`.
