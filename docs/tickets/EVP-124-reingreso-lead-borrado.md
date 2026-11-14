# EVP-124 — Leads: al eliminar un lead, la misma persona no puede volver a ingresar (HTTP 500)

Rama `ticket/EVP-124-reingreso-lead-borrado` (desde `develop` `36a0474`) · commits: sin commit todavía (pendiente de autorización) · fecha 2026-11-14 · autor: Claude (agente) para Ramiro Ruggeri

## 1. Qué pedía el ticket

Hallazgo P0 de QA en staging. Si un admin elimina un lead (`DELETE /api/v1/admin/leads/{id}`), la misma persona no puede volver a entrar: el siguiente alta pública (`POST /api/v1/public/leads`) devuelve 500 con `1062 Duplicate entry … 'leads.uq_leads_single_open_contact'` desde `CreateOrGetOpenLeadProcedure.php:34`. Afecta a todo lo que pasa por `sp_create_or_get_open_lead`: formulario web, `registrar_interes`, `registrar_contacto`, `derivar_a_asesor` y "crear lead" desde la bandeja de conversaciones. Además, el borrado dejaba las visitas `SCHEDULED` del lead ocultas en la agenda (la agenda filtra `l.deleted_at IS NULL`).

Criterios de aceptación:
1. Alta pública → borrado → alta pública del mismo contacto = 201 con un lead nuevo.
2. Lo mismo vía `registrar_interes`.
3. Las visitas del lead borrado quedan canceladas.

Fuera de alcance: restaurar leads borrados (no existe), cambiar el SP o la columna generada `open_slot`.

## 2. Qué se implementó

- `everprop-api/app/Domain/CRM/Http/Controllers/AdminLeadController.php:618` (`destroy`, cambio en `:636-665`). En una transacción:
  - bloquea primero el contacto (`:640`) y después el lead (`lockForUpdate`), el mismo orden que `sp_create_or_get_open_lead`; si el lead ya fue borrado por otra petición devuelve 404 sin auditar;
  - pone `deleted_at`, **`is_open = 0`** y `updated_at`;
  - cancela las visitas `SCHEDULED` del lead (`CANCELLED`, `cancelled_at`, `outcome = COALESCE(outcome, 'Cancelada: se eliminó el lead.')`, `:651`), como `AdminVisitController::cancel`;
  - registra `audit_logs` (`LEAD_DELETED`, entidad `LEAD`, actor = admin, `before_json {is_open}`, `after_json {is_open:false, deleted:true, cancelled_visits:n}`).
  - Además relanza `HttpExceptionInterface` (`:664`): antes el `abort_unless(… 403)` caía en `catch (\Exception)` y un no-admin recibía **500** en vez de 403.
- `everprop-api/database/schema/forward/2026-11-14.001_close_deleted_open_leads.sql`: forward **solo de datos**, sin DDL. Ver "Estado del forward" en la sección 5: la versión corregida tras la revisión está lista pero el hook impide reescribir el archivo.
  - Versión corregida: `SET SESSION innodb_lock_wait_timeout = 5` y `lock_wait_timeout = 10`; un único corte `@evp124_now = UTC_TIMESTAMP(3)`; en una transacción audita (`SYSTEM`) cada lead con `deleted_at IS NOT NULL AND is_open = 1` (`LEAD_CLOSED_AFTER_DELETE`) y cada visita `SCHEDULED` **futura** de lead borrado (`VISIT_CANCELLED_AFTER_LEAD_DELETE`, `entity_type = VISIT`, `before_json {status, outcome}`, `metadata_json {forward, ticket, lead_id}`); luego cancela esas visitas con `outcome = COALESCE(outcome, …)` y pone `is_open = 0` a esos leads. Las visitas pasadas quedan como están. Termina con `INSERT IGNORE INTO schema_versions ('2026-11-14.001', …)`. Re-ejecutable: cada sentencia solo toca filas que siguen rotas.
