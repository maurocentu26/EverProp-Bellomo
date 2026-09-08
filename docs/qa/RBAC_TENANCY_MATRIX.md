# Matriz RBAC y multitenancy

**Estado global: PASS parcial dinámico.** Se ejecutaron casos negativos críticos con PHP 8.4 + MySQL 8.4, pero no hay un E2E positivo/negativo completo para los seis roles en todas las operaciones.

Leyenda: `A` permitido esperado, `D` denegado esperado, `S` limitado por scope/asignación, `?` contrato UI incompleto.

| Capacidad | SUPER_ADMIN | TENANT_ADMIN | SALES_MANAGER | SALES_ADVISOR | BOT_OPERATOR | READ_ONLY |
|---|---:|---:|---:|---:|---:|---:|
| viewAny / view | A | A | A | S | ? | A |
| create | A | A | A | S | ? | D |
| update | A | A | A | S | ? | D |
| delete | A | A | según policy | D/S | ? | D |
| publish | A | A | según policy | D/S | ? | D |
| assign | A | A | A | D | D | D |
| manageUsers | A | A | D | D | D | D |
| manageIntegrations | A | A | D | D | S/? | D |

## Casos negativos ejecutados

| Caso | Esperado | Resultado |
|---|---|---|
| Request sin sesión a admin API | 401 JSON sin stack | PASS |
| READ_ONLY crea/edita lead o follow-up | 403 sin cambio | PASS |
| SALES_ADVISOR accede/muta lead ajeno | 404/403 no enumerable | PASS |
| Advisor sin ASSIGN reasigna lead | 403 | PASS |
| Advisor conserva autoasignación propia | permitido | PASS |
| Usuario sin scope genera lotes | 403 | PASS |
| Usuario sin precio envía precio batch | 403 | PASS |
| Batch usa proyecto interno de otro tenant | rechazo | PASS |
| Body/query contiene `tenant_id` | 422, nunca override | PASS |
| Tenant A accede a proyecto de tenant B | list/read/update/delete aislados | PASS |
| Sesión de tenant A se reutiliza en B | 404 | PASS |
| Header de tenant inexistente | 404 | PASS HTTP |

## Cobertura que falta

- CRUD completo por rol para SUPER_ADMIN, TENANT_ADMIN, SALES_MANAGER, BOT_OPERATOR y READ_ONLY.
- Flags combinados de inventario/precio sobre todas las rutas y recursos.
- Usuario/tenant PAUSED, DISABLED o eliminado en cada transición de sesión.
- Notifications, media y webhooks recorridos con identidades de los seis roles.
- E2E UI/API real por capability para las seis identidades. El modelo ya preserva `apiRole`, usa el allowlist de API y tiene regresiones unitarias para READ_ONLY, BOT_OPERATOR y SALES_MANAGER.

La API continúa siendo la autoridad. Los guards de UI reducen exposición accidental, pero no reemplazan las políticas server-side ni el E2E dinámico pendiente.
