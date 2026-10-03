# ADR 0005: configuración por tenant y desacople de Bellomo (S02)

- Estado: propuesto; implementación parcial en G0
- Fecha: 2026-09-29
- Relacionado: ADR 0001 (monolito modular y tenancy), `docs/eversys-conversations/product-scope.md` (núcleo / módulo / configuración)

## Contexto

El producto debe funcionar para un segundo tenant por las mismas rutas y el mismo artefacto, sin forks ni condicionales por nombre. Inventario de acoplamientos a Bellomo en el commit `c903406`:

| Lugar | Acoplamiento | Estado |
|---|---|---|
| `routes/console.php` | scheduler de cobranzas fijo en `['bellomo']` | **Corregido en G0**: el comando sin argumento recorre todos los tenants ACTIVE; con argumento mantiene el comportamiento anterior |
| `app/Jobs/SendWebPush.php` | título push fijo "Bellomo" | **Corregido en G0**: usa `tenants.name` |
| `everprop-public/src/lib/everprop-api.ts` | tenant del build (`NEXT_PUBLIC_EVERPROP_TENANT`, default `bellomo`) | Pendiente: resolver por host en servidor (`TENANT_HOST_MAP_JSON` / `TrustedTenantResolver`) y dejar el header solo para desarrollo |
| `everprop-public/src/lib/bellomo-policy.ts`, `server/bellomo-materials.ts` | funciones exclusivas de Bellomo por slug | Pendiente: convertir en entitlement `materials` del tenant |
| `app/Console/Commands/SeedLocalDemo.php`, `SetupSimulationDatabaseCommand.php` | fixtures de Bellomo | Aceptado: herramientas locales, no runtime |
| `app/Console/Commands/MigrateAssetsCommand.php` | buscaba proyectos sin filtrar tenant y por columna inexistente `slug` | **Corregido en G0**: exige `--tenant`, filtra `tenant_id`, usa `public_id` en la ruta R2 |

## Decisión

1. Configuración de tenant versionada en `tenant_config_versions` (branding, horarios, canales, límites, entitlements), leída por servicio con caché por `(tenant, versión)`. `tenants.settings_json` queda como compatibilidad, no se amplía.
2. Soporte Eversys mediante `support_access_grants` (motivo, alcance, aprobador, vencimiento, revocación, auditoría). `SUPER_ADMIN` no navega contenido de tenants sin grant activo.
3. Resolución de tenant del frontend exclusivamente en servidor por host confiable; `X-Everprop-Tenant` solo en local/testing (ya forzado por `TrustedTenantResolver`).
4. Features específicas de un cliente se activan por entitlement, nunca por `slug === 'bellomo'`.

## Criterio de aceptación pendiente (resto de S02)

- Segundo tenant sintético `inmobiliaria-demo-2` opera login, inventario, CRM y cobranzas por las mismas rutas con host propio.
- Host de tenant A con sesión de tenant B → rechazo (host mismatch).
- Grant de soporte vencido o revocado → sin acceso; toda lectura con grant queda auditada.
- Build único del frontend sirve a ambos tenants.

Estimación del remanente: 2–3 jornadas-persona (script forward `…003`, servicio de configuración, grants, cambio de resolución en `everprop-public`, tests).
