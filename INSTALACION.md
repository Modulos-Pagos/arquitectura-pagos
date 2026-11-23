# Instalación del módulo Pagos en workstation (TITEC 2026-2, Evaluación 3)

Guía para instalar y revisar el módulo **sin intervención del equipo**. Todo se instala con Docker.
Qué revisar de cada integración: [`INTEGRACIONES.md`](INTEGRACIONES.md).

> En los comandos, `localhost` es el propio workstation (los puertos publicados por Docker). **Entre contenedores no se
> usa localhost**: Pagos llega a Auth, al API Gateway y a RabbitMQ por sus nombres en la red `plataforma-eventos-net`.

## 0. Workstation Windows: comandos para copiar y pegar en `cmd`

Todo lo necesario para instalar y revisar Pagos, en el orden en que se ejecuta. Cada bloque se copia completo y se
pega en una ventana de **Símbolo del sistema (`cmd`)**. Las secciones 1 a 8 explican cada paso en detalle.

> **Terminal de VS Code:** en Windows abre PowerShell, donde `curl` y `&&` funcionan distinto. Antes de pegar, escribir
> `cmd` y Enter (o elegir *Command Prompt* en la flecha junto al `+` de la terminal). El `.env` también se puede editar
> directamente en VS Code en vez de `notepad`.

**0.1 Comprobar lo que Pagos necesita de la plataforma** (red, Gateway, RabbitMQ, Auth y Entradas ya instalados):

```bat
docker network inspect plataforma-eventos-net >nul && echo Red plataforma-eventos-net OK
docker ps --format "table {{.Names}}\t{{.Status}}"
```

Deben aparecer `ticketu-api-gateway`, `ticketu-rabbitmq`, `ticketu-auth-service` (Auth) y `entradas-service`.

**0.2 Descargar Pagos y crear su configuración:**

```bat
git clone https://github.com/Modulos-Pagos/arquitectura-pagos.git
cd arquitectura-pagos\backend
copy /Y .env.workstation.example .env
```

**0.3 Poner la clave interna de Auth** (la misma `INTERNAL_API_KEY` que usan Auth y Entradas). Esta línea la copia
directamente desde el contenedor de Auth al `.env` de Pagos, sin mostrarla:

```bat
powershell -NoProfile -Command "$k=(docker exec ticketu-auth-service printenv INTERNAL_API_KEY).Trim(); if(-not $k){throw 'No se pudo leer INTERNAL_API_KEY de Auth'}; (Get-Content .env) | ForEach-Object { if($_ -like 'AUTH_INTERNAL_API_KEY=*'){'AUTH_INTERNAL_API_KEY=' + $k} else {$_} } | Set-Content -Encoding ascii .env"
findstr /C:"<INTERNAL_API_KEY" .env >nul && echo FALTA LA CLAVE: revisar el paso 0.3 || echo Clave de Auth configurada
```

Si el contenedor de Auth tiene otro nombre, verlo con `docker ps` y cambiar `ticketu-auth-service` en la línea. Alternativa
manual: `notepad .env` y reemplazar `<INTERNAL_API_KEY de Auth en workstation>` por la clave.

Comprobar que Entradas usa **la misma** clave (si muestra `CAMBIAR_CLAVE_COMPARTIDA_SEGURA`, Entradas no la tiene
configurada y rechazará las reservas):

```bat
docker exec entradas-service printenv INTERNAL_API_KEY
```

**0.4 Levantar Pagos** (la base y sus tablas se crean solas):

```bat
docker compose up -d --build
```

**0.5 Verificar la instalación** (esperar unos segundos después del paso anterior):

```bat
curl http://localhost:8080/api/pagos/health
docker ps --filter name=pagos --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker exec pagos-db psql -U postgres -d pagos_db -c "\dt"
```

El health debe responder `"base_datos":"ok"`, `"pasarela":"stripe"`, `"entradas":"http"`,
`"entradas_via":"api-gateway"`, `"auth":"validar-sesion"` y `"broker":"rabbitmq"`.

**0.6 I1 Auth:** iniciar sesión con el comprador QA y comprobar perfil, rechazos y restricción por rol:

