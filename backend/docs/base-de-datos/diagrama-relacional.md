# Diagrama relacional — Microservicio de Pagos

> Generado automáticamente desde la base de datos con `npm run db:docs` (2026-09-30T20:44:03.452Z).
> GitHub dibuja el diagrama a partir del bloque Mermaid. Para una imagen: DBeaver/pgAdmin > ER Diagram,
> o en Supabase: Database > Schema Visualizer.

```mermaid
erDiagram
    pagos {
        uuid id_pago PK "NOT NULL"
        varchar_64 id_reserva UK "NOT NULL"
        varchar_64 id_usuario "NOT NULL"
        integer monto "NOT NULL"
        char_3 moneda "NOT NULL"
        varchar_20 estado_pago "NOT NULL"
        varchar_255 motivo_rechazo "NULL"
        varchar_255 stripe_session_id UK "NULL"
        varchar_255 stripe_payment_intent_id "NULL"
        text url_checkout "NULL"
        timestamptz fecha_expiracion "NULL"
        timestamptz fecha_creacion "NOT NULL"
        timestamptz fecha_actualizacion "NOT NULL"
    }
    eventos_webhook_stripe {
        varchar_255 id_evento_stripe PK "NOT NULL"
        varchar_100 tipo_evento "NOT NULL"
        uuid id_pago FK "NULL"
        jsonb payload "NOT NULL"
        timestamptz fecha_recepcion "NOT NULL"
    }
    reembolsos {
        uuid id_reembolso PK "NOT NULL"
        uuid id_pago FK "NOT NULL"
        integer monto "NOT NULL"
        varchar_255 motivo "NOT NULL"
        varchar_20 estado_reembolso "NOT NULL"
        varchar_255 stripe_refund_id UK "NULL"
        timestamptz fecha_creacion "NOT NULL"
    }
    pagos |o--o{ eventos_webhook_stripe : "id_pago"
    pagos ||--o{ reembolsos : "id_pago"
```

## Referencias a otros módulos (sin llave foránea)

Por el patrón *Database per Service*, estos identificadores apuntan a datos de otros microservicios.
Se guardan solo como referencia; no se replican datos de negocio de otros squads (ítem BD2).

| Columna | Módulo dueño del dato |
|---|---|
| `pagos.id_reserva` | Entradas/Inventario |
| `pagos.id_evento` | Panel organizador / Catálogo |
| `pagos.id_usuario` | Auth |

## Relaciones

| Restricción | Tabla hija | Columna | Tabla padre |
|---|---|---|---|
| `fk_eventos_webhook_stripe_pagos` | eventos_webhook_stripe | id_pago | pagos |
| `fk_reembolsos_pagos` | reembolsos | id_pago | pagos |

Todas las llaves foráneas apuntan a `pagos`: el diseño no tiene ciclos.
