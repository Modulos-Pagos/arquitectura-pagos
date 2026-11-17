# language: es
Característica: HU 4.1 - Agregar entradas al carrito
  Como comprador
  Quiero poder agregar entradas de uno o varios eventos a mi carrito
  Para agrupar mis compras y hacer un solo pago

  Escenario: Agregar entradas con stock disponible
    Dado que el comprador está en el Catálogo de eventos
    Cuando selecciona la cantidad de entradas y presiona 'Agregar al carrito'
    Entonces el sistema añade el ítem, actualiza el contador del ícono del carrito y guarda la sesión en la base de datos
