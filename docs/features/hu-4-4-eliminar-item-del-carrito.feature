# language: es
Característica: HU 4.4 - Eliminar ítem del carrito
  Como comprador
  Quiero poder eliminar un ítem completo de mi carrito con un solo botón (ej. ícono de basurero), si decido que ya no quiero asistir a ese evento

  Escenario: Remoción de ítem del carrito
    Dado que el comprador tiene al menos un ítem en el carrito
    Cuando presiona el botón 'Eliminar' junto al evento
    Entonces el ítem desaparece de la vista, se borra de la sesión en la base de datos y se recalcula el total a pagar
