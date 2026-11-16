# Integraciones del módulo Pagos (TITEC 2026-2, Evaluación 3)

Instalación y flujo principal: [`INSTALACION.md`](INSTALACION.md). En los comandos, `GW=http://localhost:8080` es el
API Gateway del workstation y `cookies.txt` es la sesión del usuario comprador de Auth (paso 1 del flujo principal).

| Integración | Con qué se integra | Contrato (ruta o enlace) | Cómo se evidencia | Dónde verificarlo |
|---|---|---|---|---|
| **I1. Autenticación (Auth)** | Módulo Auth: `GET /internal/validar-sesion` en cada petición a Pagos | [`docs/contratos/Contrato_Auth_Pagos_v1.5.docx`](docs/contratos/Contrato_Auth_Pagos_v1.5.docx) · [`backend/docs/openapi-servicios-consumidos.yaml`](backend/docs/openapi-servicios-consumidos.yaml) | Con sesión de Auth, Pagos responde el perfil y opera; sin sesión o con token alterado responde 401; el rol que entrega Auth limita qué pagos se pueden ver | Pantalla de pago del front · `curl` de la sección I1 · log de `pagos-service` (líneas `Auth GET /internal/validar-sesion`) |
| **I2. Servicio vía API Gateway** | Módulo **Entradas**: `GET /api/entradas/reservas/{id_reserva}`, invocado por Pagos **a través del API Gateway** | Contrato de Entradas ↔ Pagos v2.5, operación 6: [`docs/contratos/Contrato_Pagos_Entradas_v2.5.docx`](docs/contratos/Contrato_Pagos_Entradas_v2.5.docx) · ruta del Gateway: `/api/entradas/reservas/{id_reserva}` (`ENTRADAS_SERVICE_URL`) | Al crear un pago, Pagos consulta la reserva por el Gateway y solo cobra si el total coincide; la misma llamada aparece en el log de Pagos y en el del Gateway con el mismo `requestId` | `/api/pagos/health` (`"entradas_via":"api-gateway"`) · log de `pagos-service` y de `ticketu-api-gateway` · tabla `pagos` |
| **I3. Broker** | **Publica** `pago.realizado` (y `pago.rechazado`, `pago.anulado`, `pago.reembolsado`) en el exchange `ticketu.events`; lo consume **Entradas**. Además publica `pago.completado`, que consume **Promociones** | [`docs/contratos/Contrato_Pagos_Entradas_v2.5.docx`](docs/contratos/Contrato_Pagos_Entradas_v2.5.docx), operación 5 · [`docs/contratos/Contrato_Promociones_Pagos_v1.1.docx`](docs/contratos/Contrato_Promociones_Pagos_v1.1.docx), operación 2 · esquema del mensaje en la sección I3 | Al aprobarse un pago se publica el mensaje con confirmación del broker; queda registrado con fecha y hora | Log de `pagos-service` (líneas `RabbitMQ publicar`) · consola de RabbitMQ (`http://localhost:15672`) |

Contrapartes: I2 e I3 se integran con **Entradas**. Si Entradas no está operativo en workstation, la sección
"Si la contraparte no está disponible" indica qué queda verificable.

---

## I1. Autenticación con Auth

Pagos no tiene login ni valida el JWT por su cuenta: en **cada petición** reenvía a Auth el header `Cookie` (la
cookie `jwt` que Auth entregó al iniciar sesión) junto con su `x-api-key`, y usa el `id_usuario` y el `rol` que Auth
responde. No hay que copiar tokens a mano: la sesión viaja en la cookie.

| Elemento | Dónde |
|---|---|
| Código | [`backend/src/integraciones/auth.client.ts`](backend/src/integraciones/auth.client.ts) · [`backend/src/middlewares/autenticacion.ts`](backend/src/middlewares/autenticacion.ts) |
| Configuración | `AUTH_BASE_URL` y `AUTH_INTERNAL_API_KEY` (ver [`INSTALACION.md`](INSTALACION.md) § 3); sin direcciones fijas en el código |
| Autorización por rol | [`backend/src/pagos/pago.service.ts`](backend/src/pagos/pago.service.ts): el comprador solo ve y opera **sus** pagos; `staff` (`ROLES_PRIVILEGIADOS`) los de cualquier usuario |

**Cómo verificarlo**

```bash
# a) Acceso con un usuario de Auth: 200 con id_usuario, nombre, RUT, correo y rol
curl -s -b cookies.txt $GW/api/pagos/comprador/perfil

# b) Sin sesión: 401 {"error":"NO_AUTENTICADO",...}
curl -s -i $GW/api/pagos/comprador/perfil

# b) Token alterado: 401 (Auth no lo reconoce)
curl -s -i $GW/api/pagos/comprador/perfil -H 'Cookie: jwt=eyJhbGciOiJIUzI1NiJ9.token.alterado'

# c) El rol limita el acceso: un comprador que pide pagos de otro usuario recibe 403 NO_AUTORIZADO;
#    con un usuario staff de Auth la misma consulta responde 200
curl -s -b cookies.txt "$GW/api/pagos?id_usuario=otro-usuario"
```

