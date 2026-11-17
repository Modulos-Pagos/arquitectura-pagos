# Criterios de aceptación en Gherkin

Cada historia de usuario (HU) y cada ítem de integración (INT) del backlog tiene sus criterios de aceptación escritos en Gherkin
(`# language: es`: Característica, Escenario, Dado, Cuando, Entonces, Y). El mismo texto está en el issue de GitHub correspondiente;
estos archivos son la copia versionada en el repositorio.

| Issue | Historia | Estado | Archivo |
|---|---|---|---|
| #1 | HU 1.1 - Formulario de pago con tarjeta | cerrada | [`hu-1-1-formulario-de-pago-con-tarjeta.feature`](hu-1-1-formulario-de-pago-con-tarjeta.feature) |
| #3 | HU 1.2 - Validación de tarjeta en tiempo real | cerrada | [`hu-1-2-validacion-de-tarjeta-en-tiempo-real.feature`](hu-1-2-validacion-de-tarjeta-en-tiempo-real.feature) |
| #4 | HU 1.3 - Crear el pago en Stripe a partir de la orden de Entradas | cerrada | [`hu-1-3-crear-el-pago-en-stripe-desde-la-orden-de-entradas.feature`](hu-1-3-crear-el-pago-en-stripe-desde-la-orden-de-entradas.feature) |
| #5 | HU 1.4 - Manejo de rechazos y errores | cerrada | [`hu-1-4-manejo-de-rechazos-y-errores.feature`](hu-1-4-manejo-de-rechazos-y-errores.feature) |
| #7 | HU 1.5 - Comprobante del pago en pantalla | cerrada | [`hu-1-5-comprobante-del-pago-en-pantalla.feature`](hu-1-5-comprobante-del-pago-en-pantalla.feature) |
| #8 | HU 1.6 - Confirmación del estado del pago a Entradas | cerrada | [`hu-1-6-confirmacion-del-estado-del-pago-a-entradas.feature`](hu-1-6-confirmacion-del-estado-del-pago-a-entradas.feature) |
| #9 | HU 2.1 - Tokenización de tarjetas | abierta | [`hu-2-1-tokenizacion-de-tarjetas.feature`](hu-2-1-tokenizacion-de-tarjetas.feature) |
| #10 | HU 2.2 - Listado de tarjetas guardadas | abierta | [`hu-2-2-listado-de-tarjetas-guardadas.feature`](hu-2-2-listado-de-tarjetas-guardadas.feature) |
| #11 | HU 2.3 - Eliminar método de pago | abierta | [`hu-2-3-eliminar-metodo-de-pago.feature`](hu-2-3-eliminar-metodo-de-pago.feature) |
| #12 | HU 2.4 - Tarjeta por defecto | abierta | [`hu-2-4-tarjeta-por-defecto.feature`](hu-2-4-tarjeta-por-defecto.feature) |
| #13 | HU 2.5 - Alerta de tarjeta expirada | abierta | [`hu-2-5-alerta-de-tarjeta-expirada.feature`](hu-2-5-alerta-de-tarjeta-expirada.feature) |
| #14 | HU 2.6 - Gestión de datos de facturación | abierta | [`hu-2-6-gestion-de-datos-de-facturacion.feature`](hu-2-6-gestion-de-datos-de-facturacion.feature) |
| #15 | HU 2.7 - Checkout One-Click | abierta | [`hu-2-7-checkout-one-click.feature`](hu-2-7-checkout-one-click.feature) |
| #16 | HU 3.1 - Reembolso total de un pago aprobado | abierta | [`hu-3-1-reembolso-total-de-un-pago-aprobado.feature`](hu-3-1-reembolso-total-de-un-pago-aprobado.feature) |
| #17 | HU 3.2 - Reembolso parcial | abierta | [`hu-3-2-reembolso-parcial.feature`](hu-3-2-reembolso-parcial.feature) |
| #18 | HU 3.3 - Anulación del pago por reserva vencida o sin stock | abierta | [`hu-3-3-anulacion-del-pago-por-reserva-vencida-o-sin-stock.feature`](hu-3-3-anulacion-del-pago-por-reserva-vencida-o-sin-stock.feature) |
| #19 | HU 3.4 - Consulta de pagos para Promociones y el comprador | abierta | [`hu-3-4-consulta-de-pagos-para-promociones-y-el-comprador.feature`](hu-3-4-consulta-de-pagos-para-promociones-y-el-comprador.feature) |
| #20 | HU 3.5 - Panel de transacciones para el organizador | abierta | [`hu-3-5-panel-de-transacciones-para-el-organizador.feature`](hu-3-5-panel-de-transacciones-para-el-organizador.feature) |
| #21 | HU 3.6 - Exportación de conciliación | abierta | [`hu-3-6-exportacion-de-conciliacion.feature`](hu-3-6-exportacion-de-conciliacion.feature) |
| #22 | HU 3.7 - Gestión de Contracargos | abierta | [`hu-3-7-gestion-de-contracargos.feature`](hu-3-7-gestion-de-contracargos.feature) |
| #23 | HU 4.1 - Agregar entradas al carrito | cerrada | [`hu-4-1-agregar-entradas-al-carrito.feature`](hu-4-1-agregar-entradas-al-carrito.feature) |
| #24 | HU 4.2 - Visualización del resumen del carrito | cerrada | [`hu-4-2-visualizacion-del-resumen-del-carrito.feature`](hu-4-2-visualizacion-del-resumen-del-carrito.feature) |
| #25 | HU 4.3 - Ajuste de cantidad de entradas en el carrito | cerrada | [`hu-4-3-ajuste-de-cantidad-de-entradas-en-el-carrito.feature`](hu-4-3-ajuste-de-cantidad-de-entradas-en-el-carrito.feature) |
| #26 | HU 4.4 - Eliminar ítem del carrito | cerrada | [`hu-4-4-eliminar-item-del-carrito.feature`](hu-4-4-eliminar-item-del-carrito.feature) |
| #27 | HU 4.5 - Expiración del carrito (liberación temporal) | cerrada | [`hu-4-5-expiracion-del-carrito-liberacion-temporal.feature`](hu-4-5-expiracion-del-carrito-liberacion-temporal.feature) |
| #28 | HU 4.6 - Transición al Checkout (Ir a pagar) | cerrada | [`hu-4-6-transicion-al-checkout-ir-a-pagar.feature`](hu-4-6-transicion-al-checkout-ir-a-pagar.feature) |
| #29 | INT-01 · Recibir la orden de compra desde Entradas | cerrada | [`int-01-recibir-la-orden-de-compra-desde-entradas.feature`](int-01-recibir-la-orden-de-compra-desde-entradas.feature) |
| #30 | INT-02 · Enviar estado del pago y fecha de creación a Entradas | cerrada | [`int-02-enviar-estado-del-pago-y-fecha-de-creacion-a-entradas.feature`](int-02-enviar-estado-del-pago-y-fecha-de-creacion-a-entradas.feature) |
| #31 | INT-03 · Enviar id_pago a Entradas | cerrada | [`int-03-enviar-id-pago-a-entradas.feature`](int-03-enviar-id-pago-a-entradas.feature) |
| #32 | INT-04 · Enviar id_pago a Promociones | abierta | [`int-04-enviar-id-pago-a-promociones.feature`](int-04-enviar-id-pago-a-promociones.feature) |
| #33 | INT-05 · Validar el token de Auth | cerrada | [`int-05-validar-el-token-de-auth.feature`](int-05-validar-el-token-de-auth.feature) |

## Cómo escribir un escenario nuevo

```gherkin
# language: es
Característica: HU x.y - Título corto
  Como <rol>
  Quiero <acción>
  Para <beneficio>

  Escenario: <caso>
    Dado <estado inicial>
    Cuando <acción del usuario o de otro módulo>
    Entonces <resultado observable: respuesta HTTP, pantalla, fila en la base o mensaje en el broker>
```

- Un escenario prueba una sola cosa y siempre tiene **Dado**, **Cuando** y **Entonces**.
- El **Entonces** debe poder verificarse: un código HTTP con su error (`409 PAGO_NO_REEMBOLSABLE`), un texto en pantalla, una consulta SQL o un mensaje en una cola.
- Si cambian los criterios de un issue, se actualizan aquí y en el issue en el mismo commit.
