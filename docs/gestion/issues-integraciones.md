# Ítems de gestión de las integraciones (GE1)

Texto de los issues de GitHub de cada integración declarada en [`INTEGRACIONES.md`](../../INTEGRACIONES.md).
Los criterios de aceptación están escritos en Gherkin (`# language: es`), igual que en los issues y en
[`docs/features/`](../features/). En cada issue: responsable asignado, Project "Progreso Modulo de Pagos", PR o commits
vinculados y estado según lo demostrado.

---

## INT-01 (#29) — Pagos verifica la reserva en Entradas antes de cobrar

**Dependencia (tabla TITEC):** Pagos RECIBE de Entradas la orden de compra (cantidad de entradas y total).

**Módulo contraparte:** Entradas/Inventario (Grupo 3)
**Contrato:** `docs/contratos/Contrato_Pagos_Entradas_v2.5.docx` (operaciones 2 y 6) · `backend/docs/openapi-servicios-consumidos.yaml`
**Servicio consumido:** `GET /api/entradas/reservas/{id_reserva}` a través del API Gateway, reenviando la cookie del comprador (`backend/src/integraciones/entradas.client.ts`)
**Servicio expuesto:** `POST /api/v1/pagos/transacciones` (Swagger propio, tag "Entradas (consumidor)")
**Responsable:** Cristóbal Soto (back end) · Pablo Medina (front) · Alonso Venegas (BD) · Ricardo Muñoz (integración)

**Criterios de aceptación (Gherkin)**

```gherkin
# language: es
Característica: INT-01 - Pagos verifica la reserva en Entradas antes de cobrar
  Como comprador
  Quiero llegar desde Entradas a la pantalla de pago con el total de mi reserva
  Para que Pagos solo me cobre si ese total coincide con lo registrado en Entradas

  Antecedentes:
    Dado un comprador con sesión iniciada en Auth
    Y una reserva vigente en Entradas con total 30000 y 2 entradas

  Escenario: la reserva coincide
    Cuando el comprador pulsa "Ir a pagar" y llega a /pagos?idReserva=…&total=30000&cantidad=2
    Entonces Pagos consulta la reserva en Entradas a través del API Gateway
    Y crea el pago en estado PENDIENTE con respuesta 201
    Y la tabla pagos guarda id_reserva, id_evento, monto 30000, estado y fechas, sin otros datos de Entradas

  Escenario: el total no coincide
    Cuando se crea el pago con total 25000
    Entonces Pagos responde 422 ORDEN_INCONSISTENTE
    Y no se crea el pago

  Escenario: la reserva no existe
    Dado que Entradas responde 404 para la reserva
    Cuando se crea el pago
    Entonces Pagos responde 422 RESERVA_NO_ENCONTRADA
    Y la pantalla muestra un mensaje comprensible y el botón "Volver a Entradas"

  Escenario: Entradas o el API Gateway no responden
    Dado que Entradas no responde dentro de ENTRADAS_TIMEOUT_MS
    Cuando se crea el pago
    Entonces Pagos responde 503 ENTRADAS_NO_DISPONIBLE
    Y no se cobra nada

  Escenario: configuración por variables
    Dado el archivo docker-compose del workstation
    Cuando se revisa la configuración de Pagos
    Entonces la URL del gateway, la ruta y el timeout vienen de API_GATEWAY_URL, ENTRADAS_RUTA_RESERVA y ENTRADAS_TIMEOUT_MS
```

- [x] Invocación definida y probada con Entradas simulado (suite "Invocación a Entradas/Inventario")
- [x] Ruta y nombres de campos confirmados con Entradas y reflejados en ambos Swagger
- [x] Casos de Postman de éxito y de error ejecutados contra el Entradas real, con evidencia en `backend/docs/evidencias/integraciones/2026-11-04-01-48/` (27/27)
- [ ] Evaluación 3: la consulta pasa por el API Gateway del workstation y queda evidenciada en `INTEGRACIONES.md`

**Estado:** Done para la Evaluación 2 — la colección pasó contra el Entradas real (27/27). Para la Evaluación 3 queda verificar la consulta por el API Gateway del workstation.

---

## INT-05 (#33) — Pagos valida la sesión del comprador con Auth

**Dependencia técnica:** todos los endpoints validan la sesión con Auth (requisito de la política de autorización).

**Módulo contraparte:** Auth
**Contrato:** `docs/contratos/Contrato_Auth_Pagos_v1.5.docx` · `backend/docs/openapi-servicios-consumidos.yaml`
**Servicio consumido:** `GET /internal/validar-sesion` (header `Cookie` original + `x-api-key`) — `backend/src/integraciones/auth.client.ts`, `backend/src/middlewares/autenticacion.ts`
**Responsable:** Cristóbal Soto (back end) · Pablo Medina (front) · Alonso Venegas (BD) · Ricardo Muñoz (integración)

**Criterios de aceptación (Gherkin)**

```gherkin
# language: es
Característica: INT-05 - Pagos valida la sesión del comprador con Auth
  Como comprador con sesión iniciada en TicketU
  Quiero que la pantalla de pago reconozca mi sesión y muestre mis datos
  Para pagar sin volver a iniciar sesión

  Escenario: sesión válida
    Dado un usuario con sesión iniciada en Auth
    Cuando abre la pantalla de pago con la cookie jwt
    Entonces Pagos consulta a Auth antes de cualquier lógica
    Y usa el id_usuario y el rol de la respuesta de Auth, nunca del body, la URL ni el JWT
    Y la pantalla muestra nombre, RUT y correo entregados por Auth

  Escenario: sin sesión o token inválido
    Dada una petición sin cookie jwt, con un token alterado o vencido
    Cuando llega a un endpoint protegido de Pagos
    Entonces Pagos responde 401 NO_AUTENTICADO
    Y el front redirige al login de Auth con ?volver= para regresar al pago

  Escenario: usuario sin permisos
    Dado un usuario con rol usuario
    Cuando consulta los pagos de otro usuario
    Entonces Pagos responde 403 NO_AUTORIZADO

  Escenario: Auth no disponible
    Dado que Auth no responde dentro de 1000 ms
    Cuando llega una petición protegida
    Entonces Pagos responde 503 AUTH_NO_DISPONIBLE
    Y no se crea ni se cobra ningún pago

  Escenario: datos personales
    Dado un pago creado por un comprador
    Cuando se revisa la tabla pagos y el log de Pagos
    Entonces solo aparece el id_usuario de Auth, sin nombre, RUT, correo ni token
```

- [x] URL de Auth y `INTERNAL_API_KEY` por variables (`AUTH_BASE_URL`, `AUTH_INTERNAL_API_KEY`); la clave no está en GitHub
- [x] Casos de Postman de éxito y de error (sin sesión, token falso, Bearer) ejecutados contra el Auth real, con evidencia en `backend/docs/evidencias/integraciones/2026-11-04-01-48/` (27/27)
- [ ] Evaluación 3: rechazo de token inválido y control por rol evidenciados con curl en `INTEGRACIONES.md`

**Estado:** Done para la Evaluación 2 — la colección pasó contra el Auth real (27/27). Para la Evaluación 3 queda documentar en `INTEGRACIONES.md` la verificación con curl.
