# EVP-207 — Staging: página «Probar asistente» con login, sesiones, calificación y exportación

Rama `ticket/EVP-207-probar-asistente` · fecha 2026-11-26 · autor: Mauro Centurión + agente

## 1. Qué pedía el ticket

- Incorporar en el panel (`everprop-public`) la página **"Probar asistente"** (`/admin/probar-asistente`) detrás de la sesión Sanctum, accesible **solo para administradores** (`TENANT_ADMIN` / `SUPER_ADMIN`, sin RBAC paralelo — ADR D05), destinada únicamente a **staging** (`develop` → `bellomito-staging`; el módulo de IA y conversaciones nunca va a `main`).
- Permitir que el equipo administrativo del cliente (Mónica) y Eversys puedan:
  1. **Crear nuevas sesiones de prueba** (con título opcional por tema organizativo) y listar sesiones en curso y finalizadas.
  2. **Calificar cada respuesta del asistente** como **Bien / Mal** (`GOOD` / `BAD`) y dejar **anotaciones** por mensaje.
  3. **Finalizar la sesión** dejando **anotaciones generales de cierre**.
  4. **Revisar y exportar** desde cualquier cuenta administradora del tenant la traza completa de mensajes junto con todas las calificaciones y observaciones (`.md` y `.json`), además de ver la conversación real en `/admin/conversaciones`.

## 2. Qué se implementó

### Esquema (`everprop-api`)
- [2026-11-26.001_assistant_test_sessions.sql](everprop-api/database/schema/forward/2026-11-26.001_assistant_test_sessions.sql): forward aditivo e idempotente (`CREATE TABLE IF NOT EXISTS`, `SET SESSION lock_wait_timeout = 10`) que agrega dos tablas por tenant con FKs compuestas:
  - `assistant_test_sessions` (`tenant_id`, `public_id`, `conversation_id`, `created_by_user_id`, `title`, `status` `OPEN|FINISHED`, `closing_note`, `finished_at`).
  - `assistant_test_message_reviews` (`tenant_id`, `session_id`, `message_sequence`, `rating` `GOOD|BAD|NULL`, `note`, `reviewed_by_user_id`).
