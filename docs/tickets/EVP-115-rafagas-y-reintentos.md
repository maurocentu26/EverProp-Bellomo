# EVP-115 — Ráfagas, colas y reintentos del asistente

Rama `ticket/EVP-115-rafagas-y-reintentos` (desde `develop` @ `57af421`) · 2026-11-15 · Ramiro Ruggeri con Claude

## 1. Qué pedía el ticket

- **Ráfagas:** cuando el cliente manda varios mensajes seguidos, el asistente tiene que responder una sola vez.
- **Colas:** los envíos de los asesores no tienen que esperar detrás de los turnos de IA.
- **Límites del proveedor:** un límite momentáneo (429/529 o timeout) no tiene que terminar derivando la conversación sin necesidad.

## 2. Estado por criterio de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | Ventana de agrupación de 3 s: 3 mensajes en 2 s → 1 turno, 1 llamada, 1 respuesta | Hecho. Test con cola real, database y redis. |
| 2 | Un turno que encuentra el candado tomado reintenta en pocos segundos | Hecho: `release(2)` en vez de `release(10)`. |
| 3 | Colas `agent`, `outbound` y `webhooks` con prioridad, documentadas | Ya estaba en `develop` por **EVP-131** (`config/queue.php` `lanes`, `entrypoint.sh`, `railway-backend.md`). No se tocó. |
| 4 | Espera con jitter que respeta `Retry-After` antes del único reintento, dentro del turno y del candado, con ledger correcto | Hecho. |
| 5 | `production-check` falla si las colas no son tres o si `retry_after` no supera el candado | Hecho. `retry_after` ya se verificaba; se agregaron las colas y la cuenta del deadline. |
| 6 | Tests en MySQL 8.4 con cola real, pint, phpstan, suite y evals | Hecho (ver §4). |
| 7 | Revisiones `tenant-isolation-reviewer` y `llm-security-reviewer` | Hecho (ver §5). |

## 3. Qué se implementó

### Ráfagas

- **Turno demorado:** `InboundMessageService` despacha `RunAgentJob` con `delay(agent.burst_window_seconds)` (3 s, `AGENT_BURST_WINDOW_SECONDS`). El turno de un mensaje anterior se descarta como `SKIPPED_SUPERSEDED` porque ya existe un mensaje de texto más nuevo, y el último turno responde todo, porque el historial incluye todos los mensajes anteriores.
- **Cuándo un mensaje "tiene texto":** se usa el mismo criterio al despachar (`InboundMessageService::hasText`, PHP `\S`) y al buscar el mensaje más nuevo (`HAS_TEXT_SQL`, `REGEXP '[^[:space:]]'`). Así, una foto o un mensaje de WhatsApp con solo un salto de línea nunca deja sin respuesta la pregunta anterior. Antes, cualquier mensaje entrante (también una foto) descartaba el turno de la pregunta.
- **Tope de espera:** un mensaje que ya esperó `agent.burst_max_wait_seconds` (20 s) se responde aunque sigan llegando otros. Así, una ráfaga sostenida no posterga la respuesta para siempre.
- **Devolución a la IA (`ConversationControl::resume`):** responde el último texto sin responder aunque después haya llegado una foto. Antes solo lo hacía si el último mensaje era texto.

### Reintento ante límites del proveedor

- **`LlmFailure::rateLimited()`:** lee `Retry-After` en segundos o como fecha HTTP, con tope de 86.400. Si el valor es inválido, se ignora. Lo usan los tres clientes (Anthropic, Gemini y OpenAI).
- **`AgentCoordinator::retryWait`:**
  - Antes del único reintento espera `Retry-After` o 1 s, más un jitter de hasta 1 s, con `Illuminate\Support\Sleep`.
  - No reintenta si el proveedor pide más de 10 s, o si el reintento podría terminar después del deadline: 120 s por turno (por debajo del timeout del job, 150, y del candado, 180) y 30 s en el copiloto (por debajo del corte de php-fpm, 35 s).
  - **Ledger:** mientras espera no queda una reserva abierta. El 429 libera su reserva, y el timeout o el 5xx queda en `UNKNOWN` con su máximo (D10). El reintento reserva con una clave nueva (D14).
- **`ProductionCheck`:** verifica tres colas distintas, que `retry_after` supere el candado y que `3 × (timeout + 5) + espera máxima ≤ deadline < candado`. También valida los límites de la ventana y de la espera base.

### Configuración (`config/agent.php`)

