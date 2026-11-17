# language: es
Característica: INT-04 - Enviar id_pago a Promociones
  Como módulo Promociones
  Quiero saber qué pagos con código de descuento fueron aprobados
  Para descontar el uso del código

  Escenario: pago aprobado con código
    Dado un pago PENDIENTE con nombre_codigo "DESC50"
    Cuando Stripe confirma el cobro
    Entonces Pagos publica pago.completado con id_pago, id_usuario, id_evento y nombre_codigo

  Escenario: aviso repetido de Stripe
    Dado un pago ya APROBADO
    Cuando Stripe reenvía el mismo aviso
    Entonces Pagos no vuelve a publicar pago.completado

  Escenario: consulta de respaldo
    Dado un pago APROBADO de la reserva res-98765
    Cuando Promociones consulta GET /api/pagos?id_reserva=res-98765&estado=APROBADO con una sesión staff
    Entonces recibe el pago con su id_pago y nombre_codigo
