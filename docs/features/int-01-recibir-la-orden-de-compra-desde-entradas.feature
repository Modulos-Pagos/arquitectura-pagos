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