```bat
curl -s -c cookies.txt -X POST http://localhost:8080/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"comprador1@ticketu.test\",\"password\":\"TicketuQA2026!\"}"
curl -s -b cookies.txt http://localhost:8080/api/pagos/comprador/perfil
curl -s -i http://localhost:8080/api/pagos/comprador/perfil
curl -s -i http://localhost:8080/api/pagos/comprador/perfil -H "Cookie: jwt=eyJhbGciOiJIUzI1NiJ9.token.alterado"
curl -s -b cookies.txt "http://localhost:8080/api/pagos?id_usuario=otro-usuario"
```

Esperado: perfil `200` con `id_usuario`, nombre, RUT, correo y rol · sin sesión `401` · token alterado `401` · pagos de
otro usuario `403 NO_AUTORIZADO`.

**0.7 I2 Entradas por el API Gateway:** reservar un evento pagado y crear el pago. En el primer comando reemplazar
`<id_usuario>` por el que mostró el perfil; en el segundo, `<hold_id>` y `<monto_total>` por los que devuelve Entradas:

```bat
curl -s -b cookies.txt -X POST http://localhost:8080/api/entradas/reservas/hold -H "Content-Type: application/json" -d "{\"id_evento\":\"evt-77889\",\"id_usuario\":\"<id_usuario>\",\"cantidad\":2,\"tiempo_limite_minutos\":10}"
curl -s -b cookies.txt -X POST http://localhost:8080/api/pagos/transacciones -H "Content-Type: application/json" -d "{\"id_reserva\":\"<hold_id>\",\"total\":<monto_total>,\"cantidad_entradas\":2}"
docker logs pagos-service 2>&1 | findstr /C:"Entradas GET"
docker logs ticketu-api-gateway 2>&1 | findstr /C:"module=entradas"
```

Esperado: el pago se crea (`201`, `PENDIENTE`) y la misma llamada aparece en el log de Pagos (`vía API Gateway,
requestId=...`) y en el del Gateway con el **mismo `requestId`**.

**0.8 I3 Broker:** pagar (en el front común con la tarjeta `4242 4242 4242 4242`, sección 7) y revisar la publicación:

```bat
docker logs pagos-service 2>&1 | findstr /C:"RabbitMQ publicar"
docker exec ticketu-rabbitmq rabbitmqctl list_queues -p ticketu name messages
docker exec pagos-db psql -U postgres -d pagos_db -c "SELECT id_reserva, id_usuario, monto, estado_pago, fecha_creacion FROM pagos ORDER BY fecha_creacion DESC LIMIT 3;"
```

Esperado: `RabbitMQ publicar pago.realizado → confirmado`, la cola `pagos.eventos` con mensajes (la de Entradas,
`entradas.pagos`, los consume) y la fila del pago en `APROBADO`.

**0.9 Todas las pruebas de integración de una vez** (Evaluación 4): la colección `Workstation-E4` ejecuta los casos
de éxito y error de I1, I2 e I3 contra las contrapartes reales, con Newman en Docker (no hay que instalar nada):

```bat
mkdir postman\resultados 2>nul
for /f "tokens=1,* delims==" %A in ('findstr /B "STRIPE_SECRET_KEY=" .env') do @set STRIPE_KEY=%B
docker run --rm --network plataforma-eventos-net -v "%cd%\postman:/etc/newman" postman/newman run Workstation-E4.postman_collection.json -e workstation.postman_environment.json --env-var stripeSecretKey=%STRIPE_KEY% --reporters cli,junit,json --reporter-junit-export resultados/workstation-e4.junit.xml --reporter-json-export resultados/workstation-e4.json --color off
```

Esperado: `assertions … failed 0`. Detalle de cada caso: [`docs/calidad/pruebas-integracion-workstation.md`](docs/calidad/pruebas-integracion-workstation.md).
Diagrama relacional generado desde la base del workstation: [`backend/docs/base-de-datos/README.md`](backend/docs/base-de-datos/README.md).