| Clave | Valor | Variable de entorno |
|---|---|---|
| `burst_window_seconds` | 3 | `AGENT_BURST_WINDOW_SECONDS` |
| `burst_max_wait_seconds` | 20 | — |
| `retry_base_wait_ms` | 1000 | `AGENT_RETRY_BASE_WAIT_MS` |
| `retry_jitter_ms` | 1000 | `AGENT_RETRY_JITTER_MS` |
| `retry_max_wait_seconds` | 10 | `AGENT_RETRY_MAX_WAIT_SECONDS` |
| `turn_deadline_seconds` | 120 | — |
| `copilot_deadline_seconds` | 30 | — |
| `lock_retry_seconds` | 2 | — |

### Documentación

- `docs/eversys-conversations/architecture.md`: párrafo nuevo de ráfagas y reintentos, y el límite "20 s total" corregido a los valores reales.
- `docker/production/environment.example`: variables nuevas, comentadas.
- Evals FAIL-021 (ráfaga) y FAIL-022 (429 con `Retry-After`).

## 4. Verificación

Stack Compose aislado `everprop-rag` (PHP 8.4, MySQL 8.4, Redis), contenedor `everprop-rag-php115`.

- **Tests nuevos:**
  - `AgentTurnTest`:
    - ráfaga con cola real `database` y `redis`: 3 mensajes, 1 llamada, 1 corrida, 1 respuesta y nada se ejecuta dentro de la ventana;
    - foto y salto de línea después de la pregunta;
    - ráfaga sostenida que responde al pasar los 20 s;
    - 429 con `Retry-After: 2`: espera entre 2 y 3 s, responde y no queda ninguna reserva abierta;
    - `Retry-After: 60`: no reintenta y deriva;
    - lectura del header;
    - timeout que espera una vez.
  - `HandoffAndDispatchTest`: devolución a la IA con una foto después de la pregunta.
  - `ProductionEnvironmentTest`: colas iguales, `retry_after` bajo y timeout que no entra en el deadline.
- **Tests existentes con cola real** (`WhatsAppGeminiFlowTest`, `WhatsAppParallelQueueTest`): corren con `burst_window_seconds = 0`, porque sus workers procesan y se detienen enseguida. La ventana queda cubierta por el test de ráfaga.
- **Calidad:** Pint PASS, PHPStan sin errores, `node evals/validate.mjs` OK (206 casos).
- **Suite completa:** ver el PR (se corrió antes y después de las correcciones de las revisiones).

## 5. Revisiones independientes

Ninguna de las dos encontró hallazgos altos. Lo corregido:

| Revisión | Hallazgo | Arreglo |
|---|---|---|
| ambas | `TRIM` de SQL no coincide con `trim` de PHP: un "\n" de WhatsApp dejaba la pregunta sin respuesta | Criterio único `hasText` / `HAS_TEXT_SQL` y test |
| aislamiento | La devolución a la IA no respondía una pregunta seguida de una foto | `resume` busca el último texto sin responder y test |
| seguridad (medio) | El copiloto usaba el deadline de 120 s dentro de un request que php-fpm corta a los 35 s | `copilot_deadline_seconds` = 30 |
| seguridad | Una ráfaga sostenida posterga la respuesta sin límite | `burst_max_wait_seconds` = 20 y test |
| seguridad | El jitter hacía que `Retry-After: 10` derivara; las variables de entorno no estaban acotadas | El tope se compara sin el jitter; `ProductionCheck` acota la ventana y la espera base |
| aislamiento | El deadline solo se miraba antes del reintento | `ProductionCheck` verifica que 3 llamadas más la espera entren en el deadline |
| seguridad | El documento decía "20 s total" | `architecture.md` actualizado |

Quedan aceptados:
- **Estado de instancia del coordinador:** se crea uno por job o request y se reinicia al entrar. Con Octane habría que pasarlo a `ToolContext`.
- **Carga de la cola con `release(2)`:** con un turno largo, cada job pendiente reintenta cada 2 s. Es carga de cola, sin costo de LLM.
- **Ceros a la izquierda en `Retry-After`:** un valor como `00000912345678` se lee como 9 s. Queda acotado igual.

## 6. Pendientes y riesgos

- **Ventana:** suma hasta 3 s a la primera respuesta. Es configurable con `AGENT_BURST_WINDOW_SECONDS`, y 0 la desactiva.
- **Mensaje durante un turno en curso:** si el cliente escribe mientras un turno ya está corriendo, recibe dos respuestas, una por mensaje y sin duplicar contenido. Es el comportamiento esperado.
- **Railway:** el segundo worker (`QUEUE_WORKER_QUEUES=webhooks,outbound`, de EVP-131) sigue sin crear en staging y producción. Es un cambio de infraestructura que necesita autorización aparte.
- **Sin forwards SQL.** No hace falta migrar.
- **Producción:** antes de desplegar hay que verificar los accesos y la configuración del entorno (colas, workers, `retry_after` y variables del proveedor). Una prueba local no valida producción, y el módulo de IA no va a `main`.
