# language: es
Característica: HU 3.1 - Reembolso total de un pago aprobado
  Como módulo Entradas
  Quiero reembolsar el total de un pago aprobado cuando la compra se cancela
  Para devolver el dinero al comprador

  Escenario: reembolso de pago aprobado
    Dado un pago APROBADO
    Cuando Entradas solicita el reembolso con un motivo
    Entonces se reembolsa el total en Stripe, el pago queda REEMBOLSADO y se registra en la tabla reembolsos

  Escenario: reintento
    Dado un pago ya REEMBOLSADO
    Cuando se vuelve a solicitar
    Entonces responde 200 ya_procesado: true sin devolver dos veces

  Escenario: pago no reembolsable
    Dado un pago RECHAZADO
    Cuando se solicita el reembolso
    Entonces responde 409 PAGO_NO_REEMBOLSABLE

  Escenario: solicitud sin motivo
    Dado un pago APROBADO
    Cuando se solicita el reembolso sin motivo
    Entonces responde 400 VALIDACION_FALLIDA
