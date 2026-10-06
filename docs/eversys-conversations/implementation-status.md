# Estado de implementación — Eversys Conversations

Actualizado 2026-09-29. Nada de esto está desplegado ni conectado a Meta. Evidencia: suite PHPUnit sobre MySQL 8.0.46 aislado en sandbox (no 8.4 Docker; repetir con `everprop-api/scripts/import-schema.ps1` + `php artisan test`).

## G0 — hecho

| Ítem | Estado | Evidencia |
|---|---|---|
| E01 permisos publicar/precio/proyecto | Hecho | `InventoryWriteGuardsTest` (9 tests) |
| E02 CRM respeta visibilidad y precio | Hecho | `LeadInventoryGuardsTest` |
| E03 batch sin sufijo aleatorio (409) | Hecho | `InventoryWriteGuardsTest` |
| E04 visitas: scope, eliminadas, doble envío | Hecho | `LeadInventoryGuardsTest` |
| E05 CI raíz (api/web/evals), pint/phpstan verdes | Hecho; composer audit y redocly sin correr | `.github/workflows/` |
| S01 reconciliación de esquema | Hecho (ADR 0004) | preflight en base aislada |
| S02 configuración por tenant | Parcial (ADR 0005) | scheduler y push sin "bellomo" |

## G1 — hecho (backend)

| Ítem | Qué quedó | Tests |
|---|---|---|
| S03 runtime durable | Forward `2026-09-29.002`; `InboundMessageService` (dedupe por canal+ID nativo, secuencia por conversación, outbox en la misma transacción); reconciliador `everprop:conversations:reconcile` | `WhatsAppWebhookTest` |
| S05 widget web (backend) | Sesión opaca (solo SHA-256 en base), alcance a una conversación, orígenes permitidos por widget, polling por secuencia, rate limit por IP | `WebChatAndUsageTest` |
| S06 WhatsApp (simulado) | Webhook app-level: handshake, `X-Hub-Signature-256` sobre bytes crudos, tenant solo por `phone_number_id` único global, WABA opcional, estados monótonos, payload malformado tolerado; transporte Cloud API apagado por defecto (`META_SEND_ENABLED=false`) | `WhatsAppWebhookTest`, `WebChatAndUsageTest` |
| S07 handoff | `ConversationControl` (epoch, TRANSITION_PENDING, anti-robo de control, resume explícito); `OutboundDispatcher` (claim con fencing, lease, UNKNOWN sin reintento, UNKNOWN_FINAL auditado); API de bandeja | `HandoffAndDispatchTest` |
| S08 ledger | `UsageLedger` reserve/commit/release/unknown con lock por período y cupo global+tenant | `WebChatAndUsageTest` |

Revisiones independientes: aislamiento/seguridad y concurrencia. Hallazgos corregidos: robo de control en TRANSITION_PENDING, lock único sin expiración, deadlocks S→X, `phone_number_id` duplicable entre tenants, RBAC de asesor en close/resume, destinatario por hilo, autor desactivado, límites de tasa, orígenes del widget.

## Pantallas (S04 bandeja + S05 widget) — hecho

- `/admin/conversaciones`: bandeja con filtros (Esperan asesor, Mías, No leídas, Todas), hilo, tomar control, responder (clave de idempotencia atada al texto), cerrar, reanudar IA (oculto mientras la IA esté apagada), aviso y liberación de envíos sin confirmar; vista móvil; foco y `aria-live`.
- `/widget/{widgetId}`: chat del visitante con sesión opaca, reintento sin duplicar, cursor que no saltea respuestas en cola. `public/eversys-widget.js` lo embebe con un `<script>` (botón + iframe, Escape cierra).
- Encabezados anti-clickjacking: todo el panel `frame-ancestors 'none'`; el widget solo en `EVERSYS_WIDGET_FRAME_ANCESTORS`.
- `CONVERSATIONS_AI_ENABLED=false` (por defecto hasta G2): las conversaciones nuevas entran como "Espera asesor".
- Verificado E2E con Playwright sobre API + Next locales (datos sintéticos): visitante escribe → aparece en bandeja → asesor toma control y responde → el visitante lo ve. Revisión independiente de frontend aplicada (respuestas tardías, idempotencia, sesiones duplicadas, cursor, foco, framing).

## G2 — hecho (backend, IA apagada por defecto)

