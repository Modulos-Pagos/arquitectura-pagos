# Diccionario de datos — Microservicio de Pagos

> Generado automáticamente desde los comentarios (`COMMENT ON`) de la base de datos con `npm run db:docs` (2026-09-28T19:35:07.131Z).
> Fuente: [`db/schema.sql`](../../db/schema.sql).

## Convenciones de nomenclatura

- Tablas y columnas en `snake_case`, en español; tablas en plural.
- Llave primaria `id_<entidad>`; la llave foránea usa el mismo nombre que la PK referenciada.
- Fechas con prefijo `fecha_` y tipo `timestamptz` (UTC). Montos `integer` en CLP (sin decimales).
- Restricciones: `pk_<tabla>`, `fk_<tabla>_<tabla_ref>`, `uq_<tabla>_<columna>`, `ck_<tabla>_<columna>`, `idx_<tabla>_<columna>`.

## Tabla `pagos`

Intención de pago de una reserva de entradas. Un registro por reserva (idempotencia) con su estado y los datos de la sesión de Stripe.

| # | Columna | Tipo | Nulo | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id_pago` | uuid | No | `gen_random_uuid()` | PK | Identificador único del pago (UUID v4). Se entrega a Entradas y Promociones. |
| 2 | `id_reserva` | varchar(64) | No |  | UK | Referencia a la reserva del módulo Entradas/Inventario (sin FK). Llave de idempotencia: una reserva tiene como máximo un pago. |
| 3 | `id_usuario` | varchar(64) | No |  |  | Referencia al usuario comprador (módulo Auth, sin FK). Se obtiene del token JWT, nunca del body. |
| 4 | `monto` | integer | No |  |  | Total a cobrar en la moneda indicada (CLP, sin decimales). Viene como "total" desde Entradas. |
| 5 | `moneda` | char(3) | No | `'CLP'::bpchar` |  | Código ISO 4217 de la moneda. Por defecto CLP. |
| 6 | `estado_pago` | varchar(20) | No | `'PENDIENTE'::character varying` |  | Estado del pago: PENDIENTE, APROBADO, RECHAZADO, ANULADO (cancelado antes de cobrar) o REEMBOLSADO (cobrado y devuelto). |
| 7 | `motivo_rechazo` | varchar(255) | Sí |  |  | Descripción del motivo cuando el estado es RECHAZADO (obligatorio en ese caso). |
| 8 | `stripe_session_id` | varchar(255) | Sí |  | UK | Id de la Checkout Session de Stripe (cs_...). Permite conciliar webhooks y consultar el estado. |
| 9 | `stripe_payment_intent_id` | varchar(255) | Sí |  |  | Id del PaymentIntent de Stripe (pi_...), disponible una vez pagado. Necesario para reembolsar. |
| 10 | `url_checkout` | text | Sí |  |  | URL de Stripe donde el usuario completa el pago. Se reenvía si Entradas reintenta la misma reserva. |
| 11 | `fecha_expiracion` | timestamptz | Sí |  |  | Fecha y hora en que expira la sesión de checkout (mínimo 30 minutos según Stripe). |
| 12 | `fecha_creacion` | timestamptz | No | `now()` |  | Fecha y hora de creación de la intención de pago (se envía a Entradas). |
| 13 | `fecha_actualizacion` | timestamptz | No | `now()` |  | Fecha y hora de la última modificación del registro (mantenida por trigger). |

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

## Tabla `eventos_webhook_stripe`

Eventos recibidos desde Stripe por webhook. Evita procesar dos veces el mismo evento y deja evidencia de la respuesta de la pasarela.

| # | Columna | Tipo | Nulo | Por defecto | Llave | Descripción |
|---|---|---|---|---|---|---|
| 1 | `id_evento_stripe` | varchar(255) | No |  | PK | Id del evento en Stripe (evt_...). Llave primaria para deduplicar reintentos. |
| 2 | `tipo_evento` | varchar(100) | No |  |  | Tipo de evento de Stripe (ej: checkout.session.completed, checkout.session.expired). |
| 3 | `id_pago` | uuid | Sí |  | FK | Pago asociado al evento (FK a pagos). NULL si el evento no corresponde a un pago conocido. |
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
