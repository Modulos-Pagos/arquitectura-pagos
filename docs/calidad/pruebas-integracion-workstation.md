# Pruebas de integración en workstation (Evaluación 4, ítem CA2)

Colección: [`backend/postman/Workstation-E4.postman_collection.json`](../../backend/postman/Workstation-E4.postman_collection.json)
· Ambiente: [`backend/postman/workstation.postman_environment.json`](../../backend/postman/workstation.postman_environment.json)

Las tres integraciones de Pagos se prueban **contra las contrapartes reales instaladas en el workstation**, sin mocks:
Auth (`auth-service`), Entradas por el API Gateway (`ticketu-api-gateway:8080`) y RabbitMQ (`ticketu-rabbitmq`,
exchange `ticketu.events`). Cada integración tiene casos de éxito y al menos un caso de error, con el resultado
esperado escrito como prueba (`pm.test`), así que Newman marca cada caso como ✓ o ✗.

## Casos de prueba

| Caso | Integración | Tipo | Resultado esperado |
|---|---|---|---|
| E4-00 | Instalación | Éxito | `GET /api/pagos/health` por el Gateway: base `ok`, Auth `validar-sesion`, Entradas `http` vía `api-gateway`, broker `rabbitmq`, Stripe |
| I1.1 | Auth | Éxito | Login del comprador QA en Auth entrega la cookie `jwt` |
| I1.2 | Auth | Éxito | Pagos valida la sesión con Auth (`/internal/validar-sesion`) y devuelve el perfil (id_usuario, rol, correo) |
| I1.3 | Auth | Error | Sin sesión → `401 NO_AUTENTICADO` |
| I1.4 | Auth | Error | Token alterado, no emitido por Auth → `401 NO_AUTENTICADO` |
| I1.5 | Auth | Error | Comprador (rol `usuario`) pide pagos de otro usuario → `403 NO_AUTORIZADO` |
| I2.1 | Entradas | Éxito | Reserva temporal en Entradas (`evt-77889`) con id y total |
| I2.2 | Entradas | Éxito | `GET /api/entradas/reservas/{id}` por el Gateway devuelve el mismo total |
| I2.3 | Entradas | Error | Total distinto al de la reserva → `422 ORDEN_INCONSISTENTE` |
| I2.4 | Entradas | Error | Reserva que Entradas no conoce → `422 RESERVA_NO_ENCONTRADA` |
| I2.5 | Entradas | Éxito | Pagos verifica la reserva en Entradas y crea el pago `PENDIENTE` con cobro en Stripe |
| I2.6 | Entradas | Éxito | Reintento idempotente: mismo `id_pago`, sin cobro doble |
| I2.7 | Entradas | Éxito | El pago guarda solo identificadores (`id_reserva`, `id_usuario`) y el monto de la reserva |
| I3.0 | Broker | Preparación | Se vacía la cola **propia** de verificación `pagos.eventos` |
| I3.1 | Broker | Error | Stripe rechaza la tarjeta `pm_card_chargeDeclined` (`402 card_declined`) |
| I3.2 | Broker | Error | Con el cobro rechazado, el pago sigue `PENDIENTE` |
| I3.3 | Broker | Error | Con el cobro rechazado **no** se publica `pago.realizado` |
| I3.4 | Broker | Éxito | Stripe aprueba la tarjeta `pm_card_visa` (`succeeded`) |
| I3.5 | Broker | Éxito | Pagos sincroniza con Stripe y el pago queda `APROBADO` |
| I3.6 | Broker | Éxito | En RabbitMQ están `pago.realizado` (reserva, usuario, estado, monto) y `pago.completado` del pago |
| I3.7 | Broker | Éxito | Entradas tiene su consumidor conectado a su cola `entradas.pagos` |
| R.1 | Auth | Éxito | Login del staff QA (`staff1@ticketu.test`) |
| R.2 | Pagos (HU 3.1) | Error | Reembolso sin motivo → `400 VALIDACION_FALLIDA` |
| R.3 | Pagos (HU 3.1) | Éxito | El staff reembolsa el pago aprobado (Stripe en modo prueba) → `REEMBOLSADO` |
| R.4 | Broker | Éxito | En RabbitMQ está `pago.reembolsado` del pago |

I3.1 e I3.4 llaman a la API de Stripe en modo prueba para simular al comprador pagando (lo que hace el front);
no son integraciones con otro squad. Los mensajes de RabbitMQ se leen sin consumirlos (`ack_requeue_true`).

## Ejecutar en el workstation

No hace falta instalar Postman ni Newman: se usa la imagen oficial `postman/newman` conectada a la red de la
plataforma (por eso las direcciones del ambiente son nombres de contenedor, no `localhost`).

En la terminal de VS Code del workstation, dentro de `pagos\backend`, escribir `cmd` y pegar:

```bat
mkdir postman\resultados 2>nul
for /f "tokens=1,* delims==" %A in ('findstr /B "STRIPE_SECRET_KEY=" .env') do @set STRIPE_KEY=%B
docker run --rm --network plataforma-eventos-net -v "%cd%\postman:/etc/newman" postman/newman run Workstation-E4.postman_collection.json -e workstation.postman_environment.json --env-var stripeSecretKey=%STRIPE_KEY% --reporters cli,junit,json --reporter-junit-export resultados/workstation-e4.junit.xml --reporter-json-export resultados/workstation-e4.json --color off
```

- La segunda línea toma la llave de prueba de Stripe del `.env` de Pagos (no se repite en el repositorio).
- Al final aparece la tabla de Newman: **assertions … failed 0** es el resultado esperado.
- Quedan dos archivos en `backend\postman\resultados\` (git los ignora): `workstation-e4.junit.xml` y `workstation-e4.json`.
- Cada ejecución reserva 1 entrada de `evt-77889` y deja un pago `APROBADO` de prueba (Stripe en modo prueba).
- Si falla I1.1, Auth no está levantado o cambió el usuario QA. Si falla I2.1, Entradas no está o el evento no
  existe (cambiar `idEvento` en el ambiente). Si falla I3.7, Entradas no está consumiendo su cola.

## Guardar la evidencia en el repositorio

No se hace commit desde el workstation (es un PC compartido). Para subir el resultado:

1. Sacar una captura de la tabla final de Newman en la terminal.
2. Abrir `backend\postman\resultados\workstation-e4.junit.xml` en VS Code, `Ctrl+A`, `Ctrl+C`. AnyDesk comparte el
   portapapeles: pegarlo en el notebook propio como `backend/docs/evidencias/workstation-e4/AAAA-MM-DD-HHMM-newman.junit.xml`.
3. Guardar la captura en la misma carpeta, hacer commit y push **antes del miércoles 25/11 a las 14:30**.
