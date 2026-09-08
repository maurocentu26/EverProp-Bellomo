# Trazabilidad API ↔ `/admin`

## Resultado final local

- Baseline auditado: 59 operaciones Laravel frente a 34 OpenAPI; 25 sin documentar.
- Working tree: se eliminaron tres setups HTTP y el DELETE de leads sin implementación.
- Contrato final: **55 operaciones Laravel y 55 OpenAPI; paridad 100%**.
- JSON OpenAPI: PASS; Redocly recommended lint: PASS.
- El CI raíz compara método+path en ambos sentidos y falla ante cualquier divergencia.
- Los schemas y códigos principales están documentados; no existe todavía contract testing de cada combinación de payload/respuesta.

| Grupo | Laravel | OpenAPI | Cobertura local | Estado |
|---|---:|---:|---|---|
| health, readiness, CSRF, auth | 6 | 6 | HTTP + PHPUnit + E2E API 2/2 | PASS local; live readiness FAIL |
| público + webhook | 6 | 6 | HTTP + PHPUnit idempotencia/firma | PASS local; catálogo live 404 |
| admin projects | 7 | 7 | PHPUnit de scope + contrato | PASS backend; UI CRUD no exhaustivo |
| admin properties | 8 | 8 | PHPUnit scope/precio + contrato | PASS backend |
| features | 6 | 6 | unitario/contrato | Sin UI administrativa exhaustiva |
| media | 6 | 6 | MIME/traversal/cross-tenant | PASS backend; UI ausente |
| leads | 5 | 5 | PHPUnit RBAC/paginación + E2E UI→API | PASS local crítico |
| lead ↔ property | 3 | 3 | PHPUnit/autorización + contrato | PASS backend; E2E UI parcial |
| follow-ups | 3 | 3 | PHPUnit RBAC/paginación + contrato | PASS backend |
| notifications | 5 | 5 | contrato + autenticación | Sin fixture funcional E2E completa |
| setup simulation | 0 | 0 | regresión de inexistencia | PASS local |

## Trazabilidad de pantallas

| Ruta UI | Requests principales | Evidencia | Resultado |
|---|---|---|---|
| `/login` | csrf, login, me, logout | PHPUnit + navegador API | Login 200 local; producción anónima 401 esperada |
| `/admin` | projects, properties, leads, follow-ups | Playwright mock + E2E API completo | PASS local; métricas reales parciales |
| `/admin/desarrollos` | GET projects/properties | mock + backend | Lectura backend PASS; CRUD UI no exhaustivo |
| `/admin/desarrollos/[id]` | GET catálogo, POST batch | mock + tests batch | RBAC/tenant backend PASS |
| `/admin/inventory-matrix` | GET catálogo, POST batch | mock + tests batch | Backend PASS; doble-submit UI pendiente |
| `/admin/properties` | GET projects/properties | mock + HTTP público/admin tests | Local PASS; live tenant FAIL |
| `/admin/properties/new` | GET projects, POST property | validación browser + backend | Persistencia UI API no recorrida en las cinco categorías |
| `/admin/properties/[id]` | GET, PATCH, publish | unit + backend | Contrato/versionado PASS; concurrencia UI pendiente |
| `/admin/leads` | GET leads/follow-ups paginados, PATCH/PUT | unit + mock + API real | Multipágina agregada; alta/reload reales confirmados |
| `/admin/leads/new` | GET catálogo multipágina, POST lead | browser API desktop/mobile | Login, submit 201, render y reload demostrados |
| `/admin/leads/[id]` | lead, follow-ups, properties | mock + backend | Backend autorizado; E2E real completo pendiente |
| `/admin/leads/[id]/edit` | GET, PUT/PATCH, associations | mock + backend | Backend PASS; UI API parcial |
| `/admin/agenda` | sin API integral | análisis + mock | FAIL funcional real; oculta en API |
| `/admin/comercial` | GET catálogo | mock + backend | Lectura local PASS |
| `/admin/settings` | sin API | análisis + browser | FAIL funcional; oculta/informativa en API |

## Operaciones agregadas al contrato

- Alias PUT de projects, properties, features y media.
- Batch de propiedades.
- Leads list/create/show/update PATCH+PUT.
- Asociaciones lead-propiedad attach/update/detach.
- Follow-ups global, por lead y create.
- Parámetros y metadata de paginación de leads/follow-ups, con respuestas 422.
- Notifications list/count/mark-one/mark-all/delete-all.

Las rutas de compatibilidad PUT se documentaron como `deprecated`; eliminarlas requiere una migración de clientes, no un borrado silencioso.
