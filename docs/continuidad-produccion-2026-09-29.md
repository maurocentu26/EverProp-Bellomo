# EverProp: continuidad hacia producción

Fecha: 29/09/2026. Revisión sobre HEAD `1d66246` con archivos locales sin seguimiento ya existentes. Alvaro es el responsable de decisiones de negocio. Este documento es un punto de partida verificable, no una certificación de producción.

## Estado de esta sesión

- Frontend Next iniciado en http://localhost:3000/login; respuesta HTTP 200 comprobada.
- Docker Desktop recuperado de dos sockets inaccesibles. Se renombraron reversiblemente las carpetas temporales, con Docker detenido: `C:/Users/PC/AppData/Local/Docker/run-backup-20260929-135811` y `C:/Users/PC/AppData/Local/docker-secrets-engine-backup-20260929-135903`. La segunda contenía solamente `engine.sock`. No se reinicializaron volúmenes.
- `docker info` devuelve versión 29.7.2. `start-local.ps1` completado; MySQL, Redis, PHP, Nginx, worker y scheduler saludables. API local en http://127.0.0.1:18082.
- Verificación final: `test-local-app.ps1` terminó con código 0; login y nueve endpoints aprobados para cada uno de los cuatro perfiles locales (36 consultas). `/readyz` respondió HTTP 200. Esto no equivale a un E2E visual ni verifica todas las escrituras.
- Docker también muestra dos contenedores de otro stack: `everprop-api-mysql` reiniciándose y `everprop-api-redis` unhealthy. No se modificaron; el stack activo de esta web es `everprop-collections`, cuyos seis servicios están saludables. Revisar el otro stack si se pretende reutilizarlo para pruebas.
- Frontend: 41/41 pruebas regulares aprobadas; las tres reproducciones aisladas de `docs/audit/frontend-audit.cjs` fallan. Lint: seis errores y 144 advertencias. Los seis errores corresponden a imports CommonJS en ese archivo de auditoría.
- Backend: revisión estática de permisos, batch y pruebas; no se ejecutó la suite contra la base real. No hay build ni revisión visual nueva de todos los recorridos.
- Tres agentes revisaron frontend/QA, backend/seguridad y release/operaciones. No se modificó código funcional ni se hizo commit, push, PR o deploy.
- Skill creada y leída: `C:/Users/PC/.codex/skills/everprop-senior-tech-lead/SKILL.md`. El validador automático requiere PyYAML, ausente en el Python disponible; estructura y contenido revisados manualmente.

## Fuentes que hay que conservar

Leer AGENTS.md raíz y de ambos repositorios; LOCAL-DEVELOPMENT.md; docs/auditoria-panel-2026-09-15/informe.md; everprop-api/docs/REAL-WORKBOOK-IMPORT-2026-09-15.md; everprop-api/docs/inventory-production-import.md; everprop-api/docs/production-release.md y railway-backend.md; everprop-public/docs/qa-panel-2026-09-14.md.

La auditoría del 15/09 contiene A01–A10 y R01/R02. Sus resultados API, PHPStan, build y TypeScript son históricos. No copiar sus cifras como resultados nuevos. La documentación describe 27 proyectos y 3.577 registros importados localmente; reconciliar antes de afirmar conteos actuales o datos en producción.

No se identificó una lista canónica aportada por Alvaro con todas las tareas divididas de propiedades. El siguiente inventario técnico no la reemplaza. Incorporarla íntegra cuando Alvaro la complete, asignar IDs y cruzarla contra estas tareas sin omitir ninguna.

## Equipo y reglas de trabajo

El agente principal actúa como tech lead e integrador. Hasta tres especialistas simultáneos, rotando backend/seguridad, frontend/UX, datos, QA y DevOps. Asignar archivos exclusivos si hay cambios paralelos. Una revisión independiente debe comprobar las correcciones de permisos e importación.

Cada tarea tendrá responsable, dependencias, criterio de aceptación, estado, archivos cambiados y evidencia. Estados: pendiente, en curso, bloqueada, verificada. Todos los ítems siguientes están pendientes de corrección o verificación final; los hallazgos no implican implementación terminada.

## Backlog y criterios de aceptación

