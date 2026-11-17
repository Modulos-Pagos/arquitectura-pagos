# language: es
Característica: HU 2.4 - Tarjeta por defecto
  Como comprador
  Quiero marcar una de mis tarjetas como predeterminada
  Para que aparezca preseleccionada automáticamente en mis futuras compras

  Escenario: Preselección en el checkout
    Dado que el usuario tiene múltiples tarjetas y marcó una como 'Por defecto'
    Cuando ingresa a realizar un nuevo pago
    Entonces esa tarjeta aparece seleccionada de forma automática sin necesidad de hacer clic
