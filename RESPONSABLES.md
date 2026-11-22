# Responsables por rol — Equipo Pagos (TITEC 2026-2)

## Evaluación 4: Entrega integrada en workstation (vigente)

Cada responsable responde por todos los ítems de su rol, verificados sobre lo instalado en workstation.
Plan, estado por ítem y guion de la presentación: [`docs/gestion/plan-evaluacion-4.md`](docs/gestion/plan-evaluacion-4.md).

| Rol | Ítems de la rúbrica | Responsable(s) |
|---|---|---|
| Back End | BE1, BE2, BE3 | Cristóbal Soto |
| Base de Datos | BD1, BD2, BD3, BD4 | Alonso Venegas |
| UI/UX (front end) | UI1, UI2, UI3 | Pablo Medina |
| Gestión | GE1, GE2, GE3, GE4 | Simón Canales (Scrum Master) |
| Calidad | CA1, CA2 | Ricardo Muñoz y Simón Canales |

### Evidencias por rol

| Rol | Dónde está |
|---|---|
| Back End | Swagger propio [`backend/docs/openapi.yaml`](backend/docs/openapi.yaml) (`/api-docs`) y de servicios consumidos [`backend/docs/openapi-servicios-consumidos.yaml`](backend/docs/openapi-servicios-consumidos.yaml) (`/api-docs/consumidos`); código de invocación en [`backend/src/integraciones/`](backend/src/integraciones); integraciones en [`INTEGRACIONES.md`](INTEGRACIONES.md) |
| Base de Datos | [`backend/docs/base-de-datos/`](backend/docs/base-de-datos) (cómo generar el diagrama desde la base del workstation, diagrama, diccionario) y [`backend/db/schema.sql`](backend/db/schema.sql) |
| UI/UX | Módulo `/pagos` del front común (FrontendTitec, `src/modules/pagos/`); estándares en [`frontend/ESTANDARES_UI.md`](frontend/ESTANDARES_UI.md) |
| Gestión | Milestone de la Entrega 4 e issues en GitHub; plan en [`docs/gestion/plan-evaluacion-4.md`](docs/gestion/plan-evaluacion-4.md) |
| Calidad | Pruebas automáticas ([`backend/tests/`](backend/tests), evidencia en [`backend/docs/evidencias/pruebas-funcionales.txt`](backend/docs/evidencias/pruebas-funcionales.txt)); pruebas de integración en workstation: [`docs/calidad/pruebas-integracion-workstation.md`](docs/calidad/pruebas-integracion-workstation.md) |

## Evaluación 3: Integraciones en workstation (histórico)

La nota es grupal (AU1, GW1 y BR1). Cada integrante tiene sus tareas en el milestone
[Evaluación 3 - Integraciones en workstation](https://github.com/Modulos-Pagos/arquitectura-pagos/milestone/6), con criterios en Gherkin;
el detalle está en [`docs/gestion/plan-evaluacion-3.md`](docs/gestion/plan-evaluacion-3.md).

| Rol | Tareas | Issues |
|---|---|---|
| Back End — Cristóbal Soto | `INSTALACION.md` y configuración del workstation; cola visible y trazas del broker; errores de la contraparte y control por rol | #35, #36, #37 |
| Base de Datos — Alonso Venegas | Base inicializada desde cero y consultas SQL de antes y después de cada integración | #38 |
| Front End — Pablo Medina | Flujo principal usable en workstation; mensajes de error comprensibles | #39, #40 |
| Integración — Ricardo Muñoz | `INTEGRACIONES.md` en el formato de la Evaluación 3; acuerdos con Auth, Platform Team y Entradas | #41, #42 |
| Gestión — Simón Canales | Seguimiento, entrega de las claves al ayudante, README, prueba de instalación en limpio y entrega en el aula virtual | #43 |

### Verificación en clase (jueves 19/11, 08:30)

| Paso | Responsable |
|---|---|
| Instalación: versión de `main`, base inicializada y configuración del workstation | Cristóbal Soto y Alonso Venegas |
| Flujo principal | Pablo Medina |
| I1 Auth, I2 API Gateway e I3 Broker | Ricardo Muñoz (con Cristóbal Soto en I2) |
| Registro de problemas y correcciones antes de las 23:59 | Simón Canales |

## Evaluación 2: Interoperabilidad (histórico)

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