- [database-contract.php](everprop-api/config/database-contract.php): actualizado (`tables: 69`, `tenant_tables: 63`, `foreign_keys: 153`).
- [ProductionCheck.php](everprop-api/app/Console/Commands/ProductionCheck.php#L130-L132) y [ProductionEnvironmentTest.php](everprop-api/tests/Feature/ProductionEnvironmentTest.php#L75-L84): registrado `Schema: assistant test sessions` exigiendo ambas tablas y la fila `2026-11-26.001` en `schema_versions`.

### Backend (`everprop-api`)
- [api.php](everprop-api/routes/api.php#L141-L148): nuevas rutas bajo `['tenant', 'auth:sanctum', TouchLastActive::class]` + `RotatorRoleBoundary`:
  - `GET /api/v1/admin/assistant/widget`
  - `GET /api/v1/admin/assistant/test-sessions`
  - `POST /api/v1/admin/assistant/test-sessions`
  - `GET /api/v1/admin/assistant/test-sessions/{session}`
  - `POST /api/v1/admin/assistant/test-sessions/{session}/messages`
  - `PUT /api/v1/admin/assistant/test-sessions/{session}/messages/{sequence}/review`
  - `POST /api/v1/admin/assistant/test-sessions/{session}/finish`
- [AdminAssistantTestSessionController.php](everprop-api/app/Domain/Conversations/Http/Controllers/AdminAssistantTestSessionController.php): autoriza con `Capability::MANAGE_INTEGRATIONS` (ADR D05), crea conversaciones reales `WEB_CHAT` en `conversations`, envía mensajes por `InboundMessageService::accept()`, persiste calificaciones/anotaciones por mensaje y anotación final, todo filtrado por `tenant_id` resuelto en servidor y con `Cache-Control: private, no-store`.
- [AdminAiSettingsController.php](everprop-api/app/Domain/Conversations/Http/Controllers/AdminAiSettingsController.php#L31-L49): método `widget()` tenant-scoped para admins.
- Tests: [AssistantTestSessionTest.php](everprop-api/tests/Feature/Conversations/AssistantTestSessionTest.php) y [AiSettingsTest.php](everprop-api/tests/Feature/Conversations/AiSettingsTest.php#L306-L345).

### Frontend (`everprop-public`)
- [assistant-api.ts](everprop-public/src/lib/assistant-api.ts#L69-L194): clientes tipados para sesiones, mensajes, calificación, cierre y `formatAssistantTestSessionMarkdown`.
- [page.tsx](everprop-public/src/app/admin/probar-asistente/page.tsx): pantalla `/admin/probar-asistente` (solo `TENANT_ADMIN` / `SUPER_ADMIN`, redirige a `/login` sin sesión) con creación y listado de sesiones, chat con polling en vivo, calificación **Bien / Mal** + anotación por respuesta, cierre con anotación general, exportación `.md` / `.json` y enlace a `/admin/conversaciones`.
- [navigation.ts](everprop-public/src/components/sidebar/navigation.ts#L150-L158): entrada **"Probar asistente"** bajo *Comercializadora*, solo para `isTenantAdmin`.
- [ChatWidget.tsx](everprop-public/src/components/public/ChatWidget.tsx): prop opcional `embedded`.
- [probar-asistente.test.mjs](everprop-public/tests/probar-asistente.test.mjs).

## 3. Por qué esta solución

- Cada sesión de prueba usa el mismo pipeline real (`InboundMessageService::accept` → `RunAgentJob` → `AgentCoordinator`, con reglas `EVP-200`) y queda en `conversations`/`messages`, sin depender de tokens anónimos ni `localStorage` ni `allowed_origins` del navegador.
- Al guardar `assistant_test_sessions` y `assistant_test_message_reviews` en tablas nuevas aditivas, no se hace `ALTER TABLE` sobre tablas grandes existentes.
- Cualquier admin del tenant puede abrir cualquier sesión de Mónica y exportar toda la traza + calificaciones + notas en un clic.

## 4. Cómo se verificó

- **Forward SQL (MySQL 8.4 local):** aplicado dos veces seguidas sobre `bellomo_crm_test` (replay idempotente sin errores) y verificado con `php artisan everprop:schema:verify --env=testing`: **PASS** (`tables: 69`, `tenant_tables: 63`, `foreign_keys: 153`).
- **Backend (Docker local, detenido al finalizar):**
  - `vendor/bin/pint --test` en todos los archivos PHP tocados: **PASS**.
  - `vendor/bin/phpstan analyse`: **`[OK] No errors`**.
  - `php artisan test tests/Feature/Conversations/AssistantTestSessionTest.php`: **PASS**.
  - `php artisan test tests/Feature/Conversations/AiSettingsTest.php`: **17 passed (137 assertions)**.
  - `php artisan test tests/Feature/ProductionEnvironmentTest.php`: **3 passed** (incluye `OK Schema: assistant test sessions` y `FAIL` si falta `2026-11-26.001`).
- **Frontend (`everprop-public`):**
  - `npm run build` (Next.js 16.3.6 Turbopack + TypeScript, `NEXT_PUBLIC_DATA_MODE=api`): **PASS**.
  - `node --test tests/probar-asistente.test.mjs tests/chat-session.test.mjs`: **6/6 passed**.
- **Revisiones obligatorias (`tenant-isolation-reviewer` + `schema-migration-guardian`):** los 3 hallazgos detectados (`messages.text_body`, `ContactIdentityResolver` `display_name`, `BIGINT UNSIGNED` + `lock_wait_timeout`) fueron corregidos y verificados con tests en MySQL real.
- **No verificado todavía:** aplicación del forward `2026-11-26.001` en `bellomito-staging` y smoke en navegador tras desplegar.

## 5. Pendientes y riesgos

- **Antes de mergear PR #186 a `develop` (staging):**
  1. **Aplicar el forward SQL `2026-11-26.001_assistant_test_sessions.sql` en `bellomito-staging` (`mysql84`) ANTES del merge**, ya que `everprop:production-check --connections` lo exige al arrancar el contenedor.
  2. Mergear PR #186 a `develop` y verificar `php artisan everprop:production-check --connections` en `worker` de staging.
  3. Confirmar catálogo real de Bellomo (`EVP-202`), IA encendida (`EVP-201`), alta privada de la cuenta admin de Mónica y smoke en el navegador de staging (login, nueva sesión, respuesta IA, calificación Bien/Mal + nota, cierre + nota final, exportación `.md`/`.json` y logout).
- **Producción (`main`):** no aplica — el módulo de IA y conversaciones nunca va a `main`.