- `everprop-api/app/Console/Commands/ProductionCheck.php:110-111`: chequeo `Schema: deleted leads closed` en `--connections` (el forward no cambia esquema; su fila en `schema_versions` es la única huella).
- `everprop-api/tests/Feature/ProductionEnvironmentTest.php:63`: espera `OK Schema: deleted leads closed`.
- Tests:
  - `everprop-api/tests/Feature/CRM/DeletedLeadReentryTest.php:32` (criterios 1 y 3): alta pública 201 → visita `SCHEDULED` y otra `COMPLETED` → asesor borra = 403 → admin borra = 200 → segundo borrado = 404 → lead `is_open = 0`, visita pendiente `CANCELLED` con `cancelled_at`, la completada intacta, una fila `LEAD_DELETED` con actor y `cancelled_visits = 1` → nueva alta del mismo contacto = **201 con otro `lead_id`**.
  - `DeletedLeadReentryTest.php:67` (dos tenants): el admin de B borra el lead de A por su `public_id` → 404; el lead de A sigue `deleted_at NULL, is_open = 1`, su visita sigue `SCHEDULED` y no hay `audit_logs` en ninguno de los dos tenants.
  - `DeletedLeadReentryTest.php:84` (forward, dos tenants): lee el archivo del forward y lo ejecuta con `DB::unprepared`. Tenant A: lead borrado y abierto con visita futura sin `outcome`, visita futura con `outcome` previo y visita pasada. Tenant B: lead vivo del mismo email con visita futura. Tras la 1.ª corrida solo cambia A (lead cerrado, las dos futuras `CANCELLED`, la pasada `SCHEDULED`, el `outcome` previo se conserva), las auditorías llevan el `tenant_id` de A (1 `LEAD` + 2 `VISIT` con `lead_id`); la 2.ª corrida no cambia nada.
  - `everprop-api/tests/Feature/AgentRuntime/AgentTurnTest.php:197` (criterio 2): `registrar_interes` confirmado → admin borra el lead → nuevo `registrar_interes` confirmado = `ok` con otro `lead_id` y un solo lead abierto.

Flujo: el SP busca el lead abierto con `is_open = 1 AND deleted_at IS NULL`; si no hay, inserta. Como ahora el borrado cierra el lead, `open_slot` pasa a `NULL` y el `UNIQUE (tenant_id, contact_id, open_slot)` deja entrar el lead nuevo.

## 3. Por qué esta solución

- **Causa en el lugar compartido.** Revisé todos los caminos que escriben `deleted_at`/`is_open` en `leads` (`grep` en `app/`): el único que borra es `AdminLeadController::destroy`; los que cierran son `store` (crea un contacto nuevo cada vez, no choca) y `update` (WON/LOST → `is_open = 0`). No existe restaurar un lead borrado. El invariante "borrado ⇒ cerrado" se arregla en el único escritor, y el forward repara los datos viejos.
- **No se cambió `open_slot`.** Redefinirla como `CASE WHEN is_open = 1 AND deleted_at IS NULL …` arreglaría los datos viejos sin forward de datos, pero cambiar una columna generada `STORED` reconstruye `leads` con `ALGORITHM=COPY` en producción.
- **Visitas en el forward:** se cancelan solo las `SCHEDULED` futuras de **cualquier** lead borrado (también de un LOST borrado, que estaba igual de oculto). Las pasadas quedan como están: ya están ocultas y cancelarlas inventaría un estado. En `destroy` se cancelan todas las `SCHEDULED` del lead en el momento del borrado, como pedía el ticket.
- **El forward recorre `leads` completa** (no hay índice en `deleted_at`): ejecutarlo en horario de bajo tráfico. Los timeouts de sesión hacen que falle rápido en vez de quedar en cola detrás de una transacción larga; si falla por timeout, se reintenta (es re-ejecutable).
- Reutilizado: patrón de `audit_logs` de `AdminAiSettingsController`/`ConversationControl`, cancelación de `AdminVisitController::cancel`, convención de timeouts de los forwards desde `2026-10-15.001`, `deleteSyntheticTenants` y el fixture de `AgentTurnTest`.
- El reingreso no hereda el asesor del lead borrado (el ruteo "sticky" del SP excluye borrados) y va por round robin. Es el comportamiento actual del SP; no se tocó.

## 4. Cómo se verificó

Entorno: stack Docker aislado `everprop-rag`, contenedor `everprop-rag-php124` (PHP 8.4) sobre `C:\w124\everprop-api`, MySQL `everprop-rag-mysql`, base `bellomo_crm_test` (compartida con otro agente). Fecha 2026-11-14.

- Reproducción sin el fix (stash temporal de `AdminLeadController.php`):
  - `DeletedLeadReentryTest` (1.er test): `Expected response status code [403] but received 500`.
  - `test_interest_after_the_lead_was_deleted_opens_a_new_lead`: `1062 Duplicate entry '…-1' for key 'leads.uq_leads_single_open_contact' at …/CreateOrGetOpenLeadProcedure.php:34`, el error de staging.
