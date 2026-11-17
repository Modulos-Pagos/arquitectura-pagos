# language: es
Característica: HU 2.5 - Alerta de tarjeta expirada
  Como sistema
  Quiero indicar visualmente si una tarjeta guardada ya expiró
  Para evitar que el usuario intente pagar con ella y reciba un error

  Escenario: Bloqueo visual de método de pago vencido
    Dado que la fecha actual supera el mes y año (MM/AA) de una tarjeta guardada
    Cuando el sistema renderiza la lista de tarjetas en el checkout
    Entonces la tarjeta se muestra deshabilitada (gris) con una etiqueta que indica 'Expirada'
