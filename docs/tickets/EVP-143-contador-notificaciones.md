# EVP-143: contador de notificaciones sin leer todas las filas

Rama `ticket/EVP-143-contador-notificaciones`, creada desde `develop` @ `57af421` · 2026-11-16 · Ramiro Ruggeri con Claude

## Problema

Hallazgo NOT-07 de la auditoría QA de staging del 2026-11-12.

`AdminNavbar` consulta `GET /admin/notifications/count` cada 2 s en cada pestaña abierta. Para calcular la «revisión», `AdminNotificationController::count` traía todas las notificaciones del usuario a PHP, las serializaba y las hasheaba, así que el costo crecía con el historial.

## Cambios

### Backend: `AdminNotificationController::count`

La revisión sale de una sola fila agregada sobre las notificaciones del usuario:
- `COUNT(*)`;
- `SUM(read_at IS NULL)`, que además da `unread_count` y ahorra la consulta que había antes para eso;
- `BIT_XOR` de 64 bits de `SHA2(id | estado de lectura)` por fila.

Con eso la revisión cambia al crear, borrar, leer o desmarcar una notificación, igual que antes, sin traer filas a PHP.

No se usa CRC32 porque es lineal frente a XOR: leer una notificación y desmarcar otra entre dos consultas se cancelaba y la revisión no cambiaba. Lo detectó la revisión de aislamiento y hay un test que lo cubre. Se agregó `reorder()` porque la relación ordena por `created_at` y un agregado no lleva `ORDER BY`. El JSON de respuesta mantiene los mismos campos.

### Frontend: `AdminNavbar`

El `setInterval` de 2 s pasa a ser un `setTimeout` encadenado:
- 2 s con la pestaña visible;
- 10 s con la pestaña oculta.

La pestaña oculta sigue consultando porque es la que muestra la alerta de escritorio; ahora tarda hasta 10 s, que es un buen equilibrio frente a la carga.

- **Una sola cadena:** la consulta siguiente se programa recién cuando termina la anterior, así que nunca hay dos al mismo tiempo.
- **Volver a la pestaña:** se descarta la espera de 10 s y se vuelve a 2 s enseguida, salvo que haya una consulta en curso, que reprograma sola.
- **Desmontar:** el ciclo se corta.

## Medición

Con 2.000 notificaciones de un usuario sintético (borradas al terminar), MySQL 8.4 local, p95 de 50 corridas:

| Revisión | p95 |
|---|---|
| Antes: consulta vieja (todas las filas, hash en PHP) | 242,8 ms |
| Ahora: el endpoint completo (agregado con SHA2, más la última notificación) | 24,9 ms |

La máquina está compartida y los números varían entre corridas. En otra corrida, el agregado solo con CRC32 dio 184,7 ms contra 8,9 ms. La mejora se mantiene alrededor de 10 veces.

Sumando las pestañas ocultas a 10 s, la carga total del endpoint baja todavía más.

**Límite conocido:** el agregado sigue recorriendo el rango del índice del usuario. Si un usuario llegara a decenas de miles de notificaciones, el paso siguiente sería un contador de versión por usuario. Está anotado con `ponytail:` en el código.

## Verificación

Stack aislado `everprop-rag` (PHP 8.4, MySQL 8.4), contenedor `everprop-rag-php143`.

- `NotificationWorkflowTest`, ampliado. La revisión:
  - cambia al leer;
  - vuelve al mismo valor al desmarcar, porque el conjunto y el estado de lectura son los mismos;
  - no cambia cuando le llega una notificación a otro usuario;
  - cambia al crear;
  - vuelve al valor anterior al borrar;
  - cambia si se intercambia cuál notificación está leída aunque los contadores no cambien.

  También se comprobaron `unread_count` y `latest_id`.
- `WebPushTest`: pasa.
- Pint, PHPStan y suite completa: ver más abajo.
- Frontend:
  - `node --test`: 222 pasan y 1 falla. La falla, `assistant-trace.test.mjs`, ya ocurre en `develop` sin este cambio.
  - `tsc --noEmit` sin errores.
  - ESLint en `AdminNavbar.tsx`: las mismas advertencias que ya había en `develop`, ninguna nueva.

## Revisión `tenant-isolation-reviewer`

No encontró fugas entre usuarios ni entre tenants. El agregado sigue acotado por `notifiable_type` y `notifiable_id`, y `reorder()` solo quita el orden.

| Hallazgo | Severidad | Resolución |
|---|---|---|
| CRC32 es lineal frente a XOR. Intercambiar cuál notificación está leída no movía la revisión. | Media | Hash SHA2 de 64 bits por fila. Test del intercambio. |
| Al volver a la pestaña, el ritmo de 2 s tardaba hasta 10 s en retomarse. | Baja | Se reprograma al volver a la pestaña, sin duplicar el ciclo. |

## Pendientes

- Sin forwards SQL ni variables nuevas.
- No es del módulo de IA, así que puede ir a `main` con los demás arreglos. Antes hay que verificar los accesos de producción.
