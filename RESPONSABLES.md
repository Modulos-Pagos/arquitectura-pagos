# Responsables por rol — Equipo Pagos (TITEC 2026-2)

## Evaluación 2: Interoperabilidad (vigente)

Cada integrante responde por el ítem de la rúbrica de su rol, verificado en las dos integraciones declaradas en
[`INTEGRACIONES.md`](INTEGRACIONES.md) (I1: Entradas, I2: Auth).

| Rol | Ítems de la rúbrica | Responsable(s) |
|---|---|---|
| Back End | BE1 | Cristóbal Soto |
| Base de Datos | BD1 | Alonso Venegas |
| UI/UX (front end) | UI1 | Pablo Medina |
| Gestión | GE1 | Simón Canales |
| Calidad | CA1 | Ricardo Muñoz y Simón Canales |

### Evidencias por rol

| Rol | Evidencia en el repositorio |
|---|---|
| Back End (BE1) | Código: [`backend/src/integraciones/entradas.client.ts`](backend/src/integraciones/entradas.client.ts) (I1) y [`backend/src/integraciones/auth.client.ts`](backend/src/integraciones/auth.client.ts) (I2). Contratos: [`docs/contratos/`](docs/contratos) (Entradas v2.5, Auth v1.5) y [`backend/docs/openapi-servicios-consumidos.yaml`](backend/docs/openapi-servicios-consumidos.yaml). Ejecución: líneas `[integración]` del log en [`backend/docs/evidencias/integraciones/`](backend/docs/evidencias/integraciones) |
| Base de Datos (BD1) | Consultas antes y después de cada integración (`01-bd-antes.txt`, `03-bd-despues.txt`) en [`backend/docs/evidencias/integraciones/`](backend/docs/evidencias/integraciones); consultas de referencia en [`backend/docs/evidencias/consultas-integraciones.sql`](backend/docs/evidencias/consultas-integraciones.sql); modelo en [`backend/db/schema.sql`](backend/db/schema.sql) |
| UI/UX (UI1) | Módulo de Pagos en el front común (`FrontendTitec`, `src/modules/pagos/`, ruta `/pagos`, Pull Request de la rama `feature/pagos-formulario-checkout`) y front propio [`frontend/`](frontend) |
| Gestión (GE1) | Issues de cada integración (ver tabla de [`INTEGRACIONES.md`](INTEGRACIONES.md)) con criterios de aceptación, contraparte, contrato, responsable y PR; texto de referencia en [`docs/gestion/issues-integraciones.md`](docs/gestion/issues-integraciones.md) |
| Calidad (CA1) | Colección [`backend/postman/Integraciones-reales.postman_collection.json`](backend/postman/Integraciones-reales.postman_collection.json) (casos de éxito y de error de I1 e I2, contra los servicios reales) y su ejecución con fecha en [`backend/docs/evidencias/integraciones/`](backend/docs/evidencias/integraciones); pruebas automáticas en [`backend/tests/`](backend/tests) |

## Evaluación 1 (histórico)

| Rol | Ítems de la rúbrica | Responsable(s) |
|---|---|---|
| Back End | BE1, BE2, BE3 | Cristóbal Soto |
| Base de Datos | BD1, BD2, BD3, BD4 | Alonso Venegas |
| UI/UX (front end) | UI1, UI2, UI3 | Pablo Medina |
| Gestión | GE1, GE2, GE3, GE4 | Simón Canales |
| Calidad | CA1, CA2 | Simón Canales (QA) y Ricardo Muñoz (Integración) |
