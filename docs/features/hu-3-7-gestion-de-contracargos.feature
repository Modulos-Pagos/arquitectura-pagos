# language: es
Característica: HU 3.7 - Gestión de Contracargos
  Como administrador del sistema
  Quiero recibir una alerta si un usuario realiza un desconocimiento de cargo (contracargo) en su banco
  Para bloquear su entrada automáticamente y gestionar la disputa

  Escenario: Recepción de webhook de contracargo
    Dado un pago previamente aprobado
    Cuando el Gateway envía un evento (Webhook) informando un 'Chargeback'
    Entonces el sistema cambia el estado del pago a 'En Disputa' y notifica al servicio de Entradas para inhabilitar el código QR