| Ítem | Qué quedó | Tests |
|---|---|---|
| Esquema | Forward `2026-09-29.003`: `knowledge_documents/chunks` (FULLTEXT), `tool_executions`, `visit_requests`, `chatbot_runs.conversation_id/control_epoch/input_sequence` + índices; contrato 58/54/131 | `everprop:schema:verify` |
| S09 conocimiento | Alta DRAFT → aprobación (chunking por títulos/párrafos) → revocación; búsqueda FULLTEXT solo APPROVED, vigente (`valid_until`), audiencia PUBLIC y del tenant. Promociones = documentos con vigencia. API `/api/v1/admin/knowledge` (escriben admin/gerente) | `KnowledgeAdminTest`, `AgentTurnTest` |
| S10 coordinador | `AgentCoordinator` + `RunAgentJob`: un turno por mensaje, lock por conversación, ≤2 llamadas + 1 reintento, 8k entrada / 600 salida / 20 s, reserva en ledger antes de cada llamada (UNKNOWN si pudo facturarse), epoch capturado al inicio, respuesta vía `proposeBotReply` (se descarta si un asesor tomó control). `OutputGuard` bloquea montos sin respaldo (par monto+moneda de herramientas o fuentes), "visita confirmada/agendada" y visitas pedidas sin "un asesor confirma". Cualquier falla → derivación con aviso. Reconciliador deriva turnos colgados | `AgentTurnTest`, `OutputGuardTest` |
| Copiloto (2026-10-06) | `AgentCoordinator::suggest()`: borrador para el asesor con control; mismo prompt (+ modo borrador), conocimiento, `OutputGuard` y ledger, solo herramientas de lectura; no envía ni cambia la conversación. `POST /admin/conversations/{id}/suggestion` (10/min). La respuesta registra si se envió tal cual o editada; KPIs en `everprop:conversations:kpis`. Interruptor `CONVERSATIONS_COPILOT_ENABLED` (apagado) | `CopilotTest` |
| S11 inventario | `buscar_propiedades` / `consultar_propiedad`: misma regla que el catálogo público, en vivo, precio null = "no confirmado", presupuesto solo con moneda y sin conversión | `AgentTurnTest` |
| S12 CRM | `registrar_interes`: lead abierto por SP (fuera de transacción) + `lead_properties` + outbox, idempotente por turno; en web exige teléfono/email; datos declarados solo llenan campos vacíos y quedan como no verificados (teléfono local queda como `declared_phone`, no E.164). `derivar_a_asesor`: WAITING_HUMAN + aviso bajo el nuevo epoch + sugerencia del dueño del lead si está activo | `AgentTurnTest` |
| S13 visitas | `solicitar_visita`: `visit_requests` REQUESTED (nunca `visits`), franjas futuras ≤60 días y ≤4 h, zona IANA, una pendiente por propiedad y máx. 3 por conversación/24 h | `AgentTurnTest` |

Proveedor LLM: interfaz `LlmClient`; adaptador Anthropic Messages listo pero **apagado** (`AGENT_LLM_PROVIDER=disabled`, sin modelo por defecto). Con IA habilitada y proveedor apagado, cada turno deriva a un asesor con aviso. Evals: +4 casos (23). Revisiones independientes LLM-security y aislamiento/concurrencia: hallazgos corregidos (guard monto+moneda y "mil", bypass de negación, fugas del ledger, turnos sin run, TTL del lock vs `retry_after`, asignado inactivo, sesión fuera de transacción, reconciliador). Aceptado: `registrar_interes` puede crear el lead abierto (idempotente) justo antes de perder el control.

## Go-live (chat web) — hecho

- Solicitudes de visita: API `/api/v1/admin/visit-requests` (listar, confirmar → crea `visits` SCHEDULED una sola vez, rechazar) y pantalla `/admin/solicitudes-visita`. Test `VisitRequestAdminTest`.
- Pantalla `/admin/conocimiento` (alta, aprobar, revocar, vigencia). Enlace directo a la conversación (`/admin/conversaciones?c=`).
- `php artisan everprop:channels:web-chat` crea/actualiza el widget del tenant e imprime el `<script>` y `EVERSYS_WIDGET_FRAME_ANCESTORS`.
- Cola en base (forward `2026-09-30.001`: `jobs`, `failed_jobs`) para correr worker sin Redis.
- `everprop:production-check`: exige las tablas de G1/G2 (el arranque falla si no se aplicó el SQL) y, con IA encendida, cola asíncrona, `retry_after` > lock del turno y proveedor configurado. Con cola `sync` en producción la IA queda apagada sola.
- Corrección: la búsqueda de conocimiento no usa la relevancia natural de InnoDB como filtro (daba 0 cuando todos los fragmentos compartían los términos); filtra por coincidencia booleana y ordena por términos presentes.
- Runbook: [go-live.md](go-live.md).

## Pendiente conocido

