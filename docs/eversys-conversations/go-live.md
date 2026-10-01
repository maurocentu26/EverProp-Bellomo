# Go-live — Eversys Conversations (chat web primero)

Objetivo: poner en producción el chat web con asistente en el sitio de Bellomo sin depender de Meta. WhatsApp queda para después de X01 (Tech Provider) y de `ChannelPolicy` (ventana 24 h / plantillas).

**Regla de oro:** `main` despliega solo (Railway/Vercel). El SQL NO se aplica solo. Aplicar los forward **antes** del merge: desde este release, `everprop:production-check --connections` falla el arranque si faltan las tablas y Railway mantiene el despliegue anterior.

## Fase 1 — Panel (bandeja, visitas, conocimiento) con IA apagada

| # | Paso | Quién | Cómo verificar |
|---|---|---|---|
| 1 | Backup de MySQL producción **con procedures**: `mysqldump --single-transaction --routines --triggers --events --set-gtid-purged=OFF bellomo_crm`. Restaurarlo de prueba en un MySQL 8.4 aparte y anotar `MAX(applied_at)` de `schema_versions` y conteos de tablas | Ramiro | el restore levanta y `sp_create_or_get_open_lead` existe en la copia |
| 2 | Aplicar los 3 forward siguiendo **"Aplicar el SQL"** (abajo) | Ramiro (X04) | las 3 versiones en `schema_versions` + chequeos posteriores OK |

### Aplicar el SQL (paso 2)

Ventana de bajo tráfico, sin importaciones de inventario corriendo. Las tablas que se alteran (`conversations`, `messages`, `outbound_jobs`, `channel_accounts`, `chatbot_runs`) se reconstruyen con `ALGORITHM=COPY` (escrituras bloqueadas mientras dura; con tablas casi vacías son segundos) y crear tablas con FK toma un lock breve sobre `users`, `properties`, `contacts`, `projects`, `visits`, `tenants`. El riesgo no es la copia sino **esperar un lock**: por defecto MySQL espera un año y encola detrás el login y el inventario.

**Chequeos previos (solo lectura):**
1. Transacciones largas: `SELECT trx_id, trx_started, trx_mysql_thread_id FROM information_schema.innodb_trx WHERE trx_started < NOW() - INTERVAL 30 SECOND;` y `SHOW PROCESSLIST;` → nada largo abierto.
2. Sticky routing (`2026-09-29.001`) aplicado. **No se registra en `schema_versions`**: verificar por contenido: `SELECT ROUTINE_DEFINITION LIKE '%v_historical_user_id%' FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_NAME = 'sp_create_or_get_open_lead';` → `1` (si da `NULL`, usar un usuario con `SHOW_ROUTINE`).
3. Conversaciones heredadas (quedarán `AI_ACTIVE` por default): `SELECT status, COUNT(*) total, SUM(last_inbound_at >= UTC_TIMESTAMP() - INTERVAL 72 HOUR) recientes, SUM(assigned_user_id IS NULL) sin_asignar FROM conversations GROUP BY status;`. Lo esperable es 0 filas (`main` no escribe `conversations`). Si hay filas, frenar y preparar un forward de datos aparte.
4. WhatsApp sin duplicados entre tenants (si no, `2026-09-29.002` se corta a mitad con 1062): `SELECT provider_account_id, COUNT(DISTINCT tenant_id) FROM channel_accounts WHERE channel_type = 'WHATSAPP' GROUP BY 1 HAVING COUNT(*) > 1;` → 0 filas.
5. `SHOW CREATE TABLE jobs;` / `failed_jobs`: si ya existen, deben tener el formato de Laravel (`queue`, `payload`, `attempts`, `reserved_at`, `available_at`, `created_at`); el script no las altera.
6. `SHOW GRANTS` del usuario de migraciones: ALTER, CREATE, INDEX, REFERENCES e INSERT sobre `schema_versions`.
7. `SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('conversations','messages','outbound_jobs','channel_accounts','chatbot_runs');` para estimar duración (referencia local: ~3,6 s por reconstrucción de 50.000 filas; `messages` y `outbound_jobs` se reconstruyen dos veces).

