# language: es
Característica: HU 1.1 - Formulario de pago con tarjeta
  Como comprador
  Quiero ingresar los datos de mi tarjeta en la pantalla de pago de TicketU
  Para pagar mis entradas sin salir del sitio

  Escenario: pago con tarjeta válida
    Dado que Entradas creó un pago y el comprador abre la url_checkout (/?id_pago=...)
    Cuando ingresa número, vencimiento, CVC y titular y presiona "Pagar"
    Entonces la tarjeta se confirma directamente con Stripe y se muestra "¡Pago confirmado!"

  Escenario: los datos de tarjeta no pasan por nuestro backend
    Dado el formulario de pago
    Cuando el comprador ingresa su tarjeta
    Entonces los campos son de Stripe Elements y nuestro backend solo recibe el client_secret, nunca el número ni el CVC

  Escenario: pago ya realizado
    Dado un pago que ya está APROBADO
    Cuando el comprador vuelve a abrir la url_checkout
    Entonces el backend no entrega client_secret y la pantalla muestra el estado del pago
