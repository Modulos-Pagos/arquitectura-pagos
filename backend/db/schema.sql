-- =====================================================================
--  Microservicio de Pagos — TicketU / TITEC 2026-2
--  Script de creación de la base de datos + diccionario de datos
--  Motor: PostgreSQL 14+ (compatible con Supabase)
--
--  Uso:
--    psql "$DATABASE_URL" -f db/schema.sql      (o: npm run db:init)
--    En Supabase: SQL Editor > pegar este archivo > Run
--
--  Convenciones de nomenclatura:
--    * Tablas y columnas en snake_case, en español; tablas en plural.
--    * Llave primaria: id_<entidad en singular>   (ej: id_pago)
--    * Llave foránea: mismo nombre que la PK referenciada.
--    * Fechas: prefijo fecha_ y tipo TIMESTAMPTZ (UTC).
--    * Montos: INTEGER en pesos chilenos (CLP no tiene decimales).
--    * Restricciones: pk_<tabla>, fk_<tabla>_<tabla_ref>, uq_<tabla>_<col>,
--      ck_<tabla>_<col>, idx_<tabla>_<col>.
--
--  Regla de datos entre módulos (BD2):
--    id_reserva e id_usuario son identificadores de referencia
--    de otros microservicios (Entradas y Auth). Se guardan
--    SIN llave foránea y SIN replicar datos de negocio de esos módulos.
--
--  El diccionario de datos está en los COMMENT ON de este script
--  (npm run db:docs lo exporta a docs/base-de-datos/).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Tabla: pagos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagos (
    id_pago                   UUID          NOT NULL DEFAULT gen_random_uuid(),
    id_reserva                VARCHAR(64)   NOT NULL,
    id_usuario                VARCHAR(64)   NOT NULL,
    monto                     INTEGER       NOT NULL,
    moneda                    CHAR(3)       NOT NULL DEFAULT 'CLP',
    estado_pago               VARCHAR(20)   NOT NULL DEFAULT 'PENDIENTE',
    motivo_rechazo            VARCHAR(255)  NULL,
    stripe_session_id         VARCHAR(255)  NULL,
    stripe_payment_intent_id  VARCHAR(255)  NULL,
    url_checkout              TEXT          NULL,
    fecha_expiracion          TIMESTAMPTZ   NULL,
    fecha_creacion            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    fecha_actualizacion       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT pk_pagos PRIMARY KEY (id_pago),
    CONSTRAINT uq_pagos_id_reserva UNIQUE (id_reserva),
    CONSTRAINT uq_pagos_stripe_session_id UNIQUE (stripe_session_id),
    CONSTRAINT ck_pagos_monto CHECK (monto > 0),
    CONSTRAINT ck_pagos_moneda CHECK (moneda ~ '^[A-Z]{3}$'),
    CONSTRAINT ck_pagos_estado_pago CHECK (
        estado_pago IN ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'ANULADO', 'REEMBOLSADO')
    ),
    CONSTRAINT ck_pagos_motivo_rechazo CHECK (
        estado_pago <> 'RECHAZADO' OR motivo_rechazo IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_pagos_id_usuario  ON pagos (id_usuario);
CREATE INDEX IF NOT EXISTS idx_pagos_estado_pago ON pagos (estado_pago);

COMMENT ON TABLE  pagos IS 'Intención de pago de una reserva de entradas. Un registro por reserva (idempotencia) con su estado y los datos de la sesión de Stripe.';
COMMENT ON COLUMN pagos.id_pago                  IS 'Identificador único del pago (UUID v4). Se entrega a Entradas y Promociones.';
COMMENT ON COLUMN pagos.id_reserva               IS 'Referencia a la reserva del módulo Entradas/Inventario (sin FK). Llave de idempotencia: una reserva tiene como máximo un pago.';
COMMENT ON COLUMN pagos.id_usuario               IS 'Referencia al usuario comprador (módulo Auth, sin FK). Se obtiene del token JWT, nunca del body.';
COMMENT ON COLUMN pagos.monto                    IS 'Total a cobrar en la moneda indicada (CLP, sin decimales). Viene como "total" desde Entradas.';
COMMENT ON COLUMN pagos.moneda                   IS 'Código ISO 4217 de la moneda. Por defecto CLP.';
COMMENT ON COLUMN pagos.estado_pago              IS 'Estado del pago: PENDIENTE, APROBADO, RECHAZADO, ANULADO (cancelado antes de cobrar) o REEMBOLSADO (cobrado y devuelto).';
COMMENT ON COLUMN pagos.motivo_rechazo           IS 'Descripción del motivo cuando el estado es RECHAZADO (obligatorio en ese caso).';
COMMENT ON COLUMN pagos.stripe_session_id        IS 'Id de la Checkout Session de Stripe (cs_...). Permite conciliar webhooks y consultar el estado.';
COMMENT ON COLUMN pagos.stripe_payment_intent_id IS 'Id del PaymentIntent de Stripe (pi_...), disponible una vez pagado. Necesario para reembolsar.';
COMMENT ON COLUMN pagos.url_checkout             IS 'URL de Stripe donde el usuario completa el pago. Se reenvía si Entradas reintenta la misma reserva.';
COMMENT ON COLUMN pagos.fecha_expiracion         IS 'Fecha y hora en que expira la sesión de checkout (mínimo 30 minutos según Stripe).';
COMMENT ON COLUMN pagos.fecha_creacion           IS 'Fecha y hora de creación de la intención de pago (se envía a Entradas).';
COMMENT ON COLUMN pagos.fecha_actualizacion      IS 'Fecha y hora de la última modificación del registro (mantenida por trigger).';

-- ---------------------------------------------------------------------
-- Tabla: reembolsos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reembolsos (
    id_reembolso      UUID          NOT NULL DEFAULT gen_random_uuid(),
    id_pago           UUID          NOT NULL,
    monto             INTEGER       NOT NULL,
    motivo            VARCHAR(255)  NOT NULL,
    estado_reembolso  VARCHAR(20)   NOT NULL,
    stripe_refund_id  VARCHAR(255)  NULL,
    fecha_creacion    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT pk_reembolsos PRIMARY KEY (id_reembolso),
    CONSTRAINT fk_reembolsos_pagos FOREIGN KEY (id_pago)
        REFERENCES pagos (id_pago) ON DELETE RESTRICT,
    CONSTRAINT uq_reembolsos_stripe_refund_id UNIQUE (stripe_refund_id),
    CONSTRAINT ck_reembolsos_monto CHECK (monto > 0),
    CONSTRAINT ck_reembolsos_estado_reembolso CHECK (
        estado_reembolso IN ('PENDIENTE', 'EXITOSO', 'FALLIDO')
    )
);

CREATE INDEX IF NOT EXISTS idx_reembolsos_id_pago ON reembolsos (id_pago);

COMMENT ON TABLE  reembolsos IS 'Devoluciones de dinero de pagos APROBADOS (por ejemplo, cuando Entradas libera la reserva porque el usuario pagó tarde).';
COMMENT ON COLUMN reembolsos.id_reembolso     IS 'Identificador único del reembolso (UUID v4).';
COMMENT ON COLUMN reembolsos.id_pago          IS 'Pago reembolsado (FK a pagos).';
COMMENT ON COLUMN reembolsos.monto            IS 'Monto devuelto en CLP (reembolso total = monto del pago).';
COMMENT ON COLUMN reembolsos.motivo           IS 'Motivo informado por quien solicita el reembolso.';
COMMENT ON COLUMN reembolsos.estado_reembolso IS 'Estado del reembolso en la pasarela: PENDIENTE, EXITOSO o FALLIDO.';
COMMENT ON COLUMN reembolsos.stripe_refund_id IS 'Id del Refund en Stripe (re_...).';
COMMENT ON COLUMN reembolsos.fecha_creacion   IS 'Fecha y hora en que se solicitó el reembolso.';

-- ---------------------------------------------------------------------
-- Tabla: eventos_webhook_stripe (recepción de avisos de la API externa)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eventos_webhook_stripe (
    id_evento_stripe  VARCHAR(255)  NOT NULL,
    tipo_evento       VARCHAR(100)  NOT NULL,
    id_pago           UUID          NULL,
    payload           JSONB         NOT NULL,
    fecha_recepcion   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT pk_eventos_webhook_stripe PRIMARY KEY (id_evento_stripe),
    CONSTRAINT fk_eventos_webhook_stripe_pagos FOREIGN KEY (id_pago)
        REFERENCES pagos (id_pago) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_eventos_webhook_stripe_id_pago ON eventos_webhook_stripe (id_pago);

COMMENT ON TABLE  eventos_webhook_stripe IS 'Eventos recibidos desde Stripe por webhook. Evita procesar dos veces el mismo evento y deja evidencia de la respuesta de la pasarela.';
COMMENT ON COLUMN eventos_webhook_stripe.id_evento_stripe IS 'Id del evento en Stripe (evt_...). Llave primaria para deduplicar reintentos.';
COMMENT ON COLUMN eventos_webhook_stripe.tipo_evento      IS 'Tipo de evento de Stripe (ej: checkout.session.completed, checkout.session.expired).';
COMMENT ON COLUMN eventos_webhook_stripe.id_pago          IS 'Pago asociado al evento (FK a pagos). NULL si el evento no corresponde a un pago conocido o si el pago fue eliminado por un ADMIN.';
COMMENT ON COLUMN eventos_webhook_stripe.payload          IS 'Contenido completo del evento tal como lo envió Stripe (JSON).';
COMMENT ON COLUMN eventos_webhook_stripe.fecha_recepcion  IS 'Fecha y hora en que se recibió el evento.';

-- ---------------------------------------------------------------------
-- Trigger: mantiene pagos.fecha_actualizacion
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_pagos_actualizar_fecha()
RETURNS TRIGGER AS $$
BEGIN
    NEW.fecha_actualizacion := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pagos_fecha_actualizacion ON pagos;
CREATE TRIGGER trg_pagos_fecha_actualizacion
    BEFORE UPDATE ON pagos
    FOR EACH ROW EXECUTE FUNCTION fn_pagos_actualizar_fecha();

COMMIT;
