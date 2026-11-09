# EVP-103 — Confirmación de contacto y eventos no textuales

## Seguimiento — confirmación flexible (2026-11-09)

Rama `ticket/EVP-103-confirmacion-flexible`, desde `develop` en `59b927c`. Es el criterio 8, agregado a pedido de Mauro (comentario 10280 en Jira).

**Evidencia.** El 9/11, en staging y por Instagram, el cliente respondió «Sí, esos son» al resumen de un contacto ficticio y el contacto no se registró: solo valía la frase exacta «Confirmo mis datos». Detalle en el comentario 10279 de EVP-108.

**Qué cambia:**
- **`ContactConfirmation::isAffirmation()`.** El servidor decide de forma determinística si el mensaje entero es un «sí» natural: «sí», «siii», «Sí, esos son», «dale», «ok 👍», «correcto», «de acuerdo», «claro que sí», «Confirmo mis datos», etc.
  - Es cerrado por defecto: hace falta al menos una palabra afirmativa de una lista cerrada, y el resto solo puede ser relleno de otra lista. Las palabras funcionales («de», «por», «que», «te», «lo») valen únicamente dentro de frases fijas.
  - Rechaza dígitos, `@`, `?`/`¿`, cualquier símbolo o emoji que no sea 👍 ✅ 👌, las formas de ancho completo (normalizadas con NFKC), las palabras repetidas que no sean «sí» u «ok» y los mensajes de más de 8 palabras.
  - Así, «no», «pero», «¡qué va!», «así así», «sí 👎», «sí, soy Juan» y «¿sí?» no confirman. El modelo nunca decide.
- **`matches()`.** Conserva todas las condiciones anteriores: primer mensaje de texto del contacto después de un resumen enviado, con la misma epoch y secuencia.
- **`receive()`.** Si el cliente ya mandó otro mensaje después del «sí» (una ráfaga como «ok» y enseguida «cambiá el mail»), no confirma y se vuelve a pedir.
- **Resumen.** Ahora dice «responde «sí» o «Confirmo mis datos»».
- **Prompt.** En `PromptBuilder.php` el modelo ya no menciona una frase exacta y nunca decide que el cliente confirmó. `prompt_version` pasa a `coordinator-2026-11-09.1`.
- **Evals.** Se sumaron dos casos: `RIO-021` («¡Qué va!» no registra) y `RIO-022` («Sí, esos son» registra).

**Verificación** (PHP 8.4 en el contenedor local, sin red al proveedor):
- **Pruebas:** `ContactConfirmationTest`, `OutputGuardTest` y `GeminiChatClientTest` suman 62 pruebas y 231 aserciones. Incluyen 30 afirmaciones aceptadas y 38 rechazadas, entre ellas todas las adversariales que encontró la revisión.
- **Pint y PHPStan completo:** sin errores.
- **Dataset:** `node evals/validate.mjs` da 204 casos válidos.
- **Revisión `llm-security-reviewer`:** sin bloqueantes. Se aplicaron sus recomendaciones M1 («qué va»), M2 (emojis no listados y ancho completo), B1 (ráfagas), B2 (frases fijas), B3 (tests) y B4 (documentación).
- **No se corrió localmente** la prueba con base de datos que se agregó en `AgentTurnTest`: un «dale» sin resumen pendiente no registra, «sí, pero…» no confirma y «Sí, esos son» registra. Queda para CI.

**Riesgos:**
- Un «sí, claro» irónico no se puede detectar; se acepta, igual que antes se aceptaba la frase.
- Un «ok» de acuse que llega solo después del resumen confirma; para eso el resumen está escrito como una pregunta directa.
- Hay una carrera chica: si la segunda parte de una ráfaga llega después de que se procesó el turno del «sí», ya no la detiene.

**Pendiente.** Merge y despliegue autorizados, y validar en staging con el contacto ficticio.

Rama `ticket/EVP-103-confirmacion-contacto` · base `fc8bb32` · commits `00b1500` (confirmación/guard), `fcf3a9a` (eventos/UI) y cierre documental · 2026-11-03 · implementación asistida para Mauro.

## 1. Qué pedía el ticket

Evitar guardar datos de contacto sin resumen y confirmación explícita, permitir corregirlos y describir honestamente eventos no textuales de Instagram/WhatsApp. Corregir el falso positivo de enlaces al repetir un email declarado por el visitante sin permitir URLs arbitrarias.

Fuera de alcance: producción, cambios de proveedor, migraciones, nuevas conexiones personales y soporte multimedia general.

## 2. Qué se implementó

- `everprop-api/app/Domain/AgentRuntime/Tools/ContactConfirmation.php`: propuesta inmutable en el estado existente de sesión. El primer intento no ejecuta el procedimiento de leads. El resumen muestra los campos que se registrarán.
- `RegistrarContacto.php`, `RegistrarInteres.php`, `AgentCoordinator.php` y `PromptBuilder.php`: solo el siguiente mensaje textual real del contacto, exactamente `Confirmo mis datos` (sin distinguir mayúsculas ni espacios exteriores), después de un resumen enviado, habilita los argumentos almacenados por el servidor. Correcciones, tarjetas y epoch vencido no autorizan el alta. No se vuelve a interpretar la confirmación con el modelo.
- `OutputGuard.php`: excepción limitada al email exacto presente en historial público del visitante y acotado a la conversación. No habilita dominios, URLs, sufijos ni datos de pago.
- `MetaWebhookProcessor.php`: categorías mínimas de eventos comprobables por estructura, sin conservar payloads de tarjetas, URLs ni datos de contactos.
- `AdminConversationController.php`: campos opcionales aditivos `event_kind` en preview y mensajes; `type` en mensajes. Categorías filtradas mediante allowlist; sin exponer metadata original.
- `everprop-public/src/lib/conversations-api.ts` y `ConversationInbox.tsx`: descripción compartida para preview/burbuja. Las etiquetas no sustituyen el texto entrante ni otorgan consentimiento.

