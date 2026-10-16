# EVP-36 — Captura temprana de lead y asignación en bandeja de entrada

Rama `ticket/EVP-36-captura-temprana-lead`, desde `develop` `fc1c210` · 2026-10-16 · Antigravity con Mauro Centurión.
Jira: https://eversys.atlassian.net/browse/EVP-36, asignado a Mauro Centurión.

## 1. Qué pedía el ticket

1. **Captura temprana de lead:** Bellomito debe solicitar de forma natural y temprana los datos de contacto del visitante (nombre, teléfono/WhatsApp y/o email), registrando de inmediato un lead abierto en el CRM (`leads`) sin necesidad de que consulte por una propiedad específica ni esperar al final de la conversación.
2. **Asignación sin interrumpir la IA:** Al crearse el lead (mediante round-robin o asignación existente), la conversación en la bandeja (`conversations`) debe quedar asignada al asesor comercial responsable (`assigned_user_id`), manteniéndose en modo `AI_ACTIVE`.
3. **Visibilidad en tiempo real para el asesor:** El asesor asignado debe ver inmediatamente la conversación activa en su bandeja de entrada (`/admin/conversaciones`), pudiendo monitorear las respuestas autónomas de Bellomito o intervenir y tomar el control (`takeover`) en cualquier momento.

## 2. Qué se implementó

- **Herramienta `RegistrarContacto` (`app/Domain/AgentRuntime/Tools/RegistrarContacto.php`):**
  - Nueva herramienta de agente invocable por el coordinador LLM cuando el visitante proporciona sus datos personales.
  - A diferencia de `registrar_interes` (que requiere `property_id`), `registrar_contacto` crea o actualiza un lead general de interés comercial mediante el procedimiento almacenado transaccional `sp_create_or_get_open_lead`.
  - Ejecución idempotente con `ToolExecutions::once` protegida por `idempotency_key` y control de run ID.
  - Emite el evento de dominio `LEAD_CONTACT_CAPTURED` en `domain_outbox`.
- **Servicio `ConversationControl` (`app/Domain/AgentRuntime/Tools/ConversationControl.php`):**
  - Método `assignLead(int $tenantId, int $conversationId, array $lead): ?int`: vincula la conversación con el asesor dueño del lead (`assigned_user_id`) si aún no estaba asignada, sin alterar el `control_state` (se mantiene `AI_ACTIVE`).
  - Validación de asesor elegible mediante `isEligibleAssignee()`, comprobando estado `ACTIVE`, roles habilitados (`TENANT_ADMIN`, `SALES_MANAGER`, `SALES_ADVISOR`) y borrado lógico (`deleted_at IS NULL`).
  - Registro de auditoría `CONVERSATION_LEAD_ASSIGNED` en `domain_outbox` y despacho de notificación `LeadAssignedNotification` dirigida a la URL de la conversación `/admin/conversaciones/{public_id}`.
  - Reutilización de `assignLead` en la herramienta existente `RegistrarInteres`.
- **Registro en `ToolGateway`:**
  - Registro de la herramienta `registrar_contacto` con su esquema de parámetros (`contact_name`, `contact_phone`, `contact_email`, `notes`).
- **Prompt del Coordinador (`PromptBuilder.php` y `config/agent.php`):**
  - Regla 4 actualizada: instrucción explícita al agente para solicitar cordialmente nombre y WhatsApp/teléfono o email para poder brindar un seguimiento personalizado.
  - Soporte de etiquetas de canal para `INSTAGRAM_DM` ("Instagram") y `FACEBOOK_MESSENGER` ("Facebook Messenger").
  - Versión del prompt incrementada a `coordinator-2026-10-16.1`.

## 3. Por qué esta solución

- **Filosofía Ponytail (mínimo diff, máxima reutilización):**
  - Reutiliza el procedimiento `sp_create_or_get_open_lead` existente y su lógica de rotación de asesores (*round-robin*).
  - Reutiliza la tabla `contacts` y las notificaciones del CRM sin alterar el esquema de base de datos ni agregar dependencias.
  - Unifica la asignación de conversaciones entre `registrar_contacto` y `registrar_interes` en una sola función centralizada dentro de `ConversationControl`.

## 4. Cómo se verificó

- **Pruebas de integración automatizadas (`RegistrarContactoTest.php`):**
  - `test_creates_lead_without_property_and_assigns_conversation_to_advisor`: verifica creación de contacto, lead en CRM, asignación a asesor, permanencia de `AI_ACTIVE`, emisión de outbox y visibilidad en `/api/v1/admin/conversations` para el asesor asignado.
  - `test_replay_is_idempotent`: verifica que reintentos de la herramienta retornen el resultado previo sin duplicar leads.
  - `test_does_not_override_existing_assigned_user`: comprueba que no se sobreescriba un asesor ya asignado a la conversación.
  - `test_requires_reachable_contact_on_web_chat`: valida que en web chat se exija un canal de contacto accionable (teléfono o email).
  - Resultado: **4 passed (20 assertions)**.
- **Pint:** 100% aprobado sin observaciones (`vendor/bin/pint --test`, 302 archivos).