| ID | Prioridad / responsable | Trabajo y evidencia inicial | Criterio de aceptación |
|---|---|---|---|
| PROP-01 | P1 Backend/seguridad | Batch omite `setInitialPrices`; AdminPropertyController.php:60–73, 127 | Permisos idénticos en alta individual y masiva para price/corner_price, incluidos cero y null; pruebas negativas |
| PROP-02 | P1 Backend/seguridad | PATCH general acepta status sin permiso PUBLISH; UpdatePropertyRequest.php:39, AdminPropertyController.php:178,244; batch fija AVAILABLE | Transiciones respetan capacidades por todos los endpoints; asesor editor sin PUBLISH no publica |
| PROP-03 | P1 Backend/datos | Batch repetido cambia código pero conserva identidad; controlador:113–118 y forward 2026-09-15.001:25 | Repetición idempotente o conflicto 409 controlado; sin duplicados ni 500; cubrir legacy nulo/no nulo y concurrencia |
| PROP-04 | P1 Backend/seguridad | Crear/mover/batch validan proyecto del tenant, no necesariamente alcance operativo | Proyecto destino autorizado; pruebas fuera de alcance y tenant distinto |
| PROP-05 | P1 CRM/seguridad | Revalidar A01: precio oculto expuesto por intereses CRM | Serialización respeta visibilidad de activo/precio en lista y ficha; regresiones negativas |
| PROP-06 | P2 CRM | Revalidar A03: vinculación nueva con propiedad eliminada | Rechazar nueva relación inválida; conservar historial según contrato |
| PROP-07 | P2 Frontend | Guardado parcial de etapa/interés anuncia éxito; AdvisorCockpit.tsx:278–322; reproducción actual falla | Mostrar resultado parcial/error real; reconciliar con API y recargar sin falso éxito |
| PROP-08 | P2 Frontend/seguridad | READ_ONLY se presenta como ADVISOR; everprop-api.ts:147 y use-current-session.ts:20 | Controles acordes a capacidades; negativos API y navegador por perfil |
| PROP-09 | P2 Identidad | Login depende de localStorage; auth-context.tsx:67; reproducción actual falla | Login, restauración y logout operan con storage bloqueado |
| PROP-10 | P2 Frontend | Matriz convierte 12A/12B a 12; InventoryMatrix.tsx:89 | Identificadores completos y únicos en render, búsqueda, selección y edición |
| PROP-11 | P2 Frontend | Moneda omitida al editar con precio vacío; EditPropertyModal.tsx:31,75 | Contrato explícito para moneda y precio desconocido; selección persiste tras recargar |
| PROP-12 | P2 Frontend/backend | Edición carece de controles equivalentes al alta para datos técnicos, servicios, habitaciones, baños y proyecto | Matriz campo/alta/edición/API; implementar todos los campos requeridos por la lista de Alvaro |
| PROP-13 | P2 QA inventario | Alta, ficha, edición, lotes, estados, filtros, búsqueda, orden, paginación, archivos y exportación | Recorridos reales con errores, doble envío, recarga, móvil/escritorio y cada rol; sin pérdida de datos |
| PROP-14 | P2 Datos | Conciliar proyectos, inventario, UUID, identidad compuesta, tipos, siete estados y catálogos | Informe reproducible contra fuente vigente; nulos y desconocidos conservados, conteos correctos |
| PROP-15 | P2 Datos/Alvaro | Moneda ausente, localidad EdId 57, unidad 59--, superficies cero, proyecto 109 y tipos/estados faltantes según importación histórica | Decisiones de fuente documentadas; no inferir ARS/USD ni completar valores sin evidencia |
| PROP-16 | P2 QA/backend | Concurrencia, versionado, eliminado/restauración si están en alcance y archivos privados | Conflictos controlados, aislamiento, MIME/tamaño y acceso autenticado probados en MySQL aislado |
| CRM-01 | P3 Backend | Revalidar A04: DELETE lead apunta a destroy ausente | Retirar ruta no implementada o cumplir contrato aprobado; nunca 500 por método ausente |
| MOD-01 | P2 Backend/QA | Visitas desde LeadDetailView documentadas en localStorage | Crear/editar/cancelar persiste por API tras recarga; revalidar primero código actual |
| MOD-02 | P2 Negocio/QA | Cobranzas/configuración ocultas; CAC/escalonados documentados como simulación | Acordar alcance; pruebas de cuotas, pago parcial, idempotencia, reversión y saldo antes de habilitar |
| MOD-03 | P2 Push/operaciones | Cola, scheduler, polling, logout por dispositivo | Entrega HTTPS real en teléfono abierto/segundo plano/cerrado; reintentos y jobs fallidos observables, sin fuga tras logout |
| UX-01 | P2 Frontend/QA | Accesibilidad y revisión visual integral pendientes | Teclado/foco/labels/errores, responsive y temas verificados con evidencia |
| QA-01 | P1 QA | Lint falla; tres reproducciones frontend fallan | Corregir causas, integrar regresiones estables a suite; lint y TypeScript aprobados; warnings triados |
| QA-02 | P1 QA | Build y suite API actuales pendientes; PHPStan histórico fallaba | PHP 8.4 + MySQL aislado, Composer/Pint/PHPStan, tests frontend y build aprobados en revisión actual |
| OPS-01 | P1 DevOps | Workflow solo en everprop-api/.github/workflows/ci.yml; falta raíz .github | Workflow monorepo con directorios/montajes correctos y frontend; ejecución remota comprobada tras autorización |
| OPS-02 | P1 DevOps | README manda artisan serve; Railway documenta Nginx/FPM; Redis frente a DB/sync | Perfil de despliegue único y documentación coherente; probar imagen y configuración elegida |
| OPS-03 | P1 DevOps | Readiness no acredita trabajo procesado | TLS/CORS/Sanctum/hosts/proxies; readyz, login, CSRF, roles, workers/scheduler y almacenamiento persistente verificados |
| OPS-04 | P1 Operaciones | Backup/restauración y rollback actuales pendientes | Backup cifrado durable con triggers/routines, hash, restauración aislada y rollback ensayados |
| OPS-05 | P1 Release/datos | Importación local no prueba importación en producción | Seguir inventory-production-import.md: backup, inspección, forward, plan hash, rehearsal, ventana sin escrituras, apply, relaciones, verify y smoke |
| OPS-06 | P1 Tech lead | Cierre de release | Cero bloqueantes abiertos; production-check --connections, --webpush si aplica; evidencia del destino y autorización expresa para deploy |

