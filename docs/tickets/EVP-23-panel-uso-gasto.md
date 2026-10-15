# EVP-23 — Panel del asistente: uso y gasto

Rama `ticket/EVP-23-panel-uso-gasto` (desde `develop`) · fecha 2026-10-15 · Claude Code con Ramiro Ruggeri
Ticket Jira [EVP-23](https://eversys.atlassian.net/browse/EVP-23). Es la primera vista del módulo "Panel del asistente"; las siguientes son EVP-24, EVP-25 y EVP-26.

## 1. Qué pedía el ticket

Que el administrador de cada cliente vea cuánto consume la IA antes de encenderla con saldo real (EVP-22):
- el gasto del mes contra el tope, por día;
- las llamadas y los tokens;
- las respuestas frenadas por el tope.

Solo el administrador, y solo los datos de su cliente.

## 2. Qué se implementó

**API:** `GET /api/v1/admin/assistant/usage?period=AAAA-MM` ([AdminUsageController.php](../../everprop-api/app/Domain/Usage/Http/AdminUsageController.php))
- **Gasto del mes:** es la misma cifra que usa `UsageLedger` para frenar, es decir, el costo comprometido más las reservas abiertas. Las reservas abiertas también se informan aparte.
- **Tope del cliente** y el **% usado**.
- **Gasto por día en la zona horaria del cliente:** una llamada a las 02:00 UTC cuenta para el día anterior en Salta.
- **Asistente y copiloto por separado:** respuestas generadas y tokens leídos y escritos.
  - Asistente: también las respuestas frenadas por el tope (`QUOTA_EXCEEDED`).
  - Copiloto: su gasto contra su tope propio. No informa respuestas frenadas, porque un borrador frenado por su tope falla antes de registrarse como corrida.
- **Permiso:** `MANAGE_INTEGRATIONS`, que tienen `TENANT_ADMIN` y `SUPER_ADMIN`. Es el mismo que el de la configuración de IA.
- **`period` validado:** formato `AAAA-MM`, con mes del 01 al 12.

**Índice:** [2026-10-15.001_chatbot_runs_tenant_started.sql](../../everprop-api/database/schema/forward/2026-10-15.001_chatbot_runs_tenant_started.sql)
- Agrega `ix_chatbot_runs_tenant_started (tenant_id, started_at)`, en línea (`INPLACE`, `LOCK=NONE`) y de forma que se puede volver a correr.
- **Por qué:** los índices que había empezaban por sesión o por conversación, así que el panel y el tope mensual del copiloto, que se consulta en cada borrador, recorrían todas las corridas del cliente.
- Es aditivo: se puede aplicar antes o después del deploy.

**Política de releases** ([check-pr-policy.mjs](../../.github/scripts/check-pr-policy.mjs)): se suman las huellas `Domain\Usage` y `/assistant/usage`. Así, la ruta del panel en `routes/api.php`, que es un archivo compartido, no puede llegar a `main` sin que se detecte. Tiene un test nuevo.

**Panel:** `/admin/conocimiento/uso` ([AssistantUsagePanel.tsx](../../everprop-public/src/components/admin/assistant/AssistantUsagePanel.tsx))
- Tres números destacados:
  - gastado;
  - tope, con barra de progreso que se pone ámbar al llegar al 80 %;
  - respuestas frenadas por el tope.
- Gasto por día: gráfico de barras de una sola serie, con el monto al pasar el mouse y una tabla equivalente ("Ver como tabla").
- Detalle del asistente y del copiloto, y selector de mes.
- Acceso "Uso de la IA" desde **Conocimiento IA**, visible solo para quien tiene el permiso.

## 3. Por qué esta solución

- **El administrador ve solo su gasto y su tope:** el tope global de la plataforma es compartido por todos los clientes, y mostrar ese total dejaría ver el consumo de los demás.
- **Reutiliza `UsageLedger::spent` y `tenantCap`:** el panel y el freno nunca muestran cifras distintas.
- **No hay tablas nuevas:** usa `usage_ledger` y `chatbot_runs`. Solo se suma un índice.
- **El módulo de IA no se cuela a producción:** los archivos nuevos están en rutas que la política de releases (EVP-17) ya excluye. Para el único archivo compartido, `routes/api.php`, se sumaron las huellas.
- **Es una subsección de Conocimiento IA y no un ítem del menú:** el menú resalta los ítems por prefijo de ruta, y un ítem hijo habría marcado dos entradas a la vez.

## 4. Cómo se verificó

| Comprobación | Resultado |
|---|---|
| `AssistantUsageTest` (4 tests) | Escritos. Se corren en el CI del PR (ver abajo) |
| Qué cubren | Gasto, tope, % y reservas, agrupados por día local; el mes anterior; otro tenant que no se mezcla. Roles sin permiso dan 403, un `period` inválido da 422 y el host de otro tenant da 404. Respuesta real del asistente y una frenada por el tope, que deriva a un asesor. Gasto del copiloto separado por tenant, con los límites exactos del mes (00:00:00.000 y 23:59:59.999) y la corrida del mes siguiente excluida. `SUPER_ADMIN` ve solo el tenant que resuelve el host |
| Forward 2026-10-15.001 | Aplicado dos veces sobre la base sintética de pruebas sin error; índice verificado y versión registrada. `ForwardScriptsTest` OK |
| Política de releases | 4 tests OK. Prueba de mutación: sin las huellas nuevas, el test falla |
| Pint y PHPStan | OK, en un contenedor sin red ni base de datos. PHPStan detectó que el helper del test pisaba `TestCase::run()`; se renombró |
| Panel: `tsc` y eslint | OK |
| Revisión `tenant-isolation-reviewer` | Sin fugas entre tenants ni hallazgos bloqueantes o altos. Se aplicaron sus 4 hallazgos: huellas, índice, tests faltantes y `blocked_by_cap` del copiloto |
| Revisión `schema-migration-guardian` del forward | Sin bloqueantes. El nombre, la idempotencia y el DDL en línea son correctos, ningún índice existente lo vuelve redundante y no hace falta tocar los contratos. Se aplicó su sugerencia: `lock_wait_timeout = 10` antes del ALTER. Se aplica en staging antes del código, y no va a `main` |

**Los tests de PHP no se corrieron en local.** El contenedor de pruebas monta el checkout principal, que tenía trabajo sin commitear de otra sesión (EVP-20). Un contenedor nuevo sobre este worktree habría tomado la configuración de la base de **desarrollo**, porque `phpunit.xml` no fija la base de pruebas, así que no se corrió para no escribir en esa base. El CI usa siempre una base aislada.

**No verificado:** la pantalla en el navegador.

## 5. Pendientes y riesgos

- **Bordes del mes en la vista por día:** los días se muestran en hora local, pero el período es el mes UTC, igual que en el freno del ledger. La noche del 1.º, en hora de Salta, puede aparecer en el mes anterior. Es coherente con cómo se cobra.
- **Rendimiento:** la agrupación por día se hace en PHP sobre las filas del mes (`ponytail`). Alcanza para el piloto; con decenas de miles de llamadas por mes conviene agruparla en SQL.
- **Ticket aparte:** que `phpunit.xml` fije la base de pruebas, para que los tests nunca dependan de un archivo de entorno.
