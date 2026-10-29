# Diccionario de datos — Microservicio de Pagos

> Generado automáticamente desde los comentarios (`COMMENT ON`) de la base de datos con `npm run db:docs` (2026-10-28T22:41:51.118Z).
> Fuente: [`db/schema.sql`](../../db/schema.sql).

## Convenciones de nomenclatura

- Tablas y columnas en `snake_case`, en español; tablas en plural.
- Llave primaria `id_<entidad>`; la llave foránea usa el mismo nombre que la PK referenciada.
- Fechas con prefijo `fecha_` y tipo `timestamptz` (UTC). Montos `integer` en CLP (sin decimales).
- Restricciones: `pk_<tabla>`, `fk_<tabla>_<tabla_ref>`, `uq_<tabla>_<columna>`, `ck_<tabla>_<columna>`, `idx_<tabla>_<columna>`.

## Tabla `pagos`

Intención de pago de una reserva de entradas. Un registro por reserva (idempotencia) con su estado y los identificadores del cobro en Stripe.

| # | Columna | Tipo | Nulo | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id_pago` | uuid | No | `gen_random_uuid()` | PK | Identificador único del pago (UUID v4). Se entrega a Entradas y Promociones. |
| 2 | `id_reserva` | varchar(64) | No |  | UK | Referencia a la reserva del módulo Entradas/Inventario (sin FK). Llave de idempotencia: una reserva tiene como máximo un pago. |
| 3 | `id_usuario` | varchar(64) | No |  |  | Referencia al usuario comprador (módulo Auth, sin FK). Se obtiene del token JWT, nunca del body. |
| 4 | `id_evento` | varchar(64) | Sí |  |  | Referencia al evento de la compra (módulo Catálogo/Panel, sin FK). La envía Entradas al crear el pago; se reenvía a Promociones en el evento pago.completado. |
| 5 | `nombre_codigo` | varchar(50) | Sí |  |  | Código de descuento aplicado a la compra (módulo Promociones, sin FK), p. ej. DESC50. NULL si no se usó código. Se reenvía a Promociones en pago.completado para descontar un uso. |
| 6 | `monto` | integer | No |  |  | Total a cobrar en la moneda indicada (CLP, sin decimales). Viene como "total" desde Entradas. |
| 7 | `moneda` | char(3) | No | `'CLP'::bpchar` |  | Código ISO 4217 de la moneda. Por defecto CLP. |
| 8 | `estado_pago` | varchar(20) | No | `'PENDIENTE'::character varying` |  | Estado del pago: PENDIENTE, APROBADO, RECHAZADO, ANULADO (cancelado antes de cobrar) o REEMBOLSADO (cobrado y devuelto). |
| 9 | `motivo_rechazo` | varchar(255) | Sí |  |  | Descripción del motivo cuando el estado es RECHAZADO (obligatorio en ese caso). |
| 10 | `stripe_session_id` | varchar(255) | Sí |  | UK | Id de la Checkout Session de Stripe (cs_...). Solo en el método checkout (página de Stripe); NULL en el método formulario. Permite conciliar webhooks y consultar el estado. |
| 11 | `stripe_payment_intent_id` | varchar(255) | Sí |  |  | Id del PaymentIntent de Stripe (pi_...). En el método formulario se crea junto con el pago; en el método checkout se obtiene al pagar. Necesario para anular o reembolsar. |
| 12 | `url_checkout` | text | Sí |  |  | URL donde el comprador paga: el formulario del front de Pagos (método formulario, por defecto) o la página de Stripe Checkout. Se reenvía si Entradas reintenta la misma reserva. |
| 13 | `fecha_expiracion` | timestamptz | Sí |  |  | Fecha y hora en que expira la sesión de Stripe Checkout (mínimo 30 minutos). NULL en el método formulario. |
| 14 | `fecha_creacion` | timestamptz | No | `now()` |  | Fecha y hora de creación de la intención de pago (se envía a Entradas). |
| 15 | `fecha_actualizacion` | timestamptz | No | `now()` |  | Fecha y hora de la última modificación del registro (mantenida por trigger). |

**Restricciones**

| Nombre | Tipo | Definición |
|---|---|---|
| `ck_pagos_estado_pago` | CHECK | `CHECK (((estado_pago)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'APROBADO'::character varying, 'RECHAZADO'::character varying, 'ANULADO'::character varying, 'REEMBOLSADO'::character varying])::text[])))` |
| `ck_pagos_moneda` | CHECK | `CHECK ((moneda ~ '^[A-Z]{3}$'::text))` |
| `ck_pagos_monto` | CHECK | `CHECK ((monto > 0))` |
| `ck_pagos_motivo_rechazo` | CHECK | `CHECK ((((estado_pago)::text <> 'RECHAZADO'::text) OR (motivo_rechazo IS NOT NULL)))` |
| `pk_pagos` | PRIMARY KEY | `PRIMARY KEY (id_pago)` |
| `uq_pagos_id_reserva` | UNIQUE | `UNIQUE (id_reserva)` |
| `uq_pagos_stripe_session_id` | UNIQUE | `UNIQUE (stripe_session_id)` |

