# language: es
Característica: INT-03 - Enviar id_pago a Entradas
  Como módulo Entradas
  Quiero recibir el id_pago al crear el pago
  Para guardarlo como referencia de la reserva

  Escenario: pago nuevo
    Dada una reserva sin pago
    Cuando Entradas crea el pago
    Entonces responde 201 con el id_pago (UUID)

  Escenario: pago ya creado para la reserva
    Dada una reserva que ya tiene un pago PENDIENTE
    Cuando Entradas vuelve a crear el pago
    Entonces responde 200 con el mismo id_pago, sin duplicar el pago
