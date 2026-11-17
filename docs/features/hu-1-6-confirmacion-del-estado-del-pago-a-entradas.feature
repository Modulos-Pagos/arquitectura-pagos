# language: es
Característica: HU 1.6 - Confirmación del estado del pago a Entradas
  Como módulo Entradas
  Quiero consultar el estado y la fecha de creación del pago
  Para emitir la entrada con QR cuando esté APROBADO

  Escenario: pago aprobado
    Dado un pago APROBADO
    Cuando Entradas lo consulta reenviando la cookie jwt del comprador
    Entonces recibe estado_pago = APROBADO y fecha_creacion

  Escenario: el webhook no llegó
    Dado un pago PENDIENTE cuyo cobro ya se hizo en Stripe
    Cuando Entradas consulta
    Entonces Pagos verifica en Stripe, actualiza el estado a APROBADO y lo devuelve

  Escenario: id inexistente o inválido
    Dado un id_pago que no existe
    Cuando se consulta el estado del pago
    Entonces responde 404

  Escenario: id con formato inválido
    Dado un id_pago que no es UUID
    Cuando se consulta el estado del pago
    Entonces responde 400
