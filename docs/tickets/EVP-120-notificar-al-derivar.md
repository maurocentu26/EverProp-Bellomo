# EVP-120 — Conversaciones y Notificaciones: notificar solo al derivar a un asesor con contacto identificado

Rama `ticket/EVP-120-notificar-al-derivar` · commits `d367bf6` · fecha 2026-11-10 · autor Antigravity y Mauro Centurión

## 1. Qué pedía el ticket
Corregir el flujo de notificaciones e identificación de conversaciones del panel comercial para que:
1. **No se emitan notificaciones por cada mensaje o ingreso de chat**: la apertura o envío de mensajes en el widget web, WhatsApp, Instagram o Messenger mientras atiende el asistente (`AI_ACTIVE`), ni cada mensaje subsiguiente dentro de una conversación activa con un asesor (`HUMAN_ACTIVE` / `WAITING_HUMAN`), deben generar alertas `ConversationNeedsAttention` en la campana o en notificaciones push.
2. **Notificación únicamente ante derivación concreta (o reapertura de conversación cerrada)**:
   - Cuando la conversación pasa efectivamente a requerir atención de un asesor (`ConversationControl::requestHuman`, ya sea por la herramienta `derivar_a_asesor` o por fallback del runtime).
   - Cuando se registra y asigna un nuevo lead desde el chat (`LeadAssignedNotification` con `LEAD_CREATED`).
   - Cuando un cliente vuelve a escribir en una conversación que estaba `CLOSED` (`$reopen === true`).
3. **Eliminación de conversaciones anónimas `"Visitante del chat web"` al derivar**:
   - Antes de derivar con `derivar_a_asesor`, el asistente solicita nombre y teléfono/email (si aún no los tiene) y los envía en `contact_name`, `contact_phone` y/o `contact_email`.
   - `DerivarAAsesor` persiste la identidad del contacto en `contacts` (reemplazando placeholders genéricos si los hubiera) y, cuando cuenta con un medio de contacto alcanzable, crea o reutiliza el lead mediante `sp_create_or_get_open_lead`, rotando y asignando al asesor correspondiente antes del handoff.
   - `AdminConversationController::index` resuelve `contact_name` priorizando el nombre real y haciendo fallback al teléfono (`phone_e164` / `declared_phone`) o email del contacto para que un contacto identificado nunca figure como `"Visitante del chat web"` ni `"Contacto sin nombre"`.

**Fuera de alcance**:
- Modificar el flujo de confirmación en dos pasos de `registrar_contacto` y `registrar_interes` (`EVP-103` / `EVP-119`), que permanece en `AI_ACTIVE` tras confirmar el lead.
- Cambios de esquema SQL (no se requirieron migraciones ni scripts forward).

