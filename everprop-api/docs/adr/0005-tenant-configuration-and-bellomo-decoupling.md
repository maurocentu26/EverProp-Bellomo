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
| `everprop-public/src/lib/everprop-api.ts` | tenant del build (`NEXT_PUBLIC_EVERPROP_TENANT`, default `bellomo`) | **Corregido (2026-10-05)**: canal firmado. `src/proxy.ts` firma con HMAC-SHA256 (`"eversys-panel-host-v1\nhost\nts"`) el dominio del header `Host`, sin puerto (`X-Eversys-Panel-Host/Timestamp/Signature`, clave `TENANT_PANEL_SIGNING_KEY` solo en servidor, TTL 60 s), y borra esos headers si vienen del navegador. **No** usa `request.nextUrl.hostname`: con `next start` es el hostname del servidor (`localhost`), igual para todos los clientes. Con clave y un Host inválido, el proxy responde 404. `TrustedTenantResolver` verifica la firma y busca ese host en `TENANT_HOST_MAP_JSON`. Firma inválida o vencida, host no mapeado o mapeado a vacío, y fuera de local/testing `localhost` o una IP: rechazo, sin caer a la sesión. El header `X-Everprop-Tenant` queda solo para desarrollo. Pendiente: llamadas del servidor del panel que no pasan por el proxy (`server/bellomo-materials.ts`) |
| `everprop-public/src/lib/bellomo-policy.ts`, `server/bellomo-materials.ts` | funciones exclusivas de Bellomo por slug | Pendiente: convertir en entitlement `materials` del tenant |
| `app/Console/Commands/SeedLocalDemo.php`, `SetupSimulationDatabaseCommand.php` | fixtures de Bellomo | Aceptado: herramientas locales, no runtime |
| `app/Console/Commands/MigrateAssetsCommand.php` | buscaba proyectos sin filtrar tenant y por columna inexistente `slug` | **Corregido en G0**: exige `--tenant`, filtra `tenant_id`, usa `public_id` en la ruta R2 |

## Decisión

1. Configuración de tenant versionada en `tenant_config_versions` (branding, horarios, canales, límites, entitlements), leída por servicio con caché por `(tenant, versión)`. `tenants.settings_json` queda como compatibilidad, no se amplía.
2. Soporte Eversys mediante `support_access_grants` (motivo, alcance, aprobador, vencimiento, revocación, auditoría). `SUPER_ADMIN` no navega contenido de tenants sin grant activo.
3. Resolución de tenant del frontend exclusivamente en servidor por host confiable; `X-Everprop-Tenant` solo en local/testing (ya forzado por `TrustedTenantResolver`).
4. Features específicas de un cliente se activan por entitlement, nunca por `slug === 'bellomo'`.

**Despliegue del canal firmado:** la misma `TENANT_PANEL_SIGNING_KEY` en la API y en el panel (gestor de secretos, nunca `NEXT_PUBLIC_`). En `TENANT_HOST_MAP_JSON` van **todos** los dominios por los que se sirve el panel: el de cada cliente, el dominio por defecto del servicio y los previews si se usan. Un dominio que falte da 404 (falla cerrado). Cada dominio también tiene que estar en `SANCTUM_STATEFUL_DOMAINS` y `CORS_ALLOWED_ORIGINS`. Al activar el canal conviene quitar del mapa el host de la propia API, para que nada del panel se resuelva por él. Sin la clave, staging y producción siguen como hoy.

**Verificado en local el 2026-10-05** con `next build` + `next start` y la API solo conociendo un dominio inventado: con clave, `Host: panel-e2e.test` resuelve el cliente; `Host: localhost` y los headers forjados por el cliente dan 404; sin clave, todo 404. Revisión de aislamiento: un bloqueante (se firmaba el hostname del servidor) y los hallazgos medios y bajos, todos aplicados.

**Excepción acotada (EVP-L01, 2026-10-11, aprobada por Ramiro):** los interruptores por cliente del asistente y del copiloto viven en `tenants.settings_json.conversations.ai_enabled` / `copilot_enabled`, igual que el tope de gasto (`usage.monthly_cap_micros`). Se eligió para no adelantar `tenant_config_versions` (resto de S02, 2–3 jornadas) solo por dos booleanos. Ausente o distinto de `true` = apagado. Cada cambio queda en `audit_logs` (`CONVERSATIONS_AI_SETTINGS_UPDATED`, antes/después y actor). Cuando exista `tenant_config_versions`, estas claves se migran ahí y se elimina la lectura de `settings_json`.

**Excepción acotada (EVP-L02, 2026-10-11, aprobada por Ramiro):** el horario de atención y el aviso fuera de horario viven en `tenants.settings_json.conversations.business_hours` (`{"mon": [["09:00","18:00"]], …}`, hasta dos franjas por día, en la zona horaria de `tenants.timezone`) y `away_message`. Es la misma excepción que los interruptores de IA de EVP-L01. Validación estricta en `BusinessHours::normalize` (un horario mal formado se rechaza, no se interpreta) y auditoría `CONVERSATIONS_BUSINESS_HOURS_UPDATED`. Sin horario = siempre abierto. La preferencia de cada asesor de recibir avisos fuera de horario es por dispositivo, en `web_push_subscriptions.out_of_hours` (forward `2026-10-11.001`). Los feriados (EVP-14) van en `settings_json.conversations.holidays` (lista de fechas `AAAA-MM-DD`, hasta 60, en la zona horaria del tenant): un feriado está cerrado todo el día y solo aplica si hay horario. Cuando exista `tenant_config_versions`, el horario y los feriados se migran ahí.

## Criterio de aceptación pendiente (resto de S02)

- Segundo tenant sintético `inmobiliaria-demo-2` opera login, inventario, CRM y cobranzas por las mismas rutas con host propio.
- Host de tenant A con sesión de tenant B → rechazo (host mismatch).
- Grant de soporte vencido o revocado → sin acceso; toda lectura con grant queda auditada.
- Build único del frontend sirve a ambos tenants.

Estimación del remanente: 2–3 jornadas-persona (script forward `…003`, servicio de configuración, grants, cambio de resolución en `everprop-public`, tests).
