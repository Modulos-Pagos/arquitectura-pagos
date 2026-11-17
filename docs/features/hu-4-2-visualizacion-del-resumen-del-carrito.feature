# language: es
Característica: HU 4.2 - Visualización del resumen del carrito
  Como comprador
  Quiero abrir mi carrito
  Para ver un resumen detallado con el nombre del evento, cantidad de entradas, precio unitario y monto total a pagar

  Escenario: Visualización del resumen de compra
    Dado que el comprador tiene ítems guardados en su sesión
    Cuando hace clic en el ícono del carrito de compras
    Entonces el sistema despliega una vista con el desglose de los ítems, el subtotal y el botón 'Ir a pagar'
