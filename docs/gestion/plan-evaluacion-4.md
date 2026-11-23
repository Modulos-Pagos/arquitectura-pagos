# Plan de trabajo — Evaluación 4: Entrega integrada en workstation

**Pauta:** `TITEC_Especificacion_Evaluacion_4_Entrega_integrada.docx` — los 16 ítems de la Evaluación 1, ahora
verificados **sobre lo instalado en workstation** y con las integraciones funcionando contra las contrapartes reales.
Vale 30%: entrega integrada (20%) y presentación (10%), con la misma rúbrica.

| Fecha | Qué pasa |
|---|---|
| Lunes 23/11, 14:30 | Plazo del ayudante para informar las correcciones de la Entrega 3. En la tarde instala los componentes y avisa si algo falla. |
| Lunes 23 a miércoles 25 | Verificar la instalación en workstation (todos los módulos) y subir los cambios que hagan falta. |
| **Miércoles 25/11, 14:30** | **Cierre:** rama `main` actualizada, producto funcionando en workstation y enlace a la rama en el aula virtual. Lo que se suba después no cuenta. |
| **Miércoles 25/11, desde 16:15** | **Presentación de Pagos: 3.º en el bloque** (después de Entradas/inventario y Notificaciones). 10 min + 5 de preguntas, todo el grupo presente; presenta el Scrum Master. |
| Miércoles 2/12, 14:30 | Entrega 5 (solo si la nota grupal de la Entrega 4 es menor que 5,0 o no hay acuerdo de todos para no hacerla). |

> Reglas que más pesan: **no se acepta modo local**; toda funcionalidad visible que falle cuenta en contra (si no
> está lista, mejor que no sea accesible); una integración que solo funciona contra mocks **no** se considera lograda.

## 1. Estado por ítem de la rúbrica

