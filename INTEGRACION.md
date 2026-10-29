# Integración de Pagos con la plataforma TicketU

Guía para levantar Pagos junto con la plataforma del Platform Team (repo `FWizav/backendticketU`: API Gateway y RabbitMQ) y el front común (`FrontendTitec`), y para hacer la prueba de punta a punta.

## 1. Qué está listo del lado de Pagos

| Pieza | Cómo queda | Dónde se ve |
|---|---|---|
| API Gateway | Pagos responde bajo `/api/pagos/...`, que el Gateway reenvía sin reescribir la ruta. Contenedor `pagos-service`, puerto interno 3000, en la red `plataforma-eventos-net` | `backend/docker-compose.yml` |
| Servicio que proveemos | `POST /api/pagos/transacciones`, `GET /api/pagos/{id_pago}`, `POST /api/pagos/{id_pago}/reembolso` (Entradas) y `GET /api/pagos` (Promociones) | `backend/docs/openapi.yaml` |
| Servicio que consumimos (Entradas) | `GET /api/entradas/reservas/{id_reserva}` reenviando la cookie del comprador. Usa el prefijo `/api/entradas` que exige el Gateway | `backend/src/integraciones/entradas.client.ts` |
| Servicio que consumimos (Auth) | `GET /internal/validar-sesion` en cada petición, con la cookie `jwt` y `x-api-key` (red interna, no pasa por el Gateway) | `backend/src/integraciones/auth.client.ts` |
| Eventos (RabbitMQ) | Exchange `ticketu.events` (topic, durable): `pago.realizado`, `pago.rechazado`, `pago.anulado`, `pago.reembolsado` y `pago.completado` (Promociones), con el sobre `eventId / eventName / occurredAt / source / data` del Platform Team | `backend/src/integraciones/eventos/` |
| Front | El checkout se monta en el front común como `/pagos` (parche `FrontendTitec`, ver sección 5). El front propio (`frontend/`, puerto 5173) sigue funcionando | `src/modules/pagos/` del front común |
| Puertos sin Docker | Pagos en **3004** (el 3000 es del front común), Auth simulado en 3001, Gateway en 8080 | `backend/.env.example` |

Evidencia de la prueba con el Gateway del Platform Team: `backend/docs/evidencias/prueba-gateway-local.txt`.

## 2. Levantar todo en un PC (Docker Desktop)

Ejecutar en PowerShell, en este orden.

**1. Red común** (una vez por máquina; si dice que ya existe, seguir):

```powershell
docker network create plataforma-eventos-net
```

**2. RabbitMQ** (repo `backendticketU`):

```powershell
cd backendticketU\event-broker
Copy-Item .env.example .env
docker compose up -d --build
```

Panel: http://localhost:15672 (usuario `ticketu`, contraseña `ticketu_dev`).

**3. API Gateway** (repo `backendticketU`):

```powershell
cd backendticketU\api-gateway
Copy-Item .env.example .env
```

En `api-gateway\.env` revisar estas líneas (si se usa el front propio de Pagos, agregar el 5173 a CORS):

```env
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
PAGOS_SERVICE_URL=http://pagos-service:3000
```

```powershell
docker compose up -d --build
```

**4. Auth.** Con el servicio real del equipo Auth: debe llamarse `auth-service` en la red común y entregar la `INTERNAL_API_KEY`. Mientras no esté, usar el Auth simulado en el PC (terminal aparte, en `arquitectura-pagos\backend`):

```powershell
npm install
npm run auth:simulado
```

**5. Pagos** (`arquitectura-pagos\backend`): copiar `.env.example` a `.env` y dejar:

```env
BROKER_MODO=rabbitmq
FRONTEND_URL=http://localhost:3000/pagos
AUTH_INTERNAL_API_KEY=<la clave de Auth, o clave-dev-local con el simulado>
# Solo si se usa el Auth simulado del paso 4 (corre fuera de Docker):
AUTH_URL_DOCKER=http://host.docker.internal:3001
# Cuando Entradas esté levantado en la red común:
ENTRADAS_MODO=http
```

```powershell
docker compose up -d --build
```

**6. Front común** (`FrontendTitec`, con el parche de la sección 5 aplicado):

```powershell
Copy-Item .env.example .env.local
# en .env.local: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
# con el Auth simulado, además: NEXT_PUBLIC_LOGIN_URL=http://localhost:3001/login
npm install
npm run dev
```

**7. Comprobar:**

```powershell
curl http://localhost:8080/health
curl http://localhost:8080/api/pagos/health
```

`/api/pagos/health` debe responder `"base_datos":"ok"`, `"auth":"validar-sesion"` y `"broker":"rabbitmq"`.

## 3. Prueba de punta a punta

