# ADR 0004: reconciliación del esquema para el núcleo conversacional (S01)

- Estado: propuesto
- Fecha: 2026-09-29
- Relacionado: `docs/eversys-conversations/data-and-contracts.md`, ADR D01/D05/D10/D11 del paquete de diseño, ADR 0003.

## Contexto

Eversys Conversations debe construirse extendiendo el esquema existente, sin tablas paralelas ni RBAC nuevo. Antes de escribir scripts forward se hizo un preflight sobre una base aislada `bellomo_crm_test` (baseline con SHA-256 `4C8B…472D` verificado + todos los forward de `database/schema/forward/` al commit `c903406`, `everprop:schema:verify --env=testing` en PASS).

Preflight ejecutado sobre MySQL 8.0.46 del sandbox de desarrollo (no 8.4). Sirve para inventario de columnas, índices y CHECKs; **no** acredita compatibilidad con 8.4. Repetir con `scripts/import-schema.ps1` en Docker antes de aplicar.

## Hallazgos del preflight

Ningún código de `app/` lee ni escribe `conversations`, `messages`, `chatbot_*` ni `outbound_jobs`. Solo `domain_outbox` se usa (`PublicLeadService`, `ProcessWebhookReceipt`). Por lo tanto las extensiones no tienen consumidores que romper.

| Tabla | Existe | Falta para el diseño |
|---|---|---|
| `conversations` | `status`, `bot_mode`, `assigned_user_id`, `unread_count`, `last_*_at`; únicos `(tenant_id,id)`, `(tenant_id,channel_account_id,provider_thread_id)` | `control_state`, `control_epoch`, `state_version`, `next_sequence` |
| `messages` | dedupe `(tenant_id, conversation_id, provider_message_id)` y `(tenant_id, webhook_event_id)`; `delivery_status` sin `UNKNOWN` | `channel_account_id` + único `(tenant_id, channel_account_id, provider_message_id)` para que un mismo ID nativo no se reasigne a otra conversación; `sequence`; `UNKNOWN` en CHECK |
| `chatbot_sessions` | `handoff_user_id`, `handoff_reason`, `state_json`, único de sesión activa | nada bloqueante |
| `chatbot_runs` | tokens, costo, `decision`, `status`, `trace_json` | `control_epoch`, `input_sequence`, `config_version` |
| `outbound_jobs` | `idempotency_key` único, `locked_at/locked_by`, `requested_by_bot_run_id` | `control_epoch`, `dispatch_nonce`, `lease_expires_at`; estados `UNKNOWN` y `UNKNOWN_FINAL` en CHECK |
| `domain_outbox` | dedupe `(tenant_id, idempotency_key)`, lease | tabla de consumo `(tenant_id, event_id, consumer)` |
| `webhook_receipts/events` | receipt durable, dedupe por integración | recovery sweep (código, no esquema) |

Tablas nuevas justificadas (sin equivalente en baseline): `tool_executions`, `usage_ledger`, `tenant_config_versions`, `knowledge_documents` / `knowledge_document_versions` / `knowledge_chunks`, `visit_requests`, `support_access_grants`, `conversation_read_cursors`, `conversation_tags` + relación, `outbox_consumptions`.

## Decisión

1. Extender, no duplicar: las columnas faltantes se agregan a las tablas existentes; `conversations.status` y `bot_mode` se conservan y un único servicio de transición mantiene `control_state` coherente con ellos (sin dos campos autoritativos).
2. Los cambios de CHECK (`messages.delivery_status`, `outbound_jobs.status`) se hacen con `DROP CHECK` + `ADD CONSTRAINT` idempotentes guardados por `information_schema`, como `2026-09-15.001`.
3. Orden y agrupación de scripts forward (cada uno expand-only, compatible con la app anterior, registrado en `schema_versions`):

| Script | Contenido | Ítem |
|---|---|---|
| `AAAA-MM-DD.001_conversation_control.sql` | columnas de control en `conversations`; `sequence` y `channel_account_id` (nullable + backfill desde conversación) en `messages`; único nuevo; `UNKNOWN` en `delivery_status` | S03 |
| `…002_outbound_fencing.sql` | epoch/nonce/lease en `outbound_jobs`; `UNKNOWN`, `UNKNOWN_FINAL`; `outbox_consumptions` | S03, S07 |
| `…003_tenant_config_entitlements.sql` | `tenant_config_versions`, `support_access_grants`, entitlements | S02 |
| `…004_usage_ledger.sql` | `usage_ledger` con reserva/commit/release | S08 |
| `…005_knowledge.sql` | documentos, versiones, chunks con FULLTEXT, audiencia, ACL, vigencia | S09 |
| `…006_agent_runtime.sql` | `tool_executions` con `UNIQUE(tenant_id, tool_name, idempotency_key)` + hash; columnas de `chatbot_runs` | S10–S12 |
| `…007_visit_requests.sql` | `visit_requests` (REQUESTED ≠ `visits.SCHEDULED`) | S13 |

4. Cada tabla nueva: `tenant_id`, `UNIQUE(tenant_id,id)`, FKs compuestas, `DATETIME(3)`, CHECKs de enums. Los scripts se crean recién al implementar su ítem (no se adelantan tablas sin código que las use).

## Consecuencias

- `SchemaContractVerifier` / `config/database-contract.php` se amplían en el mismo cambio que agrega cada script.
- `messages.channel_account_id` se agrega nullable y se completa por backfill; el único se crea en un release posterior (contract) para no romper inserciones de la app anterior.
- Riesgo: `properties` y `leads` no se tocan en estos scripts; los locks relevantes son sobre tablas hoy vacías en producción (verificar conteos antes de aplicar).
