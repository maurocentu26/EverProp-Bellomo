# EVP-119 — Rediseño de la bandeja de notificaciones (campana) del panel

Rama `ticket/EVP-119-bandeja-notificaciones` · commit `7654761` · fecha 2026-11-10 · Claude (Opus 5.5) con Mauro Centurión

## 1. Qué pedía el ticket

Que la campana funcione como la bandeja de una app de gestión: ver primero lo que requiere acción de uno, resolver lo simple sin salir del panel y no perder historial por error. Prototipo de referencia: canvas privado `https://claude.ai/artifact/LzcyTp3JyZZejy9GuBhLDw`, basado en PatternFly, Salesforce Lightning, Jira, Linear y Monday.

Criterios: escritorio con desplegable bajo la campana y móvil a pantalla completa; pestañas "Para mí / Todas" e interruptor "Solo no leídas"; lista por día con tipo, urgencia y hora relativa; marcar leída/no leída y archivar por fila; Deshacer en "marcar todas" y "archivar" con un aviso que no se cierra solo; la campana cuenta solo "Para mí"; sin "Vaciar historial"; estados de carga, error, vacío. Backend: `PATCH /notifications/{id}/unread` y `DELETE /notifications/{id}`, solo sobre notificaciones propias.

Fuera de alcance: datos estructurados por notificación (persona, objeto), agrupar ráfagas en el servidor, rediseño de `/admin/notifications` y botones de decisión dentro de la fila.

## 2. Qué se implementó

**Backend (`everprop-api`)**
- [AdminNotificationController.php:84](../../everprop-api/app/Domain/Identity/Http/Controllers/AdminNotificationController.php) `markAsUnread`: busca la notificación en `$user->notifications()` y usa `markAsUnread()` de Laravel; 404 si no es del usuario.
- [AdminNotificationController.php:102](../../everprop-api/app/Domain/Identity/Http/Controllers/AdminNotificationController.php) `destroy`: borra una sola notificación con `$user->notifications()->where('id', $id)->delete()`; 404 si no borró exactamente una.
- [routes/api.php:160](../../everprop-api/routes/api.php): las dos rutas, en el mismo grupo autenticado y con tenant que las rutas existentes de notificaciones. Sin cambios de esquema.

**Frontend (`everprop-public`)**
- [NotificationTray.tsx](../../everprop-public/src/components/admin/NotificationTray.tsx) (nuevo): la bandeja. Desde 1024 px usa el `Popover` de base-ui anclado a la campana (28rem, sin oscurecer la página); por debajo, el `Sheet` existente (el panel ya trata como móvil todo lo menor a 1024 px). El mismo cuerpo en los dos: cabecera con "Solo no leídas" y menú ⋮ (marcar todas, sonido, preferencias), pestañas con contadores, lista agrupada en Hoy/Ayer/Anteriores, acciones por fila, avisos con Deshacer y "Ver todas las notificaciones".
- [notification-tray.ts](../../everprop-public/src/lib/notification-tray.ts) (nuevo, puro): clasifica por `event_type` (tipo, "Para mí", urgencia), agrupa por día y arma la hora relativa en horario de Buenos Aires. Ordena de más nueva a más vieja aunque los offsets difieran.
- [AdminNavbar.tsx](../../everprop-public/src/components/admin/AdminNavbar.tsx): se quitó el `Sheet` anterior (cuatro botones, "Limpiar", tarjetas). Conserva el sondeo; suma `loadState` con Reintentar, la lista de archivos pendientes y el contador de la campana solo con no leídas de "Para mí". Con la bandeja abierta, lo nuevo entra arriba sin aviso emergente.
- [notifications.ts](../../everprop-public/src/lib/notifications.ts) y [everprop-api.ts](../../everprop-public/src/lib/everprop-api.ts): `markNotificationAsUnread` y `archiveNotification`, con su variante para el modo de datos de muestra.

**Flujo:** abrir una fila la marca como leída y navega solo a rutas `/admin/...` (ya no a cualquier `actionUrl`). Marcar leída/no leída es optimista y se revierte si la API falla. Archivar oculta la fila al instante y envía el `DELETE` recién cuando el aviso deja de ofrecer Deshacer: al cerrarlo, al reemplazarlo por otra acción o al cerrar la bandeja. "Marcar todas" y "Marcar como leídas" (de la pestaña) dejan un aviso con Deshacer, que vuelve a marcar como no leídas solo esas.

## 3. Por qué esta solución

