# language: es
Característica: HU 1.4 - Manejo de rechazos y errores
  Como comprador
  Quiero saber claramente si mi pago fue rechazado o expiró
  Para poder intentarlo de nuevo

  Escenario: tarjeta rechazada
    Dado el formulario de pago
    Cuando el comprador paga con una tarjeta rechazada (ej. 4000 0000 0000 0002)
    Entonces se muestra "La tarjeta fue rechazada. Intenta con otra." y no se realiza el cobro

  Escenario: sesión expirada
    Dado un pago cuya sesión de Stripe expiró
    Cuando se consulta el pago
    Entonces responde estado_pago = RECHAZADO con motivo_rechazo

  Escenario: no se retrocede de estado
    Dado un pago APROBADO
    Cuando llega un evento de expiración atrasado
    Entonces el estado sigue siendo APROBADO

  Escenario: datos inválidos
    Dada una solicitud con campos inválidos
    Cuando se intenta crear el pago
    Entonces responde 400 con la lista de todos los errores

  Escenario: pasarela caída
    Dado que Stripe no responde
    Cuando se intenta crear el pago
    Entonces responde 502 ERROR_PASARELA
