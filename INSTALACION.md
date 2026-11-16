# Instalación del módulo Pagos en workstation (TITEC 2026-2, Evaluación 3)

Guía para instalar y revisar el módulo **sin intervención del equipo**. Todo se instala con Docker.
Qué revisar de cada integración: [`INTEGRACIONES.md`](INTEGRACIONES.md).

> En los comandos, `localhost` es el propio workstation (los puertos publicados por Docker). **Entre contenedores no se
> usa localhost**: Pagos llega a Auth, al API Gateway y a RabbitMQ por sus nombres en la red `plataforma-eventos-net`.

## 1. Requisitos previos

| Requisito | Detalle |
|---|---|
| Docker Engine con Docker Compose v2 | `docker compose version` |
| Red Docker de la plataforma | `plataforma-eventos-net` (la crea el Platform Team; si no existe: `docker network create plataforma-eventos-net`) |
| API Gateway y RabbitMQ del Platform Team | Contenedores `ticketu-api-gateway` (8080) y `ticketu-rabbitmq` (5672, consola 15672), repo [`FWizav/backendticketU`](https://github.com/FWizav/backendticketU) |
| Auth instalado | Alcanzable como `http://auth-service:10000` en la red de la plataforma |
| Entradas instalado (contraparte de I2 e I3) | Alcanzable desde el Gateway (`ENTRADAS_SERVICE_URL` en el `.env` del Gateway) |
| En el `.env` del Gateway | `PAGOS_SERVICE_URL=http://pagos-service:3000` (valor por defecto de su `.env.example`) |

Comprobación rápida de los requisitos:

```bash
docker network inspect plataforma-eventos-net --format '{{range .Containers}}{{.Name}} {{end}}'
curl http://localhost:8080/health          # API Gateway
```

## 2. Instalar

```bash
git clone https://github.com/Modulos-Pagos/arquitectura-pagos.git
cd arquitectura-pagos/backend
cp .env.example .env
```

Editar `.env` y dejar estos valores (el resto queda como viene):

```env
# La misma clave interna que usa Auth en workstation (INTERNAL_API_KEY de Auth). No se sube a GitHub.
AUTH_INTERNAL_API_KEY=<INTERNAL_API_KEY de Auth en workstation>
# Pasarela de pago: mock no necesita llaves. Para cobrar con Stripe en modo prueba, ver la sección 6.
PASARELA=mock
# Dirección pública del front común (a dónde vuelve el comprador después de pagar)
FRONTEND_URL=http://localhost:3000/pagos
```

Levantar:

```bash
docker compose up -d --build
```

Crea dos contenedores: `pagos-db` (PostgreSQL 16; **el esquema y las tablas se crean solos** la primera vez, desde
[`backend/db/schema.sql`](backend/db/schema.sql)) y `pagos-service` (la API). No hay pasos manuales de base de datos.

## 3. Variables de entorno y valores en workstation

Las direcciones de las integraciones se definen en [`backend/docker-compose.yml`](backend/docker-compose.yml) con estos
valores por defecto (nombres de la guía del Platform Team). Si en workstation algún contenedor tiene otro nombre, se
cambia en `backend/.env` con la variable de la tercera columna, sin tocar el código.

| Variable de Pagos | Valor en workstation | Para cambiarlo (`backend/.env`) | Integración |
|---|---|---|---|
| `AUTH_BASE_URL` | `http://auth-service:10000` | `AUTH_URL_DOCKER` | I1 (Auth) |
| `AUTH_INTERNAL_API_KEY` | la `INTERNAL_API_KEY` de Auth | `AUTH_INTERNAL_API_KEY` | I1 (Auth) |
| `API_GATEWAY_URL` | `http://ticketu-api-gateway:8080` | `API_GATEWAY_URL_DOCKER` | I2 (Gateway) |
| `ENTRADAS_RUTA_RESERVA` | `/api/entradas/reservas/{id_reserva}` | `ENTRADAS_RUTA_RESERVA` | I2 (Gateway) |
| `ENTRADAS_MODO` | `http` (Pagos consulta cada reserva por el Gateway) | `ENTRADAS_MODO_DOCKER` | I2 (Gateway) |
| `BROKER_URL` | `amqp://ticketu:ticketu_dev@ticketu-rabbitmq:5672/ticketu` | `BROKER_URL_DOCKER` | I3 (Broker) |
| `BROKER_MODO` | `rabbitmq` | `BROKER_MODO_DOCKER` | I3 (Broker) |
| `EVENT_EXCHANGE` | `ticketu.events` (topic, durable) | `BROKER_EXCHANGE` | I3 (Broker) |
| `DATABASE_URL` | `postgres://postgres:postgres@pagos-db:5432/pagos_db` (red interna de Pagos) | — | — |
| `PASARELA` | `mock` (o `stripe`, sección 6) | `PASARELA` | — |
| `LOG_INTEGRACIONES` | `true` (trazas `[integración]` en el log) | `LOG_INTEGRACIONES` | I1, I2, I3 |

Si falta una dirección obligatoria, `pagos-service` no arranca y el log dice qué variable falta. Si alguna apunta a
`localhost`, lo avisa al arrancar.

## 4. Puertos

| Contenedor | Puerto en el host | Uso |
|---|---|---|
| `pagos-service` | **3004** (→ 3000 del contenedor; se cambia con `PAGOS_PUERTO_HOST` en `.env`) | API y Swagger. El acceso normal es por el Gateway: `http://localhost:8080/api/pagos/...` |
| `pagos-db` | **ninguno** | Solo red interna (`pagos-db:5432`). No choca con las bases de otros módulos |

## 5. Verificar que quedó instalado

```bash
docker ps --filter name=pagos --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
curl http://localhost:8080/api/pagos/health
```

Respuesta esperada (pasando por el API Gateway):

```json
{"estado":"ok","servicio":"microservicio-pagos","base_datos":"ok","pasarela":"mock",
 "entradas":"http","entradas_via":"api-gateway","auth":"validar-sesion","broker":"rabbitmq"}
```

- `"base_datos":"ok"`: la base está creada y conectada.
- `"entradas_via":"api-gateway"`: Pagos llega a Entradas a través del Gateway (I2).
- `"auth":"validar-sesion"` y `"broker":"rabbitmq"`: Auth y broker reales (I1, I3).

Base de datos (tablas creadas): `docker exec pagos-db psql -U postgres -d pagos_db -c '\dt'`

Trazas de las integraciones, con fecha y hora: `docker logs pagos-service 2>&1 | grep integración`

Documentación de la API (Swagger): `http://localhost:3004/api-docs` · servicios que Pagos consume: `http://localhost:3004/api-docs/consumidos`

## 6. Usuarios de prueba

Pagos **no tiene usuarios propios**: usa los usuarios de prueba que publica **Auth** en workstation (comprador,
organizador y staff). Se inicia sesión con ellos; no hay que crear nada en Pagos.

| Rol en Auth | Qué puede hacer en Pagos |
|---|---|
| comprador (`usuario`) / `organizador` | Pagar sus reservas y consultar, anular o reembolsar **solo sus propios** pagos |
| `staff` | Además, consultar y reembolsar pagos de cualquier usuario y eliminar pagos |

**Pago con tarjeta (opcional, Stripe en modo prueba).** Con `PASARELA=mock` no se necesita ninguna llave: el pago se
aprueba con el paso 4b del flujo principal. Para usar el formulario de tarjeta, en `backend/.env`:
`PASARELA=stripe`, `STRIPE_SECRET_KEY=sk_test_...` y `STRIPE_WEBHOOK_SECRET=whsec_...` (las llaves de prueba no se
suben a GitHub; el equipo las entrega por privado), y en el front `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...`.
Tarjeta de prueba: `4242 4242 4242 4242`, cualquier fecha futura y cualquier CVC.

## 7. Flujo principal

**Iniciar sesión como comprador → reservar en Entradas → pagar → ver el pago aprobado.**

### En la interfaz (front común de TicketU)

1. Abrir el front común e iniciar sesión con el usuario **comprador** de Auth.
2. En **Entradas**, elegir un evento pagado y reservar; pulsar el botón que continúa al pago.
3. Se abre la pantalla de **Pagos** (`/pagos?idReserva=...&total=...&cantidad=...`) con los datos del comprador
   (entregados por Auth) y la cantidad y el total de la reserva (verificados con Entradas a través del Gateway).
4. Pagar (con `PASARELA=stripe`, tarjeta `4242 4242 4242 4242`) → **"¡Pago confirmado!"** → **Ver mis entradas**.

### Por consola (no depende del front ni de Stripe)

`<correo>` y `<clave>` son los del usuario comprador de Auth; `<id_evento>` es un evento pagado con stock de Entradas.

```bash
GW=http://localhost:8080

# 1. Iniciar sesión en Auth (guarda la cookie de sesión jwt)
curl -s -c cookies.txt -X POST $GW/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"<correo>","password":"<clave>"}'

# 2. Pagos reconoce la sesión (I1): responde id_usuario, nombre, RUT, correo y rol
curl -s -b cookies.txt $GW/api/pagos/comprador/perfil

# 3. Reservar en Entradas: anotar hold_id y monto_total de la respuesta
curl -s -b cookies.txt -X POST $GW/api/entradas/reservas/hold -H 'Content-Type: application/json' \
  -d '{"id_evento":"<id_evento>","id_usuario":"<id_usuario del paso 2>","cantidad":2,"tiempo_limite_minutos":10}'

# 4. Crear el pago: Pagos verifica la reserva en Entradas por el Gateway (I2) → 201, estado PENDIENTE
curl -s -b cookies.txt -X POST $GW/api/pagos/transacciones -H 'Content-Type: application/json' \
  -d '{"id_reserva":"<hold_id>","total":<monto_total>,"cantidad_entradas":2}'

# 4b. (solo con PASARELA=mock) Aprobar el pago: simula la confirmación de la pasarela
curl -s -X POST $GW/api/pagos/webhooks/stripe -H 'Content-Type: application/json' \
  -d '{"id":"evt_ws_1","type":"payment_intent.succeeded","data":{"object":{"id":"pi_ws_1","object":"payment_intent","metadata":{"id_pago":"<id_pago del paso 4>"}}}}'

# 5. Ver el pago: estado_pago APROBADO, con el id_reserva de Entradas y el id_usuario de Auth
curl -s -b cookies.txt $GW/api/pagos/<id_pago>
```

Al aprobarse el pago, Pagos publica `pago.realizado` en RabbitMQ (I3). Resultado en la base de datos:

```bash
docker exec pagos-db psql -U postgres -d pagos_db -c \
  "SELECT id_pago, id_reserva, id_usuario, monto, estado_pago, fecha_creacion FROM pagos ORDER BY fecha_creacion DESC LIMIT 3;"
```

## 8. Si algo falla

| Síntoma | Revisar |
|---|---|
| `pagos-service` se reinicia | `docker logs pagos-service`: indica la variable que falta (`AUTH_INTERNAL_API_KEY`, `STRIPE_SECRET_KEY`, ...) |
| `/api/pagos/health` da 502 por el 8080 | `PAGOS_SERVICE_URL=http://pagos-service:3000` en el `.env` del Gateway y `pagos-service` en `plataforma-eventos-net` |
| 503 `AUTH_NO_DISPONIBLE` | Auth no responde en `http://auth-service:10000`: ajustar `AUTH_URL_DOCKER` en `.env` y `docker compose up -d` |
| 403 `SERVICIO_NO_AUTORIZADO` | `AUTH_INTERNAL_API_KEY` no es la `INTERNAL_API_KEY` de Auth |
| 503 `ENTRADAS_NO_DISPONIBLE` | El Gateway no llega a Entradas: `ENTRADAS_SERVICE_URL` en el `.env` del Gateway; el log de Pagos dice el motivo |
| `"entradas_via":"directo"` en el health | Hay un `ENTRADAS_URL_DOCKER` en `.env`: borrarlo y `docker compose up -d` |
| Log `RabbitMQ publicar ... → error` | RabbitMQ no disponible o credenciales distintas: `BROKER_URL_DOCKER` en `.env`. Pagos sigue funcionando |
| Cambié `.env` y no se nota | `docker compose up -d` (recrea el contenedor) |

Reinstalar desde cero (borra los datos de Pagos): `docker compose down -v && docker compose up -d --build`
