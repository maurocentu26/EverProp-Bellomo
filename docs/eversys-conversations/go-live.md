# Go-live — Eversys Conversations (chat web primero)

Objetivo: poner en producción el chat web con asistente en el sitio de Bellomo sin depender de Meta. WhatsApp queda para después de X01 (Tech Provider) y de `ChannelPolicy` (ventana 24 h / plantillas).

**Regla de oro:** `main` despliega solo (Railway/Vercel). El SQL NO se aplica solo. Aplicar los forward **antes** del merge: desde este release, `everprop:production-check --connections` falla el arranque si faltan las tablas y Railway mantiene el despliegue anterior.

## Fase 1 — Panel (bandeja, visitas, conocimiento) con IA apagada

| # | Paso | Quién | Cómo verificar |
|---|---|---|---|
| 1 | Backup de MySQL producción | Ramiro | dump restaurable probado |
| 2 | Verificar `schema_versions`: debe estar `2026-09-29.001` (sticky routing). Aplicar con el usuario de migraciones, en orden: `2026-09-29.002_conversation_runtime.sql`, `2026-09-29.003_agent_runtime.sql`, `2026-09-30.001_queue_tables.sql` | Ramiro (X04) | `SELECT version FROM schema_versions ORDER BY version DESC LIMIT 5;` |
| 3 | Variables API (Railway): `CONVERSATIONS_AI_ENABLED=false`, `AGENT_LLM_PROVIDER=disabled`, `META_SEND_ENABLED=false` | Ramiro | `everprop:production-check --connections` todo OK |
| 4 | Merge del PR a `main` → despliega API y panel | Ramiro | `/readyz` 200; `/admin/conversaciones`, `/admin/solicitudes-visita`, `/admin/conocimiento` cargan |
| 5 | Scheduler corriendo (reconciliador cada minuto) | Ramiro | log `expired=… requeued=… stuck_runs=…` |
| 6 | Crear widget: `php artisan everprop:channels:web-chat --tenant=bellomo --panel-origin=https://ever-prop-bellomo.vercel.app --site=https://<sitio-bellomo>` | Ramiro | imprime `widget_id`, `<script>` y el valor de `EVERSYS_WIDGET_FRAME_ANCESTORS` |
| 7 | Vercel: `EVERSYS_WIDGET_FRAME_ANCESTORS` con el valor impreso; redeploy | Ramiro | el iframe carga en el sitio y no en otros dominios |
| 8 | Pegar el `<script>` en el sitio de Bellomo (reemplaza el `/api/chat` con Gemini de Bellomito) | EverSys | mensaje de prueba aparece en la bandeja como "Espera asesor" |

Con IA apagada el chat ya sirve: toda conversación entra a la bandeja y un asesor responde.

## Fase 2 — Asistente IA

**Costo y riesgo:** el modelo se paga en USD. Tope en código: USD 30/mes (`USAGE_GLOBAL_CAP_MICROS`), por turno ≤ ~USD 0,03 con tarifas tipo Haiku 4.5. Requiere tarjeta/cuenta del proveedor (decisión X03) y un worker: Redis en Railway o cola en base (`QUEUE_CONNECTION=database`, sin costo extra).

| # | Paso | Cómo verificar |
|---|---|---|
| 1 | Aprobar proveedor/región y modelo (X03); crear API key con límite de gasto en la consola del proveedor | límite visible en la consola |
| 2 | Worker: servicio Railway con `railway-worker.json`; `QUEUE_CONNECTION=database` (o redis) y `DB_QUEUE_RETRY_AFTER`/`REDIS_QUEUE_RETRY_AFTER` ≥ 240 | `production-check` OK en "Assistant: asynchronous queue" |
| 3 | Cargar en `/admin/conocimiento`: FAQs, financiación y promociones vigentes; aprobarlas | `/admin/conocimiento` muestra "Aprobada" |
| 4 | Variables: `AGENT_LLM_PROVIDER=anthropic`, `AGENT_LLM_MODEL=<modelo aprobado>`, `ANTHROPIC_API_KEY` (secreto) | `production-check` OK en "Assistant: LLM provider configured" |
| 5 | Correr los 23 casos de `evals/` contra el modelo real en staging; todos los críticos en verde | reporte de evals |
| 6 | `CONVERSATIONS_AI_ENABLED=true` en horario con asesores disponibles; monitorear `chatbot_runs` (FAILED/HANDOFF) y `usage_ledger` las primeras 48 h | derivaciones < umbral acordado; gasto dentro del tope |

**Rollback:** `CONVERSATIONS_AI_ENABLED=false` (efecto inmediato: nuevas conversaciones esperan asesor). No borra datos.

## Fase 3 — WhatsApp

Bloqueado por X01 (verificación de negocio, App Review con videos, permisos avanzados) y por `ChannelPolicy`. Hasta entonces `META_SEND_ENABLED=false`.
