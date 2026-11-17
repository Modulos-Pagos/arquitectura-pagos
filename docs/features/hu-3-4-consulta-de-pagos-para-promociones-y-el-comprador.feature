# language: es
Característica: HU 3.4 - Consulta de pagos para Promociones y el comprador
  Como módulo Promociones
  Quiero obtener los id_pago aprobados de un usuario o reserva
  Para validar el uso de códigos de descuento; como comprador, quiero listar mis pagos

  Escenario: Promociones consulta
    Dado pagos de varios usuarios
    Cuando Promociones (sesión con rol staff) filtra por id_usuario y estado=APROBADO
    Entonces recibe los id_pago correspondientes, paginados

  Escenario: el comprador lista
    Dado pagos de varios usuarios
    Cuando un comprador lista sin filtros
    Entonces solo ve sus propios pagos

  Escenario: filtros inválidos
    Dado un estado inexistente o un límite fuera de rango
    Cuando se consulta la lista de pagos
    Entonces responde 400 VALIDACION_FALLIDA
