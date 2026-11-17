# language: es
Característica: HU 2.6 - Gestión de datos de facturación
  Como comprador corporativo
  Quiero poder ingresar mis datos de facturación (RUT empresa, Razón Social, Giro)
  Para solicitar una factura en lugar de una boleta

  Escenario: Solicitud de factura
    Dado que el usuario está completando el formulario de pago
    Cuando marca la casilla 'Solicitar Factura'
    Entonces se despliegan campos adicionales obligatorios (RUT, Razón Social, Dirección, Giro)