- Tests del ticket:
  - `--filter=DeletedLeadReentryTest` contra el archivo del forward **actual** (pre-revisión): 2 passed, 1 failed; el test del forward falla como corresponde (cancela la visita pasada y no audita visitas).
  - Mismo filtro con el SQL corregido (copia temporal en `tests/`, ruta del test cambiada solo para esa corrida y luego restaurada): **3 passed (24 assertions)**.
  - `--filter=test_interest_after_the_lead_was_deleted_opens_a_new_lead`: 1 passed (12 assertions).
- Forward corregido aplicado con `mysql` dos veces sobre un tenant sintético (`evp124-forward-probe`: lead borrado `is_open = 1`, visita `SCHEDULED` futura, `SCHEDULED` pasada y `COMPLETED`):
  - antes: leads borrados abiertos (global) 1; visitas `SCHEDULED,SCHEDULED,COMPLETED`; auditorías del tenant ninguna; versión registrada 1 (de la corrida anterior).
  - 1.ª ejecución (exit 0): 0; `CANCELLED:Cancelada: se eliminó el lead.,SCHEDULED,COMPLETED`; auditorías `LEAD,VISIT`.
  - 2.ª ejecución (exit 0): sin cambios → idempotente. Luego se borraron las filas del tenant sintético.
- Suite completa (después de la revisión, una corrida): 1 failed, 1 skipped, 569 passed (5484 assertions). La única falla es `DeletedLeadReentryTest > the forward closes deleted open leads only and is rerunnable`, esperada mientras el archivo del forward no se reemplace por la versión corregida. Rondas anteriores tuvieron fallas ajenas por la base compartida (deadlocks, `WhatsAppParallelQueueTest`, `ModelEvalTest`) que pasaron al repetirlas.
- `vendor/bin/pint --test`: PASS, 341 files. `vendor/bin/phpstan analyse --memory-limit=1G`: `[OK] No errors`.
- No verificado: staging ni producción (no se tocaron); la carrera `destroy` ↔ SP (orden de bloqueos) se razonó, no se probó con concurrencia real.

## 5. Pendientes y riesgos

- **Estado del forward (bloqueante):** el hook `.claude/hooks/guard.mjs` bloquea reescribir cualquier archivo existente en `database/schema/forward/`, aunque este nunca se commiteó ni se aplicó fuera de `bellomo_crm_test`. El agente no lo esquivó. El contenido corregido está probado y hay que reemplazar el archivo a mano (o autorizar que el agente borre el archivo no versionado y lo cree de nuevo). Hasta entonces, el test `DeletedLeadReentryTest::test_the_forward_closes_deleted_open_leads_only_and_is_rerunnable` falla.
- **Aplicar el forward en staging y producción** requiere autorización expresa (ver más abajo).
- **`origin/main` tiene el mismo bug** (`destroy` en `main` solo pone `deleted_at`, mismo `uq_leads_single_open_contact`, y el formulario web de `main` usa `CreateOrGetOpenLeadProcedure`). Llevarlo a `main` requiere un `hotfix/*` aparte con este `destroy` y el forward (sin el test de `AgentTurnTest`, que es del módulo IA), con el mismo orden de despliegue.
- Integra el coordinador o quedan para otro ticket: incremento de `leads.version` en `destroy` (depende de EVP-134), `visit_requests` CONFIRMED, autorización por `Capability` en `destroy`.
- Fuera de alcance, para tickets nuevos:
  - **Reabrir un lead cerrado con otro abierto:** `update` con etapa no terminal sobre un WON/LOST pone `is_open = 1`; si el contacto ya volvió con otro lead abierto, choca con el mismo `UNIQUE` y devuelve 500 genérico. Debería responder 409/422.
  - `chatbot_sessions.lead_id` y `conversations` pueden seguir apuntando al lead borrado.
  - `visit_requests` `REQUESTED` cuelgan del contacto, no del lead: no se cancelan al borrar el lead.
- El test del forward ejecuta el script real sobre toda la base de tests (es global por diseño): repara también filas rotas de otros tenants sintéticos si las hubiera.
- `origin/develop` avanzó (`36a0474` → `4422bc3`); el coordinador integra EVP-134 y actualiza la rama. Confirmar entonces que ningún forward nuevo usa la versión `2026-11-14.001`.

### Cómo aplicar el forward en staging y producción

El entrypoint corre `everprop:production-check --connections`, que exige la fila `2026-11-14.001`: desplegar primero el código tumba el arranque. Y si se aplica el forward antes, la app vieja sigue borrando leads sin cerrarlos durante la ventana. Por eso el script se corre antes **y** después del despliegue:

