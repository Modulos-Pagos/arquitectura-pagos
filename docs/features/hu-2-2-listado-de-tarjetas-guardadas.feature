# language: es
Característica: HU 2.2 - Listado de tarjetas guardadas
  Como comprador
  Quiero ver una lista de mis tarjetas guardadas en mi perfil o en el checkout
  Para seleccionar rápidamente con cuál quiero pagar

  Escenario: Visualización de tarjetas enmascaradas
    Dado que el usuario tiene métodos de pago guardados previamente
    Cuando ingresa al checkout de una nueva compra
    Entonces el sistema despliega una lista con las tarjetas enmascaradas (ej. Visa terminada en 1234)
