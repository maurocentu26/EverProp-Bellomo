# EVP-33 — Conversaciones: reapertura manual y reactivación por recontacto

Rama `ticket/EVP-33-reapertura-conversaciones`, desde `origin/develop` (`5c398af`). Fecha 2026-10-15. Autor: Codex para Álvaro Ruggeri. Publicación de commit, rama y PR autorizada expresamente por Álvaro el 2026-10-15; sin merge/deploy. Jira verificado En curso por el hilo principal; trabajo paralelo autorizado.

## 1. Qué pedía el ticket

Un cierre no elimina el hilo ni impide que vuelva a atenderse. Un mensaje nuevo debe reabrir la misma conversación en espera humana, conservar historial, notas, lead y asesor asignado, sumar un no leído y avisar al responsable. El equipo debe poder reabrirla manualmente desde la bandeja. Sin autocierre, reactivación automática de IA ni integración con proveedores reales.

## 2. Qué se implementó

- `everprop-api/app/Domain/Conversations/Services/ConversationControl.php`: transición de reapertura bajo el mismo bloqueo de fila que el dispatcher. Incrementa epoch, invalida envíos IA pendientes, registra auditoría y evento durable `CONVERSATION_REOPENED`. Conserva asignación y datos del hilo. La acción manual usa al asesor asignado activo como controlador; sin asesor disponible queda `WAITING_HUMAN`. Si existe envío IA incierto/en curso, espera en `TRANSITION_PENDING` antes de habilitar respuesta humana.
- `everprop-api/app/Domain/Conversations/Services/InboundMessageService.php`: un recontacto siempre espera a una persona, incluso si la IA global está habilitada; nunca crea otro hilo ni reactiva IA. Dedupe existente evita repetir mensaje, epoch, alerta y evento.
- `everprop-api/app/Domain/Conversations/Http/Controllers/AdminConversationController.php` y `routes/api.php`: `POST /api/v1/admin/conversations/{uuid}/reopen` con `expected_epoch` entero positivo obligatorio. Tenant resuelto en servidor, acceso mediante visibilidad existente y comprobación de rol/asignación nuevamente bajo lock. Conflictos de estado devuelven 409; otros tenants no ven el hilo.
- `waiting_since` usa la secuencia del último episodio de reapertura para no mostrar como espera actual mensajes de antes del cierre.
- `everprop-public/src/lib/conversations-api.ts` y `ConversationInbox.tsx`: botón Reabrir sólo en conversaciones cerradas y para usuarios con escritura. Envía el epoch observado, muestra errores existentes, impide doble acción mientras espera y refresca hilo/bandeja.
- Pruebas: `ConversationReopenTest.php`, `conversations-api.test.mjs`, extensiones de `tests/e2e/api-vertical.mjs` y `ui-vertical.mjs`.

No hay cambios de esquema, variables de entorno, dependencias ni proveedores.

## 3. Por qué esta solución

Se reutilizan el servicio de control, lock MySQL por conversación, dominio outbox, auditoría, política de bandeja, alertas, composer y refresco existentes. La clave durable de reapertura se deriva del hilo y del epoch cerrado; dos solicitudes concurrentes del mismo cierre producen una sola transición. Un reintento atrasado de ese mismo epoch devuelve el resultado guardado y nunca reabre un cierre posterior. No se añade otra tabla ni otro sistema RBAC.

Las fechas de espera se delimitan por secuencia local, sin depender de diferencias de reloj entre HTTP, MySQL y el proveedor. La consulta de espera usa la auditoría de reapertura y su índice existente por tenant/entidad; no escanea la cola outbox. La clave durable del evento mantiene la idempotencia y no se elimina por esta funcionalidad.

## 4. Cómo se verificó

- Ciclo rojo: prueba de recontacto falló porque el estado real era `AI_ACTIVE` en lugar de `WAITING_HUMAN`; frontend falló porque faltaba la función de reapertura.
- `node --test everprop-public/tests/conversations-api.test.mjs`: 10/10 aprobadas.
- `npm run lint -- --quiet` en `everprop-public`: aprobado.
- `npx tsc --noEmit` en `everprop-public`: aprobado.
- `node --check everprop-api/tests/e2e/{api-vertical,ui-vertical}.mjs`: ambos aprobados (sintaxis; no demuestra ejecución E2E).
- `git diff --check`: aprobado.
- MySQL aislado: el hilo principal ejecutó `php artisan test tests/Feature/Conversations tests/Feature/AgentRuntime tests/Unit`: 255 pruebas, 1351 aserciones aprobadas (10,97 s), incluyendo seis pruebas nuevas de reapertura.
- Revisión independiente encontró un asesor soft-deleted todavía ACTIVE como posible controlador. Se añadió el filtro `deleted_at IS NULL` y prueba de regresión aprobada. La consulta `waiting_since` se mejoró después para usar el índice existente de auditoría; revalidación final: 27 pruebas / 213 aserciones aprobadas de ConversationReopenTest, InboxQueueTest, ConversationAlertsTest y HandoffAndDispatchTest.
- PHPStan completo: sin errores. Pint aplicado a los archivos nuevos/cambiados y comprobado. Build Webpack: aprobado.
- Navegador real con API PHP 8.4 y tenant sintético de bellomo_crm_test: visitante envía consulta, asesor toma control, cierra, reabre, conserva el mensaje y recupera compositor; segundo cierre y recontacto conservan UUID/historial y dejan WAITING_HUMAN. Evidencias locales `/tmp/evp33-conversacion-reabierta.png` y `/tmp/evp33-recontacto.png`. Sin respuestas de proveedor ni mensajes externos.
- Contrato OpenAPI: ruta, request/response, cookieAuth, XSRF, 401/419 y referencias JSON revisados.

## 5. Pendientes y riesgos

Se comprobó el recorrido manual en navegador; no se ejecutaron completos los scripts E2E agregados, porque su runner preexistente controla worker y base de desarrollo compartidos. No se probó producción ni carreras con dos conexiones MySQL simultáneas. No se usó SQLite, credenciales de Bellomo ni proveedores externos. Revisión independiente de tenant/LLM realizada: único hallazgo de asesor eliminado corregido y revalidado; no quedaron hallazgos de código abiertos. El límite histórico de espera depende de conservar los eventos de auditoría de reapertura.

Un envío ya aceptado externamente puede llegar tarde: se conserva el manejo existente de `UNKNOWN`/`TRANSITION_PENDING` y no se reintenta a ciegas. El resultado guardado de un replay describe la transición original; el panel refresca el estado actual después de la acción.