En la interfaz: con sesión iniciada, la pantalla de pago muestra los datos del comprador sin pedir login de nuevo;
sin sesión, redirige al login de Auth y vuelve al pago.

Trazas (fecha, operación y resultado):

```bash
docker logs pagos-service 2>&1 | grep "Auth GET"
# [pagos] [integración] 2026-11-19T12:00:00.000Z Auth GET /internal/validar-sesion → 200 valido=true id_usuario=... rol=usuario (12 ms)
# [pagos] [integración] 2026-11-19T12:00:05.000Z Auth GET /internal/validar-sesion → 401 → 401 NO_AUTENTICADO (8 ms)
```

Si Auth no responde: 503 `AUTH_NO_DISPONIBLE` y no se cobra. En la base, el pago queda con el `id_usuario` que
entregó Auth (Pagos no guarda nombre, RUT ni correo del comprador).

## I2. Servicio de Entradas a través del API Gateway

Al recibir `POST /api/pagos/transacciones`, Pagos invoca `GET {API_GATEWAY_URL}/api/entradas/reservas/{id_reserva}`
**pasando por el API Gateway** (no hay llamadas directas a `entradas-service`), reenviando la cookie del comprador.
Compara total, cantidad y evento con lo que responde Entradas y usa la respuesta en su lógica: crea el pago (201) o
lo rechaza. El pago guarda el `id_reserva` y el `id_evento` informados por Entradas.

| Elemento | Dónde |
|---|---|
| Código | [`backend/src/integraciones/entradas.client.ts`](backend/src/integraciones/entradas.client.ts) · uso en `crearTransaccion` de [`backend/src/pagos/pago.service.ts`](backend/src/pagos/pago.service.ts) |
| Configuración | `API_GATEWAY_URL` (workstation: `http://ticketu-api-gateway:8080`), `ENTRADAS_RUTA_RESERVA`, `ENTRADAS_TIMEOUT_MS` |
| Contrato | Entradas ↔ Pagos v2.5, operación 6 · Swagger: `http://localhost:3004/api-docs/consumidos` |

**Cómo verificarlo**

```bash
# 1. Pagos está configurado para llegar a Entradas por el Gateway
curl -s $GW/api/pagos/health        # "entradas":"http","entradas_via":"api-gateway"

# 2. Crear un pago para una reserva de Entradas (pasos 3 y 4 del flujo principal) → 201
curl -s -b cookies.txt -X POST $GW/api/pagos/transacciones -H 'Content-Type: application/json' \
  -d '{"id_reserva":"<hold_id>","total":<monto_total>,"cantidad_entradas":2}'

# 3. La llamada en el log de Pagos y en el del Gateway, con el mismo requestId
docker logs pagos-service 2>&1 | grep "Entradas GET"
# [pagos] [integración] 2026-11-19T12:01:00.000Z Entradas GET /api/entradas/reservas/hold-ab12 (vía API Gateway, requestId=6e4d5f4e-...) → 200 (total 12000, cantidad 2) (35 ms)
docker logs ticketu-api-gateway 2>&1 | grep "module=entradas"
# [gateway] requestId=6e4d5f4e-... method=GET path=/api/entradas/reservas/hold-ab12 module=entradas

# 4. El dato que deja: el pago referencia la reserva de Entradas
docker exec pagos-db psql -U postgres -d pagos_db -c \
  "SELECT id_pago, id_reserva, id_evento, monto, estado_pago, fecha_creacion FROM pagos ORDER BY fecha_creacion DESC LIMIT 3;"
```

**Manejo de errores** (en ningún caso se crea ni se cobra el pago; la pantalla muestra un mensaje comprensible):

| Qué pasa | Pagos responde | Cómo probarlo |
|---|---|---|
| El total no coincide con la reserva | 422 `ORDEN_INCONSISTENTE` | Repetir el paso 2 con otro `total` y una reserva nueva |
| Entradas responde 404 | 422 `RESERVA_NO_ENCONTRADA` | `"id_reserva":"no-existe"` |
| El Gateway no llega a Entradas (502 `BAD_GATEWAY`), no tiene la ruta (404 `ROUTE_NOT_FOUND`) o el servicio (503 `SERVICE_NOT_CONFIGURED`) | 503 `ENTRADAS_NO_DISPONIBLE` | Detener Entradas y repetir el paso 2 |
| Sin respuesta en `ENTRADAS_TIMEOUT_MS` (1500 ms) | 503 `ENTRADAS_NO_DISPONIBLE` | — |

## I3. Broker (RabbitMQ)

