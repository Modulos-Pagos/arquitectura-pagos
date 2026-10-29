# Microservicio de Pagos — TicketU (TITEC 2026-2)

Módulo **Pagos** del proyecto TicketU (venta de entradas para eventos universitarios).
Cobra las entradas de los eventos pagados con **Stripe Checkout**, informa el estado del pago a **Entradas/Inventario**,
entrega el `id_pago` a **Promociones** y permite **anular o reembolsar** cuando Entradas libera una reserva.

**v2.4 — integración con la plataforma:** rutas bajo el API Gateway (`/api/pagos/**`), red Docker `plataforma-eventos-net`,
eventos `pago.*` en RabbitMQ (`ticketu.events`), sesión validada con **Auth** y opción de **comprar la entrada para otra persona**
(ver [§ 6](#6-integración-con-la-plataforma-ticketu)).

**v2.7 — contratos Auth ↔ Pagos v1.3 y Pagos ↔ Entradas v2.3:** la sesión llega solo en la cookie `jwt` y Pagos la valida
con Auth (`GET /internal/validar-sesion` + `x-api-key`) en cada petición; roles `usuario`, `organizador` y `staff`;
ya no se aceptan `Authorization: Bearer` ni `token_sesion`; si Auth no responde, 503 y no se cobra (ver § 6).

**v2.8 — alineado 1:1 con esos dos contratos:** Pagos ya no tiene modo mock ni `JWT_SECRET` (no valida JWT por su cuenta;
para desarrollar se usa un Auth simulado aparte, `npm run auth:simulado`); llama a Auth en cada petición, también sin cookie;
staff consulta y anula/reembolsa pagos ajenos pero no los paga; la ruta de Entradas es la del contrato
(`GET /api/entradas/reservas/{id_reserva}`); el front redirige a `/login` con 401.

**v2.5/2.6 — contrato Promociones ↔ Pagos y guía del Platform Team:** `POST /transacciones` acepta el código de descuento (`nombre_codigo`), se guarda junto al
`id_evento` y, al aprobarse el pago, se publica `pago.completado` para que Promociones descuente un uso del código.
Los eventos usan los nombres, el RabbitMQ (`ticketu-rabbitmq`, vhost `ticketu`) y el formato de sobre del repo del Platform Team.

**Stack:** Node.js 22 · TypeScript · Express 5 · PostgreSQL (local, Docker o Supabase) · Stripe · OpenAPI 3 · Postman/Newman · `node:test`

| Evidencia (rúbrica) | Dónde está |
|---|---|
| BE1: Swagger de servicios propios | [`docs/openapi.yaml`](docs/openapi.yaml) → `http://localhost:3004/api-docs` (`npm run dev` o Docker) |
| BE2: Invocación a servicios de otros squads | [`src/integraciones/entradas.client.ts`](src/integraciones/entradas.client.ts) · [`src/integraciones/auth.client.ts`](src/integraciones/auth.client.ts) · [`docs/openapi-servicios-consumidos.yaml`](docs/openapi-servicios-consumidos.yaml) → `/api-docs/consumidos` |
| BE3: Swagger de servicios para otros módulos | Tags **Entradas (consumidor)** y **Promociones (consumidor)** en `/api-docs` |
| BD1–BD4: Diagrama relacional | [`docs/base-de-datos/diagrama-relacional.md`](docs/base-de-datos/diagrama-relacional.md) (generado desde la BD) |
| BD3: Script de creación + diccionario | [`db/schema.sql`](db/schema.sql) · [`docs/base-de-datos/diccionario-datos.md`](docs/base-de-datos/diccionario-datos.md) |
| CA1: Pruebas de funcionalidad | [`tests/`](tests) · resultado en [`docs/evidencias/pruebas-funcionales.txt`](docs/evidencias/pruebas-funcionales.txt) |
| CA2: Pruebas de integración | [`postman/`](postman) (colección + entorno) · [`docs/evidencias/postman-integracion.junit.xml`](docs/evidencias/postman-integracion.junit.xml) · eventos en RabbitMQ: [`docs/evidencias/prueba-rabbitmq-docker.txt`](docs/evidencias/prueba-rabbitmq-docker.txt) |
| Responsables por rol | [`RESPONSABLES.md`](../RESPONSABLES.md) |

---

## 1. Flujo de pago (contrato v2.1 con Entradas)

```mermaid
sequenceDiagram
    autonumber
    participant E as Entradas/Inventario
    participant P as Pagos
    participant DB as PostgreSQL (Pagos)
    participant S as Stripe
    actor U as Comprador

    E->>P: POST /api/v1/pagos/transacciones {id_reserva, total, cantidad_entradas, id_evento?} + header Cookie jwt=... del comprador
    P->>DB: ¿existe pago para id_reserva? (idempotencia)
    P->>E: GET /api/entradas/reservas/{id_reserva} (verifica total y cantidad)
    P->>S: POST /v1/checkout/sessions (CLP)
    P->>DB: INSERT pago PENDIENTE
    P-->>E: 201 {id_pago, estado_pago: PENDIENTE, fecha_creacion, url_checkout} (< 2000 ms)
    E-->>U: redirige a url_checkout
    U->>S: paga con tarjeta
    S->>P: webhook checkout.session.completed (firmado)
    P->>DB: PENDIENTE → APROBADO
    loop cada pocos segundos (MVP con polling)
        E->>P: GET /api/v1/pagos/{id_pago}
        P-->>E: {estado_pago: APROBADO}
    end
    opt Hold de la reserva vencido
        E->>P: POST /api/v1/pagos/{id_pago}/reembolso (con la cookie del comprador)
        P->>S: POST /v1/refunds (o expira la sesión si aún no pagó)
        P-->>E: {estado_pago: REEMBOLSADO | ANULADO}
    end
```

Si el webhook no llega (servidor sin URL pública), el `GET /{id_pago}` consulta la sesión en Stripe y actualiza el estado.
Además, cada cambio de estado se **publica en RabbitMQ** (`pago.realizado`, `pago.rechazado`, `pago.anulado`, `pago.reembolsado`),
así Entradas puede emitir la entrada sin esperar al polling. El polling se mantiene como respaldo.
Por el API Gateway las mismas rutas quedan como `/api/pagos/...` (ver § 6).

### Estados del pago

```mermaid
stateDiagram-v2
    [*] --> PENDIENTE: POST /transacciones
    PENDIENTE --> APROBADO: Stripe confirma el pago
    PENDIENTE --> RECHAZADO: sesión expirada / pago fallido
    PENDIENTE --> ANULADO: Entradas anula antes del pago
    APROBADO --> REEMBOLSADO: Entradas pide reembolso
```

### Dos formas de cobrar (`metodo`)

| `metodo` | `url_checkout` apunta a | Cómo paga el usuario |
|---|---|---|
| `formulario` (**por defecto**) | Front de Pagos: `http://localhost:5173/?id_pago=...` | Formulario del equipo (Stripe Elements); la tarjeta va directo del navegador a Stripe |
| `checkout` | Página alojada por Stripe (Stripe Checkout) | En la página de Stripe |

Entradas crea el pago y redirige al usuario a `url_checkout`. El front obtiene monto y `client_secret` con
`GET /api/v1/pagos/{id_pago}/checkout`, cobra con Stripe y el estado se consulta con `GET /api/v1/pagos/{id_pago}`.

## 2. Endpoints

| Método | Ruta | Consumidor | Historias |
|---|---|---|---|
| `POST` | `/api/v1/pagos/transacciones` | Entradas | HU 1.1, HU 1.3 |
| `GET` | `/api/v1/pagos/{id_pago}` | Entradas (polling), front | HU 1.4, HU 1.6 |
| `GET` | `/api/v1/pagos/{id_pago}/checkout` | Front de Pagos | HU 1.1 |
| `POST` | `/api/v1/pagos/{id_pago}/reembolso` | Entradas | HU 3.1, HU 3.3 |
| `GET` | `/api/v1/pagos?id_usuario=&id_reserva=&estado=` | **Promociones**, front | HU 3.4 |
| `DELETE` | `/api/v1/pagos/{id_pago}` | Administración (rol `staff`) | Eliminar pagos RECHAZADOS/ANULADOS de la BD |
| `POST` | `/api/v1/pagos/webhooks/stripe` | Stripe | HU 1.3, HU 1.4 |
| `GET` | `/api/v1/pagos/comprador/perfil` | Front de Pagos | Perfil del comprador según la sesión de Auth (prellenar) |
| `PUT` | `/api/v1/pagos/{id_pago}/destinatario` | Front de Pagos | La entrada es para otra persona (solo pago PENDIENTE) |
| `DELETE` | `/api/v1/pagos/{id_pago}/destinatario` | Front de Pagos | La entrada vuelve a ser para el comprador |
| `GET` | `/health` | plataforma | — |

Todas las rutas existen también con el prefijo del Gateway: `/api/v1/pagos/X` = `/api/pagos/X` (y `/api/pagos/health`).

### Política de autorización

Sesión de **Auth** en la cookie `jwt` (contrato Auth ↔ Pagos v1.3), validada con Auth en cada petición. El `id_usuario` y el rol
(`usuario`, `organizador`, `staff`) vienen de Auth, nunca del body, la URL ni el JWT. Entradas reenvía el header `Cookie` del comprador.

| Operación | Dueño (`usuario`/`organizador`) | Otro usuario | Rol `staff` |
|---|---|---|---|
| Crear transacción | Sí | No aplica | Sí |
| Consultar pago | Sí, solo los suyos | No (403) | Sí |
| Listar pagos | Sí, solo los suyos | No (403) | Sí, todos |
| Anular / reembolsar | Sí, solo los suyos | No (403) | Sí |
| Eliminar pago | No (403) | No (403) | Sí |
| Definir / quitar destinatario | Sí, solo los suyos y PENDIENTE (si no, 409) | No (403) | Sí |
| Webhook Stripe | sin sesión, se valida la firma `Stripe-Signature` | | |

### Operaciones sobre la base de datos (crear, modificar, eliminar y consultar)

| Operación | SQL | Endpoint |
|---|---|---|
| Crear | `INSERT INTO pagos` · `INSERT INTO destinatarios_pago` (upsert) | `POST /api/v1/pagos/transacciones` · `PUT /{id_pago}/destinatario` |
| Modificar | `UPDATE pagos SET estado_pago` (+ `INSERT INTO reembolsos`) | `POST /{id_pago}/reembolso`, webhook y polling |
| Eliminar | `DELETE FROM pagos` (solo RECHAZADO/ANULADO, rol staff) · `DELETE FROM destinatarios_pago` | `DELETE /api/v1/pagos/{id_pago}` · `DELETE /{id_pago}/destinatario` |
| Consultar | `SELECT` | `GET /api/v1/pagos/{id_pago}`, `GET /api/v1/pagos` |

## 3. Cómo ejecutar

Requisitos: **Node.js 22 o superior** y PostgreSQL (local, Docker o Supabase).

```bash
npm install
cp .env.example .env        # completar DATABASE_URL (y AUTH_BASE_URL + AUTH_INTERNAL_API_KEY para usar Auth real)
npm run db:init             # crea las tablas desde db/schema.sql
npm run auth:simulado       # (otra terminal, solo si no está el Auth real) Auth simulado en :3001
npm run dev                 # http://localhost:3004/api-docs
```

**Con Supabase:** crear el proyecto → *SQL Editor* → pegar y ejecutar [`db/schema.sql`](db/schema.sql) (o `npm run db:init`).
En `.env`: `DATABASE_URL=<connection string de Project Settings > Database>` y `DATABASE_SSL=true`.

**Con Docker (servicio + base de datos propia, en la red de la plataforma):**

```bash
cp .env.example .env
docker network create plataforma-eventos-net   # solo si el Platform Team aún no la creó
docker compose up --build
```

Queda en `http://localhost:3004` (directo, el 3000 del host se deja al front común) y, con el Gateway levantado,
en `http://localhost:8080/api/pagos`. La base del contenedor se publica en el puerto `5433` del host.

Si la base del contenedor ya existía (volumen creado con una versión anterior), aplicar los cambios del esquema sin borrar datos:

```powershell
Get-Content db\schema.sql | docker compose exec -T pagos-db psql -U postgres -d pagos_db
```

### Demo con Stripe real (modo test)

1. Crear cuenta en Stripe (modo test) y copiar la llave `sk_test_...` en `STRIPE_SECRET_KEY`.
2. Instalar [Stripe CLI](https://docs.stripe.com/stripe-cli) y ejecutar:
   `stripe listen --forward-to localhost:3004/api/pagos/webhooks/stripe` → copiar el `whsec_...` en `STRIPE_WEBHOOK_SECRET`.
3. En `.env`: `PASARELA=stripe`, reiniciar con `npm run dev`.
4. Crear un pago (Swagger o Postman), abrir la `url_checkout` y pagar con la tarjeta de prueba `4242 4242 4242 4242` (fecha futura, CVC cualquiera).
5. `GET /api/v1/pagos/{id_pago}` → `APROBADO`.

> CLP no tiene decimales en Stripe: `total: 15000` = $15.000. Stripe exige un monto mínimo equivalente a ~0,50 USD.

### Sesión para probar

Pagos **siempre** valida la sesión con Auth por HTTP (`GET {AUTH_BASE_URL}/internal/validar-sesion`); no verifica JWT por su
cuenta ni tiene modo mock (contrato Auth v1.3, reglas 1 y 6).

- **Con Auth real** (`AUTH_BASE_URL` y la `AUTH_INTERNAL_API_KEY` que entrega Auth): iniciar sesión en Auth y usar la cookie `jwt`
  que deja en el navegador.
- **Sin el servicio de Auth (solo desarrollo):** el **Auth simulado** (`scripts/auth-simulado/`) expone el mismo endpoint del
  contrato. No es parte de Pagos: Pagos lo llama por HTTP igual que al real. En `.env`: `AUTH_BASE_URL=http://localhost:3001` y
  cualquier `AUTH_INTERNAL_API_KEY` (el simulador exige la misma).

```bash
npm run auth:simulado             # terminal aparte: Auth simulado en http://localhost:3001
# Navegador: http://localhost:3001/login?usuario=usr-demo-1&rol=usuario&volver=http://localhost:5173/
#            (deja la cookie jwt HttpOnly y vuelve al checkout; el front redirige ahí solo con 401)
npm run token                     # Postman/curl: usuario usr-demo-1  -> Cookie: jwt=<token del simulado>
npm run token -- usr-staff staff  # staff: consulta y anula/reembolsa pagos de cualquier usuario
```

Los tokens del simulado solo los acepta el simulado: contra el Auth real reciben 401, como exige el contrato.
Swagger UI no puede enviar cookies desde el navegador: los endpoints protegidos se prueban con Postman o con el front.

## 4. Pruebas

| Comando | Qué hace |
|---|---|
| `npm test` | 91 pruebas funcionales y unitarias (`node:test`) contra PostgreSQL real (BD `DATABASE_URL_TEST`, se reinicia en cada corrida). Incluye `tests/plataforma.test.ts` (rutas del Gateway, eventos, Auth y destinatario) y `tests/promociones.test.ts` (código de descuento y `pago.completado`) |
| `RABBITMQ_URL_TEST=amqp://ticketu:ticketu_dev@localhost:5672/ticketu npm test` | Además ejecuta `tests/rabbitmq.test.ts` contra un RabbitMQ real (usuario y vhost del Platform Team): una cola recibe `pago.realizado` (Entradas) y otra `pago.completado` (Promociones) (92 pruebas) |
| `npm run test:evidencia` | Igual, y guarda el resultado en `docs/evidencias/` (evidencia CA1) |
| `npm run test:integracion` | Ejecuta la colección Postman con Newman (servicio levantado con `PASARELA=mock`) y guarda el JUnit en `docs/evidencias/` (evidencia CA2) |

La colección [`postman/Pagos-TITEC.postman_collection.json`](postman/Pagos-TITEC.postman_collection.json) tiene 37 casos con resultado esperado
y 61 aserciones: creación, request de Entradas v2.3 (cookie jwt; Bearer rechazado), idempotencia, validaciones, autorización, webhook, listado para Promociones, reembolso, anulación,
eliminación (DELETE), código de descuento para Promociones (`nombre_codigo`, por las rutas del Gateway `/api/pagos`) y perfil/destinatario. Usa `Cookie: jwt=...` con tokens del Auth simulado (Pagos con `AUTH_BASE_URL` apuntando al simulado).
Importarla junto a [`postman/pagos-local.postman_environment.json`](postman/pagos-local.postman_environment.json) y usar **Run collection**.
Para correrla: `npm run auth:simulado` y `npm run dev` (con `PASARELA=mock`). Si cambian `AUTH_SIMULADO_SECRETO`, regenerar el entorno con `npm run postman:env`. Con Auth real, reemplazar los tokens del entorno por cookies `jwt` emitidas por Auth.

## 5. Base de datos

PostgreSQL con 4 tablas: `pagos`, `reembolsos`, `eventos_webhook_stripe` (deduplicación de avisos de Stripe) y
`destinatarios_pago` (1 a 0..1 con `pagos`: a quién va la entrada cuando se compra para otra persona).
`id_reserva`, `id_usuario`, `id_evento` y `nombre_codigo` son **referencias sin FK** a otros microservicios (Database per Service): no se replican datos de negocio de otros squads.

- Script de creación con diccionario (`COMMENT ON`): [`db/schema.sql`](db/schema.sql)
- `npm run db:docs` lee el catálogo de la base de datos y regenera el [diagrama relacional](docs/base-de-datos/diagrama-relacional.md) y el [diccionario de datos](docs/base-de-datos/diccionario-datos.md).

**¿Por qué PostgreSQL y no MongoDB?** Aplicamos persistencia políglota (cada microservicio elige su BD): un módulo de pagos necesita
transacciones ACID (cambio de estado + reembolso en una sola operación), restricciones `UNIQUE` para garantizar la
idempotencia por `id_reserva` a nivel de base de datos, y `CHECK` para que no existan montos negativos ni estados inválidos.

## 6. Integración con la plataforma TicketU

Sigue el repositorio del Platform Team [`FWizav/backendticketU`](https://github.com/FWizav/backendticketU). Checklist de su § 11:

| Requisito del Platform Team | En Pagos |
|---|---|
| Contenedor en `plataforma-eventos-net` | `docker-compose.yml`, servicio y alias `pagos-service` |
| Nombre igual al del `.env` del Gateway | `PAGOS_SERVICE_URL=http://pagos-service:3000` |
| Endpoints bajo `/api/<modulo>/...` | Todas las rutas en `/api/pagos/...` (y `/api/v1/pagos/...` para compatibilidad directa) |
| Funciona pasando por `http://localhost:8080` | `GET http://localhost:8080/api/pagos/health` |
| Eventos en `ticketu.events` | Exchange topic durable en `ticketu-rabbitmq:5672`, vhost `ticketu` (`BROKER_URL`) |
| Sin URLs de otros servicios en el front | El front usa `NEXT_PUBLIC_GATEWAY_URL` + `/api/pagos` |
| CORS centralizado en el Gateway | Agregar `http://localhost:5173` (front de Pagos) a `CORS_ORIGINS` del Gateway; aquí se puede desactivar con `CORS_ORIGIN=none` |

Servicios que Pagos invoca (dentro de Docker, por la red común): Auth en `http://auth-service:10000/internal/validar-sesion` y
Entradas en `http://entradas-service:3000/api/entradas/reservas/{id_reserva}` (ruta configurable con `ENTRADAS_RUTA_RESERVA`).
Fuera de Docker: `ENTRADAS_BASE_URL=http://localhost:8080` (Gateway) y `AUTH_BASE_URL` = puerto local de Auth
(su endpoint interno no pasa por el Gateway).

### API Gateway

El Gateway del Platform Team (`http://localhost:8080`) reenvía `/api/pagos/**` a `pagos-service:3000` **sin reescribir el path**,
por eso el servicio monta las rutas también bajo `PREFIJO_GATEWAY=/api/pagos`:

| Directo (3000) | Por el Gateway (8080) |
|---|---|
| `POST /api/v1/pagos/transacciones` | `POST /api/pagos/transacciones` |
| `GET /api/v1/pagos/{id_pago}` | `GET /api/pagos/{id_pago}` |
| `POST /api/v1/pagos/webhooks/stripe` | `POST /api/pagos/webhooks/stripe` |
| `GET /health` | `GET /api/pagos/health` |

Variable para el Gateway: `PAGOS_SERVICE_URL=http://pagos-service:3000`. Red Docker común: `plataforma-eventos-net`
(alias `pagos-service`); la base de datos queda en una red interna `pagos-interna`, invisible para otros módulos.

### Eventos en RabbitMQ

| Routing key | Cuándo | Quién lo consume |
|---|---|---|
| `pago.realizado` | Stripe confirma el pago | Entradas (emite la entrada, al destinatario si existe), Notificaciones |
| `pago.rechazado` | Sesión expirada / tarjeta rechazada | Entradas (libera la reserva) |
| `pago.anulado` | Se anula antes de pagar | Entradas |
| `pago.reembolsado` | Se devuelve el dinero | Entradas, Notificaciones |
| `pago.completado` | Stripe confirma el pago | **Promociones** (contrato v1.0: descuenta un uso de `nombre_codigo`) |

Exchange `ticketu.events` (topic, durable), mensajes JSON persistentes, `messageId = id_mensaje` para deduplicar.
Cada consumidor crea **su propia cola durable** y la enlaza a la clave que necesita (por ejemplo `entradas.pagos` → `pago.realizado`,
`promociones.pagos` → `pago.completado`). Cuerpo de `pago.*`:

```json
{ "tipo": "pago.realizado", "version": 1, "id_mensaje": "uuid", "fecha_evento": "ISO-8601",
  "id_pago": "uuid", "id_reserva": "res-123", "id_usuario": "usr-1", "id_evento": "evt-123", "nombre_codigo": "DESC50",
  "estado_pago": "APROBADO",
  "monto": 15000, "moneda": "CLP", "motivo": null,
  "destinatario": { "nombre": "Pedro Soto Fuentes", "email": "pedro@correo.cl", "rut": "12345678-5" },
  "eventId": "uuid", "eventName": "pago.realizado", "occurredAt": "ISO-8601", "source": "pagos-service", "data": { ... } }
```

Los últimos cinco campos son el **sobre** del ejemplo del Platform Team (`event-broker/src/publisher.js`); `data` repite los campos
del contrato. Así sirve tanto a un consumidor que lee `mensaje.id_pago` como a uno que lee `mensaje.data.id_pago`.

Cuerpo de `pago.completado` (contrato Promociones ↔ Pagos v1.0):

```json
{ "tipo": "pago.completado", "version": 1, "id_mensaje": "uuid", "fecha_evento": "ISO-8601",
  "id_pago": "uuid", "id_usuario": "usr-999", "id_evento": "evt-123", "nombre_codigo": "DESC50",
  "eventId": "uuid", "eventName": "pago.completado", "occurredAt": "ISO-8601", "source": "pagos-service", "data": { ... } }
```

`nombre_codigo` llega en `POST /transacciones` (lo envía Entradas) o, si no viene, se toma de la reserva de Entradas.
Si es `null`, Promociones ignora el evento. La clave se cambia con `BROKER_CLAVE_PROMOCIONES` (vacío = no se publica).

`destinatario` es `null` cuando la entrada es para el propio comprador. La publicación es *best effort*: si RabbitMQ no
responde, se registra en el log y el estado del pago igual queda guardado (Entradas puede seguir consultando por polling).
`BROKER_MODO=mock` desactiva la publicación (solo se muestran en el log). Los nombres siguen la guía del Platform Team
(`<recurso>.<hecho-en-pasado>`); `BROKER_SEPARADOR=_` los cambia a `pago_realizado` si otro equipo lo necesitara.

### Auth (contrato Auth ↔ Pagos v1.3) y "comprar para otra persona"

En cada petición protegida, antes de cualquier lógica (middleware `src/middlewares/autenticacion.ts` → `src/integraciones/auth.client.ts`).
El header `Cookie` se reenvía tal como llegó; `Authorization: Bearer` y `token_sesion` se ignoran:

```
GET {AUTH_BASE_URL}/internal/validar-sesion
Cookie: <header Cookie original, con jwt=...>
x-api-key: <AUTH_INTERNAL_API_KEY>
→ 200 { valido: true, usuario: { id_usuario, nombre_completo, rut, correo_electronico, rol } }
```

| Respuesta de Auth | Pagos |
|---|---|
| 200 | Sigue; usa `id_usuario` y `rol` de Auth |
| 401 (sin cookie, token inválido, vencido o revocado) | 401 `NO_AUTENTICADO` (el front redirige a /login) |
| 403 (x-api-key) | 403 `SERVICIO_NO_AUTORIZADO` |
| 500 | 500 |
| Timeout 1000 ms, conexión rechazada u otro 5xx | 503 `AUTH_NO_DISPONIBLE`: no se crea ni cambia ningún pago |

Pagos no guarda RUT, nombre ni correo del comprador, y no registra el token ni datos personales en los logs: el perfil se usa
solo para mostrarlo y prellenar (`GET /comprador/perfil` devuelve la misma respuesta de validar-sesion, sin otra llamada a Auth).
Autorización (regla 7): `usuario` y `organizador` solo operan sobre sus pagos; `staff` consulta pagos de cualquier usuario y los
anula o reembolsa (no los paga ni elige el destinatario). CORS responde con el origen explícito y `Access-Control-Allow-Credentials: true`.

**Comprar para otra persona:** el comprador elige *Para otra persona* y escribe nombre, correo y RUT (Auth no expone búsqueda
de usuarios). Antes de cobrar, el front guarda el destinatario (`PUT /{id_pago}/destinatario`); aparece en `GET /{id_pago}`,
`GET /{id_pago}/checkout` y en el evento `pago.realizado` para que Entradas emita la entrada a su nombre.

### Tabla de dependencias (TITEC 2026-2)

| Dependencia | Dirección | Servicio | Issue |
|---|---|---|---|
| Orden de compra (cantidad, total) | Entradas → Pagos | Recibimos `POST /transacciones`; invocamos `GET /api/entradas/reservas/{id}` | INT-01 |
| Estado del pago y fecha de creación | Pagos → Entradas | `POST /transacciones`, `GET /{id_pago}` y evento `pago.*` | INT-02 |
| `id_pago` | Pagos → Entradas | `POST /transacciones` | INT-03 |
| `id_pago` (+ código usado) | Pagos → Promociones | Evento `pago.completado` (contrato v1.0) y `GET /api/v1/pagos?id_usuario=&estado=APROBADO` | INT-04 |
| Usuario (id, rol) y perfil de la sesión | Auth → Pagos | `GET /internal/validar-sesion` (cookie jwt + x-api-key) | Contrato Auth v1.3 |

## 7. Estructura

```
src/
├── index.ts                     # arranque del servidor
├── app.ts                       # Express: middlewares, Swagger, rutas, manejo de errores
├── contenedor.ts                # arma las dependencias (inyección)
├── config/env.ts                # variables de entorno validadas
├── db/pool.ts                   # conexión a PostgreSQL
├── errores.ts                   # errores de dominio → códigos HTTP
├── middlewares/                 # sesión validada con Auth, CORS, errores
├── integraciones/
│   ├── entradas.client.ts       # INVOCACIÓN al módulo Entradas (BE2)
│   ├── auth.client.ts           # INVOCACIÓN a Auth: GET /internal/validar-sesion
│   ├── eventos/                 # publicación de eventos pago.* (RabbitMQ real y mock)
│   └── pasarela/                # Stripe (real) y pasarela simulada
└── pagos/                       # routes → controller → service → repository (+ DTOs y tipos)
db/schema.sql                    # script de creación + diccionario
docs/                            # Swagger, diagrama, diccionario, evidencias
postman/                         # colección y entorno de pruebas de integración
scripts/                         # db:init, db:docs, token, postman:env
scripts/auth-simulado/           # SOLO DESARROLLO: imita GET /internal/validar-sesion de Auth (npm run auth:simulado)
tests/                           # pruebas funcionales (node:test)
```
