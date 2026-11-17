# Plan de trabajo — Evaluación 3: Integraciones en workstation

**Entrega:** miércoles 18/11 hasta las 23:59 (enlace a la rama `main` en el aula virtual).
**Verificación en clase:** jueves 19/11 desde las 08:30. **Correcciones:** hasta el jueves 19/11 a las 23:59.
**Pauta:** `TITEC_Especificacion_Evaluacion_3_Integraciones_ws.pdf` — tres ítems: AU1 (Auth), GW1 (API Gateway) y BR1 (Broker).

> Condición para revisar: si Pagos no se levanta en workstation o su flujo principal no funciona, la nota es 1,0
> sin revisar nada más. Por eso lo primero es que **cualquiera pueda instalar Pagos desde la rama sin ayuda del equipo**.

## 1. Integraciones que vamos a declarar

| Integración | Tipo | Contraparte | Servicio, ruta o tópico | Evidencia principal |
|---|---|---|---|---|
| I1 | A. Autenticación | Auth | `GET /internal/validar-sesion` (cookie `jwt` + `x-api-key`) | Funcionalidad (login y datos del comprador en pantalla) + curl de rechazo 401/403 |
| I2 | B. API Gateway | Entradas | `GET /api/entradas/reservas/{id_reserva}` por el gateway (`ticketu-api-gateway:8080`) | Logs del gateway y de Pagos + fila en `pagos` con el monto de la reserva |
| I3 | C. Broker | Entradas / Notificaciones (por confirmar) | Exchange `ticketu.events`, routing key `pago.realizado` (y `pago.rechazado`, `pago.anulado`, `pago.reembolsado`) | Consola de RabbitMQ (cola y mensaje) + log de publicación de Pagos |

**Flujo principal a declarar:** iniciar sesión en Auth como comprador de prueba → desde Entradas, reservar y pulsar "Ir a pagar"
→ pagar con la tarjeta de prueba de Stripe `4242 4242 4242 4242` → ver el comprobante con estado APROBADO.

## 2. Revisión del repositorio (17/11)

| # | Hallazgo | Riesgo | Responsable |
|---|---|---|---|
| 1 | No existe `INSTALACION.md`; el `README.md` sigue hablando de la Evaluación 2 y de Auth v1.4. | Sin instrucciones el ayudante no puede instalar → nota 1,0. | Cristóbal (instalación) y Simón (README) |
| 2 | `INTEGRACIONES.md` está en el formato de la Evaluación 2 (I1 Entradas "tipo A", I2 Auth "tipo C"). Falta la tabla I1 A / I2 B / I3 C con "Cómo se evidencia" y "Dónde verificarlo". | Una integración no declarada se califica 0. | Ricardo |
| 3 | Hay dos archivos parecidos en la raíz: `INTEGRACION.md` (guía local) e `INTEGRACIONES.md`. | El ayudante puede leer el que no es. | Ricardo |
| 4 | Pagos publica en `ticketu.events`, pero no declara ninguna cola. En un exchange topic sin colas enlazadas el mensaje se descarta y no se ve en la consola. | BR1 (a) y (b) sin evidencia. | Cristóbal (cola) y Ricardo (acuerdo con el consumidor) |
| 5 | `AUTH_INTERNAL_API_KEY` y `STRIPE_SECRET_KEY` no están en la rama (correcto), pero sin ellas el backend no parte. | El ayudante no puede levantar Pagos. | Simón (decidir cómo se entregan) y Cristóbal |
| 6 | `frontend/` no tiene Dockerfile ni servicio en el compose; el flujo depende del módulo `/pagos` del front común. | Si el front común no está en workstation, no hay flujo principal. | Pablo |
| 7 | El webhook de Stripe no llega al workstation (no hay URL pública). El pago igual se aprueba porque `GET /api/pagos/{id}` sincroniza con Stripe, pero hay que dejarlo escrito. | Pago queda PENDIENTE si nadie consulta el estado. | Cristóbal y Pablo |
| 8 | El milestone #3 se llama "Entrega 3 - Reembolsos y consultas" y no tiene relación con esta evaluación. | Confusión al revisar el Project. | Simón |

## 3. Tareas por integrante

Cada tarea tiene su issue en el milestone **"Evaluación 3 - Integraciones en workstation"**, con estos mismos criterios.

### Cristóbal Soto — Back end

**C1. Configuración del workstation e `INSTALACION.md`** (miércoles 18, 18:00)

```gherkin
# language: es
Característica: Instalación de Pagos en workstation
  Como ayudante del curso
  Quiero instalar Pagos siguiendo solo INSTALACION.md
  Para revisar el módulo sin ayuda del equipo

  Escenario: instalación desde cero
    Dado un clon limpio de la rama main
    Y la red plataforma-eventos-net con Auth, el API Gateway y RabbitMQ del workstation
    Cuando sigo los pasos de INSTALACION.md
    Entonces pagos-service y pagos-db quedan arriba
    Y GET http://<workstation>:8080/api/pagos/health responde 200

  Escenario: direcciones por configuración
    Dado el archivo backend/.env.workstation.example
    Cuando reviso las variables
    Entonces AUTH_BASE_URL, API_GATEWAY_URL y BROKER_URL apuntan a los servicios del workstation
    Y ninguna dirección está fija en el código ni apunta a localhost
```

