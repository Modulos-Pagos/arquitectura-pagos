# language: es
Característica: HU 3.6 - Exportación de conciliación
  Como administrador financiero
  Quiero poder exportar los movimientos del sistema en formato CSV o Excel
  Para realizar la conciliación bancaria con mi propio software contable

  Escenario: Descarga de reporte contable
    Dado que el administrador visualiza el listado global de transacciones
    Cuando selecciona un rango de fechas y presiona 'Exportar CSV'
    Entonces el sistema genera y descarga un archivo con las columnas: Fecha, OrderID, Pasarela, Monto Bruto, Comisión, Monto Neto
