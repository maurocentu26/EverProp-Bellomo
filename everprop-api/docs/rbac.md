# RBAC

El baseline no contiene tablas `roles` o `permissions`. La fuente canónica es `users.role_code`; las capacidades se definen en código y las Policies deniegan por defecto. No se instala Spatie Permission.

## Mapeo funcional

- `company_admin` corresponde a `TENANT_ADMIN`.
- `agent` corresponde a `SALES_ADVISOR`; `SALES_MANAGER` amplía su alcance con publicación y asignación.
- `viewer` corresponde a `READ_ONLY`.
- `platform_admin` corresponde a `SUPER_ADMIN`, pero sólo dentro de `PlatformAccess` explícito y auditable.
- `BOT_OPERATOR` sólo opera flujos automatizados autorizados; no administra usuarios ni integraciones.

## Matriz de capacidades

| Rol canónico | viewAny | view | create | update | delete | publish | assign | manageUsers | manageIntegrations |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `SUPER_ADMIN` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `TENANT_ADMIN` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `SALES_MANAGER` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| `SALES_ADVISOR` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `BOT_OPERATOR` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `READ_ONLY` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ASSISTANT_TESTER` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

`ASSISTANT_TESTER` (EVP-212) es la cuenta de QA del cliente en staging. No tiene capacidades genéricas: `RotatorRoleBoundary` le permite solo `/api/v1/admin/assistant/test-sessions*` (únicamente sus propias sesiones; las ajenas dan 404) y la lectura de las conversaciones de esas sesiones. Todo lo demás da 403. Se crea con `can_view_prices = false`. Lee sus conversaciones completas, incluidas las notas internas y el resumen de derivación. Es para la prueba del cliente en staging; el código no lo limita por entorno, así que en producción no se debe asignar.

Todas las celdas permitidas requieren además usuario activo, coincidencia de tenant y Policy del recurso.

## Conversaciones (bandeja)

Decisión del 2026-11-16 (EVP-146): `READ_ONLY` es un **supervisor de todo el tenant**. Ve todas las conversaciones, incluido el texto de los mensajes y los adjuntos, con el mismo alcance con el que ve todos los leads, pero **no puede cambiar nada**.

| Rol | Lista y mensajes | Responder, notas, tomar, devolver, cerrar, crear lead |
|---|---|---|
| `TENANT_ADMIN`, `SALES_MANAGER` | Todas las del tenant | Sí |
| `SALES_ADVISOR` | Las asignadas a él y las sin asignar que esperan a una persona | Sí, sobre las que controla |
| `READ_ONLY` | Todas las del tenant, mensajes incluidos | No (403) |
| `ASSISTANT_TESTER` | Solo las de sus sesiones de prueba (las demás, 404) | No (403) |
| `ROTATOR`, `BOT_OPERATOR` | No (403) | No |

- Que `READ_ONLY` lea una conversación no la marca como leída. El contador de no leídos es del asignado.
- Este acceso a datos personales de clientes debe figurar en la política de privacidad del tenant. Quien le asigna el rol a alguien le está dando acceso a esas conversaciones.
- Test que fija el contrato: `HandoffAndDispatchTest::test_conversation_access_per_role`. Cambiarlo es una decisión de producto, no un arreglo.

## Alcance de inventario

Para asesores, la capacidad de rol no basta. `user_inventory_settings` y `user_inventory_scopes` filtran la query antes de paginar por proyecto, propiedad o categoría. `can_view_prices`, `can_manage_inventory` y `can_manage_prices` refinan campos y mutaciones. Un recurso cross-tenant siempre se trata como inexistente.
