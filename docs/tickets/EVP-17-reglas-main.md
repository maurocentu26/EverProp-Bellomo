# EVP-17 — Reglas para los PR hacia main

Rama `ticket/EVP-17-reglas-main` · publicación autorizada 2026-10-14 · validación 2026-10-13 · autor Codex / Alvaro Ruggeri

## 1. Qué pedía el ticket

Definir y validar las ramas que pueden proponer cambios a producción. Decisión de Producto recibida en esta sesión: permitir `release/*` y `hotfix/*` hacia `main`, rechazar `develop` directo y conservar la prohibición del módulo IA/conversaciones en producción. Se conserva la regla existente para PR hacia `develop`. Fuera de alcance: merge, deploy, cambiar protecciones remotas y limpiar módulos de una release real.

## 2. Qué se implementó

- `.github/workflows/ticket-branch.yml`: aplica también a `main`, con permiso de lectura mínimo, checkout del SHA exacto de la rama propuesta, sin persistir credenciales. Conserva el job `name`. Para PR hacia main obtiene los scripts desde `develop` en un checkout hermano confiable y registra su SHA; el PR no decide qué script se ejecuta. Primero debe integrarse este ticket a `develop`.
- `.github/scripts/check-pr-policy.mjs`: `develop` admite los mismos nombres de ticket y la excepción `main`; `main` admite solamente `release/*` y `hotfix/*`. Para producción revisa **todos los archivos del árbol del PR**, no el diff: bloquea los dominios AgentRuntime, Conversations y Usage, configuración, comandos, scripts SQL y UI del módulo. También busca referencias residuales en código compartido (imports, rutas y widget).
- `.github/scripts/check-pr-policy.test.mjs`: pruebas sin dependencias con Git temporal, incluidos módulos heredados sin modificación en el último commit y referencias que sobreviven al borrado de carpetas.
- `TICKETS.md` y `docs/proceso-de-trabajo.md`: documentan la política y la protección remota necesaria.

No hay migración, cambio de runtime ni modificación de secretos.

## 3. Por qué esta solución

Se extiende el check existente, manteniendo su nombre y validación de tickets. Un diff no alcanza: una rama creada desde develop hereda el módulo aunque el cambio de ese ticket sea ajeno a IA. Inspeccionar el árbol completo impide ese falso aprobado. Los flags apagados no equivalen a excluir el código.

La lista de rutas y referencias corresponde al módulo actual; no es un análisis semántico universal. Cuando se agreguen o renombren puntos de entrada deben actualizarse la política y sus pruebas. Documentación histórica y fixtures de evaluación no se confunden con código ejecutable.

## 4. Cómo se verificó

- `node --test .github/scripts/check-pr-policy.test.mjs`: 4 pruebas aprobadas, cubriendo los nombres permitidos/rechazados y un repositorio Git temporal limpio, módulo heredado, import residual y manifest con ruta `/admin/conversaciones`. También se verifica que el script confiable rechaza un PR cuyo script propio devuelve éxito incondicional.
- Ejecución CLI para `BASE=develop HEAD=ticket/EVP-17-reglas-main`: aprobada.
- Ejecución sobre el SHA real de `origin/main` con nombre `release/prueba`: rechazada correctamente por referencias existentes en `everprop-public/src/app/manifest.ts` a `/admin/conversaciones`.
- Revisión de whitespace con `git diff --check`: aprobada.

No se ejecutó GitHub Actions remoto, build de producto ni suites de API: no cambia runtime. No hay queries, jobs ni lógica LLM; las revisiones de aislamiento de tenants y LLM no aplican.

## 5. Pendientes y riesgos

- **Protección remota:** el administrador debe exigir el check `Ticket branch / name`, revisión humana y controles de push/bypass. El workflow y el script también necesitan revisión obligatoria (o un required workflow administrado desde un ruleset): aunque la política se carga desde develop, un PR puede editar el YAML que la ejecuta. Develop debe estar protegido y la política allí debe existir antes de habilitar este workflow. Este cambio no configura ni garantiza esa protección remota.
- **Hallazgo existente en main:** el manifest de producción aún enlaza `/admin/conversaciones`. El guard falla de forma conservadora hasta que otro ticket retire esas referencias de la release; no se modificó ese archivo aquí.
- Preparar releases limpias de IA/conversaciones requiere trabajo deliberado. Un PR desde `release/*` recién creado de develop fallará hasta limpiar el árbol.
- Commit, push y PR autorizados el 2026-10-14; sin merge ni despliegue. El merge y cualquier excepción de protección quedan a cargo humano.

Bootstrap: los PR hacia `develop` ejecutan y prueban los scripts propuestos, conservando el flujo existente y permitiendo integrar EVP-17 por primera vez. Solo los PR hacia `main` usan la política confiable de `develop`; esta debe existir allí antes de abrir una release. La revisión y protección de develop siguen siendo necesarias.
