# language: es
Característica: INT-02 - Enviar estado del pago y fecha de creación a Entradas
  Como módulo Entradas
  Quiero conocer el estado final de cada pago
  Para emitir o liberar las entradas de la reserva

  Escenario: Entradas consulta el estado
    Dado un pago creado para una reserva
    Cuando Entradas consulta GET /api/v1/pagos/{id_pago}
    Entonces recibe estado_pago y fecha_creacion

  Escenario: el pago se aprueba
    Dado un pago PENDIENTE
    Cuando Stripe confirma el cobro
    Entonces el pago queda APROBADO
    Y Pagos publica pago.realizado en el exchange ticketu.events

  Escenario: el broker no está disponible
    Dado que RabbitMQ no responde
    Cuando un pago cambia de estado
    Entonces el cambio de estado igual se guarda
    Y Pagos registra el error de publicación en el log sin caerse
