# language: es
Característica: HU 3.3 - Anulación del pago por reserva vencida o sin stock
  Como módulo Entradas
  Quiero anular un pago cuando la reserva venció o ya no hay stock
  Para no cobrar entradas que no se emitirán

  Escenario: pago pendiente
    Dado un pago PENDIENTE
    Cuando Entradas solicita la anulación
    Entonces se cancela el PaymentIntent (o se expira la sesión) en Stripe y el pago queda ANULADO sin cobro

  Escenario: el comprador pagó justo antes
    Dado un pago que Stripe ya cobró pero aún figura PENDIENTE
    Cuando Entradas solicita la anulación
    Entonces Pagos detecta el cobro y lo reembolsa en vez de anularlo (queda REEMBOLSADO)

  Escenario: pago ajeno
    Dado un comprador que no es dueño del pago
    Cuando solicita la anulación
    Entonces responde 403 NO_AUTORIZADO
