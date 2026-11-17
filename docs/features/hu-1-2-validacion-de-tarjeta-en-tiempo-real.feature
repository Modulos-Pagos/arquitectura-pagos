# language: es
Característica: HU 1.2 - Validación de tarjeta en tiempo real
  Como comprador
  Quiero que el formulario me avise mientras escribo si mi tarjeta, vencimiento o CVC están incompletos o son inválidos
  Para corregirlos antes de pagar

  Escenario: número de tarjeta inválido
    Dado que el comprador está en el formulario de pago
    Cuando escribe un número de tarjeta inválido
    Entonces el campo se marca en rojo y aparece el mensaje de error bajo el campo

  Escenario: enviar con campos incompletos
    Dado un campo vacío o incompleto (incluido el titular)
    Cuando presiona "Pagar"
    Entonces no se envía nada a Stripe y se muestran los errores de cada campo a la vez

  Escenario: corrección
    Dado un campo con error
    Cuando el comprador lo corrige
    Entonces el mensaje desaparece y el borde vuelve al color normal
