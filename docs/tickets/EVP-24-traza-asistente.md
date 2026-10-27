# EVP-24 — Traza del asistente para el admin

Rama `ticket/EVP-24-traza-asistente` desde `origin/develop` (`64ea4af`). Fecha: 2026-10-27.

## Qué hace
- `GET /api/v1/admin/conversations/{id}/trace` (solo `TENANT_ADMIN`, throttle 60/min): últimos 20 turnos con pregunta, respuesta, conocimiento usado (título, sección, extracto de 600 caracteres), herramientas (nombre, ok/código, repetida), control de salida, modelo, tokens y costo.
- Bandeja: menú "Traza del asistente" visible solo para el admin; diálogo que muestra todo como texto plano.

## Decisiones de seguridad
- Todas las consultas filtran `tenant_id`. Otro tenant recibe 404; asesor y gerente de ventas reciben 403.
- Nunca salen `error_message` del proveedor, argumentos de tools ni el prompt (test con `SECRETO-PROVEEDOR-991`).
- Documentos revocados o no aprobados: se muestran como "ya no disponible", sin el texto.
- `guard` solo devuelve códigos (`^[A-Z0-9_]{1,64}$`).

## Límites conocidos
- **Argumentos de herramientas:** no se guardan (solo un hash), así que la traza no los muestra.
- **Versión del documento:** `trace.sources` guarda `public_id#ordinal` sin versión. Si el documento se reversionó, el extracto mostrado es el de la versión vigente. Para arreglarlo hay que guardar la versión en la traza (ticket aparte).
- Se leen todos los chunks de los documentos citados y se devuelven solo los citados (sobrelectura chica, no es una fuga).
- Falta un test que siembre conocimiento y ejercite `sources` (y el caso cross-tenant del join).

## Revisión
- `tenant-isolation-reviewer`: sin hallazgos altos. Los medios (revocados, test de fuentes) quedaron arreglados o anotados arriba.
- `llm-security-reviewer`: sin hallazgos altos. Revocados y allowlist de `guard` arreglados; invariante de render anotada en el componente.

## Evidencia
- Frontend: 187/187 tests, `tsc` OK, lint 0 errores.
- Backend: **no corrido local**. MySQL no arranca porque falta `.docker/secrets/redis.acl` (EVP-70). Pint, phpstan y los tests corren en CI cuando se abra la PR.
