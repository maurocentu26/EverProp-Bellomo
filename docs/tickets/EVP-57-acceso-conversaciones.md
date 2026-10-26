# EVP-57 · Acceso rápido a Conversaciones

Rama `ticket/EVP-57-acceso-conversaciones`, sale de `ticket/EVP-65-rediseno-visual` (usa el encabezado y la barra inferior del rediseño). Hecho con Codex (implementación) y Claude (revisión y ajuste visual).

## Cambios

- **Encabezado** (`AdminNavbar.tsx`): botón a `/admin/conversaciones` junto a la campana, 44 px, para admin y asesor. Contador = conversaciones en espera de asesor (`WAITING_HUMAN`) o sin leer, sin duplicar; se refresca cada 60 s y al volver a la pestaña; si la consulta falla, no muestra contador. El lector de pantalla anuncia "Conversaciones, N pendientes".
- **Barra inferior en celular** (< 768 px): ahora también para admin, en una sola fila: Mi Día, Mensajes (con contador), Leads y Agenda. El resto del menú queda en el botón ☰ del encabezado. Se oculta con un chat abierto (`wa-chat-open`) y el contenido deja lugar abajo.
- **Inicio** (`AdvisorCockpit.tsx`): botón "Conversaciones" junto a Nuevo lead y Mi agenda.
- **Test**: `tests/conversation-access.test.mjs` (accesos, contador, refresco, fallo y ocultamiento).

## Verificación (2026-10-26, modo demo, puerto 3165)

- TypeScript sin errores; ESLint 0 errores.
- Tests del front: 169 OK, 6 fallas previas de notificaciones push (no relacionadas).
- Navegador a 375 px y escritorio como admin: barra de una fila, contador visible sin tapar el ícono.