**Si algo falla:** `docker logs pagos-service` dice qué variable falta; ver la sección 8.

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
cp .env.workstation.example .env
```

[`backend/.env.workstation.example`](backend/.env.workstation.example) ya trae todos los valores del workstation.
Editar `.env` y completar **solo** esta línea (no se sube a GitHub):

```env
# La misma clave interna que usa Auth en workstation (INTERNAL_API_KEY de Auth)
AUTH_INTERNAL_API_KEY=<INTERNAL_API_KEY de Auth en workstation>
```

El archivo ya trae la pasarela **Stripe en modo prueba** con las llaves de prueba del equipo (sección 6): no hay que
agregar nada más para pagar con tarjeta.

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
| `EVENT_EXCHANGE` | `ticketu.events` (topic, durable) | `EVENT_EXCHANGE` | I3 (Broker) |
| `BROKER_COLA_VERIFICACION` | `pagos.eventos`: cola durable propia enlazada a `pago.*`, para ver cada mensaje en la consola | `BROKER_COLA_VERIFICACION` | I3 (Broker) |
| `DATABASE_URL` | `postgres://postgres:postgres@pagos-db:5432/pagos_db` (red interna de Pagos) | — | — |
| `PASARELA` | `stripe` en modo prueba, con `STRIPE_SECRET_KEY=sk_test_...` (o `mock`, sección 6) | `PASARELA` | — |
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
{"estado":"ok","servicio":"microservicio-pagos","base_datos":"ok","pasarela":"stripe",
 "entradas":"http","entradas_via":"api-gateway","auth":"validar-sesion","broker":"rabbitmq"}
```

- `"base_datos":"ok"`: la base está creada y conectada.
- `"entradas_via":"api-gateway"`: Pagos llega a Entradas a través del Gateway (I2).
- `"auth":"validar-sesion"` y `"broker":"rabbitmq"`: Auth y broker reales (I1, I3).

Base de datos (tablas creadas): `docker exec pagos-db psql -U postgres -d pagos_db -c '\dt'`

Trazas de las integraciones, con fecha y hora: `docker logs pagos-service 2>&1 | grep integración`

Documentación de la API (Swagger): `http://localhost:3004/api-docs` · servicios que Pagos consume: `http://localhost:3004/api-docs/consumidos`

## 6. Usuarios de prueba