## Tabla `destinatarios_pago`

Persona a quien se le emite la entrada cuando el comprador compra para otra persona. Sin fila = la entrada es para el comprador.

| # | Columna | Tipo | Nulo | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id_pago` | uuid | No |  | FK, PK | Pago al que pertenece (FK a pagos, 1 a 1). Se borra junto con el pago. |
| 2 | `nombre` | varchar(120) | No |  |  | Nombre completo del destinatario (el que aparecerá en la entrada). |
| 3 | `email` | varchar(254) | No |  |  | Correo del destinatario, para que Entradas/Notificaciones le envíen la entrada. |
| 4 | `rut` | varchar(12) | Sí |  |  | RUT del destinatario con dígito verificador (12345678-9), opcional. |
| 5 | `fecha_registro` | timestamptz | No | `now()` |  | Fecha y hora en que se registró o cambió el destinatario. |

**Restricciones**

| Nombre | Tipo | Definición |
|---|---|---|
| `ck_destinatarios_pago_email` | CHECK | `CHECK (((email)::text ~~ '%_@_%'::text))` |
| `ck_destinatarios_pago_rut` | CHECK | `CHECK (((rut IS NULL) OR ((rut)::text ~ '^[0-9]{7,8}-[0-9K]$'::text)))` |
| `fk_destinatarios_pago_pagos` | FOREIGN KEY | `FOREIGN KEY (id_pago) REFERENCES pagos(id_pago) ON DELETE CASCADE` |
| `pk_destinatarios_pago` | PRIMARY KEY | `PRIMARY KEY (id_pago)` |

## Tabla `eventos_webhook_stripe`

Eventos recibidos desde Stripe por webhook. Evita procesar dos veces el mismo evento y deja evidencia de la respuesta de la pasarela.

| # | Columna | Tipo | Nulo | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id_evento_stripe` | varchar(255) | No |  | PK | Id del evento en Stripe (evt_...). Llave primaria para deduplicar reintentos. |
| 2 | `tipo_evento` | varchar(100) | No |  |  | Tipo de evento de Stripe (ej: payment_intent.succeeded, checkout.session.completed, checkout.session.expired). |
| 3 | `id_pago` | uuid | Sí |  | FK | Pago asociado al evento (FK a pagos). NULL si el evento no corresponde a un pago conocido o si el pago fue eliminado por un ADMIN. |
| 4 | `payload` | jsonb | No |  |  | Contenido completo del evento tal como lo envió Stripe (JSON). |
| 5 | `fecha_recepcion` | timestamptz | No | `now()` |  | Fecha y hora en que se recibió el evento. |

**Restricciones**

| Nombre | Tipo | Definición |
|---|---|---|
| `fk_eventos_webhook_stripe_pagos` | FOREIGN KEY | `FOREIGN KEY (id_pago) REFERENCES pagos(id_pago) ON DELETE RESTRICT` |
| `pk_eventos_webhook_stripe` | PRIMARY KEY | `PRIMARY KEY (id_evento_stripe)` |

## Tabla `reembolsos`

Devoluciones de dinero de pagos APROBADOS (por ejemplo, cuando Entradas libera la reserva porque el usuario pagó tarde).

| # | Columna | Tipo | Nulo | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id_reembolso` | uuid | No | `gen_random_uuid()` | PK | Identificador único del reembolso (UUID v4). |
| 2 | `id_pago` | uuid | No |  | FK | Pago reembolsado (FK a pagos). |
| 3 | `monto` | integer | No |  |  | Monto devuelto en CLP (reembolso total = monto del pago). |
| 4 | `motivo` | varchar(255) | No |  |  | Motivo informado por quien solicita el reembolso. |
| 5 | `estado_reembolso` | varchar(20) | No |  |  | Estado del reembolso en la pasarela: PENDIENTE, EXITOSO o FALLIDO. |
| 6 | `stripe_refund_id` | varchar(255) | Sí |  | UK | Id del Refund en Stripe (re_...). |
| 7 | `fecha_creacion` | timestamptz | No | `now()` |  | Fecha y hora en que se solicitó el reembolso. |

**Restricciones**

| Nombre | Tipo | Definición |
|---|---|---|
| `ck_reembolsos_estado_reembolso` | CHECK | `CHECK (((estado_reembolso)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'EXITOSO'::character varying, 'FALLIDO'::character varying])::text[])))` |
| `ck_reembolsos_monto` | CHECK | `CHECK ((monto > 0))` |
| `fk_reembolsos_pagos` | FOREIGN KEY | `FOREIGN KEY (id_pago) REFERENCES pagos(id_pago) ON DELETE RESTRICT` |
| `pk_reembolsos` | PRIMARY KEY | `PRIMARY KEY (id_reembolso)` |
| `uq_reembolsos_stripe_refund_id` | UNIQUE | `UNIQUE (stripe_refund_id)` |
