# EVP-62 — Staging: error 500 al cargar el panel por ausencia de users.last_active_at

Rama `ticket/EVP-62-staging-last-active-at` · commits pendientes de autorización · fecha 2026-10-24 · autor (Antigravity + Mauro)

## 1. Qué pedía el ticket
El objetivo de **EVP-62** es restablecer el funcionamiento del panel y los servicios de `bellomito-staging` (Railway) tras el error HTTP 500 en `/api/v1/auth/me` y en las rutas autenticadas (`SQLSTATE[42S22]: Column not found: 1054 Unknown column 'last_active_at' in 'where clause'`), aplicando de forma controlada los scripts forward oficiales pendientes y agregando un control preventivo proporcional para evitar que un despliegue futuro active contenedores cuando falten esos esquemas.

### Criterios de aceptación
1. `/api/v1/auth/me` autenticado devuelve `200` sin `SQLSTATE`.
2. Inicio, leads, proyectos, notificaciones y cobranzas responden `200` con los datos reales del tenant `bellomito-staging` en staging, sin errores `500`.
3. Revisión de logs de `api`, `worker` y `scheduler` sin errores por esquema pendiente (`everprop:leads:follow-up-alerts` y `everprop:collections:notify-upcoming` ejecutan con código `0`).
4. Evidencia de esquema y pruebas antes/después, sin secretos ni datos personales.
5. `/readyz` sigue respondiendo `200` y queda documentado su alcance frente a `everprop:production-check --connections`.

### Fuera de alcance
- Modificar el entorno de producción, importar datos comerciales o alterar el alcance liviano de `/readyz`.

---

## 2. Qué se implementó

### A. Diagnóstico y aplicación autorizada de forwards en `bellomito-staging`
1. **Verificación en modo lectura:**
   - Se comprobó que los tres servicios de backend en Railway (`api`, `worker` y `scheduler`, desplegados en el commit `41d2fcb` de `develop`) apuntan a `mysql84.railway.internal:3306` / base `bellomo_crm`.
   - En `bellomo_crm`, `schema_versions` e `information_schema` mostraban aplicados los forwards hasta `2026-10-07.001_rotator_role.sql` (`tenant_tables: 54` vs `58` esperadas; `foreign_keys: 131` vs `138` esperadas), faltando los 7 scripts forward posteriores de `develop`.
2. **Aplicación en orden de los 7 scripts forward oficiales (con autorización expresa):**
   - [`2026-10-07.001_collection_email_attempts.sql`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/database/schema/forward/2026-10-07.001_collection_email_attempts.sql)
   - [`2026-10-11.001_web_push_out_of_hours.sql`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/database/schema/forward/2026-10-11.001_web_push_out_of_hours.sql)
   - [`2026-10-15.001_chatbot_runs_tenant_started.sql`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/database/schema/forward/2026-10-15.001_chatbot_runs_tenant_started.sql)
   - [`2026-10-15.002_collection_email_kind.sql`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/database/schema/forward/2026-10-15.002_collection_email_kind.sql)
   - [`2026-10-20.001_lead_follow_up_alerts.sql`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/database/schema/forward/2026-10-20.001_lead_follow_up_alerts.sql) *(EVP-50)*
   - [`2026-10-21.001_collection_email_sequence.sql`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/database/schema/forward/2026-10-21.001_collection_email_sequence.sql) *(EVP-53)*
   - [`2026-10-22.001_project_landing.sql`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/database/schema/forward/2026-10-22.001_project_landing.sql) *(EVP-55)*

