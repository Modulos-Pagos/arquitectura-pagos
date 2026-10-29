# Módulo de Pagos — TicketU (TITEC 2026-2)

Microservicio de Pagos de TicketU. Recibe la orden de compra de Entradas/Inventario, cobra con Stripe (modo prueba),
informa el estado del pago (consulta y eventos en RabbitMQ) y permite reembolsos y anulaciones. Incluye la pantalla de pago
(checkout) del módulo, con la opción de **comprar la entrada para otra persona**.

Equipo y responsables por rol: [`RESPONSABLES.md`](RESPONSABLES.md).

| Carpeta | Contenido | Puerto |
|---|---|---|
| [`backend/`](backend) | Microservicio (Node.js 22, TypeScript, Express, PostgreSQL/Supabase, Stripe, RabbitMQ) | 3004 (`npm run dev` y Docker) |
| [`frontend/`](frontend) | Pantalla de pago (Next.js + Stripe Elements) | 5173 |
| [`docs/contratos/`](docs/contratos) | Contratos de interfaz con Entradas (v2.4), Auth (v1.4) y Promociones (v1.1) | — |

## Integración con la plataforma TicketU

Sigue la guía del Platform Team ([`FWizav/backendticketU`](https://github.com/FWizav/backendticketU)) y los contratos firmados:

| Con | Qué hace Pagos | Contrato |
|---|---|---|
| **API Gateway** | Rutas bajo `/api/pagos/...` (el Gateway no reescribe el path); contenedor `pagos-service` en la red `plataforma-eventos-net`; en el Gateway `PAGOS_SERVICE_URL=http://pagos-service:3000` | Guía del Platform Team |
| **Auth** | En cada petición valida la cookie `jwt` con `GET /internal/validar-sesion` (+ `x-api-key`); roles `usuario`, `organizador`, `staff`; si Auth no responde, 503 y no se cobra | [`Contrato_Auth_Pagos_v1.4.docx`](docs/contratos/Contrato_Auth_Pagos_v1.4.docx) |
| **Entradas/Inventario** | Recibe `POST /api/pagos/transacciones` con la cookie del comprador reenviada; verifica la reserva (`GET /api/entradas/reservas/{id}`, prefijo que exige el API Gateway); responde el estado y anula/reembolsa | [`Contrato_Pagos_Entradas_v2.4.docx`](docs/contratos/Contrato_Pagos_Entradas_v2.4.docx) |
| **RabbitMQ** | Publica `pago.realizado`, `pago.rechazado`, `pago.anulado`, `pago.reembolsado` en `ticketu.events` (`ticketu-rabbitmq`, vhost `ticketu`) | Guía del Platform Team |
| **Promociones** | Publica `pago.completado` con `id_pago`, `id_usuario`, `id_evento` y `nombre_codigo` | [`Contrato_Promociones_Pagos_v1.1.docx`](docs/contratos/Contrato_Promociones_Pagos_v1.1.docx) |

Detalle en [`backend/README.md`](backend/README.md) § 6. Pasos para levantar todo junto (Gateway, RabbitMQ, Auth, front común) y hacer la prueba de punta a punta: [`INTEGRACION.md`](INTEGRACION.md).

## Evidencias por ítem de la rúbrica

| Ítem | Evidencia |
|---|---|
| **BE1** Servicios propios | [`backend/docs/openapi.yaml`](backend/docs/openapi.yaml) (Swagger en `http://localhost:3004/api-docs`) |
| **BE2** Servicios que requerimos de otros squads | [`backend/src/integraciones/auth.client.ts`](backend/src/integraciones/auth.client.ts) (Auth), [`backend/src/integraciones/entradas.client.ts`](backend/src/integraciones/entradas.client.ts) (Entradas), [`backend/docs/openapi-servicios-consumidos.yaml`](backend/docs/openapi-servicios-consumidos.yaml) |
| **BE3** Servicios para otros módulos | Secciones *Entradas (consumidor)* y *Promociones (consumidor)* de [`backend/docs/openapi.yaml`](backend/docs/openapi.yaml); eventos en [`backend/src/integraciones/eventos/`](backend/src/integraciones/eventos) |
| **BD1–BD4** Diagrama relacional | [`backend/docs/base-de-datos/diagrama-relacional.md`](backend/docs/base-de-datos/diagrama-relacional.md) (generado desde la base de datos) |
| **BD3** Script de creación y diccionario | [`backend/db/schema.sql`](backend/db/schema.sql), [`backend/docs/base-de-datos/diccionario-datos.md`](backend/docs/base-de-datos/diccionario-datos.md) |
| **UI1–UI2** Aplicación | [`frontend/`](frontend) |
| **UI3** Estándar de UI acordado | [`frontend/ESTANDARES_UI.md`](frontend/ESTANDARES_UI.md), [`frontend/docs/Checklist_Consistencia_Visual.docx`](frontend/docs/Checklist_Consistencia_Visual.docx) |
| **GE1–GE4** Planificación, historias, avance e integración | [Issues](https://github.com/Modulos-Pagos/arquitectura-pagos/issues), [Milestones (sprints)](https://github.com/Modulos-Pagos/arquitectura-pagos/milestones), [Project "Progreso Modulo de Pagos"](https://github.com/orgs/Modulos-Pagos/projects/1), ítems de integración `INT-01` a `INT-05`, [contratos](docs/contratos) |
| **CA1** Pruebas de funcionalidad | [`backend/tests/`](backend/tests) (92 pruebas), resultado en [`pruebas-funcionales.txt`](backend/docs/evidencias/pruebas-funcionales.txt) y [`pruebas-funcionales.junit.xml`](backend/docs/evidencias/pruebas-funcionales.junit.xml) |
| **CA2** Pruebas de integración | Colección Postman en [`backend/postman/`](backend/postman) (37 casos, 61 aserciones), resultado en [`postman-integracion.txt`](backend/docs/evidencias/postman-integracion.txt) y [`postman-integracion.junit.xml`](backend/docs/evidencias/postman-integracion.junit.xml); eventos en RabbitMQ: [`prueba-rabbitmq-docker.txt`](backend/docs/evidencias/prueba-rabbitmq-docker.txt) |

## Cómo ejecutar

**Requisitos:** Node.js 22 o superior, PostgreSQL (Supabase, local o el contenedor `pagos-db`) y una cuenta de Stripe en modo prueba.

### Con la plataforma (Docker: Gateway + RabbitMQ + Auth)

```bash
docker network create plataforma-eventos-net    # una vez por máquina
# Platform Team: levantar event-broker/ y api-gateway/ (en su .env: PAGOS_SERVICE_URL=http://pagos-service:3000
#                y CORS_ORIGINS con http://localhost:5173)
cd backend
cp .env.example .env    # completar: STRIPE_*, AUTH_INTERNAL_API_KEY (la entrega Auth), BROKER_MODO=rabbitmq
docker compose up -d --build
```

Pagos queda en `http://localhost:8080/api/pagos/...` (por el Gateway). La sesión es la cookie `jwt` que pone Auth al iniciar sesión.

### Solo nuestro módulo (desarrollo, sin el servicio de Auth)

Pagos siempre valida la sesión con Auth por HTTP (contrato v1.4: no valida JWT por su cuenta). Sin el Auth real se usa el
**Auth simulado** del backend, que expone el mismo `GET /internal/validar-sesion` (no es parte de Pagos; solo desarrollo).

**Backend (terminal 1 y 2)**
```bash
cd backend
npm install
cp .env.example .env   # completar DATABASE_URL, PASARELA=stripe y STRIPE_SECRET_KEY (sk_test_...)
                       # AUTH_BASE_URL=http://localhost:3001 y AUTH_INTERNAL_API_KEY=clave-dev-local ya vienen para el simulado
npm run db:init        # crea o actualiza las tablas desde db/schema.sql (no borra datos)
npm run auth:simulado  # terminal 1: Auth simulado en http://localhost:3001
npm run dev            # terminal 2: Pagos en http://localhost:3004 (Swagger en /api-docs)
```

**Frontend (terminal 3)**
```bash
cd frontend
npm install
cp .env.local.example .env.local   # pk_test_..., NEXT_PUBLIC_PAGOS_API_URL=http://localhost:3004/api/pagos
                                   # NEXT_PUBLIC_LOGIN_URL=http://localhost:3001/login (ya viene)
npm run dev                        # http://localhost:5173
```

### Probar el flujo completo
1. Abrir `http://localhost:5173`: sin sesión, el front redirige al login (en desarrollo, el del Auth simulado, que deja la cookie `jwt` y vuelve). Luego muestra los datos de la sesión y prellena el titular.
2. (Opcional) En **¿Para quién es la entrada?** elegir *Para otra persona* y completar correo, nombre y RUT.
3. Pagar con la tarjeta de prueba `4242 4242 4242 4242` (fecha futura, CVC cualquiera). Rechazo: `4000 0000 0000 0002`.
4. Reembolso o anulación: `POST /api/pagos/{id_pago}/reembolso` (dueño del pago o staff). Token para Postman: `npm run token` (`Cookie: jwt=<token>`).
5. Eliminar un pago RECHAZADO o ANULADO (solo `staff`; con el simulado `npm run token -- usr-staff staff`): `DELETE /api/pagos/{id_pago}`.

Swagger no puede enviar cookies desde el navegador: los endpoints protegidos se prueban con Postman (`Cookie: jwt=...`) o el front.

### Pruebas
```bash
cd backend
npm test                 # 91 pruebas (requiere la BD de prueba DATABASE_URL_TEST); 92 con RABBITMQ_URL_TEST
npm run test:integracion # colección Postman (37 casos, 61 aserciones) con Newman; backend con PASARELA=mock y el Auth simulado corriendo
```

Más detalle del backend en [`backend/README.md`](backend/README.md) y del frontend en [`frontend/README.md`](frontend/README.md).

**No subir a GitHub:** `.env`, `.env.local` ni `node_modules` (ya están en `.gitignore`). La `AUTH_INTERNAL_API_KEY` y las llaves de Stripe se comparten solo por privado.
