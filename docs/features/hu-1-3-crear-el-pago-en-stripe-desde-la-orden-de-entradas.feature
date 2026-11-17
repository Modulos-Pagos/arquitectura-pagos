# language: es
Característica: HU 1.3 - Crear el pago en Stripe a partir de la orden de Entradas
  Como módulo Entradas
  Quiero enviar la orden de compra (reserva, evento, cantidad y total) a Pagos
  Para obtener un id_pago y un enlace de pago para el comprador

  Escenario: orden válida
    Dada una reserva vigente en Entradas
    Cuando Entradas envía id_reserva, id_evento, total y cantidad_entradas
    Entonces Pagos responde 201 con id_pago, estado_pago = PENDIENTE, fecha_creacion y url_checkout

  Escenario: reintento (idempotencia)
    Dado un pago ya creado para ese id_reserva
    Cuando Entradas reintenta (incluso en solicitudes simultáneas)
    Entonces se responde 200 con el mismo id_pago y no se crea un segundo cobro

  Escenario: orden alterada
    Dado que el total enviado no coincide con la reserva en Entradas
    Cuando se solicita el pago
    Entonces se responde 422 ORDEN_INCONSISTENTE y no se crea el pago

  Escenario: confirmación de Stripe
    Dado un pago PENDIENTE
    Cuando Stripe envía payment_intent.succeeded o checkout.session.completed con firma válida
    Entonces el pago pasa a APROBADO; si el evento se repite, se responde duplicado: true sin reprocesarlo