## Prompt de continuidad para copiar

```text
Actuá como senior tech lead de EverProp para Alvaro. Usá la skill
C:/Users/PC/.codex/skills/everprop-senior-tech-lead/SKILL.md.
Trabajá en C:/Users/PC/Documents/ChatGPT/New project.

Objetivo: completar TODAS las tareas divididas de propiedades que aporte Alvaro,
corregir los bloqueantes comprobados y dejar una entrega verificable para producción.
Leé AGENTS.md raíz y ambos repositorios, LOCAL-DEVELOPMENT.md y
docs/continuidad-produccion-2026-09-29.md. Incorporá íntegra mi lista de tareas;
si aún no está, pedila mientras avanzás en los defectos técnicos conocidos.

Coordiná agentes especializados como equipo senior: backend/seguridad, frontend/UX,
datos/importación, QA y DevOps. Respetá la concurrencia disponible y rotá agentes.
Vos integrás, priorizás dependencias y revisás resultados. Evitá ediciones simultáneas
de los mismos archivos. Asigná revisión independiente a permisos e importaciones.

Revalidá el estado actual antes de usar resultados anteriores. El 29/09 se levantó
frontend en localhost:3000 y API Docker en 127.0.0.1:18082; se recuperaron sockets
temporales de Docker por renombrado reversible, sin reinicializar volúmenes.
Frontend tuvo 41 tests aprobados, 3 reproducciones aisladas fallidas y lint con
6 errores/144 warnings. No se certificaron build, suite API ni UX completa.

Empezá por PROP-01 a PROP-06: permisos de precio/publicación/proyecto, batch
repetido, visibilidad CRM y propiedades eliminadas. Continuá con persistencia,
matriz alfanumérica, moneda/precio desconocido, formularios completos y recorridos
por rol. Cubrí todos los IDs del backlog y mi lista; no cierres solo el camino feliz.
Cada tarea debe tener responsable, dependencias, criterio de aceptación y evidencia.
Corregí y probá en incrementos pequeños; no te detengas en otro diagnóstico.

Protegé los datos reales y cambios locales. PHP/Composer solo en Docker PHP 8.4;
pruebas de integración con MySQL aislado, nunca sobre el inventario real. No
reinicialices ni importes baseline, no cargues demo y no inventes moneda/datos.
No abras credenciales históricas ni expongas secretos. Leé los docs Next instalados
antes de modificar frontend y evitá interferencia entre next dev y build.

Ejecutá gates actuales: tests positivos y negativos de tenant/roles/proyectos,
TypeScript, lint, build, suite API, análisis estático y E2E de persistencia. Prepará CI
correcto para el monorepo, perfil de despliegue coherente, backup/restauración,
rollback y smoke tests. Marcá explícitamente lo bloqueado por acceso o decisiones
de negocio. No equipares contenedores saludables con funcionalidades verificadas.

Avanzá autónomamente con cambios locales reversibles y validaciones autorizadas.
Según AGENTS de la API, commit, push, PR y deploy requieren autorización expresa:
prepará primero el resultado concreto y pedila solo cuando corresponda ejecutarlos.
Terminá informando tareas verificadas, evidencia, pendientes y siguiente acción.
```