1. **Escuchar los eventos como lo haría Entradas** (repo `backendticketU\event-broker`, terminal aparte):

   ```powershell
   npm install
   $env:QUEUE_NAME="entradas.pagos"; npm run consumer -- "pago.*"
   ```

2. **Iniciar sesión.** Con el simulado: abrir
   `http://localhost:3001/login?usuario=usr-demo-1&volver=http://localhost:3000/pagos`
   (deja la cookie `jwt` y vuelve al checkout). Con Auth real: el login del front común.

3. **Crear el pago como lo haría Entradas** (Postman, con el header `Cookie: jwt=<token>`):
   `POST http://localhost:8080/api/pagos/transacciones` con
   `{ "id_reserva": "res-demo-1", "id_evento": "evt-123", "total": 7500, "cantidad_entradas": 1 }`.
   La respuesta trae `url_checkout` (`http://localhost:3000/pagos/?id_pago=...`).

4. **Pagar.** Abrir la `url_checkout` y pagar con la tarjeta de prueba `4242 4242 4242 4242` (fecha futura, CVC cualquiera). Requiere `PASARELA=stripe`, las llaves `sk_test` / `pk_test` y, para que llegue el aviso de Stripe:

   ```powershell
   stripe listen --forward-to localhost:3004/api/pagos/webhooks/stripe
   ```

5. **Resultado esperado:** la página muestra "Pago aprobado" y el consumidor del paso 1 imprime el evento `pago.realizado` con `id_pago`, `id_reserva` y `monto`. Guardar capturas de ambos como evidencia.

Sin Stripe (`PASARELA=mock`), el pago se aprueba simulando el webhook, como hace la colección de Postman (caso "Pago completado → APROBADO").

## 4. Checklist del Platform Team (README de `backendticketU`, sección 11)

| Punto | Pagos |
|---|---|
| Contenedor conectado a `plataforma-eventos-net` | Sí (`backend/docker-compose.yml`) |
| Nombre de servicio igual al del `.env` del Gateway | Sí: `pagos-service` ↔ `PAGOS_SERVICE_URL=http://pagos-service:3000` |
| Endpoints bajo `/api/<módulo>/...` | Sí: `/api/pagos/...` (también responde en `/api/v1/pagos/...` para pruebas directas) |
| Funciona pasando por `http://localhost:8080` | Sí (evidencia `prueba-gateway-local.txt`) |
| Eventos en `ticketu.events` y cola propia por consumidor | Pagos publica; cada consumidor (Entradas, Promociones, Notificaciones) crea su cola |
| Sin URLs de otros microservicios en el front | Sí: el módulo usa `GATEWAY_URL` de `src/lib/env.ts` |

## 5. Front común: parche del módulo de Pagos

El parche `FrontendTitec-pagos.patch` (o la carpeta con los archivos) monta el checkout en `/pagos`. Se sube como Pull Request al repo del front común, en la rama `feature/pagos-checkout`, como pide su README.

| Archivo | Cambio |
|---|---|
| `src/app/pagos/page.tsx` | Muestra el checkout (lee `?id_pago=` de la `url_checkout`) |
| `src/modules/pagos/` | `api.ts` (por el Gateway), `components/` (checkout, formulario, resumen, confirmación, destinatario), `lib/` y `pagos.css` |
| `package.json` / `package-lock.json` | Agrega `@stripe/stripe-js`, `@stripe/react-stripe-js`, `lucide-react` y, para estilos, `tailwindcss` + `@tailwindcss/postcss` |
| `postcss.config.js` | Activa Tailwind solo para `pagos.css`: sin reseteo global y escaneando solo `src/modules/pagos`, así no cambia el estilo de los otros módulos |
| `.env.example`, `Dockerfile`, `docker-compose.yml` | Agregan `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` y `NEXT_PUBLIC_LOGIN_URL` (opcional) |

El Header y el Footer los pone el layout común: el módulo no los repite. Con 401 redirige a `/auth?volver=...` (o a `NEXT_PUBLIC_LOGIN_URL`).

## 6. Lo que depende de otros equipos

| Equipo | Qué falta |
|---|---|
| Auth | `INTERNAL_API_KEY`, servicio `auth-service` con `GET /internal/validar-sesion` y login que deje la cookie `jwt` (y si acepta `?volver=`) |
| Entradas | Llamar a `POST /api/pagos/transacciones` reenviando la cookie; exponer `GET /api/entradas/reservas/{id_reserva}`; escuchar `pago.realizado` / `pago.rechazado` con su cola |
| Promociones | Escuchar `pago.completado` con su cola |
| Platform Team | Aceptar el PR del front común y agregar `PAGOS_SERVICE_URL` (y `CORS_ORIGINS` si se usa el front propio) en el Gateway compartido |
