# EVP-16 — Versiones forward duplicadas con prefijo 2026-10-07.001

Rama `ticket/EVP-16-forward-duplicados` (desde `develop`) · fecha 2026-10-13 · Claude Code con Ramiro Ruggeri
Ticket Jira [EVP-16](https://eversys.atlassian.net/browse/EVP-16).

## 1. Qué pedía el ticket

Dos scripts forward tienen la misma versión, `2026-10-07.001`: `collection_email_attempts` y `rotator_role`.

El ticket pide:
- decidir con `schema-migration-guardian` cómo resolverlo sin editar scripts ya aplicados;
- impedir en CI que una versión se repita.

## 2. Diagnóstico

- **El orden es estable:** todos los importadores (`import-schema.ps1`, `api.yml`, `.claude/cloud/up.sh` y `SetupSimulationDatabaseCommand`) ordenan por nombre completo de archivo, así que `collection…` corre siempre antes que `rotator…`, y los dos tocan cosas distintas.
- **No hay choque en `schema_versions`:** solo `collection_email_attempts` registra `2026-10-07.001`; `rotator_role` no registra ninguna versión.
- **Nada depende de esa fila:** que el rol está aplicado lo verifica `production:check`, leyendo el CHECK `ck_users_role`.
- **Hay 8 forwards anteriores que no registran su versión.**

## 3. Qué se implementó

**[tests/Unit/ForwardScriptsTest.php](../../everprop-api/tests/Unit/ForwardScriptsTest.php)** es un test unitario sin base de datos, que corre en CI con la suite. Exige tres cosas:
1. **Nombre:** `AAAA-MM-DD.NNN_descripcion.sql`, en minúsculas.
2. **Sin versiones repetidas.** La única excepción es `2026-10-07.001`.
3. **Cada script registra su propia versión** en `schema_versions`, con `VALUES` o con `SELECT`. Las líneas comentadas no cuentan. Las excepciones son los 8 scripts anteriores.

Las listas de excepciones están en el test, y solo pueden achicarse: un script nuevo que repita versión o no la registre hace fallar el CI con un mensaje que explica cómo corregirlo.

**Documentación**
- `.claude/skills/forward-migration/SKILL.md`: la regla nueva en el paso 2.
- `everprop-api/docs/production-release.md`: explica que el script de `rotator_role` comparte versión y que su aplicación se verifica con `production:check`, no con `schema_versions`.

## 4. Por qué esta solución

- **No se renombra ni se edita ningún script.** Están aplicados en staging, y forward-only no permite tocarlos.
- **No se agregó un forward solo para registrar la versión de `rotator_role`.** No podría usar `2026-10-07.001`, porque es la clave primaria y ya está ocupada, así que necesitaría una versión inventada que no coincide con su archivo. Sumaría confusión sin beneficio, porque nada lee esa fila.
- **El problema real era que nada impedía repetirlo.** El test lo cierra para los scripts nuevos.

## 5. Cómo se verificó

Entorno: contenedor `everprop-lote3-php` (PHP 8.4), 2026-10-13.

| Comprobación | Resultado |
|---|---|
| Test con los scripts reales | OK (3 tests) |
| Con un forward temporal duplicado y sin versión | Fallan las dos reglas, como se esperaba |
| Con un forward temporal nuevo y bien escrito | OK |
| Pint (289 archivos) y PHPStan | OK |
| Revisión `schema-migration-guardian` | Aprueba el enfoque, sin bloqueantes. Se aplicaron sus dos sugerencias: ignorar comentarios y la nota en `production-release.md` |

La suite completa no se corrió en local: el cambio es un test nuevo y documentación. La corre el CI del PR.

## 6. Pendientes y riesgos

- **Fuera de este ticket**, detectado en la revisión: `rotator_role` hace `DROP CHECK` y después `ADD CONSTRAINT`, y en MySQL el DDL no es atómico. Si falla un `UPDATE` en el medio, `users` queda sin el CHECK de roles hasta volver a correrlo. Es de riesgo bajo, porque ya está aplicado.
- **El test es estático:** no detecta un script que registra su versión pero falla antes de llegar a esa línea.
