# language: es
Característica: HU 3.2 - Reembolso parcial
  Como organizador
  Quiero poder emitir un reembolso parcial a un usuario (ej. por problemas técnicos en una zona del evento)
  Para compensarlo sin tener que devolver el valor total de la orden

  Escenario: Devolución de un monto específico
    Dado que el organizador está en el detalle de una transacción aprobada
    Cuando ingresa un monto menor al total y presiona 'Reembolso Parcial'
    Entonces la pasarela descuenta ese saldo y el estado del pago cambia a 'Reembolsado Parcialmente'
