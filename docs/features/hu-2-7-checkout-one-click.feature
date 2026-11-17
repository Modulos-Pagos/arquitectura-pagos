# language: es
Característica: HU 2.7 - Checkout One-Click
  Como comprador frecuente
  Quiero poder confirmar mi pago con un solo clic usando mi tarjeta por defecto
  Para hacer el proceso de compra lo más rápido posible

  Escenario: Flujo rápido de pago
    Dado que el usuario está autenticado y tiene una tarjeta válida por defecto
    Cuando ingresa al checkout
    Entonces solo necesita hacer clic en el botón 'Confirmar Pago' sin tener que rellenar ningún formulario manual
