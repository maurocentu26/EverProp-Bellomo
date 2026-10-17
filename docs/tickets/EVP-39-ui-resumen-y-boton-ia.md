# EVP-39 — Conversaciones UI: Resumen de derivación colapsable y reubicación de botón para delegar a IA

- **Ticket Jira:** [EVP-39](https://eversys.atlassian.net/browse/EVP-39)
- **Rama:** `ticket/EVP-39-ui-resumen-y-boton-ia`

## Contexto y problema

1. En la vista de conversaciones (`ConversationInbox.tsx`), el bloque de **Resumen del asistente** que aparece cuando una conversación es derivada a un asesor humano ocupa demasiado espacio vertical en el panel de chat, especialmente cuando el resumen generado es extenso, sin opción de ocultarlo ni colapsarlo.
2. El botón **«Devolver la conversación a la IA»** se encontraba ubicado al final del panel, debajo de la caja de redacción de mensajes (`composer`), en una zona poco visible e incómoda para el flujo operativo del asesor.

## Solución implementada

- **Reubicación de la acción para delegar a la IA (`Pasar a IA`):**
  - Se eliminó el bloque `<details>` ubicado debajo del compositor de mensajes.
  - Se incorporó un botón **«Pasar a IA»** directamente en la barra superior de acciones de la conversación (`wa-bar`) junto a los controles principales del chat, visible cuando la conversación está en estado `WITH_HUMAN` o `WAITING_HUMAN`.
  - Al pulsar «Pasar a IA», se despliega una barra compacta inmediatamente debajo del encabezado para ingresar el motivo y confirmar (**«Reanudar IA»**) o cancelar (`X`).
- **Resumen del asistente compacto, desplegable y cerrable:**
  - El banner `<section aria-label="Resumen del asistente">` muestra ahora el resumen truncado a una línea (`line-clamp-1`) por defecto para ahorrar espacio vertical.
  - Si el resumen supera los 90 caracteres o contiene saltos de línea, muestra un botón **«Ampliar» / «Contraer»** que permite alternar entre la vista resumida y el texto completo.
  - Incluye un botón de cierre (`X`) para ocultar la nota de resumen durante la visualización de la conversación actual (restaurándose automáticamente al cambiar de conversación).

## Archivos modificados

- `everprop-public/src/components/admin/conversations/ConversationInbox.tsx`
- `docs/tickets/EVP-39-ui-resumen-y-boton-ia.md`

## Verificación

- `npx tsc --noEmit` ejecutado sin errores de tipado en `everprop-public`.
