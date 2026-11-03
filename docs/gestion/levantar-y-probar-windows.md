# Levantar todo y probar las integraciones (Windows + Docker Desktop)

Guía para dejar funcionando, en un solo PC, la plataforma TicketU con Pagos, Auth y Entradas, y verificar las dos
integraciones de la Evaluación 2 (I1: Entradas, I2: Auth). Todos los comandos son de **PowerShell**.

## 0. Antes de empezar

**Programas:** Docker Desktop (abierto), Git, Node.js 22 o superior. Opcional: Stripe CLI.

**Archivos:**

| Qué | De dónde |
|---|---|
| Repo de Pagos | `git clone https://github.com/Modulos-Pagos/arquitectura-pagos.git` (o el zip `arquitectura-pagos-eval2.zip`) |
| Front común para la demo (Entradas + Pagos juntos) | zip `FrontendTitec-demo-entradas-pagos.zip` |
| Gateway y RabbitMQ del Platform Team | `git clone https://github.com/FWizav/backendticketU.git` |
| Auth y Entradas (servicios reales) | Repos de esos equipos, con su `docker compose` en la red `plataforma-eventos-net` |

**Datos que se piden por privado (nunca a GitHub):**
- `INTERNAL_API_KEY`: la misma clave en Auth, Entradas y Pagos.
- Un usuario de prueba de Auth (correo y contraseña) y la ruta de su login.
- El id de un evento **pagado** con stock en Entradas.
- Llaves de Stripe en modo prueba: `sk_test_...` y `pk_test_...`.

Todo en una carpeta, por ejemplo `C:\ticketu`:

```powershell
mkdir C:\ticketu; cd C:\ticketu
git clone https://github.com/FWizav/backendticketU.git
git clone https://github.com/Modulos-Pagos/arquitectura-pagos.git
Expand-Archive $HOME\Downloads\FrontendTitec-demo-entradas-pagos.zip -DestinationPath C:\ticketu
```

## 1. Red común (una vez por PC)

```powershell
docker network create plataforma-eventos-net
```

Si dice que ya existe, se sigue.

## 2. RabbitMQ (Platform Team)

```powershell
cd C:\ticketu\backendticketU\event-broker
Copy-Item .env.example .env
docker compose up -d --build
```

Comprobar: abrir http://localhost:15672 (usuario `ticketu`, contraseña `ticketu_dev`).

## 3. API Gateway (Platform Team)

```powershell
cd C:\ticketu\backendticketU\api-gateway
Copy-Item .env.example .env
notepad .env
```

Dejar estas líneas así (Auth escucha en el 10000):

```env
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
AUTH_SERVICE_URL=http://auth-service:10000
ENTRADAS_SERVICE_URL=http://entradas-service:3000
PAGOS_SERVICE_URL=http://pagos-service:3000
```

```powershell
docker compose up -d --build
curl.exe http://localhost:8080/health
```

## 4. Auth y Entradas (servicios reales de los otros equipos)

Levantar cada uno con su `docker compose`, con la **misma** `INTERNAL_API_KEY`. Comprobar que están en la red con
los nombres correctos:

```powershell
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker network inspect plataforma-eventos-net --format "{{range .Containers}}{{.Name}} {{end}}"
```

Deben aparecer `auth-service` y `entradas-service` (además de `ticketu-rabbitmq` y `ticketu-api-gateway`).
Si sus contenedores tienen otro nombre, usar en el `.env` de Pagos `AUTH_URL_DOCKER` y `ENTRADAS_URL_DOCKER`
(paso 5) y los mismos nombres en el `.env` del Gateway.

## 5. Pagos

```powershell
cd C:\ticketu\arquitectura-pagos\backend
Copy-Item .env.example .env
notepad .env
```

Completar:

```env
AUTH_INTERNAL_API_KEY=<la clave compartida con Auth y Entradas>
PASARELA=stripe
STRIPE_SECRET_KEY=sk_test_...
FRONTEND_URL=http://localhost:3000/pagos
LOG_INTEGRACIONES=true
```

En Docker ya vienen activados por defecto: verificación contra Entradas (`ENTRADAS_MODO=http`), publicación en
RabbitMQ y Auth en `http://auth-service:10000`. Levantar y comprobar:

```powershell
docker compose up -d --build
curl.exe http://localhost:8080/api/pagos/health
```

Debe responder `"base_datos":"ok"`, `"entradas":"http"`, `"auth":"validar-sesion"` y `"broker":"rabbitmq"`.

Dejar abierta una terminal con el log de las integraciones:

```powershell
docker logs -f pagos-service | Select-String "integración"
```

> Solo si Auth todavía no está: en otra terminal `npm install` y `npm run auth:simulado` (en `backend`), y en el `.env`
> `AUTH_URL_DOCKER=http://host.docker.internal:3001` y `AUTH_INTERNAL_API_KEY=clave-dev-local`. Sirve para revisar que
> todo levanta, pero **no cuenta como integración real** para la evaluación.

## 6. Front común (demo con Entradas y Pagos)

```powershell
cd C:\ticketu\FrontendTitec-demo
Copy-Item .env.example .env.local
notepad .env.local
```