No hay forwards SQL, dependencias ni variables de entorno nuevas.

## 3. Por qué esta solución

Reutiliza `chatbot_sessions.state_json`, locks de conversación, gateway y procedimientos existentes; no usa el consentimiento legal como autorización conversacional. La decisión de persistir pertenece al servidor, no al prompt. La confirmación se vincula al resumen, secuencia y epoch, preservando aislamiento e idempotencia.

La clasificación desconocida sigue siendo genérica: no se afirma que la tarjeta histórica de Instagram sea una tarjeta de contactos de WhatsApp.

## 4. Cómo se verificó

Entorno sintético aislado MySQL 8.4 y Redis; PHP 8.4 Docker. Sin `.env` real, llamadas pagas al modelo ni datos de clientes. Ambos contenedores de pruebas quedaron detenidos.

- RED→GREEN para matcher de confirmación y presentación no textual.
- Verificador independiente sobre snapshot temporal: seis clases PHPUnit, **100 pruebas / 571 assertions**.
- Copilot y probes independientes de hash CRM, diferencial del guard y enlaces/email: **11 pruebas / 120 assertions**. El hash de datos CRM permaneció igual al rechazar altas.
- Parent spot check HTTP de DTO, filtrado de metadata y aislamiento: **1 prueba / 20 assertions**.
- `node --test tests/conversations-api.test.mjs tests/conversation-composer.test.mjs`: **14/14**, repetido por el padre.
- Revisión independiente conjunta de seguridad LLM y aislamiento: sin bloqueos reproducibles atribuibles al cambio. Interleavings y replay deterministas; no prueba de carga concurrente real.
- `npm run lint`: exit 0, 127 warnings y 0 errores.
- `npm run build`: bloqueado por el junction externo de dependencias en Turbopack. Alternativa explícita `npm run build -- --webpack`: exit 0, TypeScript y 37 páginas estáticas.
- `node evals/validate.mjs`: 202 casos válidos. Pint: 14 archivos correctos.
- PHPStan completo encontró 15 diagnósticos en código nuevo. Se corrigieron tipos PHPDoc y nullsafe redundantes; recheck independiente acotado a los cuatro archivos: sin errores. No se repitió el análisis global después de esa corrección.
- Tras la corrección estática, suites puras: 49 pruebas / 72 assertions. Sin cambios de comportamiento ni nuevo barrido semántico.
- Revisión nativa final: omitida expresamente por el usuario para el candidato completo; verificación independiente funcional conservada.

## 5. Pendientes y riesgos

- Sin prueba navegador/proveedor real en staging; no publicado ni desplegado.
- Falta reproducir el subtipo real de la tarjeta histórica de Instagram; fixtures sintéticos no lo demuestran.
- El guard sigue bloqueando importes/enlaces no verificados: puede derivar al asesor sin guardar datos. No se debilita esa protección.
- El detector de dominios previo no reconoce `.test`; advisory preexistente, sin ampliar este ticket.
- Revisión nativa final declinada expresamente; no implica aprobación automática. Un único PR con `size:exception` autorizado por el usuario ("Un unico pr").
- Antes de staging: autorización de push/PR/despliegue y verificación de accesos del entorno. Producción requiere además verificar dominios, CORS/R2, tenant/Sanctum/cookies, proveedores, storage y forwards pendientes; local no certifica producción.

Risk: items 1, 2, 4 — autorización de persistencia y estado compartido; contrato DTO aditivo revisado con aislamiento.

PR abierto: https://github.com/maurocentu26/EverProp-Bellomo/pull/99 (base develop). Sin merge ni despliegue; CI pendiente al publicar.
### Corrección de checks del PR

CI `41674146900`: 538 pasaron, dos fallaron y uno omitido. Causa: la expectativa exacta del preview no incluía `event_kind: null`; el self-check del runner intentaba registrar interés sin confirmación. Se actualizaron ambos tests sin modificar código productivo: el eval ahora comprueba ausencia de alta antes de confirmar, confirmación real y reintento sin duplicados.

RED reproducido:9 tests/59 assertions,2 fallos,1 omitido. GREEN focalizado:9 tests/87 assertions,0 fallos,1 omitido. Pint/PHPStan de ambos archivos correctos; dataset202 válido.

Suite local completa intentada: primero42 fallos por guardas de nombre de base sintética; corregido el entorno externo a `bellomo_crm_test`, quedaron541 tests/4462 assertions,5 fallos,1 error y1 omitido. Fallos restantes en StatisticsDemo, CollectionSchema, Collections, ImportLandingContent y parsing de stdout de WhatsAppParallelQueue; no clasificados como preexistentes ni atribuibles al cambio. No se afirma suite completa local verde. Contenedores de prueba detenidos. La nueva ejecución de CI del PR debe corroborar el conjunto en su entorno canónico.

Risk: none — corrección limitada a expectativas y escenarios de tests, sin cambiar producción.
