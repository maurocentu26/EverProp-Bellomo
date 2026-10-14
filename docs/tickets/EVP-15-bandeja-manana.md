# EVP-15 — Bandeja: prioridad de la mañana para consultas nocturnas

Rama `ticket/EVP-15-bandeja-manana` (desde `develop`) · fecha 2026-10-14 · Claude Code con Ramiro Ruggeri
Ticket Jira [EVP-15](https://eversys.atlassian.net/browse/EVP-15).

## 1. Qué pedía el ticket

Que en la bandeja las conversaciones derivadas fuera de horario aparezcan primero al abrir el horario, con el resumen que juntó el asistente.

**Criterios:**
- orden y marca visible "llegó fuera de horario";
- sin cambios de permisos;
- revisión `tenant-isolation`.

**Hallazgo al investigar:** el resumen que el asistente escribe al derivar (`derivar_a_asesor.summary`) se guardaba en `chatbot_sessions.handoff_reason`, pero **no se le mostraba al asesor en ningún lado**.

## 2. Qué se implementó

**API** ([AdminConversationController.php](../../everprop-api/app/Domain/Conversations/Http/Controllers/AdminConversationController.php))
- `GET /admin/conversations` agrega dos campos por conversación:
  - `waiting_since`: el primer mensaje del cliente que ninguna persona respondió todavía, es decir, posterior al último mensaje de un usuario del equipo. Las respuestas del bot no cuentan.
  - `out_of_hours`: si esa espera empezó fuera del horario del tenant, incluidos los feriados de EVP-14.
- Los dos campos solo se completan cuando el estado es `WAITING_HUMAN`.
- **Con el filtro "Esperan asesor"** (`state=WAITING_HUMAN`), el orden pasa a ser de la espera más vieja a la más nueva, así lo que llegó a la noche queda arriba a la mañana. La vista general mantiene el orden por última actividad.
- `GET /admin/conversations/{id}/messages` agrega `conversation.handoff` con `{reason, summary, at}`, tomado de la última derivación del asistente en esa conversación.

**Panel** ([ConversationInbox.tsx](../../everprop-public/src/components/admin/conversations/ConversationInbox.tsx), [conversations-api.ts](../../everprop-public/src/lib/conversations-api.ts))
- Marca "Llegó fuera de horario · hora" en cada ítem de la lista.
- Recuadro "Resumen del asistente" arriba del hilo, con el motivo en lenguaje claro, mientras la conversación espera un asesor o la tiene un asesor.
  - El texto lo escribe el modelo, así que se muestra como texto plano, que React escapa.
  - Ese resumen es solo para el equipo y nunca se envía al cliente.

## 3. Por qué esta solución

- **Sin esquema nuevo:** la espera sale de los mensajes, que ya tienen índice `(tenant_id, conversation_id, sequence)`, y el resumen sale de `chatbot_sessions`, que ya tiene índice por la FK `(tenant_id, conversation_id)`.
- **Se reutiliza `BusinessHours`**, así que el horario y los feriados son los mismos que usan los avisos y el asistente.
- **Se ordena solo la cola de espera:** cambiar el orden de la vista general alteraría la forma de trabajo actual. En la cola, de la más vieja a la más nueva es el criterio de cualquier cola de atención, y resuelve el caso de la mañana.

## 4. Cómo se verificó

Entorno: stack Docker aislado `everprop-lote3` (PHP 8.4, MySQL 8.4, base sintética), 2026-10-14.

| Comprobación | Resultado |
|---|---|
| `InboxQueueTest` (3 tests, 40 assertions) | OK |
| Qué cubren | Orden de la cola y marca. La espera de una conversación reabierta cuenta desde el mensaje nuevo, no desde el ya respondido. El resumen del asistente en el hilo. Dos tenants, cada uno con su conversación y su resumen, sin cruces; el hilo de otro tenant da 404 |
| Mutación: contar todos los mensajes del cliente, aunque ya tengan respuesta | El test de reapertura falla, como se esperaba |
| Suite backend completa | 379 tests, 0 fallos (corrida antes de reforzar el test de tenants) |
| Pint y PHPStan | OK |
| Panel: TypeScript (`tsc --noEmit`) y eslint de los archivos tocados | OK |
| Revisión `tenant-isolation-reviewer` | Sin hallazgos bloqueantes ni altos. Se aplicó su hallazgo medio: el test de tenants ahora tiene datos en los dos |

**No verificado:**
- **La pantalla en el navegador.**
- **`npm run build` completo:** otra sesión estaba editando el panel en el mismo checkout. Lo corre el CI del PR.
- **Comprobación de la revisión que no se puede hacer:** que el test detecte la falta del filtro de tenant en la subconsulta. Los IDs de conversación son únicos globalmente, así que el resultado no cambiaría. Lo que sí se prueba es que no hay cruces entre tenants.

**CI del PR #23 (primera corrida):**
- El E2E de navegador falló.
- **Causa:** el panel abre en "Esperan asesor", y el E2E hacía clic en la **primera** conversación, que con el orden viejo era la más nueva. Con la cola de la más vieja a la más nueva, la primera pasó a ser otra conversación del mismo recorrido, el asesor respondió ahí y el visitante nuevo no recibió la respuesta.
- No es un error del cambio sino una suposición del test.
- **Corrección:** el E2E elige la conversación por el mensaje de su visitante (`ui-vertical.mjs`), no por su posición.

## 5. Pendientes y riesgos

- **`out_of_hours` usa el horario vigente**, no el que regía cuando empezó la espera. Si el tenant cambia el horario, las esperas viejas se reclasifican. Es aceptable para una marca de prioridad.
- **Cambio de comportamiento visible:** como el panel abre en "Esperan asesor", lo primero que ve el asesor ahora es la espera más vieja y no el último mensaje. Es lo que pide el ticket, pero conviene avisarle al equipo.
- **El recuadro muestra la última derivación del asistente**, aunque sea de un episodio anterior de la misma conversación, con su fecha y hora. Si confunde, se puede limitar al episodio actual.
