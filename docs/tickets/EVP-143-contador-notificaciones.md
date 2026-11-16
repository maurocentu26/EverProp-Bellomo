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
- `BIT_XOR(CRC32(id | estado de lectura))`.

Con eso la revisión cambia al crear, borrar, leer o desmarcar una notificación, igual que antes, sin traer filas a PHP. Se agregó `reorder()` porque la relación ordena por `created_at` y un agregado no lleva `ORDER BY`. El JSON de respuesta mantiene los mismos campos.

### Frontend: `AdminNavbar`

El `setInterval` de 2 s pasa a ser un `setTimeout` encadenado:
- 2 s con la pestaña visible;
- 10 s con la pestaña oculta.

La pestaña oculta sigue consultando porque es la que muestra la alerta de escritorio; ahora tarda hasta 10 s, que es un buen equilibrio frente a la carga. El encadenado además evita consultas superpuestas, y al desmontar el componente el ciclo se corta.

## Medición

Con 2.000 notificaciones de un usuario sintético (borradas al terminar), MySQL 8.4 local, p95 de 50 corridas:

| Revisión | p95 |
|---|---|
| Antes (todas las filas, hash en PHP) | 184,7 ms |
| Ahora (un agregado) | 8,9 ms |

Sumando las pestañas ocultas a 10 s, la carga total del endpoint baja todavía más.

**Límite conocido:** el agregado sigue recorriendo el rango del índice del usuario. Si un usuario llegara a decenas de miles de notificaciones, el paso siguiente sería un contador de versión por usuario. Está anotado con `ponytail:` en el código.

## Verificación

Stack aislado `everprop-rag` (PHP 8.4, MySQL 8.4), contenedor `everprop-rag-php143`.

- `NotificationWorkflowTest`, ampliado. La revisión:
  - cambia al leer;
  - vuelve al mismo valor al desmarcar, porque el conjunto y el estado de lectura son los mismos;
  - no cambia cuando le llega una notificación a otro usuario;
  - cambia al crear;
  - vuelve al valor anterior al borrar.

  También se comprobaron `unread_count` y `latest_id`.
- `WebPushTest`: pasa.
- Pint, PHPStan y suite completa: ver más abajo.
- Frontend:
  - `node --test`: 222 pasan y 1 falla. La falla, `assistant-trace.test.mjs`, ya ocurre en `develop` sin este cambio.
  - `tsc --noEmit` sin errores.
  - ESLint en `AdminNavbar.tsx`: las mismas advertencias que ya había en `develop`, ninguna nueva.

## Pendientes

- Sin forwards SQL ni variables nuevas.
- No es del módulo de IA, así que puede ir a `main` con los demás arreglos. Antes hay que verificar los accesos de producción.
