# Front del módulo de Pagos — TicketU (TITEC 2026-2)

Checkout con formulario de tarjeta propio (Stripe Elements) conectado al microservicio de Pagos **a través del API Gateway**
(`http://localhost:8080/api/pagos`).

## Flujo

1. **Paso 1 – Pago**
   - **Información de contacto:** nombre, correo y RUT del comprador según su **sesión de Auth** (`GET /api/pagos/comprador/perfil`;
     Pagos los obtiene al validar la cookie `jwt` con Auth, contrato v1.3). El nombre prellena el titular de la tarjeta (editable).
     Sin sesión válida (401) aparece **Iniciar sesión**; si Auth no responde (503) no se puede pagar (fail-secure).
   - **¿Para quién es la entrada?**
     - *Para mí*: la entrada queda a nombre del comprador.
     - *Para otra persona*: se escriben su correo, nombre y RUT (Auth no expone búsqueda de usuarios); la entrada le llega a ese correo.
   - **Método de pago:** tarjeta en los campos seguros de Stripe y nombre del titular.
2. Al apretar **Confirmar y pagar**:
   - `POST /api/pagos/transacciones` con `metodo: "formulario"` → el backend crea el PaymentIntent y devuelve `client_secret`.
   - `PUT /api/pagos/{id_pago}/destinatario` si la entrada es para otra persona (o `DELETE` si se volvió a *Para mí*).
   - `stripe.confirmCardPayment(client_secret)` → la tarjeta va **directo a Stripe** (nunca pasa por nuestro backend).
   - `GET /api/pagos/{id_pago}` → el backend confirma con Stripe y actualiza la base de datos.
3. **Paso 2 – Confirmación:** estado final (APROBADO, RECHAZADO...), monto, ID de pago y, si corresponde, a quién se le enviará la entrada.

**Llegando desde Entradas:** el backend entrega `url_checkout = http://localhost:5173/?id_pago=...`. Al abrir esa URL,
el front carga el pago con `GET /api/pagos/{id_pago}/checkout` (monto, `client_secret` y destinatario si ya se había elegido)
y lo cobra con el mismo formulario. Sin `id_pago` en la URL, el front usa el pedido de ejemplo y crea el pago él mismo (modo demo).

Si la tarjeta es rechazada se muestra el error y se puede reintentar con el mismo pago (sin cobros dobles).

**Campana de notificaciones (header):** según el estándar del equipo de Notificaciones. Mientras ese módulo no exponga su API,
muestra un aviso local con el resultado del pago.

## Cómo ejecutar

Requisitos: backend de Pagos corriendo (por el Gateway en `:8080` o directo en `:3004`).
Todas las llamadas van con `credentials: 'include'` para que el navegador envíe la cookie `jwt`. Por eso:
- con el Gateway, su `CORS_ORIGINS` debe incluir `http://localhost:5173`;
- directo al backend, su `CORS_ORIGIN` debe incluir `http://localhost:5173` (es el valor por defecto).
- La cookie es `SameSite=Strict`: el front debe estar en el mismo sitio que Auth (en local, `localhost` con cualquier puerto sirve).
- El front no maneja tokens: la cookie `jwt` la pone Auth al iniciar sesión. En desarrollo, con el Auth simulado del backend (`npm run auth:simulado`), abrir el checkout lleva solo a `http://localhost:3001/login`, que deja la cookie y vuelve.

```bash
npm install
cp .env.local.example .env.local   # completar las variables
npm run dev                        # http://localhost:5173
```

| Variable | Qué es |
|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Llave **publicable** de Stripe (`pk_test_...`), de la misma cuenta que la `sk_test_` del backend |
| `NEXT_PUBLIC_GATEWAY_URL` | API Gateway del Platform Team (por defecto `http://localhost:8080`); el front llama a `.../api/pagos` |
| `NEXT_PUBLIC_PAGOS_API_URL` | Opcional, solo sin Gateway: `http://localhost:3004/api/pagos` (vacío = usar el Gateway) |
| `NEXT_PUBLIC_LOGIN_URL` | Página de inicio de sesión de Auth: con 401 el front redirige ahí (con `?volver=` a la página actual). Vacío = `NEXT_PUBLIC_PORTAL_URL` + `/login`. En desarrollo, el Auth simulado del backend: `http://localhost:3001/login` |

Las variables `NEXT_PUBLIC_*` se incrustan al compilar: si las cambias, reinicia `npm run dev` (o vuelve a ejecutar `npm run build`).

Tarjetas de prueba de Stripe: `4242 4242 4242 4242` (aprobada), `4000 0000 0000 0002` (rechazada), fecha futura y CVC cualquiera.

## Estructura

```
app/page.tsx                         → página del checkout
components/checkout/CheckoutPage.tsx → controla los pasos 1 y 2 y carga el perfil del comprador
components/checkout/CheckoutForm.tsx → contacto + destinatario + Stripe Elements + llamadas a la API
components/checkout/ParaQuien.tsx    → "¿Para quién es la entrada?" (Para mí / Para otra persona)
components/checkout/OrderSummary.tsx → resumen del pedido (subtotal, cargo por servicio, total)
components/checkout/Confirmacion.tsx → resultado del pago
components/layout/Header.tsx         → header estándar (menú, buscar, campana, carrito, avatar)
components/layout/Notificaciones.tsx → campana de notificaciones (círculo 36px en área de 44px; se cierra con clic fuera o Escape)
lib/api.ts                           → cliente del microservicio de Pagos (vía Gateway, con la cookie de sesión)
lib/destinatario.ts                  → validación de correo y RUT (mismas reglas que el backend)
lib/pedido.ts                        → pedido de ejemplo y cálculo de totales en CLP
lib/stripe.ts                        → carga de Stripe.js con la llave publicable
```