- ~~Webhook síncrono antes del ACK~~: resuelto en W6 (recibo durable → 200 → worker).
- ~~`ChannelPolicy` inexistente~~: resuelta en W2. El transporte real sigue apagado hasta X04.
- Integrar el widget en el sitio de Bellomo (hoy Bellomito usa su propio `/api/chat` con Gemini): reemplazar por el `<script>` cuando G2 esté listo.
- Bandeja: etiquetas y adjuntos (diseño S04) aún no.
- **Búsqueda en la bandeja hecha (2026-10-04)**: `GET /admin/conversations?q=` busca por nombre, email o teléfono del contacto (por dígitos, en cualquier formato) y por texto del hilo, incluidas las notas. No distingue mayúsculas ni acentos, se combina con los filtros y solo devuelve conversaciones que el usuario ya puede ver. Usa `LIKE`, que alcanza para el volumen del piloto; con cientos de miles de mensajes por tenant habrá que pasar a un índice FULLTEXT con un script forward.
- **Notas internas hechas (2026-10-04)**: `POST /admin/conversations/{id}/notes`. Son mensajes `INTERNAL` en el hilo, con autor, idempotentes y para cualquier rol que pueda escribir y ver la conversación. No se envían, no aparecen en el widget ni en el historial de la IA, y no cambian el orden ni los no leídos de la bandeja. En el panel se ven como "Nota interna de …" y se agregan desde "Agregar nota interna".
- **S16 mínimo hecho (2026-10-04, solo datos sintéticos)**: comando `everprop:conversations:kpis` con los KPIs del gate F1 (ver `go-live.md`). Falta el tablero en el panel, la atribución bot/asesor más allá de la primera respuesta humana y el horario de atención. Las definiciones son provisorias: el equipo las confirma con la línea base.
- ~~Alta de integraciones sin endpoint~~: Embedded Signup resuelto en W4/W5. El resto de S14 (baja completa del tenant) sigue pendiente.
- Activar IA: aprobar proveedor/región (X03), elegir modelo, cargar `ANTHROPIC_API_KEY` en el gestor de secretos, `REDIS_QUEUE_RETRY_AFTER` > 180, y correr evals contra el modelo real antes de `CONVERSATIONS_AI_ENABLED=true`.
- Conciliar filas UNKNOWN del ledger contra el uso real del proveedor (hoy conservan la reserva máxima).
- ~~Montos escritos en palabras~~: corregido 2026-10-02 (`OutputGuard::wordsToDigits`, "ochenta y cinco mil", "un millón y medio"; `OutputGuardTest` 37 casos). Formas mixtas raras ("85 mil quinientos") siguen sin cubrirse.
- Dependencias externas: X01 (Tech Provider: verificación de negocio, App Review, videos), X02–X04.

## Plan de cierre (2026-10-02)

Cada fase abre solo con el gate de la anterior. Responsables: **R** = Ramiro (operación, autorizaciones), **N** = sesión en la nube (implementa, abre PR), **L** = sesión local (revisión con subagentes, ítems chicos). Ningún paso activa IA ni Meta sin autorización expresa.

| Fase | Entregable | Quién | Gate de salida |
|---|---|---|---|
| F0-S Staging (**en curso**) | Proyecto Railway independiente `bellomito-staging` (cuenta de Mauro): MySQL 8.4 nuevo con baseline + 16 forward, `api` y `worker` desde `chore/agentic-setup`, IA/Meta apagadas, tenant y usuarios sintéticos, panel y sitio en preview. Sin credenciales ni datos de producción. Pasos S1–S7 en `go-live.md` | R | `/readyz` 200, `production-check` OK, recorrido S6 con "Enviado" una vez |
| F0-P Producción (**no autorizado**, 2026-10-02) | Backup manual + restore de prueba; 4 forward con `lock_wait_timeout`; variables; worker; PR #7 fuera de borrador y merge a `main` (dispara el despliegue) | R | Requiere autorización nueva; mismo gate que F0-S sobre producción |
| F1 Piloto web humano | Sitio con widget por variables; conocimiento cargado desde `knowledge.ts`; responsables y horario; KPIs S16 mínimos | R + L | 2 semanas: tiempo de primera respuesta, leads completos, 0 duplicados |
| F2 IA en web | **Bloqueante del runner Q01 resuelto (2026-10-06):** `consultar_propiedad`, `registrar_interes` y `solicitar_visita` aceptan `unit_code`, que el gateway resuelve antes de la clave de idempotencia; el asistente registra interés y pide visitas en un solo turno (`AgentTurnTest`). Después: X03 aprobado, modelo, secreto; evals Q01 contra el modelo real; tope del ledger; rollback probado en Railway | R + L | Gates de `evaluation-and-security.md`; costo por conversación dentro de USD 150 |
| F3 WhatsApp | `ChannelPolicy` por número (D19); receipt → ACK → worker; X01 Tech Provider; alta de números (S14); número general y luego 1–2 asesores | N + R + L | S17: ambos canales reales; ningún simulador cuenta |
| F4 SaaS | S02 completo, S14, S15, billing manual (D15); n8n periférico (D20) si suma | N + L | Segundo tenant sin fork; restore medido |

### F0-S — estado de `bellomito-staging` (2026-10-02)

API `https://api-staging-30f3d.up.railway.app`, panel en Railway `https://panel-staging-staging-62ec.up.railway.app`, tenant sintético `bellomito-staging`, despliegue inicial `30d9573`. Vercel no se usó. Detalle de Codex en [staging-evidence.md](staging-evidence.md).

