# Estado de implementación — Eversys Conversations

Actualizado 2026-09-29. Nada de esto está desplegado ni conectado a Meta. Evidencia: suite PHPUnit sobre MySQL 8.0.46 aislado en sandbox (no 8.4 Docker; repetir con `everprop-api/scripts/import-schema.ps1` + `php artisan test`).

## G0 — hecho

| Ítem | Estado | Evidencia |
|---|---|---|
| E01 permisos publicar/precio/proyecto | Hecho | `InventoryWriteGuardsTest` (9 tests) |
| E02 CRM respeta visibilidad y precio | Hecho | `LeadInventoryGuardsTest` |
| E03 batch sin sufijo aleatorio (409) | Hecho | `InventoryWriteGuardsTest` |
| E04 visitas: scope, eliminadas, doble envío | Hecho | `LeadInventoryGuardsTest` |
| E05 CI raíz (api/web/evals), pint/phpstan verdes | Hecho; composer audit y redocly sin correr | `.github/workflows/` |
| S01 reconciliación de esquema | Hecho (ADR 0004) | preflight en base aislada |
| S02 configuración por tenant | Parcial (ADR 0005) | scheduler y push sin "bellomo" |

## G1 — hecho (backend)

| Ítem | Qué quedó | Tests |
|---|---|---|
| S03 runtime durable | Forward `2026-09-29.002`; `InboundMessageService` (dedupe por canal+ID nativo, secuencia por conversación, outbox en la misma transacción); reconciliador `everprop:conversations:reconcile` | `WhatsAppWebhookTest` |
| S05 widget web (backend) | Sesión opaca (solo SHA-256 en base), alcance a una conversación, orígenes permitidos por widget, polling por secuencia, rate limit por IP | `WebChatAndUsageTest` |
| S06 WhatsApp (simulado) | Webhook app-level: handshake, `X-Hub-Signature-256` sobre bytes crudos, tenant solo por `phone_number_id` único global, WABA opcional, estados monótonos, payload malformado tolerado; transporte Cloud API apagado por defecto (`META_SEND_ENABLED=false`) | `WhatsAppWebhookTest`, `WebChatAndUsageTest` |
| S07 handoff | `ConversationControl` (epoch, TRANSITION_PENDING, anti-robo de control, resume explícito); `OutboundDispatcher` (claim con fencing, lease, UNKNOWN sin reintento, UNKNOWN_FINAL auditado); API de bandeja | `HandoffAndDispatchTest` |
| S08 ledger | `UsageLedger` reserve/commit/release/unknown con lock por período y cupo global+tenant | `WebChatAndUsageTest` |

Revisiones independientes: aislamiento/seguridad y concurrencia. Hallazgos corregidos: robo de control en TRANSITION_PENDING, lock único sin expiración, deadlocks S→X, `phone_number_id` duplicable entre tenants, RBAC de asesor en close/resume, destinatario por hilo, autor desactivado, límites de tasa, orígenes del widget.

## Pantallas (S04 bandeja + S05 widget) — hecho

- `/admin/conversaciones`: bandeja con filtros (Esperan asesor, Mías, No leídas, Todas), hilo, tomar control, responder (clave de idempotencia atada al texto), cerrar, reanudar IA (oculto mientras la IA esté apagada), aviso y liberación de envíos sin confirmar; vista móvil; foco y `aria-live`.
- `/widget/{widgetId}`: chat del visitante con sesión opaca, reintento sin duplicar, cursor que no saltea respuestas en cola. `public/eversys-widget.js` lo embebe con un `<script>` (botón + iframe, Escape cierra).
- Encabezados anti-clickjacking: todo el panel `frame-ancestors 'none'`; el widget solo en `EVERSYS_WIDGET_FRAME_ANCESTORS`.
- `CONVERSATIONS_AI_ENABLED=false` (por defecto hasta G2): las conversaciones nuevas entran como "Espera asesor".
- Verificado E2E con Playwright sobre API + Next locales (datos sintéticos): visitante escribe → aparece en bandeja → asesor toma control y responde → el visitante lo ve. Revisión independiente de frontend aplicada (respuestas tardías, idempotencia, sesiones duplicadas, cursor, foco, framing).

## G2 — hecho (backend, IA apagada por defecto)

