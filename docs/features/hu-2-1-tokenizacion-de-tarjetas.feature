# language: es
Característica: HU 2.1 - Tokenización de tarjetas
  Como sistema
  Quiero tokenizar de forma segura los datos de la tarjeta al guardarla
  Para cumplir con las normativas de seguridad (PCI-DSS) y no almacenar datos sensibles en texto plano

  Escenario: Generación de token al guardar tarjeta
    Dado que el comprador selecciona la opción de "Guardar tarjeta"
    Cuando la transacción es procesada y aprobada por la pasarela
    Entonces el sistema recibe un token seguro desde la pasarela y lo guarda en la base de datos vinculado al ID del usuario