- `INSTALACION.md` en la raíz: requisitos, comandos, variables con su valor en workstation, puertos (3004 → 3000), usuarios de prueba de Auth y flujo principal.
- `backend/.env.workstation.example` con todos los valores no secretos.

**C2. Cola visible y trazas del broker** (miércoles 18, 18:00)

```gherkin
# language: es
Característica: Publicación de pagos en el broker
  Como equipo consumidor de los eventos de pago
  Quiero que cada pago aprobado quede como mensaje en RabbitMQ
  Para procesarlo y poder verificarlo en la consola

  Escenario: pago aprobado
    Dado un pago PENDIENTE
    Cuando Stripe confirma el cobro
    Entonces Pagos publica pago.realizado en ticketu.events
    Y el mensaje aparece en la cola acordada con fecha y hora
    Y el log de Pagos muestra la línea [integración] de la publicación

  Escenario: broker caído
    Dado que RabbitMQ no está disponible
    Cuando un pago se aprueba
    Entonces el pago queda APROBADO igual
    Y el error de publicación queda en el log sin que Pagos se caiga
```

- Si ningún módulo consume todavía, declarar una cola durable propia (por ejemplo `pagos.eventos`) enlazada a `pago.*` para que el mensaje se vea.

**C3. Errores de la contraparte y control por rol** (miércoles 18, 18:00)

```gherkin
# language: es
Característica: Errores de Auth, del gateway y de Entradas
  Como comprador
  Quiero mensajes comprensibles cuando algo falla
  Para saber qué hacer sin que la aplicación se caiga

  Escenario: reserva inexistente
    Dado un id_reserva que no existe en Entradas
    Cuando se crea el pago por el gateway
    Entonces Pagos responde 422 RESERVA_NO_ENCONTRADA

  Escenario: token alterado
    Dado un token jwt modificado a mano
    Cuando se llama a GET /api/pagos con ese token
    Entonces Pagos responde 401 NO_AUTENTICADO

  Escenario: rol sin permiso
    Dado un usuario de prueba con rol usuario
    Cuando consulta los pagos de otro usuario
    Entonces Pagos responde 403 NO_AUTORIZADO
```

- Dejar en `INTEGRACIONES.md` (con Ricardo) las líneas de código del timeout (`ENTRADAS_TIMEOUT_MS`, 1000 ms de Auth) y del manejo de la caída del broker.

### Alonso Venegas — Base de datos

**A1. Base inicializada y consultas de evidencia** (miércoles 18, 18:00)

```gherkin
# language: es
Característica: Base de datos de Pagos en workstation
  Como ayudante del curso
  Quiero consultar la base antes y después de cada integración
  Para verificar los cambios que deja cada operación

  Escenario: base nueva
    Dado un volumen pagos-db-data vacío
    Cuando se levanta pagos-db
    Entonces schema.sql crea las tablas pagos, reembolsos, destinatarios_pago y eventos_webhook_stripe

  Escenario: consulta antes y después de pagar
    Dado el comprador de prueba sin pagos para la reserva
    Cuando paga la reserva desde el flujo principal
    Entonces la consulta de INTEGRACIONES.md muestra una fila nueva con id_usuario de Auth, monto igual al total de la reserva y estado APROBADO
```

- Actualizar `backend/docs/evidencias/consultas-integraciones.sql` con una consulta por integración (I1: `id_usuario`; I2: `id_reserva` y `monto`; I3: `estado_pago` y `fecha_actualizacion`).
- Dejar el comando exacto: `docker exec -it pagos-db psql -U postgres -d pagos_db -c "<consulta>"`.
- Confirmar que la base no publica puertos en el host (no choca con Auth ni con otros módulos).

### Pablo Medina — Front end

**P1. Flujo principal usable en workstation** (miércoles 18, 18:00)

```gherkin
# language: es
Característica: Flujo principal de pago
  Como comprador de prueba
  Quiero pagar una reserva desde el navegador
  Para obtener mis entradas

  Escenario: pago completo
    Dado que inicié sesión en Auth como comprador de prueba
    Cuando desde Entradas pulso "Ir a pagar"
    Entonces veo la pantalla de pago con mi nombre, RUT y correo, sin volver a iniciar sesión
    Cuando pago con la tarjeta 4242 4242 4242 4242
    Entonces veo el comprobante con estado APROBADO

  Escenario: sesión vencida
    Dado que no tengo sesión en Auth
    Cuando abro la pantalla de pago
    Entonces me lleva al login de Auth y luego vuelve al pago
```

- Confirmar con el Platform Team si el front común con el módulo `/pagos` estará instalado en workstation. Si no, agregar `frontend/Dockerfile` y el servicio en el compose (las variables `NEXT_PUBLIC_*` se pasan como build args).
- Escribir en `INSTALACION.md` la URL de la pantalla de pago en workstation.