| Ítem | Qué quedó | Tests |
|---|---|---|
| Esquema | Forward `2026-09-29.003`: `knowledge_documents/chunks` (FULLTEXT), `tool_executions`, `visit_requests`, `chatbot_runs.conversation_id/control_epoch/input_sequence` + índices; contrato 58/54/131 | `everprop:schema:verify` |
| S09 conocimiento | Alta DRAFT → aprobación (chunking por títulos/párrafos) → revocación; búsqueda FULLTEXT solo APPROVED, vigente (`valid_until`), audiencia PUBLIC y del tenant. Promociones = documentos con vigencia. API `/api/v1/admin/knowledge` (escriben admin/gerente) | `KnowledgeAdminTest`, `AgentTurnTest` |
| S10 coordinador | `AgentCoordinator` + `RunAgentJob`: un turno por mensaje, lock por conversación, ≤2 llamadas + 1 reintento, 8k entrada / 600 salida / 20 s, reserva en ledger antes de cada llamada (UNKNOWN si pudo facturarse), epoch capturado al inicio, respuesta vía `proposeBotReply` (se descarta si un asesor tomó control). `OutputGuard` bloquea montos sin respaldo (par monto+moneda de herramientas o fuentes), "visita confirmada/agendada" y visitas pedidas sin "un asesor confirma". Cualquier falla → derivación con aviso. Reconciliador deriva turnos colgados | `AgentTurnTest`, `OutputGuardTest` |
| S11 inventario | `buscar_propiedades` / `consultar_propiedad`: misma regla que el catálogo público, en vivo, precio null = "no confirmado", presupuesto solo con moneda y sin conversión | `AgentTurnTest` |
| S12 CRM | `registrar_interes`: lead abierto por SP (fuera de transacción) + `lead_properties` + outbox, idempotente por turno; en web exige teléfono/email; datos declarados solo llenan campos vacíos y quedan como no verificados (teléfono local queda como `declared_phone`, no E.164). `derivar_a_asesor`: WAITING_HUMAN + aviso bajo el nuevo epoch + sugerencia del dueño del lead si está activo | `AgentTurnTest` |
| S13 visitas | `solicitar_visita`: `visit_requests` REQUESTED (nunca `visits`), franjas futuras ≤60 días y ≤4 h, zona IANA, una pendiente por propiedad y máx. 3 por conversación/24 h | `AgentTurnTest` |

Proveedor LLM: interfaz `LlmClient`; adaptador Anthropic Messages listo pero **apagado** (`AGENT_LLM_PROVIDER=disabled`, sin modelo por defecto). Con IA habilitada y proveedor apagado, cada turno deriva a un asesor con aviso. Evals: +4 casos (23). Revisiones independientes LLM-security y aislamiento/concurrencia: hallazgos corregidos (guard monto+moneda y "mil", bypass de negación, fugas del ledger, turnos sin run, TTL del lock vs `retry_after`, asignado inactivo, sesión fuera de transacción, reconciliador). Aceptado: `registrar_interes` puede crear el lead abierto (idempotente) justo antes de perder el control.

## Go-live (chat web) — hecho

- Solicitudes de visita: API `/api/v1/admin/visit-requests` (listar, confirmar → crea `visits` SCHEDULED una sola vez, rechazar) y pantalla `/admin/solicitudes-visita`. Test `VisitRequestAdminTest`.
- Pantalla `/admin/conocimiento` (alta, aprobar, revocar, vigencia). Enlace directo a la conversación (`/admin/conversaciones?c=`).
- `php artisan everprop:channels:web-chat` crea/actualiza el widget del tenant e imprime el `<script>` y `EVERSYS_WIDGET_FRAME_ANCESTORS`.
- Cola en base (forward `2026-09-30.001`: `jobs`, `failed_jobs`) para correr worker sin Redis.
- `everprop:production-check`: exige las tablas de G1/G2 (el arranque falla si no se aplicó el SQL) y, con IA encendida, cola asíncrona, `retry_after` > lock del turno y proveedor configurado. Con cola `sync` en producción la IA queda apagada sola.
- Corrección: la búsqueda de conocimiento no usa la relevancia natural de InnoDB como filtro (daba 0 cuando todos los fragmentos compartían los términos); filtra por coincidencia booleana y ordena por términos presentes.
- Runbook: [go-live.md](go-live.md).

## Pendiente conocido

- Webhook Meta procesa sincrónicamente antes del ACK (persistencia primero). Pasar a receipt → ACK → worker si el volumen lo exige.
- `ChannelPolicy.canSend` (ventana 24 h / plantillas) aún no existe: el transporte real sigue apagado hasta tenerla.
- Integrar el widget en el sitio de Bellomo (hoy Bellomito usa su propio `/api/chat` con Gemini): reemplazar por el `<script>` cuando G2 esté listo.
- Bandeja: búsqueda, etiquetas, notas internas y adjuntos (diseño S04) aún no.
- Alta de `channel_accounts`/integraciones (onboarding S14/Embedded Signup) sin endpoint.
- Activar IA: aprobar proveedor/región (X03), elegir modelo, cargar `ANTHROPIC_API_KEY` en el gestor de secretos, `REDIS_QUEUE_RETRY_AFTER` > 180, y correr evals contra el modelo real antes de `CONVERSATIONS_AI_ENABLED=true`.
- Conciliar filas UNKNOWN del ledger contra el uso real del proveedor (hoy conservan la reserva máxima).
- Montos escritos en palabras ("ochenta y cinco mil") no los detecta el guard.
- Dependencias externas: X01 (Tech Provider: verificación de negocio, App Review, videos), X02–X04.
