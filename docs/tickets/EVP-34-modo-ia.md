# EVP-34 — Modo de IA: respuestas automáticas o Copiloto

Rama `ticket/EVP-34-modo-ia` · base `origin/develop` (`5c398af`) · fecha 2026-10-15 · autor Codex para Álvaro Ruggeri. Publicación de commit, rama y PR autorizada expresamente por Álvaro el 2026-10-15; sin merge/deploy.

## 1. Qué pedía el ticket

Elegir cómo se atienden las conversaciones: asistente autónomo o sugerencias para una persona. El cambio debe persistir por tenant, mantener aislamiento y auditoría, impedir envíos autónomos en Copiloto y conservar mensajes y atención humana ante fallos o falta de presupuesto.

Alcance aplicado: modo por inmobiliaria. No se añade una preferencia por conversación, otro proveedor ni llamadas facturables. La opción «IA apagada» conserva el estado existente con ambos interruptores apagados.

## 2. Qué se implementó

- `everprop-api/app/Domain/Conversations/Http/Controllers/AdminAiSettingsController.php`: `GET/PUT /api/v1/admin/conversations-ai` expone `mode`. PUT acepta `AUTONOMOUS`, `COPILOT` o `DISABLED` y transforma la elección al par existente `ai_enabled`/`copilot_enabled`. Rechaza modos desconocidos y enviar modo junto a flags. Conserva compatibilidad con consumidores que actualizan flags.
- `everprop-public/src/components/admin/AiSettings.tsx`: selector de radio con leyenda, ayudas, foco visible, estado de guardado y errores sin cambio optimista. Advierte cuando los interruptores de plataforma impiden aplicar la elección.
- `everprop-api/openapi.yaml`: contrato del endpoint GET/PUT, enum de modo, respuesta con gates, incompatibilidad de modo y flags, y compatibilidad legacy.
- `everprop-api/tests/Feature/Conversations/AiSettingsTest.php`: cuatro regresiones de modo, aislamiento, conservación de settings ajenos, despacho/no despacho e invalidación de turnos pendientes al pasar a Copiloto.

Persistencia sin cambio de esquema: `tenants.settings_json.conversations`. `AUTONOMOUS` activa ambos flags (sugerencias disponibles para asesores); `COPILOT` desactiva respuestas y activa sugerencias; `DISABLED` apaga ambos. `mode` se deriva del par, evitando otra fuente de verdad. Escritura existente bajo `lockForUpdate` y auditoría `CONVERSATIONS_AI_SETTINGS_UPDATED` en la misma transacción: una actualización concurrente no puede guardar la mitad del par.

Se reutilizan `InboundMessageService`, `AgentCoordinator`, `ConversationControl` y el compositor. En Copiloto el inbound queda guardado en `WAITING_HUMAN` y no despacha `RunAgentJob`; el asesor toma control y solicita un borrador. El cambio desde automático deriva chats recientes, cancela envíos pendientes y aumenta epoch. Volver a automático no quita el control a un asesor. La plataforma conserva sus gates globales y el ledger existente.

## 3. Por qué esta solución

Los interruptores, autorización, lock, auditoría, presupuesto y handoff ya existían. El ticket necesitaba una elección conjunta y comprensible, no otra máquina de estados. No se modifica baseline SQL, tenancy, proveedor, modelo, canal ni prompt. No hay dependencias nuevas. Se evita tocar el flujo de reapertura que desarrolla EVP-33 en otra rama.

## 4. Cómo se verificó

- TDD: antes de modificar el controlador, la nueva prueba falló por `data.mode = null` frente a `AUTONOMOUS` (ejecución coordinada por el hilo principal en PHP 8.4 y MySQL aislado).
- `./node_modules/.bin/eslint src/components/admin/AiSettings.tsx`: pasa.
- `./node_modules/.bin/tsc --noEmit`: pasa.
- `git diff --check`: pasa.
- `npm run build -- --webpack`: pasa, 31 páginas generadas.
- Backend `php artisan test --filter=AiSettingsTest`: **16 pruebas aprobadas, 122 assertions**. Ejecutado por el hilo principal con PHP 8.4.26 y MySQL 8.4, copia `/tmp/evp34`, base aislada `bellomo_crm_test` y `.env.testing`.

No se ejecutó Docker desde este agente ni se conectaron proveedores reales. Las dependencias frontend se reutilizan con un symlink local ignorado; el primer `npm run build` con Turbopack rechazó ese symlink fuera de su raíz. Se comprueba alternativamente `npm run build -- --webpack`, sin alterar configuración versionada.

Revisión independiente de tenant/LLM completada, sin defectos nuevos concretos. Se alineó el contrato PUT con XsrfHeader. Las pruebas existentes `AgentTurnTest` cubren cuota agotada, timeout y fallo del worker con derivación humana; `CopilotTest` cubre sugerencias sin envío y herramientas de solo lectura.

- Suite ampliada Conversations + AgentRuntime + Unit: **253 pruebas / 1347 aserciones aprobadas**, PHP 8.4.26 y MySQL 8.4 (10,47 s). PHPStan completo sin errores; Pint aplicado y comprobado.
- Navegador real: login con administrador sintético, elegir automático, guardar y recargar (persistencia verificada), cambiar a Copiloto y luego apagado con teclado. Gates globales apagados en todas las pruebas; no se llamó a un modelo. Evidencia `/tmp/evp34-modo-copiloto.png`.
- JSONSchema y referencias del contrato validadas; no equivale a validar operación en producción.

## 5. Pendientes y riesgos

- Sin validación de proveedor real, gastos, sesiones móviles físicas ni concurrencia de dos conexiones MySQL simultáneas. La prueba de carrera ejercita un turno ya encolado y un cambio de modo antes de ejecutarlo.
- La política existente deriva inmediatamente chats automáticos recientes (72 horas configurables); los anteriores se recuperan al próximo mensaje o con el reconciliador. No se amplía esa política en este ticket.
- Un modo seleccionado no activa una capacidad apagada globalmente. Los avisos de la UI distinguen elección persistida y disponibilidad.
- Ningún cambio está integrado a `develop` ni desplegado. Revisión humana antes del merge; commit/push/PR autorizados en esta sesión; merge/deploy quedan fuera de alcance.