### B. Control preventivo en el arranque de contenedores (`everprop-api`)
- [`everprop-api/app/Console/Commands/ProductionCheck.php`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/app/Console/Commands/ProductionCheck.php#L90-L102): se actualizaron las comprobaciones de `everprop:production-check --connections` (ejecutado por [`docker/production/entrypoint.sh`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/docker/production/entrypoint.sh#L9) antes de iniciar `web`, `worker` o `scheduler`) para verificar también:
  - `web_push_subscriptions.out_of_hours` (`2026-10-11.001`).
  - `Schema: collection email sequence` (`collection_email_attempts.kind`, `upcoming_installment_id`, `sequence_installment_id`).
  - `Schema: follow-up alerts and activity` (`users.last_active_at`, `users.last_nudged_at`, `lead_follow_up_alerts`).
  - `Schema: project landing` (`project_landing`, `project_landing_assets`).
- [`everprop-api/tests/Feature/ProductionEnvironmentTest.php`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/tests/Feature/ProductionEnvironmentTest.php#L40-L46): se amplió la prueba de `everprop:production-check --connections` para verificar las nuevas aserciones de esquema.

---

## 3. Por qué esta solución y alcance de `/readyz`
- **Por qué el despliegue permitió código incompatible con el esquema:**
  - [`docker/production/entrypoint.sh`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/docker/production/entrypoint.sh#L9) ejecuta `php artisan everprop:production-check --connections` al iniciar cada contenedor y aborta el arranque (`set -eu`) si algún check falla, impidiendo que Railway conmute el tráfico hacia un despliegue cuyo esquema aún no fue migrado. Sin embargo, [`ProductionCheck.php`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/app/Console/Commands/ProductionCheck.php) había quedado detenido en `2026-10-07.001_rotator_role.sql` y no verificaba las tablas/columnas agregadas entre el `2026-10-07` y el `2026-10-22`.
- **Alcance de `/readyz` vs. `everprop:production-check --connections`:**
  - `/readyz` ([`ReadinessController.php`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/app/Domain/Shared/Http/Controllers/ReadinessController.php) / [`ProductionDependencies.php`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/app/Support/ProductionDependencies.php)) es un *readiness probe* de alta frecuencia que verifica conectividad viva con MySQL (`SELECT 1`) y Redis (`PING`) en cada ciclo del balanceador, sin consultar `information_schema` en cada request.
  - La verificación estructural de tablas y columnas pertenece al arranque del contenedor (`everprop:production-check --connections` en `entrypoint.sh`), donde se ejecuta una sola vez por despliegue con costo cero durante el tráfico normal.

---

## 4. Cómo se verificó

### Antes vs. Después en `bellomito-staging` (`mysql84` / `bellomo_crm`)
| Verificación | Antes | Después |
|---|---|---|
| `everprop:schema:verify` → `tenant_tables` | `54` (`FAIL`, esperado `58`) | `58` (`PASS`) |
| `everprop:schema:verify` → `foreign_keys` | `131` (`FAIL`, esperado `138`) | `138` (`PASS`) |
| `schema_versions` registrados | Hasta `2026-10-02.001` (11 filas) | Hasta `2026-10-22.001` (18 filas) |
| `GET /api/v1/auth/me` (autenticado) | `HTTP 500` (`Unknown column 'last_active_at'`) | `HTTP 200` (`users.last_active_at` actualizado) |
| `GET /api/v1/admin/notifications/count` | `HTTP 500` | `HTTP 200` |
| `GET /api/v1/admin/leads?per_page=5` | `HTTP 500` | `HTTP 200` |
| `GET /api/v1/admin/projects?per_page=5` | `HTTP 500` | `HTTP 200` |
| `GET /api/v1/admin/payment-agreements?page=1` | `HTTP 500` | `HTTP 200` |
| `GET /api/v1/admin/installments?page=1` | `HTTP 500` | `HTTP 200` |
| `GET /api/v1/public/landing/projects` | `HTTP 500` (`Table 'project_landing' doesn't exist`) | `HTTP 200` (`{"schema_version":"1.0","data":[]}`) |
| `GET /api/v1/public/projects` | `HTTP 500` | `HTTP 200` |
| `GET /readyz` | `HTTP 200` (`{"status":"ready"}`) | `HTTP 200` (`{"status":"ready"}`) |
| `php artisan everprop:leads:follow-up-alerts` | `FAIL` (exit code `1`, `SQLSTATE[42S22]`) | `PASS` (exit code `0`, `Follow-up notifications sent: 0.`) |
| `php artisan everprop:collections:notify-upcoming` | Pendiente de esquema `collection_email_attempts` | `PASS` (exit code `0`) |

### Calidad de código (`everprop-api`)
- `php vendor/bin/pint --test app/Console/Commands/ProductionCheck.php tests/Feature/ProductionEnvironmentTest.php`: **PASS**.
- `php vendor/bin/phpstan analyse --memory-limit=1G app/Console/Commands/ProductionCheck.php tests/Feature/ProductionEnvironmentTest.php`: **PASS** (`[OK] No errors`).

---

## 5. Pendientes y riesgos
- **Tablas globales heredadas en `bellomito-staging`:** `everprop:schema:verify` reporta en `global_tables` tres tablas adicionales (`cache`, `cache_locks`, `sessions`) creadas históricamente cuando el entorno usó driver `database` antes de pasar a `redis`. No afectan el funcionamiento ni el aislamiento multi-tenant, y no se eliminaron para respetar la regla de cambios únicamente aditivos.
- **Antes de pasar estos módulos a producción (`main`):** recordar verificar y aplicar previamente en la base de producción los forwards correspondientes, y verificar dominios definitivos, CORS/R2, Sanctum/cookies y credenciales propias del entorno productivo.
