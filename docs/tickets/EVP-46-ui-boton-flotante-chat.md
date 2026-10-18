# EVP-46 — Conversaciones UI: Botón flotante de acciones (FAB) en el chat

- **Ticket Jira:** [EVP-46](https://eversys.atlassian.net/browse/EVP-46)
- **Rama:** `ticket/EVP-46-ui-boton-flotante-chat`

## Contexto y problema

En la bandeja de conversaciones (`ConversationInbox.tsx`), las acciones operativas del asesor (`Lead y visita`, `Pasar a IA`, `Cerrar`, `Reabrir`) se encontraban acumuladas en la barra superior del chat (`wa-bar`). Esto generaba sobrecarga visual en la cabecera, reducía el espacio disponible para los datos del visitante y rompía la armonía con el diseño conversacional tipo mensajería.

## Solución implementada

- **Despeje de la cabecera del chat:**
  - Se eliminaron los botones de acción del encabezado superior, dejando únicamente la información esencial: avatar/iniciales, nombre del contacto, canal, horario límite de respuesta y la insignia (*badge*) de estado de la conversación.
- **Botón Flotante de Acciones (FAB) al pie del chat:**
  - Se integró un botón flotante con icono `MoreVertical` (`X` al abrir) en la esquina inferior derecha del panel de chat, junto al compositor de mensajes.
  - Al presionarlo, despliega un menú contextual flotante (*popover*) hacia arriba con las opciones según el estado actual de la conversación:
    - **Control humano (`HUMAN_ACTIVE` / `WAITING_HUMAN`):** `Lead y visita`, `Pasar a IA`, `Cerrar conversación`.
    - **IA en control (`AI_ACTIVE` / `WAITING_TOOL`):** `Lead y visita`, `Tomar control`.
    - **Cerrada (`CLOSED`):** `Lead y visita`, `Reabrir conversación`.
- **Formulario flotante para Pasar a IA:**
  - Al seleccionar «Pasar a IA» en el menú, se despliega un diálogo emergente compacto en la parte inferior para ingresar el motivo y confirmar la reanudación del asistente sin alterar la vista del historial.
- **Cumplimiento de diseño:**
  - Aplicación de directrices de `corporate-design-system`: colores sólidos, iconos descriptivos Lucide (`UserPlus`, `Bot`, `Hand`, `RefreshCw`, `CheckCircle2`), contrastes legibles y cero emojis.

## Archivos modificados

- `everprop-public/src/components/admin/conversations/ConversationInbox.tsx`
- `docs/tickets/EVP-46-ui-boton-flotante-chat.md`

## Verificación

- `npx tsc --noEmit` ejecutado sin errores de tipado en `everprop-public`.
