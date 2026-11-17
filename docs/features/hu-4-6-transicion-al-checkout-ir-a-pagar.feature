# language: es
Característica: HU 4.6 - Transición al Checkout (Ir a pagar)
  Como comprador
  Quiero poder presionar el botón 'Ir a Pagar' (Checkout)
  Para congelar el contenido de mi carrito y pasar al formulario de ingreso de tarjeta

  Escenario: Transición exitosa hacia el pago
    Dado que el comprador revisó su carrito y está conforme
    Cuando presiona el botón 'Ir a Pagar'
    Entonces el sistema bloquea modificaciones en el carrito, genera un 'Order ID' preliminar y redirige a la vista del formulario de pago