**Aplicar** con el usuario de migraciones, **un archivo por vez**, cliente `mysql` **sin `--force`** (se detiene en el primer error) y en cada sesión `SET SESSION lock_wait_timeout = 10;` antes del `source`. Nunca con un glob `forward/*.sql`: el viejo `2026-09-14.001` no es re-ejecutable y cortaría la corrida.
1. `2026-09-29.002_conversation_runtime.sql`
2. `2026-09-29.003_agent_runtime.sql`
3. `2026-09-30.001_queue_tables.sql`

**Si falla a mitad:** no restaurar el backup. Cada DDL es atómico y los 3 scripts son re-ejecutables (probado aplicándolos dos veces): corregir la causa (`1205` = lock: esperar y reintentar; `1062` = duplicado del chequeo 4) y volver a correr **el mismo archivo**. La app actual sigue funcionando porque los cambios solo agregan. No mergear hasta tener las 3 versiones registradas (si se mergea antes, `production-check` hace que Railway mantenga el despliegue anterior).

**Chequeos posteriores:**
- `SELECT version FROM schema_versions WHERE version IN ('2026-09-29.002','2026-09-29.003','2026-09-30.001');` → 3 filas.
- `information_schema.CHECK_CONSTRAINTS`: `ck_messages_delivery` incluye `UNKNOWN` y `ck_outbound_jobs_status` incluye `UNKNOWN_FINAL`.
- `information_schema.STATISTICS`: `uq_messages_channel_provider`, `uq_outbound_jobs_message`, `uq_channel_accounts_whatsapp_phone`, `ix_chatbot_runs_status_started`.
- `everprop:schema:verify` cuenta tablas/FKs contra una instalación limpia (60/54/131). Producción puede tener FKs extra de `2026-09-15.002` (se crean solo si había inventario importado): correrlo primero contra el restore del paso 1 y anotar el valor real antes de usarlo como control.
- Tras el merge: `everprop:production-check --connections` todo OK.

**Rollback:** de la app, redeployar el commit anterior en Railway; el esquema queda (es compatible hacia atrás). Restaurar el backup es último recurso y pierde lo escrito desde el dump.
| 3 | Variables API (Railway): `CONVERSATIONS_AI_ENABLED=false`, `AGENT_LLM_PROVIDER=disabled`, `META_SEND_ENABLED=false` | Ramiro | `everprop:production-check --connections` todo OK |
| 4 | Merge del PR a `main` → despliega API y panel | Ramiro | `/readyz` 200; `/admin/conversaciones`, `/admin/solicitudes-visita`, `/admin/conocimiento` cargan |
| 5 | Scheduler corriendo (reconciliador cada minuto) | Ramiro | log `expired=… requeued=… stuck_runs=… ai_off_handoffs=…` |
| 6 | Crear widget: `php artisan everprop:channels:web-chat --tenant=bellomo --panel-origin=https://ever-prop-bellomo.vercel.app --site=https://<sitio-bellomo>` | Ramiro | imprime `widget_id`, `<script>` y el valor de `EVERSYS_WIDGET_FRAME_ANCESTORS` |
| 7 | Vercel (panel): `EVERSYS_WIDGET_FRAME_ANCESTORS` con el valor impreso. Se lee en `next.config.ts` al construir: **requiere redeploy** | Ramiro | el iframe carga en el sitio y no en otros dominios |
| 8 | Sitio Bellomo (rama `feat/eversys-chat-widget`): `NEXT_PUBLIC_EVERSYS_WIDGET_ID` y `NEXT_PUBLIC_EVERSYS_PANEL_ORIGIN` en Vercel. Las `NEXT_PUBLIC_*` quedan **incrustadas en el build**: activar y revertir exige rebuild/redeploy del sitio | EverSys | mensaje de prueba aparece en la bandeja como "Espera asesor"; sin variables sigue Bellomito |

Con IA apagada el chat ya sirve: toda conversación entra a la bandeja y un asesor responde.

