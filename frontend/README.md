# Front del módulo de Pagos — TicketU (TITEC 2026-2)

Checkout con formulario de tarjeta propio (Stripe Elements) conectado al microservicio de Pagos.

## Flujo

1. **Paso 1 – Pago:** el usuario ingresa la tarjeta en los campos seguros de Stripe y el nombre del titular.
2. Al apretar **Confirmar y pagar**:
   - `POST /api/v1/pagos/transacciones` con `metodo: "formulario"` → el backend crea el PaymentIntent y devuelve `client_secret`.
   - `stripe.confirmCardPayment(client_secret)` → la tarjeta va **directo a Stripe** (nunca pasa por nuestro backend).
   - `GET /api/v1/pagos/{id_pago}` → el backend confirma con Stripe y actualiza la base de datos.
3. **Paso 2 – Confirmación:** muestra el estado final (APROBADO, RECHAZADO...), monto e ID de pago.

**Llegando desde Entradas:** el backend entrega `url_checkout = http://localhost:5173/?id_pago=...`. Al abrir esa URL,
el front carga el pago con `GET /api/v1/pagos/{id_pago}/checkout` (monto y `client_secret`) y lo cobra con el mismo formulario.
Sin `id_pago` en la URL, el front usa el pedido de ejemplo y crea el pago él mismo (modo demo).

Si la tarjeta es rechazada se muestra el error y se puede reintentar con el mismo pago (sin cobros dobles).

## Cómo ejecutar

Requisitos: backend de Pagos corriendo en `http://localhost:3000` con `PASARELA=stripe`.

```bash
npm install
cp .env.local.example .env.local   # completar las 3 variables
npm run dev                        # http://localhost:5173
```

| Variable | Qué es |
|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Llave **publicable** de Stripe (`pk_test_...`), de la misma cuenta que la `sk_test_` del backend |
| `NEXT_PUBLIC_PAGOS_API_URL` | `http://localhost:3000/api/v1/pagos` |
| `NEXT_PUBLIC_PAGOS_TOKEN` | Token JWT del comprador: en el backend ejecutar `npm run token` (sin la palabra `Bearer`) |

Tarjetas de prueba de Stripe: `4242 4242 4242 4242` (aprobada), `4000 0000 0000 0002` (rechazada), fecha futura y CVC cualquiera.

## Estructura

```
app/page.tsx                         → página del checkout
components/checkout/CheckoutPage.tsx → controla los pasos 1 y 2
components/checkout/CheckoutForm.tsx → formulario con Stripe Elements + llamada a la API
components/checkout/OrderSummary.tsx → resumen del pedido (subtotal, cargo por servicio, total)
components/checkout/Confirmacion.tsx → resultado del pago
lib/api.ts                           → cliente del microservicio de Pagos
lib/pedido.ts                        → pedido de ejemplo y cálculo de totales en CLP
lib/stripe.ts                        → carga de Stripe.js con la llave publicable
```
