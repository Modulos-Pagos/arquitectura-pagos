# Guion de la presentación — Evaluación 2 (Pagos, miércoles 4/11, 17:00, R. Noël)

10 minutos (unos 4 min 30 s por integración) + 5 de preguntas. Presenta el Scrum Master (Simón) y cada rol muestra su
parte. **Lo que no se muestra vale 0**: cada rol muestra todos sus elementos en las dos integraciones.

Integraciones declaradas en [`INTEGRACIONES.md`](../../INTEGRACIONES.md): **I1, tipo A** (Pagos consume la reserva de
Entradas) e **I2, tipo C** (Pagos delega la autenticación en Auth). Las dos corren contra los servicios reales de Auth y
Entradas, levantados en el mismo PC con su propio código (Auth con su Dockerfile; Entradas con su FastAPI y MongoDB).

## Antes de entrar (16:15, en el PC que presenta)

- [ ] Docker Desktop abierto → `1-levantar.cmd` → todo en verde (la primera vez tarda varios minutos).
- [ ] `2-probar.cmd`: login real en Auth, Pagos valida con Auth, Entradas responde y el evento evt-77889 existe.
- [ ] `demo\1-ver-log-integraciones.cmd` abierto y visible (líneas `[integración]`).
- [ ] `demo\2-abrir-bd-pagos.cmd` abierto (psql) y [`consultas-integraciones.sql`](../../backend/docs/evidencias/consultas-integraciones.sql) a mano.
- [ ] Navegador: sesión iniciada en `http://localhost:3000/auth`; pestaña en `http://localhost:3000/entradas`; una
      **ventana privada** cerrada (para mostrar el login con vuelta al pago); Swagger de servicios consumidos
      `http://localhost:3004/api-docs/consumidos`; GitHub con los issues INT-01 (#29) e INT-05 (#33) e `INTEGRACIONES.md`.
- [ ] Contratos abiertos: `docs/contratos/Contrato_Pagos_Entradas_v2.5.docx` (operación 6) y `Contrato_Auth_Pagos_v1.5.docx`.
- [ ] Carpeta de evidencia con fecha abierta: `backend/docs/evidencias/integraciones/`.

## 0. Introducción (30 s) — Simón

"Pagos cobra las entradas de TicketU. Declaramos dos integraciones de tipos distintos: **I1, tipo A**, consumimos la
reserva de Entradas para validar el cobro; **I2, tipo C**, delegamos la autenticación en Auth. Las dos contra los
servicios reales de esos equipos."

## I1 — Entradas, tipo A (≈ 4 min 30 s)

| # | Rol | Qué se hace y se dice | Ítem |
|---|---|---|---|
| 1 | Base de Datos (Alonso) | **Antes:** en psql, `SELECT estado_pago, COUNT(*) FROM pagos GROUP BY estado_pago;` y los últimos 5 pagos | BD1 (a) |
| 2 | UI/UX (Pablo) | `/entradas` → "Probar Reserva Temporal" → Entradas crea la reserva (hold) → "Continuar a Pasarela de Pagos" → `/pagos` muestra la cantidad y el total de la reserva y los datos del comprador, **sin copiar nada ni volver a iniciar sesión** y sin ids ni JSON en pantalla | UI1 (a)(b)(c) |
| 3 | Back End (Cristóbal) | En el log: `Entradas GET /api/entradas/reservas/hold-… → 200 (total …, cantidad …)`. Contrato v2.5, operación 6, y Swagger de servicios consumidos. Dirección y timeout por configuración (`ENTRADAS_BASE_URL`, `ENTRADAS_RUTA_RESERVA`, `ENTRADAS_TIMEOUT_MS` en `docker-compose.yml`), nada fijo en el código. Contrato verificado con el código de Entradas | BE1 (a)(c)(d)(e) |
| 4 | UI/UX + Back End | **Falla de la contraparte:** crear otra reserva → `demo\3-caer-entradas.cmd` → "Continuar a Pasarela de Pagos" → la pantalla dice "No pudimos confirmar tu reserva con el sistema de entradas. No se realizó ningún cobro…". En el log: `→ 503 ENTRADAS_NO_DISPONIBLE`. Luego `demo\4-levantar-entradas.cmd` | UI1 (d), BE1 (b) |
| 5 | Base de Datos (Alonso) | **Después:** `SELECT id_pago, id_reserva, id_evento, monto, estado_pago, fecha_creacion FROM pagos WHERE id_reserva = 'hold-…';` → 1 fila: referencia a Entradas, estado y fecha; `monto` = el total que mostró el log. Columnas de `pagos`: solo ids de otros módulos | BD1 (a)(b)(c)(d) |
| 6 | Gestión (Simón) | Issue INT-01 (#29): historia, criterios de aceptación, contraparte (Entradas), contrato v2.5, responsable, commits enlazados y estado Done. Fila I1 de `INTEGRACIONES.md` | GE1 (a)–(e) |
| 7 | Calidad (Ricardo) | `3-evidencia.cmd` en vivo (Newman, colección `Integraciones-reales`): carpeta I1 con éxito, total alterado → 422 y reserva inexistente → 422; 27 de 27 correctas. Mostrar la carpeta con fecha que deja | CA1 (a)–(d) |

## I2 — Auth, tipo C (≈ 4 min 30 s)

| # | Rol | Qué se hace y se dice | Ítem |
|---|---|---|---|
| 1 | UI/UX (Pablo) | En la ventana privada abrir `http://localhost:3000/pagos` → lleva al login de Auth (`/auth?volver=…`) → iniciar sesión → **vuelve solo** al pago con nombre, RUT y correo que entrega Auth | UI1 (a)(b)(c) |
| 2 | Back End (Cristóbal) | En el log: `Auth GET /internal/validar-sesion → 200 valido=true id_usuario=… rol=usuario` y, sin sesión, `401 → 401 NO_AUTENTICADO`. Contrato v1.5 (cookie `jwt` + `x-api-key`, 401/403/500/503, OK de Auth) y Swagger. `AUTH_BASE_URL` y `AUTH_INTERNAL_API_KEY` por configuración; la clave no está en GitHub; la sesión de las pruebas se obtiene con el login, no copiada a mano | BE1 (a)(c)(d)(e) |
| 3 | UI/UX + Back End | **Falla de la contraparte:** `demo\5-caer-auth.cmd` → recargar `/pagos` → "No pudimos verificar tu sesión en este momento. No se realizó ningún cobro…" y no deja pagar. En el log: `→ 503 AUTH_NO_DISPONIBLE`. Luego `demo\6-levantar-auth.cmd` | UI1 (d), BE1 (b) |
| 4 | Base de Datos (Alonso) | `SELECT id_pago, id_usuario, estado_pago, fecha_creacion FROM pagos WHERE id_usuario = '<id_usuario del log>' ORDER BY fecha_creacion DESC LIMIT 5;` → el pago quedó a nombre del usuario que validó Auth (el "antes" es la consulta del paso I1-1). En las columnas no hay nombre, RUT ni correo | BD1 (a)(b)(c)(d) |
| 5 | Gestión (Simón) | Issue INT-05 (#33): criterios, contraparte (Auth), contrato v1.5, responsable, commits y estado Done | GE1 (a)–(e) |
| 6 | Calidad (Ricardo) | En la misma ejecución del paso I1-7, carpeta I2: login real, perfil 200, sin sesión 401, token falso 401 y Bearer 401 | CA1 (a)–(d) |

## Cierre (solo si sobra tiempo)

Pagar con la tarjeta de prueba `4242 4242 4242 4242` → "Pago aprobado" y, en RabbitMQ (`http://localhost:15672`), la
cola `entradas.pagos` recibió `pago.realizado` (integración adicional, no evaluada).

## Preguntas probables

- **¿Qué pasa si Entradas o Auth se caen?** No se cobra: 503 con mensaje comprensible; timeouts de 500 ms (Entradas) y 1000 ms (Auth).
- **¿Son los servicios reales?** Sí: el código de cada equipo corriendo en local (Auth con su Dockerfile, Entradas con su FastAPI y MongoDB), que la pauta permite. Auth dio su OK al contrato v1.5.
- **¿Por qué Pagos no valida el JWT?** El contrato Auth v1.5 exige preguntarle a Auth en cada petición (revocación y rol vigente).
- **¿Qué guardan de otros módulos?** Solo `id_reserva`, `id_usuario` e `id_evento` como referencias, sin FK (base de datos por servicio). El destinatario lo escribe el comprador en la pantalla de pago; no viene de otro módulo.
- **¿Cómo evitan cobrar dos veces?** `id_reserva` es único: un reintento devuelve el mismo pago (200).
