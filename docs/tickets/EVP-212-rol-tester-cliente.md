# EVP-212: rol de prueba para el cliente

Fecha: 2026-11-26. Rama: `ticket/EVP-212-rol-tester-cliente`, desde `develop` (`cb3b7a2`, con EVP-207 mergeado).

## 1. Qué pedía el ticket

El cliente necesita una cuenta en staging que:
- entre solo a **"Probar asistente"** y a **Conversaciones**;
- en Conversaciones vea **solo las conversaciones que generó esa cuenta**, en modo lectura;
- cuando el asistente deriva a un asesor, pueda decir si la derivación fue **muy temprana, innecesaria o correcta**.

La respuesta sobre la derivación se agrega a la **observación** de la calificación, sin un campo nuevo.

## 2. Qué se hizo

### Backend (`everprop-api`)

- **Rol `ASSISTANT_TESTER`** en `RoleCode`, **sin capacidades genéricas** (`[]`): todo acceso es un chequeo explícito de rol y lo demás se deniega por defecto.
- **Forward `2026-11-26.002_assistant_tester_role.sql`:**
  - agrega el rol al `CHECK` `ck_users_role` y registra `schema_versions`;
  - se puede re-ejecutar sin efecto;
  - está registrado en `ProductionCheck` ("Schema: assistant tester role") y en `ProductionEnvironmentTest`, que también prueba el FAIL si falta.
- **`RotatorRoleBoundary`:** el tester solo pasa por:
  - `/api/v1/admin/assistant/test-sessions*`;
  - `GET /api/v1/admin/conversations`, `.../{id}/messages` y `.../{id}/media/{seq}`.

  El resto de `/api/v1/admin/*` devuelve 403.
- **`AdminAssistantTestSessionController`:**
  - acepta al tester además de los administradores;
  - para el tester, listado y los cinco verbos se limitan a sus sesiones (`created_by_user_id`); las ajenas dan 404;
  - los administradores siguen viendo todas, incluidas las del cliente.
- **Derivación:** el detalle de la sesión marca `handoff: true` en el aviso que envió el asistente al derivar. Sale del `outbound_jobs.payload_json.handoff_notice` que ya escribe `ConversationControl::requestHuman`, sin esquema nuevo.
- **`AdminConversationController`:**
  - el tester entra a la bandeja, pero `visible()` le muestra solo las conversaciones de sus sesiones (`whereExists` sobre `assistant_test_sessions`, por tenant);
  - `writer()` lo rechaza (403), igual que a `READ_ONLY`.
- **Alta de usuarios** (`AdminUserController`): un administrador puede crear el rol o cambiar a alguien a él. Queda con `can_view_prices = false`.
- **Documentación:** `docs/rbac.md` (matriz y bandeja), `docs/production-release.md` y `openapi.yaml`.

### Frontend (`everprop-public`)

- **Rol:** `ASSISTANT_TESTER` se mapea al rol de panel `TESTER`, con el título "Prueba del asistente".
- **`MainLayout`:** para el tester, cualquier ruta que no sea "Probar asistente" o "Conversaciones" redirige a `/admin/probar-asistente`.
- **Menú:** solo esas dos opciones, y no consulta el contador de posibles leads.
- **"Probar asistente":**
  - permite el rol;
  - para el tester no muestra "Volver al panel" ni el enlace a Configuración.
- **Pregunta de derivación:**
  - el mensaje que derivó lleva la etiqueta "Derivó a un asesor";
  - al calificarlo aparece "¿La derivación fue necesaria?" con *Muy temprana*, *Innecesaria* y *Correcta*;
  - la respuesta se antepone a la observación, por ejemplo `Derivación: muy temprana. <nota>`;
  - al reabrir la calificación se separa de nuevo, así la nota no se duplica;
  - el export `.md` marca el mensaje con "derivó a un asesor".
- **Conversaciones:**
  - modo lectura para el tester;
  - sin el tablero de solicitudes de visita ni el contador de posibles leads;
  - el botón de volver lleva a las pruebas.
- **Alta de usuarios:** nueva opción "Prueba del asistente", con su explicación.

## 3. Cómo se verificó

**Frontend (`everprop-public`)**
- `eslint` sobre los archivos tocados: 0 errores.
- `npm run lint`: 0 errores (133 advertencias previas).
- `npm run build` con `NEXT_PUBLIC_DATA_MODE=api`: PASS.
- `node --test tests/probar-asistente.test.mjs`: 4/4. Incluye el confinamiento del tester y la composición de la observación de derivación sobre textos reales.
- `node --test tests/`: 234/238. Los 4 que fallan (`assistant-trace`, `collections-redesign` y `conversation-workspace`) **fallan igual en `develop` limpio** (`cb3b7a2`); no los causa este ticket.

**Backend**
- Tests nuevos en `tests/Feature/Conversations/AssistantTesterRoleTest.php`:
  - sesiones propias y ajenas;
  - derivación;
  - bandeja limitada y sin escritura;
  - 403 en el resto del panel;
  - aislamiento entre tenants;
  - alta y cambio de rol sin precios.
- `HandoffAndDispatchTest::test_conversation_access_per_role` suma el rol.
- `ProductionEnvironmentTest` suma el check nuevo.
- **Ejecutados en un stack de Docker aparte** (proyecto `everprop-api`, MySQL 8.4), autorizado porque otra sesión usaba el suyo; el stack se detuvo al terminar:
  - forward `2026-11-26.002` aplicado dos veces seguidas en `bellomo_crm_test` sin errores; `everprop:schema:verify --env=testing`: PASS;
  - `pint --test`: PASS (374 archivos); `phpstan analyse`: sin errores;
  - clases tocadas: 39 passed (457 assertions);
  - suite completa `php artisan test`: **1233 passed, 2 skipped** (7831 assertions).

**Revisión de aislamiento (`tenant-isolation-reviewer`):** sin hallazgos BLOQUEANTES ni ALTOS. Los MEDIOS se atendieron:
- negativos de media ajena, listado y búsqueda entre tenants, cambio de rol sin precios y derivación de otra conversación;
- rol agregado al test de contrato;
- la documentación aclara que el rol es solo para staging.

## 4. Pendientes y riesgos

- **Staging** (requiere autorización):
  - aplicar el forward `2026-11-26.002` en `bellomito-staging`;
  - desplegar la api y el panel;
  - crear la cuenta del cliente con el rol "Prueba del asistente" y entregar el enlace de activación por un canal privado;
  - probar en el navegador: login, chat, derivación con la pregunta, Conversaciones solo con lo suyo, una ruta bloqueada y logout.
- **Producto:** el tester lee sus conversaciones completas, incluidas las notas internas del equipo y el resumen de derivación del modelo. Es coherente con "lectura de sus conversaciones", pero conviene confirmarlo.
- **Bandeja de asesores:** el título de la sesión del tester aparece en la bandeja de los asesores como `Prueba · <título>`.
- **Entorno:** el rol no está limitado a staging por código. La documentación indica no asignarlo en producción.
- **Producción:** el módulo de IA no va a `main`. Antes de cualquier pase hay que verificar los accesos de producción.
