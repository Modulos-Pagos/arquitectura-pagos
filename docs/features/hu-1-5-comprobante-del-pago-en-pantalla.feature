# language: es
Característica: HU 1.5 - Comprobante del pago en pantalla
  Como comprador
  Quiero ver un comprobante al terminar el pago
  Para tener el id de pago y el monto como respaldo de mi compra

  Escenario: pago aprobado
    Dado que el pago quedó APROBADO
    Cuando termina el flujo de pago
    Entonces se muestra "¡Pago confirmado!" con monto (CLP), id de pago, reserva, fecha y badge de estado

  Escenario: pago rechazado o anulado
    Dado un pago RECHAZADO o ANULADO
    Cuando se muestra la confirmación
    Entonces el título, color e ícono corresponden al estado y se muestra el motivo si existe

  Escenario: pago aún pendiente
    Dado que Stripe todavía no confirma el cobro
    Cuando el comprador abre el comprobante
    Entonces se muestra "Pago en proceso" en color informativo