**P2. Mensajes de error comprensibles** (miércoles 18, 18:00)

```gherkin
# language: es
Característica: Mensajes de error en la pantalla de pago
  Como comprador
  Quiero entender por qué no puedo pagar
  Para volver a intentarlo o regresar a Entradas

  Escenario: Entradas no disponible
    Dado que Pagos responde 503 ENTRADAS_NO_DISPONIBLE
    Cuando abro la pantalla de pago
    Entonces veo un mensaje de servicio no disponible y el botón "Volver a Entradas"

  Escenario: orden inconsistente
    Dado que Pagos responde 422 ORDEN_INCONSISTENTE
    Cuando abro la pantalla de pago
    Entonces veo que el total no coincide con la reserva y no se cobra nada
```

### Ricardo Muñoz — Integración

**R1. `INTEGRACIONES.md` en formato de la Evaluación 3** (miércoles 18, 20:00)

```gherkin
# language: es
Característica: Declaración de integraciones
  Como ayudante del curso
  Quiero encontrar cada evidencia siguiendo INTEGRACIONES.md
  Para calificar AU1, GW1 y BR1 sin el equipo presente

  Escenario: tabla completa
    Dado el archivo INTEGRACIONES.md en la raíz de main
    Cuando lo abro
    Entonces veo I1 tipo A Auth, I2 tipo B API Gateway e I3 tipo C Broker, una por tipo
    Y cada fila indica contraparte, ruta o tópico, cómo se evidencia y dónde verificarlo con el usuario de prueba

  Escenario: rechazo de token
    Dado el comando curl de INTEGRACIONES.md con un token alterado
    Cuando lo ejecuto contra el gateway del workstation
    Entonces recibo 401 NO_AUTENTICADO

  Escenario: contraparte no disponible
    Dado que el consumidor de pago.realizado no está instalado en workstation
    Cuando reviso INTEGRACIONES.md
    Entonces está declarado y se indica la cola donde se ve el mensaje publicado
```

- Referencias de contrato: Auth v1.5, Entradas v2.5 (rama y ruta del archivo) y el Swagger de Pagos (`backend/docs/openapi.yaml`).
- Renombrar `INTEGRACION.md` a `docs/gestion/integracion-local.md` para que no se confunda.

**R2. Acuerdos con los otros equipos** (miércoles 18, 14:00)

```gherkin
# language: es
Característica: Datos del workstation
  Como equipo Pagos
  Quiero los datos reales de Auth, del gateway y del broker en workstation
  Para configurar Pagos sin suposiciones

  Escenario: datos confirmados
    Dado que escribí a Auth, al Platform Team y a Entradas
    Cuando responden
    Entonces tengo los usuarios de prueba (comprador y staff), la INTERNAL_API_KEY, la ruta /api/pagos registrada en el gateway y quién consume pago.realizado
```

### Simón Canales — Gestión

**S1. Seguimiento, secretos y entrega** (miércoles 18, 23:00)

```gherkin
# language: es
Característica: Entrega de la Evaluación 3
  Como Scrum Master
  Quiero que la rama entregada se instale sola
  Para no caer en la condición de nota 1,0

  Escenario: prueba en limpio
    Dado un clon nuevo de main en un PC que no es de desarrollo
    Cuando otro integrante sigue INSTALACION.md sin ayuda
    Entonces Pagos queda arriba y el flujo principal funciona

  Escenario: entrega en el aula virtual
    Dado que la prueba en limpio pasó
    Cuando subo la entrega antes de las 23:59 del 18/11
    Entonces el enlace es https://github.com/Modulos-Pagos/arquitectura-pagos/tree/main
```

- Decidir cómo recibe el ayudante `STRIPE_SECRET_KEY` y `AUTH_INTERNAL_API_KEY` (no van en GitHub).
- Actualizar el `README.md` (Evaluación 3, Auth v1.5, enlaces a `INSTALACION.md` e `INTEGRACIONES.md`) y `RESPONSABLES.md`.
- Renombrar el milestone "Entrega 3 - Reembolsos y consultas" a "Sprint futuro - Reembolsos y consultas".

## 4. Jueves 19/11 — verificación en clase (08:30)

Orden de la pauta, con un responsable por paso:

| Paso | Qué se revisa | Responsable |
|---|---|---|
| 1 | La versión instalada es la de `main`, la base está inicializada y la configuración apunta a Auth, gateway y broker del workstation | Cristóbal y Alonso |
| 2 | La aplicación se levanta y el flujo principal funciona | Pablo |
| 3 | I1: login con Auth, rechazo 401 y control por rol | Ricardo |
| 4 | I2: la consulta a Entradas aparece en los logs del gateway | Ricardo y Cristóbal |
| 5 | I3: el mensaje aparece en la consola de RabbitMQ | Ricardo |
| — | Anotar lo que falle, abrir un issue por cada problema y corregir en `main` antes de las 23:59 | Simón |
