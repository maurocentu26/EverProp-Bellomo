# EVP-174: release a `main` de la bandeja de notificaciones nueva y su flujo

Rama `release/evp-174-bandeja-notificaciones` desde `main` @ `f79fb03` · 2026-11-20 · Mauro Centurión con Claude

## Alcance

Lleva a producción la bandeja nueva de `develop` y el flujo que la alimenta. Igual que EVP-170, es un `cherry-pick -x` commit por commit, en el orden de `develop`. **No incluye** conversaciones ni IA (EVP-120/121/126/144/128) ni cobranzas: la rama de cuotas de `SendWebPush`, `NotifyCollections` y el scheduler quedan fuera por decisión del 20/11. El push al dispositivo depende de EVP-173 (cola en base y worker).

| Ticket de `develop` | Commit | Qué entra |
| --- | --- | --- |
| EVP-105 | `513969d` | La barra superior se oculta al bajar y vuelve al subir (`lib/topbar-scroll.ts`). |
| EVP-119 | `7654761` | `NotificationTray`, con pestañas Para mí y Todas, solo no leídas, leída y no leída, archivar con Deshacer y sonido. Backend: `PATCH /notifications/{id}/unread` y `DELETE /notifications/{id}`. |
| EVP-140 | `904492f` | Si un lead abierto vuelve a escribir desde la web, avisa "Nueva consulta web de un lead" (`LEAD_RECONTACT`) en lugar de "Nuevo lead". |
| EVP-143 | `a1bbf29`, `f35060b`, `9189720` | La revisión del contador sale de un agregado. Las pestañas ocultas consultan cada 10 s y vuelven a 2 s al mostrarse. |
| EVP-168 | `5e27024` | `<Toaster>` montado en el panel. Antes los `toast()` de `main` no se veían. |

## Decisiones al portar

- **Archivos que `main` no tiene:** no se portan sus cambios. Son el módulo Web (`ProjectWebEditor`), conversaciones (`ConversationInbox`, `conversations-api` y su test) y `qa-ux-ui-regression.test.mjs`.
- **EVP-105, parte que no entra:** el renombre de "Actual" a "Chica" y los cambios de Configuración y `PanelTextSize` (`showLabel`) dependen del rediseño de Configuración de `develop`, así que quedan las versiones de `main`. La regla `.wa-inbox` de `panel-text-size.css` es de conversaciones y tampoco entra. El CSS de la barra ya estaba en `main` desde EVP-170.
- **`AdminNavbar.tsx`:**
  - Se toma la integración de la bandeja de `develop`, sin `MessagesSquare`.
  - Se conserva el dock de asesor de `main` (Mi Día, Leads, Más), sin el link a Conversaciones.
  - No hay `isConversationAlert`.
- **`package.json`:** se agrega `test:notification-tray`. No entran `test:follow-up` ni `test:chat-session`, porque sus tests no existen en `main`.
- **Test de EVP-140:** `PublicLeadRecontactNotificationTest` usaba `ConversationTestSupport`, que no existe en `main`. Ahora lleva una copia privada de `deleteSyntheticTenants`, igual que `DeletedLeadReentryTest` (commit `d2836ed`).

## Verificación

- **`check-pr-policy.mjs`** con `BASE=main`: OK. Un grep de `isConversationAlert|OutOfHoursAlerts|BusinessHours|/admin/conversaciones|ConversationTestSupport|MessagesSquare` sobre las líneas agregadas solo encuentra el comentario del test que explica la copia.
- **Backend** (stack Docker aislado `evp174-qa`):
  - `php artisan test` completo: 181 passed. La base de `main` sin este release da 185, que incluyen los 6 casos de EVP-173. `pint --test` y `phpstan`: sin errores.
  - Las notificaciones (`NotificationWorkflowTest`, `PublicLeadRecontactNotificationTest`, `UnassignedLeadNotificationTest`, `PublicLeadEndpointTest`, `WebPushTest`) dan 12 passed (117 assertions).
  - **Nota sobre el rate limit:** dos corridas seguidas dentro del mismo minuto dan 429 en los tests de leads públicos. El límite es de 20 por minuto por IP y el caché no se limpia entre tests. Corriendo la suite una sola vez, como en CI, pasa. Este release suma 2 envíos al endpoint, así que el margen bajo el límite se achica.
- **Frontend:**
  - `notification-tray`, `topbar-scroll` y `notifications-worker`: 14/14.
  - `test:mi-dia` 32, `test:projects` 25, `test:statistics` 1 y `test:collections` 4: todos pasan.
  - `eslint` sobre los archivos tocados: 0 errores, con la misma cantidad de warnings que `main` y `develop`.
  - `npm run build` compila y pasa TypeScript.
- **QA en navegador** contra la API local (`:18174`, datos de `everprop:local-demo`):
  - **Asesor (Lucas):**
    - Llega un "Lead asignado" sin recargar: aparece el toast "Lead asignado… Ver", el contador queda en 1 y el botón dice "Notificaciones, 1 para vos sin leer".
    - Marcar como leída y como no leída cambia el contador, y la API lo confirma (`unread_count` 0 y luego 1).
    - Archivar lo saca de la lista y muestra "Notificación archivada / Deshacer" dentro de la bandeja; Deshacer lo devuelve.
    - El `DELETE` sale al cerrar la bandeja o con la acción siguiente, y la API queda sin notificaciones.
    - Abrir una notificación lleva a `/admin/leads/{id}` y la marca leída.
  - **Barra superior:** al bajar en Leads queda oculta (`data-hidden=true`, `margin-top: -72px`) y al subir vuelve.
  - **Celular (375×812):**
    - La bandeja abre como hoja (`sheet-content`) y el dock de asesor sigue visible.
    - No hay scroll horizontal (`scrollWidth` 375) y el botón mide 44×52.
    - Con el panel del navegador oculto, `requestAnimationFrame` no corre y la hoja queda en su estado de entrada (40 px corrida). No es un defecto de la app, pero la animación no se pudo ver.
  - **Administrador (Marcos):** con un aviso propio y uno de equipo (`LEAD_CREATED_UNASSIGNED`), el contador cuenta 1 "para vos". "Para mí" muestra solo el propio, y "Todas" muestra los dos (2 sin leer).

## Después del merge

- Port a `develop`: solo este reporte y el ajuste del test de EVP-140, porque `develop` ya tiene el resto.
- El push al celular necesita EVP-173 y su runbook de Railway.
- El texto vacío de la bandeja dice "Cuando te asignen un lead, te escriban o venza una cuota", igual que en `develop`. Si el cliente no va a usar cobranzas por ahora, se puede ajustar en otro cambio.