- Se reutilizaron `Popover` y `Sheet` (base-ui) que ya estaban, el sondeo de `AdminNavbar` y `markAsUnread()` de Laravel. Sin dependencias nuevas.
- **"Para mí" por `event_type`:** las notificaciones no traen todavía sobre quién son. Se tratan como de equipo/sistema `LEAD_CREATED_UNASSIGNED`, `PUBLIC_LEAD_RECEIVED`, `FOLLOW_UP_TEAM`, `INTEGRATION_*`, `WEBHOOK_*`, `SIMULATION`, `INFO` y las sin tipo; todo lo demás, incluido un tipo nuevo desconocido, queda en "Para mí" para no esconder algo dirigido. Producto tiene que validar ese mapeo (comentario `ponytail:` en el archivo).
- **Avisos dentro de la bandeja:** la app nunca montó un `<Toaster>` de sonner (no aparece en todo el historial de git), así que ningún `toast()` del panel se ve. Montarlo cambiaría todas las pantallas y queda fuera de este ticket; la bandeja muestra sus propios avisos y errores al pie, como el prototipo.
- **Archivar sin endpoint de restauración:** el `DELETE` espera a que el Deshacer desaparezca. Límite conocido: si se cierra la pestaña del navegador con el aviso abierto, la notificación no se archiva (comentario `ponytail:`).
- **Ícono por tipo en lugar de iniciales:** el ticket mencionaba "iniciales de la persona", pero el payload no trae a la persona. Se usa un ícono con color por tipo; las iniciales dependen del ticket de datos estructurados.
- **Acciones por fila:** aparecen al pasar el mouse o con el foco del teclado (`group-focus-within`); en pantallas táctiles (`pointer: coarse`) quedan visibles con texto, de 44 px.

## 4. Cómo se verificó

**Backend** (PHP 8.4 en el contenedor del stack local, MySQL 8.4, sobre una copia del código del worktree con el `vendor` del stack; el `composer.lock` del worktree trae parches de Symfony más nuevos que ese `vendor`, sin relación con estas rutas):
- `php artisan test --filter=NotificationWorkflowTest`: 2/2 en verde. El test nuevo cubre un colega del mismo tenant y un admin de otro tenant (404 en las dos rutas, la notificación no cambia), el dueño que marca no leída (`unread_count` sube a 1) y archiva, un segundo borrado (404) y un id que no es UUID (404).
- Suite completa: 546 pasados, 1 omitido, 16 fallidos. Los 16 (Cobranzas, `QueueDispatchFlowTest`, `WebChatAndUsageTest`, `PrepareMetaReviewTest`, `ProductionEnvironmentTest`) fallan igual sobre `develop` sin este cambio (`eb3951a`): a la base de test local le faltan columnas de forwards recientes (`Unknown column 'kind'` en `collection_email...`). No tocan notificaciones.
- Pint en los 3 archivos tocados: en verde. PHPStan completo: sin errores.
- `tenant-isolation-reviewer`: sin hallazgos. Confirmó que el grupo de rutas usa `tenant` + `auth:sanctum` (un usuario de otro tenant no llega al controller), que `$user->notifications()` filtra por destinatario y que el 404 no distingue "ajena" de "inexistente". Sugirió como opcionales un caso con header de otro tenant y uno sin autenticación.

**Frontend:**
- `npm run test:notification-tray`: 4/4 (clasificación, urgencia, días y horas en Buenos Aires, orden con offsets distintos).
- `npx tsc --noEmit`: sin errores. `npm run lint`: 0 errores; las advertencias de `AdminNavbar.tsx` son las mismas 5 que en `develop` y los archivos nuevos no tienen ninguna. `npm run build`: en verde.
- Navegador (worktree en `localhost:3119`, `NEXT_PUBLIC_DATA_MODE=mock`, administrador de muestra, 11 notificaciones de prueba en `localStorage`):
  - 1280 px, Chica y Grande, tema oscuro: desplegable bajo la campana (448 / 538 px), sin desbordes. Campana "4 para vos sin leer" (las de equipo y sistema no cuentan).
  - Leída/no leída, "Solo no leídas", pestañas, "Marcar como leídas" en "Para mí" (deja sin leer solo las de equipo) con Deshacer, menú ⋮ (Esc cierra solo el menú y devuelve el foco), abrir una fila (marca leída, cierra y navega a `/admin/conversaciones`).
  - Archivar: el aviso sigue a los 10 s sin enviar el `DELETE`; Deshacer restaura y la campana vuelve; archivar y cerrar la bandeja borra la notificación.
  - 768, 390 y 320 px (Chica y Grande, claro y oscuro): panel lateral con botón Cerrar; con pantalla táctil emulada las acciones por fila se ven con texto; a 320 px con Grande no hay desborde horizontal y todos los botones miden al menos 44 px.
- No verificado: lectores de pantalla reales, un teléfono físico y el flujo contra la API real de staging (la API local solo acepta sesiones desde `localhost:3000`, que sirve la carpeta principal).

## 5. Pendientes y riesgos

- **Avisos invisibles en toda la app (fuera de alcance):** no hay `<Toaster>` de sonner montado, así que ningún `toast()` del panel se muestra (errores y avisos de otras pantallas incluidos). Proponer ticket aparte.
- **Mapeo "Para mí / Todas":** inferido de `event_type`; lo tiene que validar Producto.
- **Archivar y cerrar la pestaña del navegador** con el Deshacer abierto deja la notificación sin archivar.
- **Tickets propuestos en EVP-119:** datos estructurados por notificación (persona y objeto, para las iniciales y la frase "quién hizo qué"), agrupar ráfagas en el servidor y rediseñar `/admin/notifications` con el mismo componente.
- **Observación del revisor (previa a este ticket):** la tabla `notifications` no tiene `tenant_id`; hoy no hay fuga porque los ids de usuario son únicos en toda la base, pero no queda garantizado por la base de datos.
- **Producción:** sin forwards SQL. Antes de pasar a producción falta verificar accesos y configuración del entorno (dominios, CORS, Sanctum/cookies) como en cualquier cambio del panel; una prueba local no lo valida.
