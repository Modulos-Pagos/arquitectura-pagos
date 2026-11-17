# language: es
Característica: HU 4.5 - Expiración del carrito (liberación temporal)
  Como sistema
  Quiero que el carrito tenga un tiempo de expiración (ej. 15 minutos) si contiene entradas de alta demanda
  Para publicar un evento de 'carrito_expirado' y liberar el stock temporal

  Escenario: Expiración del tiempo de reserva temporal
    Dado un carrito que lleva 15 minutos sin modificaciones ni intentos de pago
    Cuando el proceso en segundo plano (cron/worker) detecta la inactividad
    Entonces vacía el carrito y emite el evento 'CartExpired' al broker para que el servicio de Inventario libere los cupos
