# Ítems de gestión de las integraciones (GE1)

Texto para los issues de GitHub de cada integración declarada en [`INTEGRACIONES.md`](../../INTEGRACIONES.md).
I1 es el issue **INT-01 (#29)** e I2 el issue **INT-05 (#33)**, ambos actualizados con este texto. En ambos: asignar responsable,
agregarlos al Project "Progreso Modulo de Pagos", vincular el PR o los commits y dejar el estado según lo demostrado.

---

## INT-01 (#29) — I1: Pagos verifica la reserva en Entradas antes de cobrar (tipo A, servicio consumido)

**Historia de usuario**
Como comprador, cuando pulso "Ir a pagar" en Entradas quiero llegar a la pantalla de pago con el total de mi reserva,
y que Pagos solo me cobre si ese total coincide con lo registrado en Entradas.

**Módulo contraparte:** Entradas/Inventario (Grupo 3)
**Contrato:** `docs/contratos/Contrato_Pagos_Entradas_v2.5.docx` (operaciones 2 y 6) · `backend/docs/openapi-servicios-consumidos.yaml`
**Servicio consumido:** `GET /api/entradas/reservas/{id_reserva}` (reenviando la cookie del comprador)
**Responsable:** Cristóbal Soto (back end) · Pablo Medina (front) · Alonso Venegas (BD) · Ricardo Muñoz (pruebas)

**Criterios de aceptación**
- [x] Al llegar desde Entradas a `/pagos?idReserva=…&total=…&cantidad=…`, Pagos invoca a Entradas con la reserva y crea el pago (201, PENDIENTE) solo si total, cantidad, evento y código coinciden.
- [x] Si el total o la cantidad no coinciden con Entradas, responde 422 `ORDEN_INCONSISTENTE` y no crea el pago.
- [x] Si Entradas responde 404, responde 422 `RESERVA_NO_ENCONTRADA`; si no responde en 500 ms o falla, 503 `ENTRADAS_NO_DISPONIBLE`. En ambos casos la pantalla muestra un mensaje comprensible y el botón "Volver a Entradas".
- [x] El pago queda en la tabla `pagos` con `id_reserva` (referencia), `id_evento` informado por Entradas, `monto` igual al total de la reserva, estado y fechas. No se copian otros datos de Entradas.
- [x] La ruta y el timeout se configuran por variables (`ENTRADAS_BASE_URL`, `ENTRADAS_RUTA_RESERVA`, `ENTRADAS_TIMEOUT_MS`); nada fijo en el código.
- [x] Casos de Postman de éxito y de error ejecutados contra el Entradas real, con evidencia en `backend/docs/evidencias/integraciones/`.

**Estado:** Done — la colección pasó contra el Entradas real (27/27) con evidencia en `backend/docs/evidencias/integraciones/2026-11-04-01-48/`.

---

## INT-05 (#33) — I2: Pagos valida la sesión del comprador con Auth (tipo C, autenticación)

**Historia de usuario**
Como comprador con sesión iniciada en TicketU, quiero que la pantalla de pago reconozca mi sesión y muestre mis datos
sin volver a iniciar sesión; si mi sesión no es válida, quiero que me lleve al login y luego de vuelta al pago.

**Módulo contraparte:** Auth
**Contrato:** `docs/contratos/Contrato_Auth_Pagos_v1.5.docx` · `backend/docs/openapi-servicios-consumidos.yaml`
**Servicio consumido:** `GET /internal/validar-sesion` (header `Cookie` original + `x-api-key`)
**Responsable:** Cristóbal Soto (back end) · Pablo Medina (front) · Alonso Venegas (BD) · Ricardo Muñoz (pruebas)

**Criterios de aceptación**
- [x] Cada petición protegida a Pagos consulta a Auth antes de cualquier lógica; Pagos usa el `id_usuario` y el `rol` de la respuesta (nunca del body, la URL ni el JWT).
- [x] Con sesión válida, la pantalla de pago muestra nombre, RUT y correo entregados por Auth, sin pedir login de nuevo.
- [x] Sin sesión o con un token no emitido por Auth → 401 `NO_AUTENTICADO` y el front redirige al login de Auth con `?volver=` (vuelve al pago).
- [x] Si Auth no responde en 1000 ms → 503 `AUTH_NO_DISPONIBLE`, no se crea ni cobra ningún pago y la pantalla lo informa con un mensaje comprensible.
- [x] La URL de Auth y la `INTERNAL_API_KEY` vienen de variables (`AUTH_BASE_URL`, `AUTH_INTERNAL_API_KEY`); la clave no está en GitHub.
- [x] El pago creado queda con el `id_usuario` de Auth; Pagos no guarda nombre, RUT ni correo del comprador ni los escribe en el log.
- [x] Casos de Postman de éxito y de error (sin sesión, token falso, Bearer) ejecutados contra el Auth real, con evidencia en `backend/docs/evidencias/integraciones/`.

**Estado:** Done — la colección pasó contra el Auth real (27/27) con evidencia en `backend/docs/evidencias/integraciones/2026-11-04-01-48/`.
