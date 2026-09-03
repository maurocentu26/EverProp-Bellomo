# Tenancy

## Fuente de verdad

El cliente nunca envía un `tenant_id` operativo. `ResolveTenant` crea un `TenantContext` inmutable a partir de una fuente confiable:

1. hostname exacto incluido en `TENANT_HOST_MAP_JSON`;
2. pertenencia del usuario autenticado, que debe coincidir con el hostname;
3. header `X-Everprop-Tenant` sólo cuando el entorno es `local` o `testing` y `TENANT_ALLOW_LOCAL_RESOLVER=true`.

Habilitar el resolver local en `production` impide el arranque. Un hostname, sesión o selector local que resuelvan tenants diferentes produce el mismo `404` que un recurso inexistente.

## Capas de aislamiento

- `TenantContext` se instala al comenzar el request y se limpia en `finally`.
- `BelongsToTenant` protege mass assignment, estampa `tenant_id`, impide cambiarlo y agrega un global scope defensivo.
- Los controladores y servicios construyen queries tenant-aware antes de paginar.
- El route binding agrega `tenant_id` y oculta IDs ajenos con `404`.
- Las Policies vuelven a verificar identidad, tenant, rol y recurso.
- Las foreign keys compuestas MySQL rechazan relaciones cruzadas.

No se considera seguro un endpoint que dependa solamente del global scope.

## Operaciones de plataforma

`PlatformAccess` es el único límite para queries cross-tenant. Exige `SUPER_ADMIN` activo, un código de operación validado y auditoría de inicio/fin. No existe `Gate::before` ni bypass universal.

## Jobs y cache

Los jobs transportan IDs escalares confiables y mantienen `tenant_id` explícito en cada query. Si usan modelos tenant-aware, reconstruyen el contexto antes de consultar y lo limpian al finalizar. Cache, locks, rate limits e idempotencia incorporan tenant en la clave.