1. **Chequeos previos** (solo lectura):
   - `SELECT version FROM schema_versions ORDER BY version;` contra `everprop-api/database/schema/forward/`: aplicar en orden los forwards pendientes anteriores a `2026-11-14.001`.
   - Guardar los ids afectados (para poder revertir):
     ```sql
     SELECT tenant_id, id FROM leads WHERE deleted_at IS NOT NULL AND is_open = 1;
     SELECT v.tenant_id, v.id, v.lead_id, v.status, v.outcome, v.scheduled_at
       FROM visits v JOIN leads l ON l.tenant_id = v.tenant_id AND l.id = v.lead_id
      WHERE l.deleted_at IS NOT NULL AND v.status = 'SCHEDULED' AND v.scheduled_at >= UTC_TIMESTAMP(3);
     ```
   - Backup de la base (en producción, obligatorio). Elegir horario de bajo tráfico.
2. **Aplicar el forward** con el cliente `mysql`, sin `--force` (que se detenga ante el primer error): `mysql <base> < everprop-api/database/schema/forward/2026-11-14.001_close_deleted_open_leads.sql`. Si falla por timeout de bloqueo, reintentar.
3. **Desplegar** el código.
4. **Volver a ejecutar el mismo script** (re-ejecutable) para cerrar los leads que la app vieja borró durante la ventana.
5. **Verificar:**
   - `SELECT COUNT(*) FROM leads WHERE deleted_at IS NOT NULL AND is_open = 1;` = 0.
   - `SELECT entity_type, COUNT(*) FROM audit_logs WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.forward')) = '2026-11-14.001' GROUP BY entity_type;` coincide con los ids del paso 1 (más los de la ventana).
   - `php artisan everprop:schema:verify` y `php artisan everprop:production-check --connections` (debe mostrar `OK Schema: deleted leads closed`).
   - Desde el navegador del entorno: alta por formulario con un email de prueba → borrar el lead como admin → nueva alta con el mismo email = lead nuevo; una visita pendiente del lead borrado queda cancelada.
6. **Revertir** (si hiciera falta): con los ids del paso 1, `UPDATE leads SET is_open = 1 WHERE tenant_id = ? AND id IN (…)` (solo si el contacto no tiene ya otro lead abierto; vuelve a bloquear el reingreso de esos contactos, así que es una vuelta atrás completa, no un arreglo) y `UPDATE visits SET status = 'SCHEDULED', cancelled_at = NULL, outcome = <outcome guardado> WHERE tenant_id = ? AND id IN (…)`.
7. **Producción, además:** verificar los accesos de producción antes del despliegue (forwards pendientes en `schema_versions`, dominios, CORS/R2, `tenant_domains`/Sanctum/cookies, credenciales de proveedores, base y storage). Una prueba local o de staging no valida producción.

## 6. Revisión independiente (aislamiento + migración) y cambios

Sin fugas entre tenants. Hallazgos y qué los cerró:

| Hallazgo | Cambio |
|---|---|
| ALTO: orden de despliegue (production-check exige la fila; ventana con la app vieja) | Sección "Cómo aplicar": forward → deploy → forward otra vez → verificar; `mysql` sin `--force`. Vale también para un hotfix en `main`. |
| MEDIO: timeouts del forward | `SET SESSION innodb_lock_wait_timeout = 5` y `lock_wait_timeout = 10` en el SQL corregido; nota de recorrido completo de `leads` y horario de bajo tráfico (sección 3). |
| MEDIO: visitas canceladas sin trazabilidad | Forward: solo `SCHEDULED` con `scheduled_at >= UTC_TIMESTAMP(3)`, auditoría `VISIT` por visita antes del `UPDATE`, `COALESCE(outcome, …)`. `destroy`: `COALESCE(outcome, …)` (`AdminLeadController.php:651`). `SELECT` previo con ids para revertir (paso 1 y 6). |
| MEDIO: tests con dos tenants | `DeletedLeadReentryTest.php:67` (DELETE cruzado → 404, nada cambia, sin auditoría) y `:84` (forward ejecutado desde PHPUnit con `DB::unprepared`, solo cambia A, auditoría con `tenant_id` de A, 2.ª corrida sin cambios). |
| BAJO: carrera con el SP | `destroy` bloquea contacto y luego lead, mismo orden que el SP (`AdminLeadController.php:640`). |
