# Release `develop` → `main` (noviembre 2026)

Rama `release/develop-a-main` (desde `origin/develop` @ `3a186ff`, con `origin/main` @ `26157de` integrado) · fecha 2026-11-16 · autor Claude y Mauro Centurión

Cierra el hallazgo **P0-2** de la auditoría `QA_STAGING_BELLOMO.md`: producción (`main`) no tiene la integración de redes ni la infraestructura que necesita.

**Regla de oro** (de [go-live.md](../eversys-conversations/go-live.md)):
- Un merge a `main` despliega solo la API (Railway) y el panel (Vercel).
- **El SQL no se aplica solo.** Si falta un forward, el chequeo de arranque falla y Railway mantiene el despliegue anterior. Es lo que pasó en staging el 2026-11-15 con el de EVP-124.
- Por eso, todo el SQL de abajo va **antes** del merge.

## 1. Qué entra

| | Commits | Contenido |
|---|---|---|
| `develop` → `main` | 409 | Conversaciones (bandeja, chat web, Instagram y WhatsApp), asistente y copiloto, colas por prioridad, Web Push, cobranzas por email, alertas de seguimiento, landing de proyectos y los arreglos de la auditoría: EVP-124 a 129, 131 a 138, 140 y 142 a 148 |
| `main` → `develop` | 5 | Hotfix EVP-123 (Mi Día y Leads coinciden entre la vista del asesor y el filtro del administrador). Se integró en esta rama |

### Integración de EVP-123

Hubo conflictos en 3 archivos del panel porque `develop` rediseñó esas pantallas:
- **`admin/leads/page.tsx`:** se tomó el diseño de `develop` y se le aplicó EVP-123:
  - el filtro de asesor se sincroniza con el selector global;
  - la lista de asesores se completa con `useLeadAdvisors`;
  - los contadores por etapa respetan el asesor elegido;
  - se quitó «Cargar más leads», porque `loadEverpropLeads()` ya trae todas las páginas.
- **`AdvisorCockpit.tsx`:** se tomó la cabecera de `develop`, que ya tiene el selector de asesor en todos los tamaños. Lo demás de EVP-123 (citas por asesor, cuotas vencidas por asesor y `myLeads` en el balance) se integró sin conflicto.
- **`tests/leads-api.test.mjs`:** quedan los tests de los dos lados.
- **`tests/collections-redesign.test.mjs`:** se agregó la simulación de `useDashboardMode`, que EVP-123 ahora usa en cobranzas.

## 2. Verificación de la rama

- **Panel:**
  - `tsc --noEmit`: OK;
  - ESLint en los archivos tocados: 0 errores;
  - `node --test tests/*.test.mjs`: 225 de 226. Falla `assistant trace is plain text…`, que también falla en `develop` limpio.
- **API:** PHPUnit completo en Docker (PHP 8.4, MySQL 8.4): 645 tests.
  - 14 fallos, todos de entorno y los mismos que en `develop`: `CollectionEmailTest`, `WebChatAndUsageTest`, `PrepareMetaReviewTest` y `ProductionEnvironmentTest`.
  - `TodayVisitsTest` (EVP-123) pasa.
- **Falta:** CI del PR y una pasada por staging con esta rama.

## 3. Antes del merge

### 3.1 Decidir qué más entra

