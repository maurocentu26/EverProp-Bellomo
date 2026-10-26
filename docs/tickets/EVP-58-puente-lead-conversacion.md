# EVP-58 · Puente Lead ↔ Conversación y orden de la ficha

Rama `ticket/EVP-58-puente-lead-conversacion`, sale de `ticket/EVP-57-acceso-conversaciones`. Codex implementó; Claude revisó y ajustó.

## Cambios

- `LeadConversationLink.tsx` (nuevo): busca el hilo con la búsqueda existente de la bandeja (`listConversations("all", término)`), una vez por carga. Término: últimos 8 dígitos del teléfono (el lead guarda formato local y la conversación E.164) o el email. Si encuentra, muestra "Ver conversación" → `/admin/conversaciones?c=<id>`; si no o si falla, no muestra nada. Sirve para WhatsApp, Instagram, Messenger y web.
- Ficha del lead: botón nuevo junto al de WhatsApp externo (se conserva). Intereses e Historial primero; la calculadora de financiación queda abajo, en un desplegable cerrado.
- Mi Día: el mismo botón en la tarjeta del lead.
- Test `tests/lead-conversation-link.test.mjs`. Sin cambios de backend.

## Verificación (2026-10-26, modo demo local)

- TypeScript sin errores; ESLint 0 errores; test 3/3.
- Navegador: orden de la ficha correcto y calculadora cerrada.
- Pendiente: el modo demo no busca por teléfono, así que el botón "Ver conversación" solo se ve con datos reales (staging).
