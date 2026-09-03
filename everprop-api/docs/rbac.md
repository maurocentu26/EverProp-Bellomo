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

Todas las celdas permitidas requieren además usuario activo, coincidencia de tenant y Policy del recurso.

## Alcance de inventario

Para asesores, la capacidad de rol no basta. `user_inventory_settings` y `user_inventory_scopes` filtran la query antes de paginar por proyecto, propiedad o categoría. `can_view_prices`, `can_manage_inventory` y `can_manage_prices` refinan campos y mutaciones. Un recurso cross-tenant siempre se trata como inexistente.
