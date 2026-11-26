# EVP-207 — Staging: página «Probar asistente» con login para probar Bellomito

Rama `ticket/EVP-207-probar-asistente` · fecha 2026-11-26 · autor: Mauro Centurión + agente

## 1. Qué pedía el ticket

- Incorporar en el panel (`everprop-public`) una página **"Probar asistente"** detrás de la sesión existente (Sanctum), accesible **solo para administradores** (`TENANT_ADMIN` / `SUPER_ADMIN`, sin RBAC paralelo — ADR D05).
- Mostrar el chat del widget oficial (`WEB_CHAT`) del tenant resuelto en servidor, sin hardcodear ni exponer el `widget_id` fuera de la página con login, junto con una guía breve de qué probar y el enlace a **Conversaciones** (`/admin/conversaciones`) para revisar la traza completa de mensajes.
- Con sesión de otro tenant, nunca exponer el widget de Bellomo; sin sesión, redirigir al login.
- **Fuera de alcance:** marcado por mensaje (correcta/incorrecta con comentario) — se acordó revisar las trazas directamente en `/admin/conversaciones`; sin cambios de esquema SQL ni forward nuevo; sin deploy ni alta de credenciales en staging hasta su aprobación.

## 2. Qué se implementó

### Backend (`everprop-api`)
- [api.php](everprop-api/routes/api.php#L141): nueva ruta `GET /api/v1/admin/assistant/widget` (`throttle:60,1`) dentro del grupo `['tenant', 'auth:sanctum', TouchLastActive::class]` y `RotatorRoleBoundary`.
- [AdminAiSettingsController.php](everprop-api/app/Domain/Conversations/Http/Controllers/AdminAiSettingsController.php#L31-L49): método `widget(Request $request)` que autoriza con `$this->admin($request)` (`Capability::MANAGE_INTEGRATIONS`, solo `TENANT_ADMIN` y `SUPER_ADMIN`), consulta `channel_accounts` filtrado por `tenant_id` resuelto en servidor (`TenantContext`), `channel_type = 'WEB_CHAT'` y `status = 'ACTIVE'`, y devuelve `{ widget_id, display_name, ai_enabled }` con `Cache-Control: private, no-store`.
- [AiSettingsTest.php](everprop-api/tests/Feature/Conversations/AiSettingsTest.php#L306-L345): test `test_assistant_widget_requires_admin_and_isolates_tenants` cubriendo 401 sin sesión, 403 para `SALES_ADVISOR`, `SALES_MANAGER`, `BOT_OPERATOR`, `ROTATOR` y `READ_ONLY`, 200 con `Cache-Control: private, no-store` para `TENANT_ADMIN`, 404 cuando el admin de Tenant A apunta al host de Tenant B, y `widget_id: null` / `ai_enabled: false` para el admin de Tenant B.

### Frontend (`everprop-public`)
- [assistant-api.ts](everprop-public/src/lib/assistant-api.ts#L69-L76): tipo `AssistantWidgetConfig` y cliente `loadAssistantWidget(signal?)` apuntando a `/api/v1/admin/assistant/widget`.
- [ChatWidget.tsx](everprop-public/src/components/public/ChatWidget.tsx#L29): prop opcional `embedded?: boolean` para renderizar embebido dentro del panel (`h-full` en lugar de `h-dvh`, y `<h2>` en lugar de `<h1>` para mantener un único `<h1>` por página).
- [page.tsx](everprop-public/src/app/admin/probar-asistente/page.tsx): página `/admin/probar-asistente` protegida por `useCurrentSession()` (redirige a `/login` sin sesión) y restringida a `TENANT_ADMIN` / `SUPER_ADMIN`. Muestra guía de prueba, aviso si la IA está desactivada, botón **Nueva conversación** (limpia el token del widget en storage y remonta el chat) y acceso directo a **Conversaciones**.
- [navigation.ts](everprop-public/src/components/sidebar/navigation.ts#L150-L158): ítem **"Probar asistente"** bajo *Comercializadora*, visible solo cuando `isTenantAdmin` es verdadero.
- [probar-asistente.test.mjs](everprop-public/tests/probar-asistente.test.mjs): verificación estática de restricción a administradores, consumo vía `loadAssistantWidget` y ausencia de UUIDs hardcodeados.

### Esquema / Configuración
- Sin cambios de esquema SQL ni forwards nuevos.
- Sin variables de entorno nuevas.

## 3. Por qué esta solución

- Reutiliza `ChatWidget` y el flujo same-origin de `/api/v1/public/chat/*` (donde cada conversación se persiste automáticamente en `conversations` y `messages`, visible en `/admin/conversaciones` con su traza completa).
- Reutiliza `AdminAiSettingsController::admin()` (`Capability::MANAGE_INTEGRATIONS`, ADR D05) sin introducir tablas ni roles paralelos.
- Al consultar `widget_id` por sesión autenticada con `Cache-Control: private, no-store`, el identificador no queda en el bundle ni en variables públicas.

## 4. Cómo se verificó

- **Backend (Docker local, MySQL 8.4 + Redis, contenedores detenidos al finalizar):**
  - `vendor/bin/pint --test` sobre los 3 archivos PHP tocados: **PASS**.
  - `vendor/bin/phpstan analyse` sobre los 3 archivos PHP tocados: **`[OK] No errors`**.
  - `php artisan test tests/Feature/Conversations/AiSettingsTest.php`: **17 passed (137 assertions)**.
- **Frontend (`everprop-public`):**
  - `npx eslint` sobre los 4 archivos tocados: **0 errors, 0 warnings**.
  - `npm run lint` global: **0 errors**.
  - `npm run build` (Next.js 16.3.6 Turbopack + TypeScript, `NEXT_PUBLIC_DATA_MODE=api`): **PASS** (ruta `/admin/probar-asistente` generada).
  - `node --test tests/probar-asistente.test.mjs tests/chat-session.test.mjs`: **6/6 passed**.
- **Revisión obligatoria de aislamiento por tenant (`tenant-isolation-reviewer`):** **PASS** (se incorporaron los 3 refuerzos sugeridos en `AiSettingsTest.php`: `BOT_OPERATOR` 403, cross-tenant host mismatch 404 y aserción de `private` en `Cache-Control`).
- **No verificado todavía:** despliegue y smoke en navegador de **staging** (`bellomito-staging`: login, chat con IA respondiendo según reglas EVP-200, verificación de traza en `/admin/conversaciones` y cierre de sesión).

## 5. Pendientes y riesgos

- **Entorno configurado:** aún no desplegado en staging (`bellomito-staging`).
- **Antes de entregar acceso al cliente en staging:**
  1. Verificar dominio del panel de staging, CORS de la API, `tenant_domains`, Sanctum/cookies y que el canal `WEB_CHAT` del tenant de staging tenga el origen del panel en `allowed_origins` (`everprop:channels:web-chat`).
  2. Confirmar que el catálogo real de Bellomo esté cargado en staging (`EVP-202`) y que la IA esté encendida (`EVP-201`).
  3. Crear la cuenta administradora de prueba del cliente en staging y entregar las credenciales por canal privado (nunca en Git, informes ni PRs).
  4. Probar el flujo completo desde el navegador de staging (login, envío de mensajes, respuesta IA sin precios/disponibilidad/cuotas, lectura de traza en `/admin/conversaciones`, logout).
- **Producción (`main`):** el módulo de IA y conversaciones no se integra a `main` (`CLAUDE.md`).