Los PRs de la auditoría se mergearon en `develop` el 2026-11-16, con CI en verde (#125 a #128, #135 a #142 y #143 de EVP-128), y ya están en esta rama. Todos los P1 de la auditoría están resueltos.

Pendientes:
- **EVP-139 (landing):** PR #1 de `maurocentu26/bellomo-landing`. Va por su propio despliegue, no por este release.
- **EVP-130 (Lead Ads):** solo si Bellomo usa formularios de anuncios.
- **EVP-141:** figura Listo en Jira, pero su código no aparece en `develop`. Hay que confirmarlo.

### 3.2 Backup y lectura de producción

1. Backup con procedures (paso 1 de la Fase 1 de `go-live.md`) y restore de prueba.
2. Con el restore, anotar:
   - `SELECT version FROM schema_versions ORDER BY version;`
   - el estado de `ck_users_role`. `2026-10-07.001` no escribe versión: se verifica con `production:check`.

   Así sabemos cuáles de los forward que ya existían en `main` faltan aplicar en producción: `2026-10-07.001`, `2026-10-15.002` y los anteriores.

### 3.3 Forward nuevos (están en `develop`, no en `main`)

Reglas:
- un archivo por vez, con el usuario de migraciones;
- cliente `mysql` sin `--force`;
- `SET SESSION lock_wait_timeout = 10;` antes de cada uno;
- ventana de bajo tráfico;
- nunca con un glob.

Los chequeos previos y posteriores de los 5 primeros están en `go-live.md`, en «Aplicar el SQL».

| # | Archivo | Atención |
|---|---|---|
| 1 | `2026-09-29.002_conversation_runtime.sql` | Reconstruye `conversations`, `messages`, `outbound_jobs` y `channel_accounts` con `COPY`. Antes, verificar que no haya WhatsApp duplicados entre tenants |
| 2 | `2026-09-29.003_agent_runtime.sql` | Crea tablas con FK: lock breve sobre `users`, `properties` y `contacts` |
| 3 | `2026-09-30.001_queue_tables.sql` | `jobs` y `failed_jobs`. Si ya existen, deben tener el formato de Laravel |
| 4 | `2026-09-30.002_conversation_sweep_index.sql` | Índice en línea |
| 5 | `2026-10-02.001_integration_token_ciphertext.sql` | `INSTANT`. Antes, `TOTAL_ROW_VERSIONS` menor a 64 |
| 6 | `2026-10-11.001_web_push_out_of_hours.sql` | `INSTANT` |
| 7 | `2026-10-15.001_chatbot_runs_tenant_started.sql` | Índice en línea |
| 8 | `2026-10-20.001_lead_follow_up_alerts.sql` | Columnas en `users` y tabla nueva |
| 9 | `2026-10-21.001_collection_email_sequence.sql` | Copia la tabla de auditoría de emails, que es chica. Requiere `2026-10-15.002` aplicado |
| 10 | `2026-10-22.001_project_landing.sql` | No publica ningún proyecto |
| 11 | `2026-10-23.001_project_intakes.sql` | — |
| 12 | `2026-10-23.002_project_intake_units.sql` | — |
| 13 | `2026-11-14.001_close_deleted_open_leads.sql` | Solo datos (EVP-124). Recorre `leads` sin índice. Antes, contar los leads borrados que siguen abiertos |

**Chequeo final:** `everprop:schema:verify`. Usar como referencia el valor del restore, porque producción puede tener FKs extra de `2026-09-15.002`.

### 3.4 Variables de la API en Railway (producción)

Valores seguros para el primer despliegue: IA, envíos y onboarding apagados, como en la Fase 1 de `go-live.md`.

| Variable | Valor inicial |
|---|---|
| `TRUSTED_PROXIES` | `REMOTE_ADDR` (EVP-132) |
| `TENANT_HOST_MAP_JSON` | Ya existe, porque producción arranca. Agregar el host de la landing, apuntando al tenant de Bellomo, cuando la landing firme sus requests (EVP-139) |
| `TENANT_PANEL_SIGNING_KEY` | Secreto nuevo, el mismo en el panel. Lo carga Mauro |
| `CONVERSATIONS_AI_ENABLED` | `false` |
| `CONVERSATIONS_COPILOT_ENABLED` | `false` |
| `AGENT_LLM_PROVIDER` | `disabled` |
| `META_SEND_ENABLED` | `false` |
| `META_ONBOARDING_ENABLED` | `false` |
| `META_INSTAGRAM_ONBOARDING_ENABLED` | `false` |
| `USAGE_GLOBAL_CAP_MICROS` | `30000000` (USD 30 por mes) |
| `QUEUE_CONNECTION` | Hoy es `sync`. Con `sync` no hace falta worker, pero la IA queda apagada sola y los avisos salen dentro del request. Para encender la IA más adelante: `redis` o `database`, con un worker |
| `DB_QUEUE_RETRY_AFTER` / `REDIS_QUEUE_RETRY_AFTER` | `240`, si la cola no es `sync` |

`META_*`, `GEMINI_*`, `ANTHROPIC_*` y los demás secretos se cargan recién al conectar redes o encender la IA. Los carga Mauro; nunca se copian de staging. La lista completa está en `everprop-api/docker/production/environment.example`.

### 3.5 Variables del panel en Vercel (producción)

- `TENANT_PANEL_SIGNING_KEY`: la misma que en la API.
- `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL`.
- `EVERSYS_WIDGET_FRAME_ANCESTORS`: cuando se cree el widget. Requiere redeploy.
- `NEXT_PUBLIC_CLOUDFLARE_R2_URL`: si se usan adjuntos en R2.

### 3.6 Servicios de Railway (producción)

| Servicio | Necesario | Configuración |
|---|---|---|
| `api` (`EverProp-Bellomo`) | Ya existe | — |
| `scheduler` | **Sí. Hoy no existe:** en `awake-dedication` solo están `EverProp-Bellomo` y `MySQL` | `railway-scheduler.json`. Corre el reconciliador por minuto, las alertas de seguimiento y las cobranzas |
| `worker` | Si `QUEUE_CONNECTION` no es `sync` | `railway-worker.json`, con la misma `QUEUE_CONNECTION` que la API |
| `worker-fast` | Al encender la IA (EVP-131/149) | `QUEUE_WORKER_QUEUES=webhooks,outbound` |
| Redis | Si la cola o las sesiones van a Redis | Persistente |

## 4. Merge y verificación

1. PR `release/develop-a-main` → `develop`, con CI verde y merge.
2. PR `develop` → `main`. Lo mergea Ramiro o Mauro **después** de 3.2 a 3.6.
3. Verificar:
   - `/readyz` 200;
   - `everprop:production-check --connections` todo OK;
   - login de un administrador real;
   - `/admin/leads`, Mi Día, `/admin/conversaciones`, `/admin/conocimiento` y `/admin/cobranzas` cargan;
   - los números de Mi Día coinciden entre el administrador filtrado por asesor y la sesión del asesor (EVP-123).
4. Scheduler: el log del reconciliador muestra `expired=… requeued=…` cada minuto.
5. Recorrido S6 de `go-live.md` con una cuenta de prueba, antes de conectar las cuentas oficiales.

**Rollback:** redeployar en Railway y Vercel el commit anterior. El esquema queda: los forward solo agregan y son compatibles con el código viejo. Restaurar el backup es el último recurso.

## 5. Fuera de este release

- **Conectar las cuentas oficiales de Bellomo:** EVP-127, EVP-128 y EVP-129 ya están en esta rama. Requiere autorización aparte.
- **Encender la IA:** Fase 2 de `go-live.md`, con proveedor y tope aprobados.
- **Lead Ads (EVP-130):** solo si Bellomo usa formularios de anuncios.
