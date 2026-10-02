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

- Webhook Meta procesa sincrónicamente antes del ACK (persistencia primero). Pasar a receipt → ACK → worker si el volumen lo exige.
- `ChannelPolicy.canSend` (ventana 24 h / plantillas) aún no existe: el transporte real sigue apagado hasta tenerla.
- Integrar el widget en el sitio de Bellomo (hoy Bellomito usa su propio `/api/chat` con Gemini): reemplazar por el `<script>` cuando G2 esté listo.
- Bandeja: búsqueda, etiquetas, notas internas y adjuntos (diseño S04) aún no.
- Alta de `channel_accounts`/integraciones (onboarding S14/Embedded Signup) sin endpoint.
- Activar IA: aprobar proveedor/región (X03), elegir modelo, cargar `ANTHROPIC_API_KEY` en el gestor de secretos, `REDIS_QUEUE_RETRY_AFTER` > 180, y correr evals contra el modelo real antes de `CONVERSATIONS_AI_ENABLED=true`.
- Conciliar filas UNKNOWN del ledger contra el uso real del proveedor (hoy conservan la reserva máxima).
- ~~Montos escritos en palabras~~: corregido 2026-10-02 (`OutputGuard::wordsToDigits`, "ochenta y cinco mil", "un millón y medio"; `OutputGuardTest` 37 casos). Formas mixtas raras ("85 mil quinientos") siguen sin cubrirse.
- Dependencias externas: X01 (Tech Provider: verificación de negocio, App Review, videos), X02–X04.

## Plan de cierre (2026-10-02)

Cada fase abre solo con el gate de la anterior. Responsables: **R** = Ramiro (operación, autorizaciones), **N** = sesión en la nube (implementa, abre PR), **L** = sesión local (revisión con subagentes, ítems chicos). Ningún paso activa IA ni Meta sin autorización expresa.

| Fase | Entregable | Quién | Gate de salida |
|---|---|---|---|
| F0 Release | Backup manual + restore de prueba; 4 forward con `lock_wait_timeout` (runbook); variables con IA/Meta apagadas; servicio worker; PR #7 fuera de borrador y merge | R | `/readyz` 200, `production-check` OK, respuesta de prueba en "Enviado" |
| F1 Piloto web humano | Sitio con widget por variables; conocimiento cargado desde `knowledge.ts`; responsables y horario; KPIs S16 mínimos | R + L | 2 semanas: tiempo de primera respuesta, leads completos, 0 duplicados |
| F2 IA en web | X03 aprobado, modelo, secreto; evals Q01 contra el modelo real; tope del ledger; rollback probado en Railway | R + L | Gates de `evaluation-and-security.md`; costo por conversación dentro de USD 150 |
| F3 WhatsApp | `ChannelPolicy` por número (D19); receipt → ACK → worker; X01 Tech Provider; alta de números (S14); número general y luego 1–2 asesores | N + R + L | S17: ambos canales reales; ningún simulador cuenta |
| F4 SaaS | S02 completo, S14, S15, billing manual (D15); n8n periférico (D20) si suma | N + L | Segundo tenant sin fork; restore medido |

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

**Bloqueantes previos al piloto (fuera de este lote):** backup de producción **restaurado de prueba**; staging con dominios reales (Railway + Vercel preview: CORS, Sanctum, `frame-ancestors`, `TENANT_HOST_MAP_JSON`); definir quién atiende la bandeja y en qué horario.

- **Media**: `schema:verify` contra producción real sin medir; conteo de conversaciones heredadas antes del SQL; rollback de IA sin medir en Railway; `compose.yaml` local: el worker de desarrollo sigue con `queue:work redis` fijo (solo dev).
- **Baja**: `2026-09-14.001` no re-ejecutable y `2026-09-29.001` no registrado en `schema_versions` (documentado en runbook); advertencias del runner sin `.env`; aviso al visitante en handoff por IA apagada.

**Propuesta (no aplicada) para versionar el E2E:** `e2e/` en la raíz con `@playwright/test`, `playwright.config.ts` con dos proyectos (`api` y `ui`), `globalSetup` que levanta el stack Docker aislado, importa baseline + forward, siembra los 2 tenants con un comando artisan de fixtures sintéticas (solo `local`/`testing`) y arranca `next start`; los 31 checks pasan a `test()` con `expect`; job de CI nocturno y manual, no en cada push (≈6 min).

### 6. Recomendación

**GO técnico condicionado / NO-GO operativo hoy** para el piloto acotado de chat web con asesores (IA apagada). El código y las pruebas de este lote están en verde en el entorno real (PHP 8.4 / MySQL 8.4, E2E en modo producción). No se enciende hasta cumplir, en orden: (1) backup restaurable probado, (2) SQL aplicado según "Aplicar el SQL" de `go-live.md`, (3) staging con dominios reales repitiendo `api-vertical`/`ui-vertical`, (4) responsable y horario de la bandeja. IA y WhatsApp siguen fuera de alcance. No es "listo para producción".