**Cola y despacho (aplica también con IA apagada):** las respuestas del asesor salen por `DispatchOutboundJob`.
- `QUEUE_CONNECTION=sync` (modo actual del servicio `awake-dedication`): se envían dentro de la misma petición; no hace falta worker. La IA no puede encenderse en este modo (queda apagada sola en producción).
- `QUEUE_CONNECTION=database` o `redis`: **hace falta un worker vivo** consumiendo esa misma conexión (`railway-worker.json`; el worker usa `QUEUE_CONNECTION` o `QUEUE_WORKER_CONNECTION`). Sin worker, las respuestas quedan "En cola" y el visitante no las ve. Que el contenedor arranque no prueba que consuma trabajos: verificar enviando una respuesta de prueba y viendo el estado "Enviado" en la bandeja.
- Si Web Push usa otra conexión (`WEBPUSH_QUEUE_CONNECTION`), levantar un segundo worker con `QUEUE_WORKER_CONNECTION` = esa conexión.

## Fase 2 — Asistente IA

**Costo y riesgo:** el modelo se paga en USD. Tope en código: USD 30/mes (`USAGE_GLOBAL_CAP_MICROS`), por turno ≤ ~USD 0,03 con tarifas tipo Haiku 4.5. Requiere tarjeta/cuenta del proveedor (decisión X03) y un worker: Redis en Railway o cola en base (`QUEUE_CONNECTION=database`, sin costo extra).

| # | Paso | Cómo verificar |
|---|---|---|
| 1 | Aprobar proveedor/región y modelo (X03); crear API key con límite de gasto en la consola del proveedor | límite visible en la consola |
| 2 | Worker: servicio Railway con `railway-worker.json`; `QUEUE_CONNECTION=database` (o redis) en API **y** worker, `DB_QUEUE_RETRY_AFTER`/`REDIS_QUEUE_RETRY_AFTER` ≥ 240 | `production-check` OK en "Assistant: asynchronous queue" y una respuesta de prueba pasa a "Enviado" |
| 3 | Cargar en `/admin/conocimiento`: FAQs, financiación y promociones vigentes; aprobarlas | `/admin/conocimiento` muestra "Aprobada" |
| 4 | Variables: `AGENT_LLM_PROVIDER=anthropic`, `AGENT_LLM_MODEL=<modelo aprobado>`, `ANTHROPIC_API_KEY` (secreto) | `production-check` OK en "Assistant: LLM provider configured" |
| 5 | Correr los 23 casos de `evals/` contra el modelo real en staging; todos los críticos en verde | reporte de evals |
| 6 | `CONVERSATIONS_AI_ENABLED=true` en horario con asesores disponibles; monitorear `chatbot_runs` (FAILED/HANDOFF) y `usage_ledger` las primeras 48 h | derivaciones < umbral acordado; gasto dentro del tope |

**Rollback de la IA (no probado en Railway todavía):** poner `CONVERSATIONS_AI_ENABLED=false` en API, worker **y scheduler**. La configuración se cachea al arrancar (`config:cache` en el entrypoint), así que el cambio aplica recién cuando Railway redeploya/reinicia **cada** servicio; un worker que no se reinicia sigue con el valor viejo. Una vez aplicado:
- los turnos que quedaron en cola no llaman al modelo y derivan a un asesor;
- un mensaje nuevo en una conversación que tenía la IA pasa a "Espera asesor";
- el reconciliador (cada minuto, servicio scheduler) pasa a "Espera asesor" las conversaciones abiertas con IA que tienen un mensaje del visitante sin responder de las últimas 72 h (`CONVERSATIONS_AI_OFF_SWEEP_HOURS`). No envía aviso al visitante: el asesor lo ve en "Esperan asesor".
No borra datos. Medir en staging cuánto tarda de punta a punta antes de prometer un tiempo de rollback.

## Fase 3 — WhatsApp

Bloqueado por X01 (verificación de negocio, App Review con videos, permisos avanzados) y por `ChannelPolicy`. Hasta entonces `META_SEND_ENABLED=false`.