| Ítem | Qué se verifica | Evidencia que ya existe | Qué falta | Responsable |
|---|---|---|---|---|
| **BE1** Servicios propios | Swagger y que respondan en workstation | `backend/docs/openapi.yaml`, Swagger en `http://localhost:3004/api-docs`; casos E4-00, I2.5–I2.7 y R.3 de la colección | Mostrar Swagger **en el workstation** y la colección ejecutada ahí | Cristóbal |
| **BE2** Servicios de otros squads | Invocaciones contra la contraparte real, con manejo de errores | `auth.client.ts`, `entradas.client.ts`, `rabbitmq.publicador.ts`; `/api-docs/consumidos`; errores 401/403/422/503 | Que **Auth levante su servicio** en workstation (el 19/11 no estaba); colección I1/I2 verde | Cristóbal |
| **BE3** Servicios que otros requieren | Disponibles y consumidos por esos módulos | Eventos `pago.realizado` (Entradas, cola `entradas.pagos`) y `pago.completado` (Promociones); `GET /api/pagos/{id}`; casos I3.6–I3.7 | Confirmar que **Promociones esté instalado y consumiendo** `pago.completado`; si no, decirlo y mostrar el mensaje en la cola | Cristóbal y Ricardo |
| **BD1** Soporte a lo instalado | Diagrama generado **desde la base del workstation** y consultas | Comando de `backend/docs/base-de-datos/README.md` (abre el diagrama con origen `pagos-db` y filas por tabla); consultas en el mismo archivo | Ejecutarlo en workstation y guardar captura | Alonso |
| **BD2** Sin datos de otros squads | Solo identificadores de referencia | `id_reserva`, `id_usuario`, `id_evento`, `nombre_codigo` sin FK; explicado en el diagrama | — | Alonso |
| **BD3** Nomenclatura y documentación | Diagrama y diccionario | `diccionario-datos.md` (regenerado desde la base; `email` del destinatario ahora nulo) y `COMMENT ON` en `schema.sql` | — | Alonso |
| **BD4** Diseño técnico | PK, FK, tipos, nulos, sin ciclos | 4 tablas, todas las FK a `pagos`, sin ciclos | — | Alonso |
| **UI1** Funcionalidades funcionando | Flujos completos sin errores en workstation | Módulo `/pagos` del front común (PR #18 de FrontendTitec) | Recorrer el flujo **en workstation** con la versión actual del front común; ocultar lo que no funcione | Pablo |
| **UI2** Información para la tarea | Datos propios y de otros módulos | Perfil desde Auth (nombre, RUT, correo), reserva desde Entradas (total, cantidad), estado del pago | Revisar mensajes de error y validaciones en pantalla | Pablo |
| **UI3** Estándares y navegación | Navegación transparente entre módulos | `frontend/ESTANDARES_UI.md`, checklist visual | **Que no haya que escribir URLs a mano** para ir de Auth a Entradas y de Entradas a Pagos (el 19/11 hubo que corregir la barra de direcciones) | Pablo |
| **GE1** Planificación | Sprints, historias y responsables, incluido el sprint de esta entrega | Milestones 1, 5 y 6 | Crear el milestone de la Entrega 4 con sus historias y responsables; asignar sprint a HU 4.1–4.6 (están cerradas sin milestone) | Simón |
| **GE2** Documentación de historias | Descripción, criterios, DoD y política de seguridad | Las HU tienen criterios Gherkin, DoD y seguridad | Agregar DoD y política de seguridad a INT-01…INT-05 (no la tienen) | Simón y Ricardo |
| **GE3** Avance consistente | Estado de las historias = lo que funciona en workstation | — | Cerrar los issues de la Evaluación 3 (#35–#43) ya verificados; decidir HU 3.1, 3.3 y 3.4 (ver sección 3) | Simón |
| **GE4** Trabajo de integración | Ítems con criterios, contraparte, contrato y estado consistente | INT-01…INT-05 | Cerrar INT-04 (Promociones) cuando se verifique en workstation; enlazar cada ítem al caso de la colección | Ricardo |
| **CA1** Pruebas de funcionalidad | Pruebas con evidencia de ejecución | 109 pruebas automáticas (`npm test`), evidencia en `backend/docs/evidencias/pruebas-funcionales.txt` | — (evidencia actualizada el 23/11) | Simón |
| **CA2** Pruebas de integración | Éxito y error por integración, **ejecutadas en workstation** | Colección `Workstation-E4` (25 casos, 60 verificaciones) y guía `docs/calidad/pruebas-integracion-workstation.md` | Ejecutarla en workstation y subir el JUnit y la captura | Ricardo |

## 2. Verificación en workstation (antes del miércoles 25, 14:30)

1. **Instalar la versión de la rama** (la versión instalada debe corresponder a la rama entregada). En la terminal de
   VS Code, dentro de `microservicios\pagos`:
   ```bat
   cmd
   git status
   git checkout -- .
   git pull
   cd backend
   docker compose up -d --build
   ```
   `git checkout -- .` descarta cambios locales en archivos versionados (el `.env` no se toca porque git lo ignora).
   Revisar antes con `git status` que no haya algo que alguien quiera conservar.
2. **Comprobar** que sigue la clave de Auth en `backend\.env` (`AUTH_INTERNAL_API_KEY=CAMBIAR_CLAVE_COMPARTIDA_SEGURA`)
   y que responde `curl http://localhost:8080/api/pagos/health`.
3. **Contrapartes arriba:** `docker ps -a` debe mostrar Auth (su servicio, no solo `ticketu-db` y `ticketu-keycloak`),
   `entradas-service`, `ticketu-api-gateway`, `ticketu-rabbitmq` y `frontend-front-1`.
4. **Pruebas de integración:** ejecutar la colección (CA2) y guardar la evidencia.
5. **Base de datos:** generar el diagrama desde `pagos-db` (BD1) y guardar la captura.
6. **Flujo en el front común:** login → Entradas → reservar → Ir a pagar → pagar con `4242 4242 4242 4242` →
   comprobante APROBADO, sin escribir URLs a mano.
7. **GitHub al día** (sección 3) antes de las 14:30.

## 3. Pendientes en GitHub (Gestión)

- Crear el milestone **"Entrega 4 - Entrega integrada en workstation"** (vence el 25/11) y asignarle, con responsable,
  los issues de esta entrega:
  - E4-1 Instalar la versión de `main` en workstation y verificar (Cristóbal).
  - E4-2 Ejecutar la colección `Workstation-E4` en workstation y subir la evidencia (Ricardo).
  - E4-3 Diagrama y consultas desde la base del workstation (Alonso).
  - E4-4 Flujo del front común en workstation sin pasos manuales (Pablo).
  - E4-5 Tablero, responsables y presentación (Simón).
- **Cerrar** #35–#43 (Evaluación 3, verificada el 19/11) con un comentario que diga dónde está la evidencia.
- **HU 3.1 Reembolso total:** está implementada (`POST /api/pagos/{id}/reembolso`) y la prueba R.3 la ejecuta en
  workstation. Moverla al milestone de la Entrega 4 y cerrarla cuando R.3 pase en workstation.
- **HU 3.3 Anulación** y **HU 3.4 Consulta de pagos:** el backend lo soporta (anular un pago PENDIENTE con el mismo
  endpoint; listado `GET /api/pagos` con filtros), pero no hay pantalla. O se cierran como servicios de backend
  probados, o se dejan en "Sprint futuro" con un comentario. Lo importante es que el estado diga la verdad.
- **HU 4.1–4.6** (carrito, cerradas): asignarles el milestone en que se hicieron.
- **INT-01…INT-05:** agregar *Definition of Done* y política de seguridad; cerrar INT-04 cuando Promociones
  consuma `pago.completado` en workstation.

## 4. Guion de la presentación (10 minutos)

| Min | Parte | Qué se muestra en workstation | Quién |
|---|---|---|---|
| 0–3 | Producto funcional (UI) | Login en Auth con `comprador1@ticketu.test` → Entradas → reservar → Ir a pagar → datos del comprador y de la reserva → pagar con `4242…` → comprobante APROBADO. Si da el tiempo, una tarjeta rechazada (`4000 0000 0000 0002`). | Pablo |
| 3–5 | Back End | Swagger propio (`localhost:3004/api-docs`) y de servicios consumidos (`/api-docs/consumidos`); `docker logs pagos-service` con las líneas `[integración]` de Auth, Entradas (con `requestId`) y RabbitMQ; consola de RabbitMQ (`localhost:15672`) con la cola `pagos.eventos`. | Cristóbal |
| 5–7 | Base de Datos | Diagrama generado desde `pagos-db` (HTML), diccionario y la consulta del pago recién hecho (`APROBADO`, solo identificadores de otros módulos). | Alonso |
| 7–8,5 | Gestión | Milestone de la Entrega 4, historias con responsables, criterios, DoD e ítems de integración cerrados según lo que funciona. | Simón |
| 8,5–10 | Calidad | Pruebas automáticas (evidencia) y la colección `Workstation-E4` ejecutada en workstation: tabla final con 0 fallos. | Ricardo |

Preparar antes: sesión iniciada en AnyDesk, pestañas abiertas (front común, Swagger, RabbitMQ, diagrama), una
terminal en `pagos\backend` con `cmd`, y la colección ya ejecutada esa mañana (además de ejecutarla en vivo).

## 5. Observaciones de la auditoría del Platform Team (22/11) y qué se hizo

Fuente: *Informe técnico de auditoría — Platform Team vs. Entrega 4* (evidencias del 22/11/2026 en el workstation).
La auditoría confirmó que Pagos responde igual directo y por el Gateway (200/200, mismo cuerpo SHA-256) y dejó tres
observaciones para Pagos:

| Observación | Causa probable | Qué se hizo (23/11) | Estado |
|---|---|---|---|
| **502 `ERROR_PASARELA` al iniciar el pago** | **Confirmado por el ayudante (23/11):** 2 de 3 intentos fallaron con "Stripe no respondió a tiempo" (~1,28 s) y el tercero funcionó en 1,13 s. El tiempo máximo por llamada a Stripe era 1,2 s y cada pago abría una conexión TLS nueva con Stripe (~1 s desde el workstation). Además, un monto bajo el mínimo de Stripe (~500 CLP) también terminaba en 502. | **Conexión persistente con Stripe** (keep-alive, se abre al arrancar y se mantiene cada 20 s): crear el PaymentIntent pasa de ~490 ms a ~150 ms en nuestras mediciones, así `POST /transacciones` cabe en los 2000 ms que espera Entradas. Tiempo máximo de 10 s (`STRIPE_TIMEOUT_MS`), un reintento seguro con `Idempotency-Key` ante falla de red, cada llamada a Stripe queda en el log (`[integración] … Stripe POST /payment_intents → 200 (480 ms)` o el motivo del error, sin mostrar la llave) y un monto que Stripe no acepta responde `422 MONTO_NO_PERMITIDO`. 4 pruebas nuevas. Se verificó que la llave secreta sigue válida. | Corregido en `main`; **reinstalar Pagos en el workstation** (`git pull` y `docker compose up -d --build`) y ejecutar la colección `Workstation-E4` |
| **Falta la llave publicable `pk_test_…` para el front común** | El front común se construye sin `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, así que la pantalla de pago muestra "Falta la llave de Stripe". | Llave verificada (misma cuenta de prueba que la secreta) y documentada en `INSTALACION.md` sección 6, con el comando para agregarla al build del front común. | **Enviar la llave al Platform Team** para que reconstruya el front común |
| **Probar una transacción real en modo prueba y sus eventos** | — | La colección `Workstation-E4` lo hace contra Auth, Entradas, Stripe y RabbitMQ reales (casos I2.5 a I3.7 y R.1 a R.4). | Ejecutar en el workstation y guardar la evidencia |

Otra observación que nos afecta: la cola **`promociones.pagos` tenía 0 consumidores**. Pagos publica
`pago.completado` correctamente (caso I3.6), pero Promociones debe tener su consumidor activo en el workstation para
que la integración cuente como consumida (BE3). Hay que confirmarlo con Promociones.
