# EVP-L01 — Interruptor de IA por cliente, sin redeploy

Rama `ticket/EVP-L01-interruptor-ia` · fecha 2026-10-11 · Claude Code con Ramiro Ruggeri
ID local provisorio: el PM autorizó desarrollar en local y cargar en Jira después (excepción de `TICKETS.md`). Ticket anterior: EVP-0.1, revisado y mergeado (PR #11).

## 1. Qué pedía el ticket

**Objetivo.** Que un administrador encienda o apague el asistente autónomo y el copiloto de **su** inmobiliaria desde el panel, con efecto inmediato y sin redesplegar. Hoy la IA depende de una variable global (`CONVERSATIONS_AI_ENABLED`) que vale para todos los clientes, y cambiarla exige reiniciar API, worker y scheduler. Es el control de vuelta atrás que hace falta antes de encender la IA (F2).

**Criterios de aceptación**
- Interruptor por cliente, apagado por defecto, con auditoría de quién lo cambió.
- La variable global sigue siendo el corte general.
- Al apagar, lo que el modelo estuviera haciendo se descarta y las conversaciones pasan a un asesor.
- Apagar un cliente no toca a otro.
- Revisión de aislamiento y de seguridad de IA.

**Fuera de alcance:** cupos de gasto por cliente (ya están en el ledger), horario de atención (EVP-L02) y la tabla versionada de configuración (resto de S02).

## 2. Qué se implementó

**Dónde se guarda.** `tenants.settings_json.conversations.ai_enabled` y `copilot_enabled`. Si falta o no es `true`, está apagado. Es una excepción acotada al ADR 0005, aprobada por Ramiro: es el mismo lugar que ya usa el tope de gasto (`usage.monthly_cap_micros`), y se migra cuando exista `tenant_config_versions`.

**Lógica central** — [InboundMessageService.php](../../everprop-api/app/Domain/Conversations/Services/InboundMessageService.php)
- `aiEnabled(int $tenantId)` = `aiAvailable()` (plataforma: variable global y cola no sincrónica en producción) **y** el interruptor del cliente.
- `copilotEnabled(int $tenantId)` = `copilotAvailable()` (flag del copiloto y proveedor configurado) **y** el interruptor del cliente.
- Se lee de la base en cada llamada, sin caché. Por eso no hace falta reiniciar nada.
- En `accept()`, un error al leerlo no da 500 después de guardar el mensaje: falla cerrado y deriva.

**Todos los puntos que encienden la IA pasan el cliente:** alta de la conversación web ([PublicChatController.php](../../everprop-api/app/Domain/Conversations/Http/Controllers/PublicChatController.php)), mensajes entrantes web y WhatsApp, `resume`, el turno del asistente, el copiloto (`suggest`) y la vista de la bandeja.

**Corte de un turno en curso** (cinco capas, de la más temprana a la más tardía):
1. **Antes de llamar al modelo:** el turno se saltea y la conversación se deriva (`AgentCoordinator::handle`).
2. **Antes de cada herramienta que escribe** (registrar interés, pedir visita, derivar): el cerco común `ToolExecutions::once` rechaza con `STALE_CONTROL` ([ToolExecutions.php](../../everprop-api/app/Domain/AgentRuntime/Tools/ToolExecutions.php)).
3. **Al proponer la respuesta:** `ConversationControl::proposeBotReply` rechaza con `AI_DISABLED` bajo lock, y el coordinador deriva.
4. **Al apagar:** el `PUT` deriva en el momento las conversaciones del cliente en manos del bot con actividad en las últimas 72 h. La derivación sube el `control_epoch` y cancela los envíos del bot en cola, así que se descarta todo lo que el turno todavía hiciera: respuesta, aviso escrito por el modelo, herramientas y reintentos.
5. **Respaldo:** el reconciliador ([ReconcileConversations.php](../../everprop-api/app/Console/Commands/ReconcileConversations.php)) barre cada minuto solo los clientes apagados. Excluye de entrada a los encendidos, para que no ocupen el límite de 500 filas, y vuelve a comprobar cada fila.

**API** — [AdminAiSettingsController.php](../../everprop-api/app/Domain/Conversations/Http/Controllers/AdminAiSettingsController.php)
- `GET` y `PUT /api/v1/admin/conversations-ai`, con el permiso existente `manageIntegrations` (administrador del cliente resuelto por el servidor).
- `lockForUpdate` sobre el cliente y `audit_logs` (`CONVERSATIONS_AI_SETTINGS_UPDATED`) con antes, después y actor, solo si hubo cambio.
- El `X-Request-Id` se guarda solo si es válido. Un `settings_json` con forma inesperada no rompe.
- Entre clientes responde 404 genérico.

**Panel** — [AiSettings.tsx](../../everprop-public/src/components/admin/AiSettings.tsx)
- Tarjeta "Inteligencia artificial" en Configuración, con dos interruptores: "Asistente que responde solo" y "Sugerencias para asesores".
- Solo la ven los administradores. Avisa si el cliente lo encendió pero la plataforma todavía no.

**Tests y documentación**
- [AiSettingsTest.php](../../everprop-api/tests/Feature/Conversations/AiSettingsTest.php): 12 tests.
- La factory de clientes de test nace con los interruptores encendidos, para que los tests viejos sigan dependiendo de la variable global. El valor por defecto real lo prueba un cliente sin configuración.
- `ProductionSafetyTest` apunta a `aiAvailable()`.
- Runbook (`go-live.md`): pasos 5b y 6, y vuelta atrás por cliente.
- ADR 0005: la excepción.

## 3. Por qué esta solución

- **Reutiliza lo que ya existía:** el permiso `manageIntegrations`, `audit_logs`, `handOffOrphanedBotConversation`, el cerco por `control_epoch`, la cancelación de envíos de `requestHuman` y el barrido del reconciliador. No hay tabla nueva, script SQL ni dependencia.
- **`settings_json` en vez de `tenant_config_versions`:** la tabla del ADR son 2–3 jornadas solo por dos booleanos. Ramiro eligió la excepción documentada.
- **Lectura sin caché:** una consulta por clave primaria por mensaje es despreciable en el piloto, y es lo que permite el efecto inmediato. Una caché obligaba a invalidarla en API, worker y scheduler.
- **Derivar al apagar**, en lugar de agregar un chequeo en cada punto: subir el epoch reutiliza el cerco que ya protege la toma de control de un asesor. Con un solo cambio se cerraron los hallazgos de las dos revisiones (respuestas en cola, aviso escrito por el modelo, herramientas). La alternativa era un chequeo en el dispatcher y otro en `deliver()`.
- **Descartado:** apagar con la variable global (exige redeploy y vale para todos) y una tabla `tenant_feature_switches` (no es lo que dice el ADR).

## 4. Cómo se verificó

Entorno: stack Docker aislado `everprop-lote3` (PHP 8.4.24, MySQL 8.4, base `bellomo_crm_test` con datos sintéticos). Antes se le aplicaron los dos forwards del 7/10 que le faltaban. Fecha 2026-10-11.

| Comprobación | Resultado |
|---|---|
| `AiSettingsTest` | 12 tests, 83 assertions, OK |
| Suite backend completa | 342 tests, 1983 assertions, 0 fallos. Las "warnings" son el aviso conocido del runner sin `.env` |
| Pint (`--test`, 284 archivos) | OK |
| PHPStan | Sin errores |
| Panel: `tsc`, `npm run lint`, 73 tests `node --test`, `npm run build` | OK. Lint: 0 errores, las 153 advertencias que ya existían |
| Revisión `tenant-isolation-reviewer` | Sin bloqueantes ni fugas. Hallazgos medios (herramientas en un turno en curso, huecos de tests) y bajos (carrera del barrido, request id, settings malformados, textos): **todos aplicados** salvo B4 (ver pendientes) |
| Revisión `llm-security-reviewer` | Sin bloqueantes. Hallazgos medios (respuesta en cola, aviso escrito por el modelo, error de lectura en `accept()`) y bajos (textos, tests, settings malformados): **aplicados** salvo B1 (ver pendientes) |

**No verificado:**
- La tarjeta del panel en el navegador: no se levantó el panel con la API, así que solo hay typecheck, lint y build.
- El comportamiento en staging y en Railway.

## 5. Pendientes y riesgos

- **Segunda llamada al modelo en un turno en curso** (revisión de IA, B1): si se apaga justo entre la primera y la segunda llamada, esa segunda llamada puede facturarse. Su resultado se descarta igual. Está acotado a un turno por conversación y con reserva en el ledger.
- **Factory encendida** (revisión de aislamiento, B4): un test nuevo que suponga "apagado por defecto" tiene que crear el cliente con `settings_json` nulo, como hace `AiSettingsTest`.
- **Volumen:** el `PUT` de apagado deriva las conversaciones en la misma petición (`ponytail:`). Con miles de chats abiertos con bot conviene pasarlo a un job.
- **Hallazgo aparte**, para otro ticket: hay dos scripts forward con la misma versión, `2026-10-07.001` (`rotator_role` y `collection_email_attempts`). Solo el segundo se registra en `schema_versions`. Puede explicar por qué a staging le falta `collection_email_attempts`.
- Medir en staging cuánto tarda el apagado de punta a punta.