Cada vez que un pago cambia de estado, Pagos **publica** un mensaje en el exchange común `ticketu.events` (tipo
topic, durable; vhost `ticketu`). **Entradas** consume `pago.realizado` para emitir las entradas. **Promociones** consume `pago.completado` (cola
`promociones.pagos`) para descontar un uso del código de descuento; si `nombre_codigo` es `null`, lo ignora.

| Elemento | Dónde |
|---|---|
| Código | [`backend/src/integraciones/eventos/rabbitmq.publicador.ts`](backend/src/integraciones/eventos/rabbitmq.publicador.ts) · esquema en [`backend/src/integraciones/eventos/eventos.ts`](backend/src/integraciones/eventos/eventos.ts) |
| Configuración | `BROKER_URL` (workstation: `amqp://ticketu:ticketu_dev@ticketu-rabbitmq:5672/ticketu`), `EVENT_EXCHANGE=ticketu.events` |
| Tópicos (routing keys) | `pago.realizado` (aprobado), `pago.rechazado`, `pago.anulado`, `pago.reembolsado`; además `pago.completado` para Promociones |

Esquema del mensaje (`contentType: application/json`, persistente, `messageId` = `id_mensaje` para descartar duplicados):

```json
{
  "tipo": "pago.realizado", "version": 1,
  "id_mensaje": "uuid", "fecha_evento": "2026-11-19T12:02:00.000Z",
  "id_pago": "uuid", "id_reserva": "hold-ab12", "id_usuario": "uuid", "id_evento": "evt-001",
  "estado_pago": "APROBADO", "monto": 12000, "moneda": "CLP",
  "motivo": null, "nombre_codigo": null, "destinatario": null,
  "eventId": "uuid", "eventName": "pago.realizado", "occurredAt": "2026-11-19T12:02:00.000Z",
  "source": "pagos-service", "data": { "...": "los mismos campos del contrato" }
}
```

**Cómo verificarlo**

```bash
# 1. Aprobar un pago (paso 4 o 4b del flujo principal) y ver la publicación confirmada por el broker
docker logs pagos-service 2>&1 | grep "RabbitMQ publicar"
# [pagos] [integración] 2026-11-19T12:02:00.000Z RabbitMQ publicar pago.realizado → confirmado (exchange ticketu.events, id_pago ..., id_mensaje ...) (9 ms)
```

2. En la consola de RabbitMQ (`http://localhost:15672`, usuario `ticketu`, vhost `ticketu`): **Exchanges →
   `ticketu.events`** muestra el mensaje entrante (gráfico "Message rates") y, en **Bindings**, la cola de Entradas
   enlazada a `pago.realizado` y la cola `promociones.pagos` de Promociones (enlazada a `pago.completado` y
   `pago.realizado`; en **Queues** se ve el mensaje consumido).
3. Para ver el contenido del mensaje: en **Queues** crear una cola (por ejemplo `revision.pagos`), enlazarla en
   `ticketu.events` con routing key `pago.*`, aprobar otro pago y usar **Get messages** en esa cola. También sirve el
   consumidor de ejemplo del Platform Team: `npm run consumer -- "pago.*"` en `event-broker/`.

**Si el broker no está disponible, la aplicación no se cae**: el pago queda igualmente aprobado en la base, el error
queda en el log (`RabbitMQ publicar pago.realizado → error: ...`) y la conexión se reintenta en la siguiente
publicación. Se prueba deteniendo `ticketu-rabbitmq`, aprobando un pago y revisando que `/api/pagos/health` siga
respondiendo.

---

## Si la contraparte no está disponible en workstation

| Integración | Contraparte | Qué queda verificable sin ella |
|---|---|---|
| I2 | Entradas | La petición de Pagos **llega al API Gateway** con la ruta y el formato del contrato: `docker logs ticketu-api-gateway \| grep "module=entradas"` muestra `method=GET path=/api/entradas/reservas/{id}` con el `requestId` del log de Pagos (y `proxy_error` si Entradas no responde), y Pagos responde 503 `ENTRADAS_NO_DISPONIBLE` sin cobrar |
| I3 | Entradas y Promociones (consumidores) | El mensaje **se publica** en `ticketu.events` con el esquema acordado: log de Pagos (`→ confirmado`) y pasos 2 y 3 de la sección I3 en la consola de RabbitMQ |

## Pruebas automáticas

- Pruebas del backend (104, incluyen Auth, Gateway y broker): `cd backend && npm ci && npm test` (requiere PostgreSQL; ver [`backend/README.md`](backend/README.md)).
- Colección contra los servicios reales: [`backend/postman/Integraciones-reales.postman_collection.json`](backend/postman/Integraciones-reales.postman_collection.json).
- Evidencia de la Evaluación 2 (ejecución con fecha): [`backend/docs/evidencias/integraciones/`](backend/docs/evidencias/integraciones).
