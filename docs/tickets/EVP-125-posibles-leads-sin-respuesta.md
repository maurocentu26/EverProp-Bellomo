# EVP-125 — Panel: apartado «Posibles leads sin respuesta» para DMs de redes

Rama `ticket/EVP-125-posibles-leads-sin-respuesta` (desde `develop` @ `f96c337`) · fecha 2026-11-12 · autor Claude y Mauro Centurión · sin commit todavía

## 1. Qué pedía el ticket

Hallazgo P1-1 de la auditoría `QA_STAGING_BELLOMO.md`. Los DMs de Instagram, Messenger y WhatsApp **no deben crear un lead automáticamente**. Tienen que aparecer en un apartado «Posibles leads sin respuesta» que cumpla esto:

- **Qué lista:** conversaciones de esos canales cuyo contacto no tiene un lead abierto y que ningún asesor respondió después del último mensaje del cliente.
- **Qué muestra cada fila:** canal, contacto, último mensaje, tiempo de espera y asesor.
- **Acciones:** abrir la conversación y convertirla en lead.
- **Visibilidad:** la misma que la bandeja.
- **Contador:** visible en la navegación y actualizado sin recargar.

## 2. Qué se implementó

**API** (`everprop-api/app/Domain/Conversations/Http/Controllers/AdminConversationController.php`, `routes/api.php`):

- Filtro `possible_leads=1` en `GET /admin/conversations`, sobre la consulta que ya existía:
  - solo los canales `INSTAGRAM_DM`, `FACEBOOK_MESSENGER` y `WHATSAPP`;
  - deja afuera las conversaciones `CLOSED`;
  - excluye los contactos con un lead abierto (`is_open = 1`, `deleted_at` nulo);
  - exige un mensaje entrante posterior a la última respuesta de un asesor (`sender_type = USER`). Las respuestas del bot no cuentan, igual que en `waitingSince`.
- En ese modo, la lista ordena por espera más antigua y devuelve `waiting_since` también para las conversaciones con la IA activa.
- `GET /admin/conversations/possible-leads/count`: devuelve el número para el contador.
- Las dos rutas usan `visible()`: el asesor ve las suyas y las sin asignar que esperan asesor; admin, gerente y solo lectura ven todas.
- No se crea ningún lead automáticamente.

**Panel** (`everprop-public`):

- `src/lib/conversations-api.ts`: filtro `leads` con `possible_leads=1`, `possibleLeadsCount()` y soporte en modo mock.
- `src/lib/conversation-presentation.ts`:
  - `visibleConversations(..., allTabs)`: en este apartado se ven todos los estados, no solo la pestaña activa;
  - `unansweredFor()`: «Sin respuesta hace N min/h/d»;
  - `filterFromHash()`: abre el apartado con `#filtro=posibles-leads`.
- `src/components/admin/conversations/ConversationInbox.tsx`:
  - chip «Posibles leads sin respuesta» con contador que se actualiza cada 8 s;
  - texto explicativo en lugar de las pestañas;
  - marca «Sin respuesta hace…» en cada fila;
  - la fila de chips se desplaza sola hasta el chip activo, con `scrollLeft` para que la página no se mueva (EVP-121).
- `src/components/admin/AdminNavigationMenu.tsx`: contador en «Conversaciones», que se actualiza cada 30 s con la pestaña visible y al volver a ella. Con posibles leads pendientes, el link abre el apartado.
- **Convertir en lead:** se reusa la acción «Lead y visita» de la conversación (`POST /admin/conversations/{id}/lead`). El lead toma el canal como `source_channel` y la conversación sale del apartado.

## 3. Por qué esta solución

- Se reusan la consulta, la visibilidad, el orden y el `waiting_since` de la bandeja (EVP-15) y la acción de lead existente. No hace falta una tabla, una pantalla nueva ni un SQL forward.
- **Decisión pendiente del ticket, resuelta con la propuesta:** una respuesta del bot **no** saca la conversación del apartado; solo la saca la respuesta de un asesor. Es la misma regla que ya usa el tiempo de espera.
- **Sin umbral de urgencia:** la fila muestra el tiempo de espera y la lista ordena por la espera más antigua. Si se define un umbral, es un ajuste de presentación.

## 4. Cómo se verificó

- **API**, en el contenedor `everprop-api-php` (PHP 8.4, MySQL 8.4), con una copia aislada del worktree en `/tmp/evp125`:
  - `tests/Feature/Conversations/PossibleLeadsTest.php`: **3 tests y 30 assertions, PASS**. Cubren:
    - DMs de IG, Messenger y WA listados; el chat web no; ningún lead automático; `waiting_since` y vista previa;
    - la respuesta del bot no lo saca; la del asesor, el lead (con `source_channel` del canal) y el cierre sí; un mensaje nuevo después de la respuesta lo vuelve a listar;
    - el asesor solo ve las suyas y las sin asignar, el gerente ve todas y no se mezclan tenants;
    - el contador coincide siempre con la lista.
  - Junto con `InboxQueueTest`, `ConversationSearchTest` y `ConversationLeadTest`: **11 tests, PASS**.
  - Suite `tests/Feature/Conversations`: **158/160**. Las 2 fallas (`QueueDispatchFlowTest::test_human_reply_waits_in_the_database_queue_until_a_worker_consumes_it` y `WebChatAndUsageTest::test_whatsapp_transport_is_disabled_by_default_and_maps_provider_outcomes`) **también fallan sobre `develop` sin estos cambios**, con el mismo `.env.testing` local. No son de este ticket.
  - Pint: PASS. PHPStan en el controlador y el test: sin errores.
- **Panel**:
  - `node --test` de `conversations-api`, `conversation-presentation`, `conversation-composer` y `lead-messages`: 28/28.
  - `tsc --noEmit`: OK.
  - ESLint en los archivos tocados: 0 errores. El único warning es previo, en la línea `setFilter("all")` del link `?c=`.
- **Navegador**, en modo mock (`evp125-mock`, puerto 3125), escritorio 1280×800 y móvil 375×812:
  - el menú muestra «Conversaciones 2» con el link `#filtro=posibles-leads`;
  - el apartado lista las 2 conversaciones de WhatsApp (con la IA y esperando asesor), con texto explicativo y «Sin respuesta hace instantes»;
  - el chip activo queda visible y la página no se desplaza;
  - en móvil no hay desborde horizontal.

## 5. Pendientes y riesgos

- **No verificado contra staging ni con la API real en el navegador:** falta desplegar.
- **Umbral de urgencia:** sin definir (ver 3).
- **Asesor y conversación sin asignar:** si la conversación está con la IA, el asesor no la ve. Es la regla de `visible()`; admin y gerente sí la ven.
- **Respuestas fallidas:** una respuesta del asesor con estado `FAILED` cuenta como respuesta, igual que en `waitingSince`. Relacionado con EVP-127.
- **Carga:** el contador hace una consulta por pestaña cada 30 s (menú) y 8 s (bandeja abierta). El costo es bajo para el volumen del piloto.
- **Relacionado:** EVP-126 (avisar la conversación nueva con la IA apagada) es complementario. Este ticket no agrega avisos por campana ni push.