## 2. Qué se implementó
- [`everprop-api/app/Domain/Conversations/Services/InboundMessageService.php:85-130`](../../everprop-api/app/Domain/Conversations/Services/InboundMessageService.php#L85-L130):
  - Mientras la conversación está bajo control del bot (`in_array($state, ConversationControl::BOT_STATES, true)`), `unread_count` permanece en `0` para no contaminar la vista `"Para vos"` con conversaciones que la IA está atendiendo.
  - Se eliminó el disparo de `ConversationNeedsAttention::sendFor` en cada mensaje entrante cuando `unread_count === 0`; `InboundMessageService::persist` ahora solo dispara `ConversationNeedsAttention::sendFor` cuando `$reopen === true` (reapertura de una conversación `CLOSED` por un nuevo mensaje del cliente).
  - Se preservó `waiting_episode` para que el aviso automático fuera de horario (`awayNotice`) conserve su comportamiento en `BusinessHoursTest`.
- [`everprop-api/app/Domain/Conversations/Services/ConversationControl.php:117-220`](../../everprop-api/app/Domain/Conversations/Services/ConversationControl.php#L117-L220):
  - En `requestHuman()`, se asegura `unread_count = GREATEST(unread_count, 1)` al pasar a `WAITING_HUMAN`, se busca automáticamente el `assigned_user_id` de un lead abierto del contacto dentro del mismo `tenant_id` si la conversación aún no tenía responsable sugerido (validando `isEligibleAssignee`), y se pasa `'reason' => $reason` a `ConversationNeedsAttention::sendFor`.
  - En `assignLead()`, se agregó el parámetro opcional `bool $notify = true` y `?int $expectedEpoch = null`, se acotó la consulta de `User` por `tenant_id` y `status = 'ACTIVE'`, se resolvió el nombre del contacto con fallback a teléfono/email, y se corrigió `actionUrl` a `"/admin/conversaciones?c={$conversation->public_id}"`.
- [`everprop-api/app/Domain/Conversations/Notifications/ConversationNeedsAttention.php:24-125`](../../everprop-api/app/Domain/Conversations/Notifications/ConversationNeedsAttention.php#L24-L125):
  - Enriquecimiento contextual y seguro (`self::describe`) para el panel: incluye el nombre/teléfono/email del contacto únicamente cuando la notificación va dirigida en forma exclusiva al asesor propietario (`$includeIdentity === true`), evitando exponer PII a otros asesores en derivaciones sin asignar, y traduce el código de motivo (`ADVISOR_REQUESTED`, `USER_REQUEST`, `NO_EVIDENCE`, `COMMERCIAL_EXCEPTION`, `TOOL_FAILURE`, etc.) a mensajes canónicos del servidor sin inyectar texto libre del LLM.
  - `SendWebPush::payload` conserva el texto genérico sin PII para pantallas de bloqueo móviles.
- [`everprop-api/app/Domain/AgentRuntime/Tools/ContactDetails.php:66-68`](../../everprop-api/app/Domain/AgentRuntime/Tools/ContactDetails.php#L66-L68):
  - `ContactDetails::fill()` trata los placeholders `'Visitante Web'`, `'Visitante del chat web'` y `'Contacto sin nombre'` como vacíos para permitir que `contact_name` los reemplace por el nombre declarado del visitante sin sobrescribir nombres reales del CRM.
- [`everprop-api/app/Domain/AgentRuntime/Tools/DerivarAAsesor.php:14-125`](../../everprop-api/app/Domain/AgentRuntime/Tools/DerivarAAsesor.php#L14-L125):
  - Extiende `schema()['properties']` con `ContactDetails::SCHEMA` (`contact_name`, `contact_phone`, `contact_email` opcionales).
  - Verifica `InboundMessageService::aiEnabled($context->tenantId)` y valida `BOT_STATES` + `control_epoch` bajo `lockForUpdate()` antes de actualizar `contacts`.
  - Si el contacto posee un dato alcanzable (`phone_e164`, `email` o `declared_phone`) y el tenant tiene etapa `NEW` activa, ejecuta `CreateOrGetOpenLeadProcedure` (`sp_create_or_get_open_lead`) con título fijo `'Consulta derivada por asistente'`, asigna al asesor rotado mediante `ConversationControl::assignLead(..., notify: false, expectedEpoch: $context->epoch)` y vincula `chatbot_sessions.lead_id`.
- [`everprop-api/app/Domain/AgentRuntime/Coordinator/PromptBuilder.php:38`](../../everprop-api/app/Domain/AgentRuntime/Coordinator/PromptBuilder.php#L38):
  - Actualiza la regla 5 del system prompt para indicar que antes de invocar `derivar_a_asesor` se solicite nombre y teléfono/email (si aún no están cargados) y se envíen en `contact_name`, `contact_phone` y/o `contact_email`, derivando igual si el visitante insiste o si una herramienta falla.
- [`everprop-api/app/Domain/Conversations/Http/Controllers/AdminConversationController.php:67-110`](../../everprop-api/app/Domain/Conversations/Http/Controllers/AdminConversationController.php#L67-L110):
  - `index()` selecciona `ct.phone_e164`, `ct.email` y `ct.profile_json` y resuelve `contact_name` mediante `resolveContactName()`, haciendo fallback a teléfono o email cuando `display_name` está vacío o tiene un placeholder genérico.
- [`everprop-public/src/components/admin/AdminNavbar.tsx:116-126`](../../everprop-public/src/components/admin/AdminNavbar.tsx#L116-L126):
  - Cuando la pestaña está oculta (`document.visibilityState === "hidden"`), las notificaciones nativas de escritorio para `CONVERSATION_NEEDS_ATTENTION` muestran texto genérico sin PII (`"Un cliente espera respuesta"` / `"Abrí la conversación para atenderlo."`), manteniendo el detalle contextual solo dentro de la sesión autenticada del panel.

## 3. Por qué esta solución
- **Reutilización**: Se reutilizaron `ContactDetails::SCHEMA`, `ContactDetails::fill()`, `CreateOrGetOpenLeadProcedure` (`sp_create_or_get_open_lead`), `ConversationControl::assignLead()` y `ConversationNeedsAttention::sendFor()` sin crear tablas, colas ni servicios paralelos.
- **Alternativas descartadas**:
  - *Forzar handoff a `WAITING_HUMAN` al confirmar `registrar_contacto` / `registrar_interes`*: descartado porque el diseño de `EVP-103` y las suites `RegistrarContactoTest`, `AgentTurnTest`, `ModelEvalTest` y `evals/cases/crm.jsonl` exigen que tras registrar el lead el asistente siga respondiendo consultas en `AI_ACTIVE` hasta que exista una derivación explícita (`derivar_a_asesor`).
  - *Incluir el `summary` libre del LLM en la notificación*: descartado tras la revisión de `llm-security-reviewer` y `tenant-isolation-reviewer` para impedir que enlaces no verificados o textos inyectados lleguen a `notifications.data` o a otros asesores en conversaciones aún no asignadas.

## 4. Cómo se verificó
- **Validador de evals**:
  - `node evals/validate.mjs` → `OK: 204 casos válidos`.
- **Tests automatizados (PHPUnit en `everprop-api-php` con MySQL 8 y Redis)**:
  - `php artisan test tests/Feature/Conversations/ConversationAlertsTest.php tests/Feature/Conversations/WebChatAndUsageTest.php tests/Feature/AgentRuntime/RegistrarContactoTest.php` → **PASS** (21 tests).
  - Suite completa de `tests/Feature/Conversations`, `tests/Feature/AgentRuntime` y `tests/Feature/Evals` → **PASS** en `AiSettingsTest`, `AssistantUsageTest`, `BusinessHoursTest`, `ChannelPolicyTest`, `ConversationAlertsTest`, `ConversationLeadTest`, `ConversationReopenTest`, `ConversationSearchTest`, `HandoffAndDispatchTest`, `InboxQueueTest`, `MetaSocialWebhookTest`, `WhatsAppWebhookTest`, `WhatsAppGeminiFlowTest`, `AgentTurnTest`, `GeminiChatClientTest`, `KnowledgeAndInventoryToolsTest`, `OpenAiChatClientTest`, `OutOfHoursAssistantTest`, `ProductionSafetyTest`, `RegistrarContactoTest`, `VisitRequestAdminTest` y `ModelEvalTest`.
- **Estilo y análisis estático**:
  - `./vendor/bin/pint --test app tests` → **PASS** (304 archivos).
  - `./vendor/bin/phpstan analyse app/Domain/Conversations app/Domain/AgentRuntime tests/Feature/Conversations/ConversationAlertsTest.php tests/Feature/AgentRuntime/RegistrarContactoTest.php --memory-limit=1G` → **[OK] No errors**.
- **Revisiones obligatorias**:
  - `tenant-isolation-reviewer`: ejecutado; se incorporaron sus observaciones (validación de `aiEnabled`, `BOT_STATES` y `control_epoch` bajo lock en `DerivarAAsesor` y `assignLead`, omisión de PII en notificaciones de conversaciones sin asignar, y tests negativos multi-tenant y de rol inactivo/`READ_ONLY`).
  - `llm-security-reviewer`: ejecutado; se incorporaron sus observaciones (exigencia de teléfono o email alcanzable antes de ejecutar `sp_create_or_get_open_lead` en `DerivarAAsesor`, título fijo `'Consulta derivada por asistente'` en `leads`, mensajes canónicos en `ConversationNeedsAttention` sin interpolar `summary` libre del LLM, y texto genérico en `showDesktopNotification` cuando la pestaña está oculta).
- **Gestión de contenedores Docker locales**:
  - Se verificó `docker ps` al finalizar, deteniendo `everprop-api-php`, `everprop-api-redis` y `everprop-api-mysql` y respetando los contenedores ajenos en ejecución (`jujuy247_*`).

## 5. Pendientes y riesgos
- Cuando una conversación entra directamente en `WAITING_HUMAN` porque el tenant tiene `ai_enabled = false`, queda visible con `unread_count >= 1` en la cola `"Esperando"` / `"Para vos"` sin disparar una notificación por cada mensaje entrante, cumpliendo la regla de producto de notificar únicamente ante derivación concreta o reapertura.
- Antes de desplegar a `staging` o `production`, recordar que cualquier paso a producción requiere verificar dominios, CORS/R2, hosts/Sanctum/cookies y variables de proveedores (este ticket no incluye scripts forward SQL).