Pagos **no tiene usuarios propios**: usa los usuarios QA que crea **Auth** en workstation (seed de Auth,
[`equipo-auth/arquitectura` · `INSTALACION.md` § 4](https://github.com/equipo-auth/arquitectura/blob/main/INSTALACION.md)).
Contraseña común de las cuentas ficticias: **`TicketuQA2026!`**. No hay que crear nada en Pagos.

| Usuario de Auth | Rol | Qué puede hacer en Pagos |
|---|---|---|
| `comprador1@ticketu.test` (también `comprador2`, `comprador3`) | `usuario` | Pagar sus reservas y consultar, anular o reembolsar **solo sus propios** pagos |
| `organizador1@ticketu.test` | `organizador` | Igual que el comprador, sobre sus propios pagos |
| `staff1@ticketu.test` (también `staff2`, `staff3`) | `staff` | Además, consultar y reembolsar pagos de cualquier usuario y eliminar pagos |

Eventos pagados para reservar: los crea la semilla de Entradas al instalarse (por ejemplo `evt-77889`,
*Concierto Sinfónico TicketU*); el hold dura el tiempo que define Entradas (15 minutos).

**Pago con tarjeta (Stripe en modo prueba, no mueve dinero real).** `backend/.env.workstation.example` ya trae
`PASARELA=stripe` y la llave secreta de prueba del equipo. El **front común** necesita la llave publicable de la misma
cuenta al construirse (build arg `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`):

```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51UAXQpJSw5u9Hxp8AHwd9H19BED1kNB8M2lt0Hb0zi9r1AY63lO89ykP86V2NUO46yTHqGgbSzJAABeZVZ9HIoWO00ecgJ1rZL
```

Es una llave **publicable** (pensada para ir en el navegador; no permite cobrar ni leer datos) y pertenece a la misma
cuenta de prueba que la llave secreta de `backend/.env.workstation.example` (verificado el 23/11/2026). La agrega el
**Platform Team** al construir el front común (FrontendTitec ya la recibe en su `docker-compose.yml` y `Dockerfile`).
En el workstation, dentro de la carpeta del front común, en `cmd`:

```bat
echo NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51UAXQpJSw5u9Hxp8AHwd9H19BED1kNB8M2lt0Hb0zi9r1AY63lO89ykP86V2NUO46yTHqGgbSzJAABeZVZ9HIoWO00ecgJ1rZL>> .env
docker compose up -d --build
```

Sin esa llave, la pantalla de pago muestra "Falta la llave de Stripe" y no se puede pagar con tarjeta.

Tarjeta de prueba: `4242 4242 4242 4242`, cualquier fecha futura y cualquier CVC. Para no usar Stripe:
`PASARELA=mock` en `backend/.env` y el pago se aprueba con el paso 4b del flujo por consola.

El webhook de Stripe no llega al workstation (no tiene dirección pública), y no hace falta: al abrir la confirmación,
`GET /api/pagos/{id_pago}` consulta el estado en Stripe y deja el pago en `APROBADO` si quedó cobrado
([`backend/src/pagos/pago.service.ts`](backend/src/pagos/pago.service.ts), `sincronizarConPasarela`).

## 7. Flujo principal

**Iniciar sesión como comprador → reservar en Entradas → pagar → ver el pago aprobado.**

### En la interfaz (front común de TicketU)

1. Abrir el front común e iniciar sesión con el usuario **comprador** de Auth.
2. En **Entradas**, elegir un evento pagado y reservar; pulsar el botón que continúa al pago.
3. Se abre la pantalla de **Pagos** (`/pagos?idReserva=...&total=...&cantidad=...`) con los datos del comprador
   (entregados por Auth) y la cantidad y el total de la reserva (verificados con Entradas a través del Gateway).
4. Pagar (con `PASARELA=stripe`, tarjeta `4242 4242 4242 4242`) → **"¡Pago confirmado!"** → **Ver mis entradas**.

### Por consola (no depende del front ni de Stripe)

Usuario comprador de Auth: `comprador1@ticketu.test` / `TicketuQA2026!`. `<id_evento>` es un evento pagado con stock
de Entradas (por ejemplo `evt-77889`).

```bash
GW=http://localhost:8080

# 1. Iniciar sesión en Auth (guarda la cookie de sesión jwt)
curl -s -c cookies.txt -X POST $GW/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"comprador1@ticketu.test","password":"TicketuQA2026!"}'

# 2. Pagos reconoce la sesión (I1): responde id_usuario, nombre, RUT, correo y rol
curl -s -b cookies.txt $GW/api/pagos/comprador/perfil

# 3. Reservar en Entradas: anotar hold_id y monto_total de la respuesta
curl -s -b cookies.txt -X POST $GW/api/entradas/reservas/hold -H 'Content-Type: application/json' \
  -d '{"id_evento":"<id_evento>","id_usuario":"<id_usuario del paso 2>","cantidad":2,"tiempo_limite_minutos":10}'

# 4. Crear el pago: Pagos verifica la reserva en Entradas por el Gateway (I2) → 201, estado PENDIENTE
curl -s -b cookies.txt -X POST $GW/api/pagos/transacciones -H 'Content-Type: application/json' \
  -d '{"id_reserva":"<hold_id>","total":<monto_total>,"cantidad_entradas":2}'

# 4b. Pagar. Con PASARELA=stripe: confirmar el PaymentIntent con la tarjeta de prueba de Stripe (pm_card_visa).
#     <pi_id> es el client_secret del paso 4 hasta "_secret_" (pi_...); <sk_test> está en backend/.env
curl -s https://api.stripe.com/v1/payment_intents/<pi_id>/confirm -u <sk_test>: -d payment_method=pm_card_visa
#     Con PASARELA=mock, en cambio, simular la confirmación de la pasarela:
curl -s -X POST $GW/api/pagos/webhooks/stripe -H 'Content-Type: application/json' \
  -d '{"id":"evt_ws_1","type":"payment_intent.succeeded","data":{"object":{"id":"pi_ws_1","object":"payment_intent","metadata":{"id_pago":"<id_pago del paso 4>"}}}}'

# 5. Ver el pago: estado_pago APROBADO (con Stripe, esta consulta sincroniza el estado), con el id_reserva de
#    Entradas y el id_usuario de Auth
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
| 502 `ERROR_PASARELA` al iniciar el pago | `docker logs pagos-service 2>&1 \| findstr Stripe` muestra el motivo exacto: sin respuesta (red o `STRIPE_TIMEOUT_MS`, por defecto 10 s, con un reintento; la conexión con Stripe se mantiene abierta para responder en menos de 2 s), llave secreta rechazada (`STRIPE_SECRET_KEY`) u otro error de Stripe |
| 422 `MONTO_NO_PERMITIDO` | Stripe no cobra montos menores a ~50 centavos de dólar (unos 500 CLP): usar un evento con precio mayor |
| "Falta la llave de Stripe" en la pantalla de pago | El front común se construyó sin `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (sección 6) |
| Cambié `.env` y no se nota | `docker compose up -d` (recrea el contenedor) |

Reinstalar desde cero (borra los datos de Pagos): `docker compose down -v && docker compose up -d --build`
