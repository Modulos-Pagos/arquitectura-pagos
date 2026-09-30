# Módulo de Pagos — TicketU (TITEC 2026-2)

| Carpeta | Qué es | Puerto |
|---|---|---|
| `backend/` | Microservicio de Pagos (Node.js + TypeScript + Express + PostgreSQL/Supabase + Stripe) | 3000 |
| `frontend/` | Pantalla de pago (Next.js + Stripe Elements, diseño del equipo) | 5173 |
| `GUIA_GITHUB_EVALUACION1.md` | Qué cambiar en GitHub (backlog, historias, issues de integración) | — |

## Levantar todo (dos terminales)

**Requisitos:** Node.js 22 o superior, base de datos en Supabase y cuenta de Stripe en modo prueba.

### Terminal 1: backend
```bash
cd backend
npm install
cp .env.example .env      # completar DATABASE_URL (Supabase, Session pooler), DATABASE_SSL=true,
                          # PASARELA=stripe, STRIPE_SECRET_KEY=sk_test_..., CHECKOUT_EMAIL_DEFECTO
npm run dev               # http://localhost:3000/api-docs (Swagger)
```
Base de datos: en Supabase → SQL Editor, ejecutar `backend/db/schema.sql`.

### Terminal 2: frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local   # pk_test_..., URL de la API y token (en backend: npm run token)
npm run dev                        # http://localhost:5173
```

## Probar el flujo completo
1. Swagger → Authorize (token de `npm run token`) → `POST /api/v1/pagos/transacciones`.
2. Abrir la `url_checkout` de la respuesta (`http://localhost:5173/?id_pago=...`).
3. Pagar con `4242 4242 4242 4242`, fecha futura, CVC cualquiera → **¡Pago confirmado!**
4. Rechazo: `4000 0000 0000 0002`. Reembolso: `POST /api/v1/pagos/{id_pago}/reembolso`.

El token del Swagger y el de `frontend/.env.local` deben ser del mismo usuario.

## Pruebas
- `cd backend && npm test`: 58 pruebas automáticas (requiere una BD PostgreSQL de test, ver `backend/README.md`).
- `backend/postman/`: colección de 24 casos (levantar el backend con `PASARELA=mock`).

**No subir a GitHub:** `.env`, `.env.local` ni `node_modules` (ya están en los `.gitignore`).

## Evidencias y documentación
| Qué | Dónde |
|---|---|
| Responsables por rol | [`RESPONSABLES.md`](RESPONSABLES.md) |
| Swagger propio y para otros módulos | `backend/docs/openapi.yaml` (servido en `/api-docs`) |
| Servicios consumidos de otros módulos | `backend/docs/openapi-servicios-consumidos.yaml`, `backend/src/integraciones/entradas.client.ts` |
| Script de creación, diagrama y diccionario de datos | `backend/db/schema.sql`, `backend/docs/base-de-datos/` |
| Pruebas de funcionalidad (evidencia) | `backend/docs/evidencias/pruebas-funcionales.txt` / `.junit.xml` |
| Pruebas de integración (evidencia Postman/Newman) | `backend/postman/`, `backend/docs/evidencias/postman-integracion.txt` / `.junit.xml` |
| Contrato de interfaz Pagos ↔ Entradas | `docs/contratos/Contrato_Pagos_Entradas_v2.1.docx` |
| Historias, sprints e integración | GitHub Issues, Milestones y Project "Progreso Modulo de Pagos" |
