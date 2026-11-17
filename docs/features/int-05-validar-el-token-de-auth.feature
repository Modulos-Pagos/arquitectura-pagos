# language: es
Característica: INT-05 - Pagos valida la sesión del comprador con Auth
  Como comprador con sesión iniciada en TicketU
  Quiero que la pantalla de pago reconozca mi sesión y muestre mis datos
  Para pagar sin volver a iniciar sesión

  Escenario: sesión válida
    Dado un usuario con sesión iniciada en Auth
    Cuando abre la pantalla de pago con la cookie jwt
    Entonces Pagos consulta a Auth antes de cualquier lógica
    Y usa el id_usuario y el rol de la respuesta de Auth, nunca del body, la URL ni el JWT
    Y la pantalla muestra nombre, RUT y correo entregados por Auth

  Escenario: sin sesión o token inválido
    Dada una petición sin cookie jwt, con un token alterado o vencido
    Cuando llega a un endpoint protegido de Pagos
    Entonces Pagos responde 401 NO_AUTENTICADO
    Y el front redirige al login de Auth con ?volver= para regresar al pago

  Escenario: usuario sin permisos
    Dado un usuario con rol usuario
    Cuando consulta los pagos de otro usuario
    Entonces Pagos responde 403 NO_AUTORIZADO

  Escenario: Auth no disponible
    Dado que Auth no responde dentro de 1000 ms
    Cuando llega una petición protegida
    Entonces Pagos responde 503 AUTH_NO_DISPONIBLE
    Y no se crea ni se cobra ningún pago

  Escenario: datos personales
    Dado un pago creado por un comprador
    Cuando se revisa la tabla pagos y el log de Pagos
    Entonces solo aparece el id_usuario de Auth, sin nombre, RUT, correo ni token
