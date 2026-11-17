# language: es
Característica: HU 3.5 - Panel de transacciones para el organizador
  Como organizador
  Quiero un dashboard donde pueda ver en tiempo real el flujo de ingresos, pagos rechazados y aprobados de mi evento
  Para tomar decisiones financieras

  Escenario: Monitoreo de ingresos
    Dado que el organizador inicia sesión en su panel
    Cuando entra a la pestaña 'Finanzas'
    Entonces el sistema muestra métricas de total recaudado, ticket promedio y un gráfico de transacciones por hora/día