| Comprobación | Reportado (Codex) | Verificado desde la sesión local (solo GET/HEAD públicos, sin credenciales) |
|---|---|---|
| `/healthz`, `/readyz` de la API | 200 | 200 / 200 |
| `/login` y `/healthz` vía panel | 200 | 200 / 200 |
| API privada sin sesión | 401 | `auth/me` 401, `admin/conversations` 401 |
| `/admin/*` | `frame-ancestors 'none'` | `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| `/widget/*` | CSP limitada al panel | `frame-ancestors 'self' <panel staging>` |
| CORS | limitado al panel | preflight desde `evil.example` y desde el panel de producción en Vercel: `Allow-Origin` responde solo el panel de staging |
| Bundles del panel | — | 9 chunks, 0 URLs de Railway/Vercel ni de producción (el destino del proxy vive en el servidor) |
| Proxy del servidor → API de staging | variables explícitas; login de usuario solo de staging 200 con tenant correcto; logs de la API lo registran | no verificable desde afuera; la prueba del usuario exclusivo es la evidencia fuerte |
| `production-check --connections` | todo OK | — |
| Worker consume `database` | trabajo inocuo DONE, 0 pendientes y 0 fallidos | — |
| Chat público idempotente | `replayed=true`, un solo mensaje | — |
| IA/Meta apagados | sí, en API y worker | — |

Hallazgos de la revisión (2026-10-02):
- **Deriva de esquema en staging**: `cache`, `cache_locks` y `sessions` se crearon con SQL de `SetupSimulationDatabaseCommand`, fuera del baseline y los forward (invariante 3). Producción usa Redis para sesión y caché (`environment.example`). Recomendado: Redis en staging y no formalizar esas tablas, así staging reproduce producción.
- **Logout 419**: el panel lee `XSRF-TOKEN` en cada request (`everprop-api.ts`), el 419 vino del script que reutilizó el token previo al login. Confirmar con navegador.
- **Volumen del worker**: hoy ningún job usa archivos (solo `TenantMediaService`, en la API). Riesgo solo si un job futuro los necesita.
- `staging-evidence.md` dice "no hay cuenta humana"; después se creó `admin-staging@e2e.invalid` (TENANT_ADMIN). La contraseña no se documenta.

Pendiente F0-S, en este orden: (1) Redis para sesión/caché; (2) **scheduler** (sin él no corren el reconciliador, la expiración de leases ni el barrido de IA apagada, de los que depende el paso 3); (3) recorrido visitante → bandeja → tomar control → responder → una sola respuesta, y repetirlo con el worker detenido y un envío pendiente; (4) logout desde el navegador; (5) sitio de prueba externo con el widget. La biblioteca de materiales queda limitada al tenant `bellomo`: no se habilita en staging ni se usan materiales reales. El sitio público de Bellomo no tiene el widget.

Staging no completa F0-P, ni autoriza encender IA o WhatsApp, ni mergear a `main`.

### Tech Provider (plan W1–W12, 2026-10-02)

- **Corrección de concurrencia verificada (Codex, 2026-10-03):** procesamiento de receipts ligado al tenant/integración original incluso si el número cambia entre consultas; operaciones de alta/baja serializadas por WABA con bloqueo de MySQL; no desuscribir una WABA con conexiones ACTIVE/PENDING/DEGRADED restantes; una respuesta tardía de `register` no revive accesos revocados ni sobrescribe un token reemplazado. Cinco pruebas nuevas: suite local PHP 8.4/MySQL 8.4 **256/256**, flujo de integraciones/webhook **51/51**, PHPStan y Pint OK; frontend **62/62**, build OK, lint sin errores (153 advertencias existentes). Segunda revisión del parche sin bypass normal confirmado. Limitación de infraestructura: perder la sesión MySQL libera el bloqueo aunque una solicitud HTTP a Meta siga en vuelo; no se afirma atomicidad distribuida ante esa falla. Sin prueba contra Meta real.
- **Esquema de staging verificado (2026-10-03):** `2026-10-02.001` aplicado en el proyecto aislado `bellomito-staging`, servicio `mysql84` (8.4.11); columna `access_token_ciphertext TEXT NULL` y versión registradas. La cuenta runtime de API no tiene ALTER; se usó la conexión de mantenimiento existente, sin ampliar grants. IA apagada, proveedor disabled y `META_SEND_ENABLED=false` comprobados antes del despliegue. Producción y `main` no se tocaron. La página de eliminación aclara que desconectar borra credenciales, no los mensajes/contactos históricos.

- **W1 hecho**: `/privacidad` y `/eliminacion-de-datos` públicas en el panel (sin sesión, estáticas). Contacto por `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL`; sin él, el pedido se hace en el chat. Sin plazos de retención (D18 sin aprobar) ni proveedor de IA nombrado. **Antes de cargar la URL en Meta: revisión legal y email de contacto.**
- **W3 hecho**: forward `2026-10-02.001` (`integration_connections.access_token_ciphertext`, INSTANT); `IntegrationTokens` guarda el token cifrado (Crypt/APP_KEY), lo entrega solo a una integración ACTIVE, del tenant y no vencida, y al guardar anula la referencia legacy. El transporte de WhatsApp lo usa y no envía si el número no está ACTIVE. Revisiones schema-guardian y tenant-isolation aplicadas. MySQL 8.4 aislado: forward ×2 OK, `schema:verify` OK, suite 216/216, Pint y PHPStan OK.
- **W4 hecho (backend, Meta simulado)**: `GET /admin/integrations/whatsapp/config` (ids públicos) y `POST /admin/integrations/whatsapp/connect` (capacidad `manageIntegrations`, CSRF, 6/min, apagado salvo `META_ONBOARDING_ENABLED`). Canje del code en el servidor; verifica con el token que el número esté en la WABA; 409 si es de otro tenant (o `CONNECT_IN_PROGRESS` si es del mismo); `subscribed_apps`; integración, canal, token y PIN cifrados y auditoría en una transacción; `register` después: falla → `DEGRADED` y 202, salvo un número que ya estaba ACTIVE. Secretos con `#[SensitiveParameter]`; logs solo con status y código de Meta. Revisión tenant-isolation aplicada (1 alto, 4 medios). Suite 228/228, Pint y PHPStan OK. **Sin prueba contra Meta real.**
- **W5 hecho (panel)**: tarjeta "WhatsApp de la inmobiliaria" en Configuración, visible solo con `manageIntegrations` (403 del backend la oculta). Carga el SDK de Meta solo si el alta está habilitada; `FB.login` con `config_id`, `response_type: code` y `extras.setup`; acepta mensajes solo de `https://*.facebook.com` con `type: WA_EMBEDDED_SIGNUP` e ids numéricos; envía code + ids apenas llegan ambos. Estados: no habilitado, preparando, listo, conectando, conectado, pendiente de registro, cancelado, error con reintento. La CSP del panel no requiere cambios (solo restringe `frame-ancestors`). Tests frontend 62/62, tsc, lint y build OK. **Sin probar contra Meta real (W10).**
- **W7 hecho**: si Meta rechaza el token con error 190, la integración pasa a REVOKED (solo si el token guardado sigue siendo el rechazado, para no matar una reconexión reciente), con auditoría en la misma transacción y aviso por campana/push a quienes tienen `manageIntegrations`. Un 401 sin 190 o un error de permisos (10, 200) no revoca. Los envíos en cola al momento de revocar quedan FAILED y no se reenvían solos al reconectar (evita mensajes viejos fuera de contexto). Revisión tenant-isolation aplicada (1 alto, 2 medios).
- **W8 hecho**: Graph API por defecto v24.0. Sus cambios incompatibles (límites por portfolio, `conversation` fuera de los webhooks de estado) no tocan campos que usemos. Suite 233/233, Pint y PHPStan OK.
- **W6 hecho**: (a) `account_update`: `ACCOUNT_DELETED`, `ACCOUNT_OFFBOARDED`, `PARTNER_REMOVED` y `PARTNER_APP_UNINSTALLED` (de nuestra app) revocan toda integración META de esa WABA, con auditoría y aviso; `ACCOUNT_RECONNECTED` no reactiva nada. (b) Cada cambio `messages` se guarda en `webhook_receipts` (dedupe por integración + sha256) **antes** del 200 y lo aplica `ProcessMetaWebhookReceipt` en el worker (lógica movida sin cambios a `MetaWebhookProcessor`). El job exige que el número siga en el mismo tenant/integración (si no, REJECTED), toma solo RECEIVED/RETRY con lease de 15 min, transiciones condicionales, RETRY con backoff y DEAD_LETTER al agotar. El reconciliador reencola recibos colgados y leases vencidos, descarta tras 10 intentos y borra el texto de los recibos vencidos (30 días); los procesados lo borran al instante. Si el recibo no se guarda, 500 para que Meta reintente. Revisión tenant-isolation aplicada (1 alto, 4 medios). Suite 246/246, Pint y PHPStan OK.
- **W9a hecho (desconectar WhatsApp)**: la tarjeta de Configuración lista los números conectados y permite desconectarlos con confirmación (`manageIntegrations`). En una transacción con lock: integración REVOKED, número DISCONNECTED y liberado en toda la plataforma (el `phone_number_id` queda archivado en la metadata y puede conectarse de nuevo, acá o en otra cuenta), token y PIN borrados, auditoría; después del commit se pide a Meta desuscribir la WABA (mejor esfuerzo, también si estaba DEGRADED/PENDING). Toda revocación (error 190, `account_update`) ahora también borra token y PIN. Revisión tenant-isolation aplicada (4 medios). Suite 251/251, Pint y PHPStan OK; frontend 62/62 y build OK.
- **W9b pendiente de decisión (no implementado)**: borrado/anonimización de los datos de una persona. Requiere definir con el responsable legal qué se anonimiza, qué se conserva por obligación (cobranzas, visitas), quién lo ejecuta y la confirmación al titular (D18 sin aprobar). Hasta entonces, las páginas de privacidad dicen que lo procesa una persona del equipo.
- **W2 hecho, solo con simuladores** (2026-10-03): `ChannelPolicy` aplica la ventana de 24 h de WhatsApp por conversación y por número. La abre solo un mensaje del cliente en esa conversación y ese canal. Las 24 h exactas cuentan como cerrada, y el timestamp de Meta se topea con la hora de recepción, así que uno con fecha futura no extiende la ventana. Se chequea en dos puntos: al responder el asesor (409 `OUTSIDE_SERVICE_WINDOW` con explicación, salvo replay de la misma key) y en el dispatcher bajo el lock, antes de `PROCESSING`. Así, un job encolado dentro de la ventana que llega tarde queda `FAILED` y no se envía. Con datos faltantes o un canal inactivo falla cerrado. La regla de plantillas solo deja pasar las listadas en `approved_templates` del canal; EverSys todavía no envía plantillas. No modela la ventana de 72 h de los puntos de entrada gratuitos. Tests 11/11 en MySQL aislado y revisión de aislamiento de tenant sin bloqueantes (3 hallazgos aplicados). **No verificado contra Meta real.** En la bandeja (2026-10-04), el detalle de la conversación devuelve `reply_window` (`null` en chat web; `{closes_at}` en WhatsApp, con `closes_at` en `null` cuando está cerrada). El panel muestra hasta cuándo se puede responder y, con la ventana cerrada, explica por qué y desactiva Enviar, sin borrar el borrador.
- **Páginas de privacidad revisadas en staging (2026-10-03)**: `/privacidad` y `/eliminacion-de-datos` responden 200 públicas con `frame-ancestors 'none'`, y lo que dicen coincide con el código (sesión del widget en sessionStorage; la IP solo como clave de rate limit). Faltan el email de contacto (hoy muestra "pedilo en el mismo chat"), la revisión legal y una URL de privacidad de EverSys para la app de Meta: las actuales son del panel de Bellomo. No publican identidad fiscal, CUIT ni plazos de retención, y así deben seguir hasta tener datos confirmados.
- **W10/W11 preparados, no presentados** (actualizado 2026-10-04): `meta-app-review.md` tiene el estado de W2 (lo probado separado de lo verificado), la checklist de staging (servicios, variables por servicio, webhook y Embedded Signup), los guiones contrastados con el código, la propuesta de privacidad con identidad de EverSys (datos legales pendientes) y los requisitos de X04 con el apagado en 4 niveles. Falta antes de X04: verificar S6 en staging, y que la prueba confirme si el número de prueba de Meta se puede elegir en Embedded Signup.
- Siguiente: W9b tras la decisión legal; X01 y autorización X04 para W10. `store()` exige al llamador tenant desde TenantContext, solo admin y NOT_FOUND ante integración ajena.

Deuda transversal (cualquier fase, ítems chicos): conciliación UNKNOWN del ledger, búsqueda/notas en bandeja.

## Lote 3 — verificación para piloto de chat web (2026-09-30/10-01)

Corrido en la máquina local de Ramiro, **no** en sandbox. Sin push, PR, deploy ni SQL contra producción. Flags intactos: `CONVERSATIONS_AI_ENABLED=false`, `AGENT_LLM_PROVIDER=disabled`, `META_SEND_ENABLED=false`. No se leyó ningún `.env` ni secreto real: los stacks usan secretos sintéticos generados fuera del repo.

### 1. Estado de los repos

| Repo | Inicial | Final (antes de commitear) |
|---|---|---|
| EverProp `chore/agentic-setup` | HEAD `007bb48` = origin (0/0). Sin commit: Lotes 1 y 2, ajuste `.claude/` PowerShell, `composer.json` de Codex | Mismo HEAD + cambios de este lote (lock, correcciones de revisión, tests, runbook). Commits temáticos con confirmación |
| Sitio `feat/eversys-chat-widget` | HEAD `b7ca784` = origin. `?? Claude outputs/`. Los ~13 archivos "solo CRLF" ya no aparecían: `core.autocrlf=true` (sistema) los normalizó al refrescar el índice. Verificado: los 104 archivos versionados, con filtros de Git, tienen el mismo hash que HEAD | **Sin cambios**: `git status` idéntico al preflight. Builds hechos en una copia `git archive HEAD` fuera del repo |

### 2. Pruebas

Entornos: **A** = stack Docker aislado `everprop-lote3` (imagen `everprop-api-php:local`: PHP 8.4.24 con bcmath/intl/redis/pdo_mysql; `mysql:8.4` → 8.4.11; `redis:8.2-alpine`), base `bellomo_crm_test` nueva. **B** = stack aislado `everprop-e2e3` con `APP_ENV=local` (CSRF/Sanctum reales), cola `database` + worker real, IA apagada, 2 tenants sintéticos (`e2e-a`, `e2e-b`), usuarios `@e2e.invalid`; panel con `next build` + `next start` (modo producción). Node 24.16, npm 11.13. Windows 11 + Docker Desktop 29.7.

| Comando | Entorno | Resultado | Limitaciones |
|---|---|---|---|
| `composer update --lock` | A | PASS: solo `content-hash` | `update <paquete> --lock` lo rechaza Composer 2.10; `--lock` sin paquete es equivalente |
| `composer update laravel/framework league/commonmark league/flysystem league/flysystem-local` | A | PASS: 4 paquetes, el resto igual | Autorizado por Ramiro tras fallar el audit |
| `composer validate --strict` | A | PASS (rc 0) | — |
| `composer audit` | A | PASS (rc 0) tras el parche; antes FALLA: 4 advisories del 29–30/09 | — |
| SHA-256 baseline + 15 forward | A y B | PASS (`4C8B…472D`). Re-ejecución: los 3 forward nuevos OK; el viejo `2026-09-14.001` falla (1060) | Ver pendientes |
| `vendor/bin/pint --test` | A | PASS (240 archivos) | — |
| `vendor/bin/phpstan analyse` | A | PASS, 0 errores | — |
| `php artisan everprop:schema:verify` | A y B | PASS (60/54/131/2/3) | Contra instalación limpia; producción puede diferir (FKs condicionales de `2026-09-15.002`) |
| `php artisan test` | A | PASS: 186 tests, 0 fallas (rc 0) | Muestra "warnings": el runner busca un `.env` en la raíz y esta copia no lo tiene; `vendor/bin/phpunit --display-warnings` da **OK (186 tests, 1000 assertions)** sin advertencias |
| `WebPushTest` | A | PASS (bcmath presente) | — |
| `node --test .claude/hooks/guard.test.mjs` | host | PASS 54/54 (falla con el guard de HEAD) | No está en CI |
| `everprop-public`: `test:conversations` / `tsc --noEmit` / `lint` / `build` | host | 3/3 · OK · 0 errores (156 warnings preexistentes) · OK. `AGENTS.md` intacto (mismo hash) | — |
| Sitio: `npm test` / `lint` / `tsc --noEmit` | copia de HEAD | 11/11 · 0 problemas · OK | — |
| Sitio: build sin variables | copia de HEAD | PASS: Bellomito, sin widget (verificado en Chromium) | — |
| Sitio: build con `NEXT_PUBLIC_EVERSYS_WIDGET_ID=<uuid sintético>` y `NEXT_PUBLIC_EVERSYS_PANEL_ORIGIN=https://panel.example` | copia de HEAD | PASS: `https://panel.example/eversys-widget.js` con `data-widget-id` = uuid; sin Bellomito | — |
| `api-vertical.mjs` (en `_patches/e2e-lote3`) | B | **22/22 PASS** | Tenant por header (modo local) |
| `ui-vertical.mjs` | B | **9/9 PASS**, dos corridas seguidas | Panel en `next start` con `TENANT_HOST_MAP_JSON={"127.0.0.1":"e2e-a"}`, igual que Railway. Primera corrida falló: ver "Hallazgos del E2E" |
| Framing (curl) | B | `/widget/*` → `frame-ancestors http://127.0.0.1:4000`; `/admin/*` → `'none'` + `X-Frame-Options: DENY` | — |

Comprobación final en B: 0 mensajes duplicados, 0 `chatbot_runs`, 0 leads, 0 filas de `usage_ledger`.

### 3. Lock de Composer (exacto)

`content-hash` `41cef50a9676f81a21cde727ecc871c2` → `a0673fca0bc5e84a88efd2d55fcbfd33`. 126 paquetes antes y después. Cambian solo:
- `laravel/framework` v13.24.0 → v13.34.0 (XSS en página de debug, baja)
- `league/commonmark` 2.10.1 → 2.10.3 (DoS cuadrático en tablas GFM, alta; bypass de `DisallowedRawHtml`, media)
- `league/flysystem` 3.35.2 → 3.36.0 (normalización de rutas con UTF-8 mal formado, baja)
- `league/flysystem-local` 3.31.0 → 3.35.3 (acompaña a flysystem)

Con Laravel 13.24 la suite falla igual que con 13.34 cuando el entorno está mal configurado: se descartó que la subida introdujera regresiones (mismas 7 fallas de entorno, luego corregidas en la configuración sintética).

### 4. Revisión independiente (subagentes del repo; no es la auditoría de Codex Security)

| Revisor | Severidad | Hallazgo | Estado |
|---|---|---|---|
| llm-security | Media | El hook guardián se evadía con `Git push`, `& git push`, `git -C . push`, `git.exe push`, `cmd /c "git push"`, `echo $(git push)` | **Corregido**: normalización + reglas sin distinguir mayúsculas; `guard.test.mjs` (54 casos) |
| llm-security | Baja | `.env.production.local`, `.env.staging`, `.en*` no bloqueados al leer | **Corregido** en el mismo cambio |
| llm-security | Baja | Test de rollback no verificaba cero llamadas al modelo ni ledger | **Corregido**: LlmClient espía, 0 llamadas, 0 filas en `usage_ledger` |
| llm-security | Baja | Falla del handoff con IA apagada devolvía 500 con el mensaje ya guardado | **Corregido**: `rescue()`; el barrido lo recupera |
| llm-security | Baja | Rollback de IA depende de reiniciar cada servicio (`config:cache`) | Documentado en runbook; pendiente un interruptor en caliente |
| tenant-isolation | Media | Faltaban negativos con dos tenants | **Corregido**: barrido/handoff/coordinador con id ajeno, misma clave de respuesta en dos tenants, CSRF en otra ruta pública y sesión de panel sin bearer |
| tenant-isolation | Baja | Barrido con `limit(500)` sin orden | **Corregido**: `orderBy('last_inbound_at')` (techo anotado) |
| tenant-isolation | Baja | Replay de idempotencia leía `messages` sin `tenant_id` | **Corregido** |
| schema-guardian | **Alta** | Runbook sin `lock_wait_timeout`: un `ALTER` esperando un lock puede trabar login e inventario | **Corregido en runbook** (`go-live.md` → "Aplicar el SQL") |
| schema-guardian | Media | Runbook pedía ver `2026-09-29.001` en `schema_versions`, pero ese script no se registra | **Corregido**: verificación por contenido del procedure |
| schema-guardian | Media | Faltaban chequeos previos (WhatsApp duplicado, `jobs` existente, grants), backup sin `--routines`, sin verificación posterior ni plan ante falla a mitad | **Corregido en runbook** |
| schema-guardian | Media | `schema:verify` cuenta contra instalación limpia; producción puede tener 133 FKs | Documentado: correr primero contra el restore |
| schema-guardian | Baja | Barrido IA-apagada hace full scan por minuto (sin índice) | **Corregido** (2026-10-02): forward `2026-09-30.002` `ix_conversations_sweep (status, last_inbound_at)`; MySQL 8.4 limpio: baseline + 16 forward OK, re-ejecución OK, `EXPLAIN` usa el índice (range, sin filesort) |
| Info | — | `postMessage` de cierre a `*` sin datos; docblock fuera de lugar (corregido); tenants inactivos en el barrido; FK `fk_visits_follow_up` no compuesta (preexistente) | Anotados |

### Hallazgos del propio lote (no venían de la revisión)

- **`ProductionWorkerEntrypointTest` habría fallado en CI**: creaba un `php` falso en `/tmp` y lo ejecutaba, pero el contenedor del proyecto monta `/tmp` con `noexec` y el CI corre los tests ahí. En el sandbox del Lote 1 pasaba. Corregido (función de shell, sin archivos ejecutables).
- **Resolución de tenant en producción**: con `next build` el panel no manda `X-Everprop-Tenant`; el tenant sale de `TENANT_HOST_MAP_JSON` con el host que ve la API. El E2E del Lote 2 usó `next dev` y no lo ejercitaba. Verificado ahora con el mapa de hosts: funciona. En Railway, `TENANT_HOST_MAP_JSON` debe mapear el hostname de la API a `bellomo`, tal como dice `railway-backend.md`.
- E2E U5 dependía de una espera fija de 2,5 s; con el proxy de Next en frío tardó más. Sin duplicado (verificado en base); el script ahora espera el resultado.

### 5. Pendientes por severidad

**Bloqueantes previos al piloto (fuera de este lote):** staging con dominios reales **en curso** en `bellomito-staging` (F0-S; pasos S1–S7 de `go-live.md`); backup de producción restaurado de prueba y SQL de producción **no autorizados** (F0-P, 2026-10-02); definir quién atiende la bandeja y en qué horario.

- **Media**: `schema:verify` contra producción real sin medir; conteo de conversaciones heredadas antes del SQL; rollback de IA sin medir en Railway; `compose.yaml` local: el worker de desarrollo sigue con `queue:work redis` fijo (solo dev).
- **Baja**: `2026-09-14.001` no re-ejecutable y `2026-09-29.001` no registrado en `schema_versions` (documentado en runbook); advertencias del runner sin `.env`; aviso al visitante en handoff por IA apagada.

**Propuesta (no aplicada) para versionar el E2E:** `e2e/` en la raíz con `@playwright/test`, `playwright.config.ts` con dos proyectos (`api` y `ui`), `globalSetup` que levanta el stack Docker aislado, importa baseline + forward, siembra los 2 tenants con un comando artisan de fixtures sintéticas (solo `local`/`testing`) y arranca `next start`; los 31 checks pasan a `test()` con `expect`; job de CI nocturno y manual, no en cada push (≈6 min).

### 6. Recomendación

**GO técnico condicionado / NO-GO operativo hoy** para el piloto acotado de chat web con asesores (IA apagada). El código y las pruebas de este lote están en verde en el entorno real (PHP 8.4 / MySQL 8.4, E2E en modo producción). No se enciende hasta cumplir, en orden: (1) backup restaurable probado, (2) SQL aplicado según "Aplicar el SQL" de `go-live.md`, (3) staging con dominios reales repitiendo `api-vertical`/`ui-vertical`, (4) responsable y horario de la bandeja. IA y WhatsApp siguen fuera de alcance. No es "listo para producción".
