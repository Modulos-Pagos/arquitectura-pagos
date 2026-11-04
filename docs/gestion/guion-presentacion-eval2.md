# Guion de la presentación — Evaluación 2 (Pagos, miércoles 4/11, 17:00, R. Noël)

10 minutos (unos 5 por integración) + 5 de preguntas. Presenta el Scrum Master (Simón); cada rol muestra su parte.
**Lo que no se muestra vale 0**: cada rol debe mostrar su elemento en las dos integraciones.

## Antes de entrar (16:30)

- [ ] Docker Desktop: red `plataforma-eventos-net`, RabbitMQ y Gateway del Platform Team, **Auth y Entradas reales** y Pagos (`docker compose up -d`).
- [ ] `http://localhost:8080/api/pagos/health` → `"entradas":"http"`, `"auth":"validar-sesion"`, `"broker":"rabbitmq"`.
- [ ] Front común corriendo (`npm run dev` en FrontendTitec, rama con el módulo de Pagos), sesión de prueba de Auth lista.
- [ ] Un evento pagado con stock en Entradas, `stripe listen` corriendo si se paga con Stripe real.
- [ ] Pestañas abiertas: front (`/entradas`), Swagger de servicios consumidos (`http://localhost:3004/api-docs/consumidos`), contratos, terminal con `docker logs -f pagos-service | findstr integración` (PowerShell) o `grep integración`, cliente SQL (`docker exec -it pagos-db psql -U postgres -d pagos_db`), GitHub (issues y `INTEGRACIONES.md`), Postman.
- [ ] Coordinado con Auth y Entradas que sus servicios estén arriba a las 17:00 (Entradas presenta a las 16:40 con el mismo profesor).

## 0. Introducción (30 s) — Simón

"Pagos cobra las entradas de TicketU. Declaramos dos integraciones de tipos distintos (`INTEGRACIONES.md`):
**I1, tipo A**: consumimos la reserva de Entradas para validar el cobro; **I2, tipo C**: delegamos la autenticación en Auth."

## I1 — Entradas (≈ 4 min 30 s)

| Rol | Qué mostrar | Ítem |
|---|---|---|
| UI/UX (Pablo) | En el front común: elegir un evento en Entradas → "Ir a pagar" → llega a `/pagos` con la cantidad y el total de la reserva, sin copiar nada. Mostrar un error: abrir el link con otro total → "El monto no coincide con tu reserva" + "Volver a Entradas" | UI1 a–d |
| Back End (Cristóbal) | Contrato v2.5 operación 6 y Swagger de servicios consumidos. En la terminal, la línea `[integración] … Entradas GET /api/entradas/reservas/<id> → 200 (total …, cantidad …)` y la de error (`404 → 422`). Variables `ENTRADAS_*` (sin datos fijos) | BE1 a–e |
| Base de Datos (Alonso) | `SELECT … FROM pagos WHERE id_reserva = '<id>'` antes (0 filas) y después (1 fila: id_reserva, id_evento, monto = total, estado, fechas). Columnas de `pagos`: solo ids de otros módulos | BD1 a–d |
| Gestión (Simón) | Issue INT-01 (#29): criterios de aceptación, contraparte, contrato, responsable, PR y estado | GE1 a–e |
| Calidad (Ricardo) | Carpeta I1 de la colección `Integraciones-reales` ejecutada (éxito + total alterado 422 + reserva inexistente 422) y su resultado con fecha en `backend/docs/evidencias/integraciones/` | CA1 a–d |

## I2 — Auth (≈ 4 min 30 s)

| Rol | Qué mostrar | Ítem |
|---|---|---|
| UI/UX (Pablo) | Abrir `/pagos` sin sesión → redirige al login de Auth → vuelve solo al pago con nombre, RUT y correo de Auth. Error: con Auth detenido, mensaje "No pudimos verificar tu sesión…" y no deja pagar | UI1 a–d |
| Back End (Cristóbal) | Contrato Auth v1.4 y Swagger (`/internal/validar-sesion`, `x-api-key`, códigos 401/403/500/503). Log `[integración] … Auth GET /internal/validar-sesion → 200 … rol=usuario` y el de error `401 → 401 NO_AUTENTICADO`. `AUTH_BASE_URL` y `AUTH_INTERNAL_API_KEY` por configuración | BE1 a–e |
| Base de Datos (Alonso) | `SELECT id_pago, id_usuario, … FROM pagos WHERE id_usuario = '<id de Auth>'`: el pago quedó con el id que entregó Auth; no hay columnas de nombre, RUT ni correo | BD1 a–d |
| Gestión (Simón) | Issue INT-06 con criterios, contraparte (Auth), contrato v1.4, responsable, PR y estado | GE1 a–e |
| Calidad (Ricardo) | Carpeta I2 ejecutada: sesión válida 200, sin sesión 401, token falso 401, Bearer 401; resultado con fecha | CA1 a–d |

## Cierre (30 s)

Si queda tiempo: pagar con la tarjeta `4242 4242 4242 4242` y mostrar en el panel de RabbitMQ (`http://localhost:15672`)
el evento `pago.realizado` que consume Entradas (integración adicional, no evaluada).

## Preguntas probables

- **¿Qué pasa si Entradas o Auth se caen?** No se cobra: 503 con mensaje comprensible; timeouts de 500 ms (Entradas) y 1000 ms (Auth).
- **¿Por qué Pagos no valida el JWT?** El contrato Auth v1.4 exige preguntarle a Auth en cada petición (revocación, rol vigente).
- **¿Qué guardan de otros módulos?** Solo `id_reserva`, `id_usuario` e `id_evento` como referencias, sin FK (Database per Service).
- **¿Cómo evitan cobrar dos veces?** `id_reserva` es único: un reintento devuelve el mismo pago (200).
