# language: es
Característica: HU 2.3 - Eliminar método de pago
  Como comprador
  Quiero poder eliminar una tarjeta guardada de mi cuenta
  Para mantener mi información financiera actualizada y bajo mi control

  Escenario: Desvinculación de tarjeta
    Dado que el comprador está viendo su lista de tarjetas guardadas
    Cuando hace clic en el botón de eliminar junto a una tarjeta
    Entonces el sistema elimina el token asociado en la base de datos y la tarjeta desaparece de la vista
