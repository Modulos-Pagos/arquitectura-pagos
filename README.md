# Módulo de Pagos — TicketU (TITEC 2026-2)

Microservicio de Pagos de TicketU. Recibe la orden de compra de Entradas/Inventario, cobra con Stripe (modo prueba),
informa el estado del pago y permite reembolsos y anulaciones. Incluye la pantalla de pago (checkout) del módulo.

Equipo y responsables por rol: [`RESPONSABLES.md`](RESPONSABLES.md).

| Carpeta | Contenido | Puerto |
|---|---|---|
| [`backend/`](backend) | Microservicio (Node.js 22, TypeScript, Express, PostgreSQL/Supabase, Stripe) | 3000 |
| [`frontend/`](frontend) | Pantalla de pago (Next.js + Stripe Elements) | 5173 |
| [`docs/contratos/`](docs/contratos) | Contrato de interfaz Pagos ↔ Entradas | — |

## Evidencias por ítem de la rúbrica

| Ítem | Evidencia |
|---|---|
| **BE1** Servicios propios | [`backend/docs/openapi.yaml`](backend/docs/openapi.yaml) (Swagger en `http://localhost:3000/api-docs`) |
| **BE2** Servicios que requerimos de otros squads | [`backend/src/integraciones/entradas.client.ts`](backend/src/integraciones/entradas.client.ts), [`backend/docs/openapi-servicios-consumidos.yaml`](backend/docs/openapi-servicios-consumidos.yaml) |
| **BE3** Servicios para otros módulos | Secciones *Entradas (consumidor)* y *Promociones (consumidor)* de [`backend/docs/openapi.yaml`](backend/docs/openapi.yaml) |
| **BD1–BD4** Diagrama relacional | [`backend/docs/base-de-datos/diagrama-relacional.md`](backend/docs/base-de-datos/diagrama-relacional.md) (generado desde la base de datos) |
| **BD3** Script de creación y diccionario | [`backend/db/schema.sql`](backend/db/schema.sql), [`backend/docs/base-de-datos/diccionario-datos.md`](backend/docs/base-de-datos/diccionario-datos.md) |
| **UI1–UI2** Aplicación | [`frontend/`](frontend) |
| **UI3** Estándar de UI acordado | [`frontend/ESTANDARES_UI.md`](frontend/ESTANDARES_UI.md), [`frontend/docs/Checklist_Consistencia_Visual.docx`](frontend/docs/Checklist_Consistencia_Visual.docx) |
| **GE1–GE4** Planificación, historias, avance e integración | [Issues](https://github.com/Modulos-Pagos/arquitectura-pagos/issues), [Milestones (sprints)](https://github.com/Modulos-Pagos/arquitectura-pagos/milestones), [Project "Progreso Modulo de Pagos"](https://github.com/orgs/Modulos-Pagos/projects/1), ítems de integración `INT-01` a `INT-05` |
| **CA1** Pruebas de funcionalidad | [`backend/tests/`](backend/tests), resultado en [`pruebas-funcionales.txt`](backend/docs/evidencias/pruebas-funcionales.txt) y [`pruebas-funcionales.junit.xml`](backend/docs/evidencias/pruebas-funcionales.junit.xml) |
| **CA2** Pruebas de integración | Colección Postman en [`backend/postman/`](backend/postman), resultado en [`postman-integracion.txt`](backend/docs/evidencias/postman-integracion.txt), [`postman-integracion.junit.xml`](backend/docs/evidencias/postman-integracion.junit.xml) y [`postman-runner.jpg`](backend/docs/evidencias/postman-runner.jpg) |

## Cómo ejecutar

**Requisitos:** Node.js 22 o superior, PostgreSQL (Supabase o local) y una cuenta de Stripe en modo prueba.

### Backend (terminal 1)
```bash
cd backend
npm install
cp .env.example .env   # completar DATABASE_URL, PASARELA=stripe y STRIPE_SECRET_KEY (sk_test_...)
npm run db:init        # crea las tablas desde db/schema.sql (o ejecutarlo en Supabase > SQL Editor)
npm run dev            # Swagger en http://localhost:3000/api-docs
```

### Frontend (terminal 2)
```bash
cd frontend
npm install
cp .env.local.example .env.local   # llave pk_test_..., URL de la API y token (en backend: npm run token)
npm run dev                        # http://localhost:5173
```

### Probar el flujo completo
1. En Swagger, **Authorize** con el token de `npm run token` y ejecutar `POST /api/v1/pagos/transacciones`.
2. Abrir la `url_checkout` de la respuesta (`http://localhost:5173/?id_pago=...`).
3. Pagar con la tarjeta de prueba `4242 4242 4242 4242` (fecha futura, CVC cualquiera). Para probar un rechazo: `4000 0000 0000 0002`.
4. Reembolso o anulación: `POST /api/v1/pagos/{id_pago}/reembolso`.
5. Eliminar un pago RECHAZADO o ANULADO (solo rol ADMIN, token de `npm run token -- usr-admin ADMIN`): `DELETE /api/v1/pagos/{id_pago}`.

El token usado en Swagger y el de `frontend/.env.local` deben ser del mismo usuario.

### Pruebas
```bash
cd backend
npm test                 # 62 pruebas (requiere la BD de prueba DATABASE_URL_TEST)
npm run test:integracion # colección Postman (28 casos, 47 aserciones) con Newman; backend corriendo con PASARELA=mock
```

Más detalle del backend en [`backend/README.md`](backend/README.md) y del frontend en [`frontend/README.md`](frontend/README.md).
