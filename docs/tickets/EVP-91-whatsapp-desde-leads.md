# EVP-91 — WhatsApp desde leads: abrir el hilo o iniciar chat con plantilla

Rama `ticket/EVP-91-whatsapp-desde-leads`, desde `origin/develop` 33d9fd4. Fecha 2026-10-29. Implementación: Claude Code para Álvaro, en sesión visible. EVP-91 existe en Jira, asignado a Álvaro y pasado a En curso al crear la rama. Sin commit, push, PR, merge ni despliegue: requieren autorización expresa.

## 1. Pedido y alcance

Álvaro pidió que «Mensajes» desde un lead permita escribirle por WhatsApp desde el número Business del tenant: abrir el hilo si existe y, si no, iniciar el chat. EVP-89 (en develop) solo buscaba y excluía crear chats; este ticket amplía ese alcance. Meta solo permite abrir una conversación con plantilla aprobada, así que el inicio es únicamente con plantilla.

## 2. Implementación

Backend (`everprop-api`):

- `GET /api/v1/admin/leads/{lead}/whatsapp` (`AdminConversationController::leadWhatsapp`): solo lectura. Con la visibilidad de Leads (`LeadAccessPolicy::view`: el asesor solo ve sus leads), busca el hilo exacto `wa:<wa_id>` en el número WhatsApp ACTIVO del tenant. Devuelve `conversation_id` si el usuario puede verlo; si no hay hilo, las plantillas aprobadas (`WhatsAppTemplates::forChannel`). `reason`: `NO_PHONE`, `NO_CHANNEL`, `NO_TEMPLATES`, `CONVERSATION_OF_ANOTHER_ADVISOR`.
- `POST /api/v1/admin/leads/{lead}/whatsapp` (`startLeadWhatsapp`): mismo control de plantilla y parámetros que `sendTemplate`; READ_ONLY rechazado. Llama a `ConversationControl::startWithTemplate`.
- `ConversationControl::startWithTemplate`: en una transacción bloquea la fila del canal (como la creación entrante), rechaza si ya existe hilo (`CONVERSATION_EXISTS`) salvo replay de la misma clave, aplica `ChannelPolicy` (plantilla aprobada), vincula el `wa_id` al contacto del lead en `contact_identities` (o `IDENTITY_OF_ANOTHER_CONTACT` si pertenece a otro), crea la conversación en `HUMAN_ACTIVE` controlada y asignada al asesor, registra `CONVERSATION_STARTED_BY_USER` en outbox y encola la plantilla con `queueOutbound` (outbound_jobs idempotente, mismo despacho existente).
- `wa_id`: dígitos del teléfono; a números argentinos sin el 9 móvil se les agrega (`54…` → `549…`), porque el `wa_id` entrante de Meta es `549…`. Así la respuesta del cliente cae en el mismo hilo y el mismo contacto.
- Rutas con `throttle:30,1` y `whereUuid`. Sin esquema, forwards, dependencias, permisos ni variables nuevas.

Frontend (`everprop-public`):

- `leadConversationHref`: agrega `lead=<uuid>` al fragmento (no a la query; sigue fuera de logs y Referer). `conversationLeadFromHash` solo acepta UUID.
- `LeadWhatsappStart.tsx` (nuevo): al abrir la bandeja con un lead consulta el GET. Si hay hilo, lo abre directamente; si no, muestra plantillas, datos y vista previa. Enviar exige dos pasos («Revisar mensaje» → «Confirmar y enviar», mostrando el teléfono). La clave de idempotencia queda atada al texto exacto. Motivos claros sin envío para los casos de `reason`.
- `ConversationInbox.tsx`: lee el lead del fragmento y muestra el panel sobre la lista; la búsqueda por `#q` de EVP-89 se mantiene como respaldo y para varias coincidencias.
- `conversations-api.ts`: `getLeadWhatsapp` y `startLeadWhatsapp` (en mock no envía).

## 3. Verificación

- Backend, PHP 8.4 en contenedor temporal sobre copia de la rama, MySQL 8.4 base QA dedicada `bellomo_crm_evp86_qa` (sin forwards nuevos desde 70ff6fc) y Redis local; Meta simulado con `Http::fake`, sin envíos reales.
  - `LeadWhatsappStartTest`: 3/3, 40 aserciones (normalización `wa_id`; inicio + replay + hilo existente + respuesta entrante en el mismo hilo/contacto; sin teléfono, plantilla incompleta, lead de otro asesor, número de otro contacto, READ_ONLY, sin envíos).
  - `tests/Feature/Conversations`, `Integrations` y `CRM`: 254/256. Fallan `ReleaseSchemaTest` (espera el nombre de base `bellomo_crm_test`) y `StatisticsDemoTest` (requiere entorno local); fallan igual con el código de develop sin cambios.
  - Pint sin observaciones en los 4 archivos; PHPStan `app/Domain/Conversations` sin errores.
- Frontend: `node --test tests/*.test.mjs` 193/194. El fallo es `assistant-trace` (EVP-24, ya en develop: el comentario del componente contiene «innerHTML»); falla igual sin estos cambios. Se ajustaron índices del arnés de `conversation-composer.test.mjs` por el nuevo estado, sin quitar aserciones. `tsc --noEmit` aprobado; `npm run lint` 0 errores, 127 advertencias; build `NEXT_PUBLIC_DATA_MODE=mock npm run build -- --webpack` aprobado, 37 rutas.

## 4. Límites y pendientes

- No probado en navegador ni en staging. Falta validación con destinatario sandbox autorizado y una plantilla aprobada real del número Business; no se revisó si el número tiene plantillas aprobadas.
- El atajo sandbox de `WhatsAppCloudTransport` no aplica a plantillas (comportamiento previo): una plantilla va al `wa_id` `549…` sin traducir. Confirmar con Meta en staging antes de dar por buena la entrega.
- Toma el primer número WhatsApp ACTIVO del tenant (`shortcut:` en código); con varios números habría que elegir.
- La regla del 9 móvil es para Argentina; otros países se usan tal cual.
- Posible superposición con PR #82 (Ramiro) en `ConversationInbox.tsx`; revisar antes de integrar.
- Commit, push, PR, merge, despliegue: pendientes de autorización.
