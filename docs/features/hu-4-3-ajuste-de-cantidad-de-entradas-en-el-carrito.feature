# language: es
Característica: HU 4.3 - Ajuste de cantidad de entradas en el carrito
  Como comprador
  Quiero poder modificar la cantidad de entradas (aumentar o disminuir) directamente desde el carrito
  Para ajustar mi pedido sin volver a la página del evento

  Escenario: Ajuste de cantidad de entradas
    Dado que el comprador está visualizando el resumen de su carrito
    Cuando presiona los botones '+' o '-' en un ítem específico
    Entonces el sistema actualiza inmediatamente la cantidad en la base de datos, recalcula el total y lo refleja en la interfaz