```env
NEXT_PUBLIC_GATEWAY_URL=http://localhost:8080
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_LOGIN_URL=<página de login de Auth; vacío = /auth del front común>
```

```powershell
npm install
npm run dev
```

Abrir http://localhost:3000.

## 7. Probar que todo funciona

### 7.1 Flujo completo en la interfaz (UI1)

1. Iniciar sesión con el usuario de prueba de Auth.
2. Ir a http://localhost:3000/entradas, elegir un evento pagado, reservar y pulsar **Ir a pagar**.
3. Debe llegar a `/pagos` con tus datos (de Auth) y la cantidad y el total de la reserva (verificados con Entradas).
4. Pagar con `4242 4242 4242 4242`, fecha futura y cualquier CVC → "¡Pago confirmado!" → **Ver mis entradas** vuelve a Entradas.
5. Error de I1: abrir el mismo link de `/pagos` cambiando `total=` en la URL → "El monto no coincide con tu reserva".
6. Error de I2: cerrar sesión (o borrar la cookie `jwt`) y abrir `/pagos` → lleva al login y luego vuelve al pago.

En la terminal del log deben aparecer líneas como:

```
[pagos] [integración] 2026-11-04T… Auth GET /internal/validar-sesion → 200 valido=true id_usuario=… rol=usuario (12 ms)
[pagos] [integración] 2026-11-04T… Entradas GET /api/entradas/reservas/<id> → 200 (total 15000, cantidad 2) (30 ms)
[pagos] [integración] 2026-11-04T… RabbitMQ publicar pago.realizado → confirmado (…)
```

### 7.2 Base de datos (BD1)

```powershell
docker exec -it pagos-db psql -U postgres -d pagos_db -c "SELECT id_pago, id_reserva, id_usuario, id_evento, monto, estado_pago, fecha_creacion FROM pagos ORDER BY fecha_creacion DESC LIMIT 5;"
```

Consultas completas (antes y después): `backend/docs/evidencias/consultas-integraciones.sql`.

### 7.3 Evento en RabbitMQ (opcional)

Antes de pagar, en otra terminal:

```powershell
cd C:\ticketu\backendticketU\event-broker
npm install
$env:QUEUE_NAME="demo.pagos"; npm run consumer -- "pago.*"
```

Al pagar, imprime el mensaje `pago.realizado`.

### 7.4 Pruebas automáticas contra los servicios reales y evidencia (CA1, BE1, BD1)

```powershell
cd C:\ticketu\arquitectura-pagos\backend
npm install
$env:EVIDENCIA_AUTH_LOGIN_PATH="/api/auth/login"   # la ruta real del login de Auth
$env:EVIDENCIA_AUTH_LOGIN_BODY='{"email":"...","password":"..."}'
$env:EVIDENCIA_ID_EVENTO="<id de un evento pagado en Entradas>"
$env:EVIDENCIA_DATABASE_URL="postgres://postgres:postgres@localhost:5433/pagos_db"
npm run evidencia:integraciones
```

Debe terminar con `Aserciones Postman | 27 de 27 correctas` y crear `docs/evidencias/integraciones/<fecha>/`.
Si falla el login (I2.1) o la creación de la reserva (I1.1), revisar con Auth o Entradas la ruta y los campos del
cuerpo; la ruta de Entradas se cambia con `$env:EVIDENCIA_ENTRADAS_CREAR_RESERVA_PATH`, o se usa una reserva ya
creada con `$env:EVIDENCIA_ID_RESERVA` y `$env:EVIDENCIA_TOTAL`.

### 7.5 Subir la evidencia (antes del miércoles 14:30)

Agregar también las capturas de la interfaz, la base de datos y RabbitMQ en la misma carpeta de la fecha.

```powershell
cd C:\ticketu\arquitectura-pagos
git add backend/docs/evidencias/integraciones
git commit -m "docs: evidencia de las integraciones con Auth y Entradas reales"
git pull --rebase
git push
```

## Si algo falla

| Síntoma | Revisar |
|---|---|
| `/api/pagos/health` no responde por el 8080 | `PAGOS_SERVICE_URL=http://pagos-service:3000` en el `.env` del Gateway; `docker ps` muestra `pagos-service` |
| `"entradas":"mock"` en el health | El `.env` tiene `ENTRADAS_MODO_DOCKER=mock`; borrarlo y `docker compose up -d` |
| 503 `AUTH_NO_DISPONIBLE` | `auth-service` en la red y puerto 10000; si no, `AUTH_URL_DOCKER` en el `.env` |
| 403 `SERVICIO_NO_AUTORIZADO` | La `AUTH_INTERNAL_API_KEY` de Pagos no es la misma que la de Auth |
| 503 `ENTRADAS_NO_DISPONIBLE` | `entradas-service` en la red, puerto 3000 y que exponga `GET /api/entradas/reservas/{id}` |
| La página de pago no ve la sesión | Front y Gateway deben estar en `localhost` (la cookie es SameSite=Strict); el Gateway con `CORS_ORIGINS=http://localhost:3000` |
| Cambié el `.env` y no se nota | `docker compose up -d` (recrea el contenedor); en el front, reiniciar `npm run dev` |
