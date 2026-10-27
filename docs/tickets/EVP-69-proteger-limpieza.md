# EVP-69 — Proteger la limpieza del borrador y aclarar revisión

27/10/2026 · Álvaro con Codex · rama `ticket/EVP-69-proteger-limpieza`, base develop `52f1d5b`.

## Hallazgo y alcance

En el alta de leads, «Limpiar formulario» ejecutaba `handleReset` inmediatamente. Una pulsación accidental perdía el borrador. Además, el botón de edición decía «Guardar y completar ficha» aunque solo abría un resumen previo al guardado real.

Se prepara este seguimiento dentro de EVP69, asignado a Álvaro y En curso. Aviso previo Jira10181. Solo protege la acción explícita de limpiar en el alta; no modifica Cancelar, enlaces, navegación lateral ni la salida del navegador.

## Implementación

- `NewLeadForm.tsx`: usa `formState.isDirty` leído durante render y las selecciones/búsqueda de interés existentes para reconocer un borrador. «Limpiar» se deshabilita si no hay borrador y abre un Dialog existente si hay datos. «Seguir completando», Enter en esa opción y Escape conservan datos; únicamente «Sí, limpiar formulario» llama al reset existente. Se usa la variante destructiva existente; el foco inicial queda en la opción segura y vuelve al disparador al cerrar.
- «Revisar lead» / «Revisar cambios» identifican el paso previo. «Confirmar y guardar» conserva su comportamiento actual.
- `tests/leads-redesign.test.mjs`: se amplía el harness existente y se agregan dos regresiones de limpieza: borrador con campos modificados e interés seleccionado sin cambios en campos. Cubren cancelación, cierre, confirmación y estado limpio posterior. Se mantienen las pruebas de validación, revisión, error de API y guardado existentes.

Sin dependencias, API, permisos, esquema ni variables nuevas. No se creó ni modificó un cliente, visita o seguimiento durante las pruebas.

## Verificación

- TDD: las dos regresiones fallaron antes porque el reset se ejecutaba inmediatamente (una llamada donde se esperaban cero); después aprobaron.
- Suite frontend188/188 aprobada; build webpack aprobado y TypeScript incluido. ESLint de los archivos modificados:0errores/8advertencias; la versión base del componente también tiene8advertencias. `git diff --check` aprobado.
- Navegador local mock: formulario vacío no permite limpiar; con nombre/teléfono/notas se abre confirmación. Enter en opción segura, Escape y Seguir completando preservan el borrador y restituyen foco. Confirmación explícita limpia. Interés como único cambio también se protege y se limpia solo al confirmar.
- Diálogo con textoGrande20.4px en320/375/390/768/1024/1440px: texto y botones sin recortes ni desborde horizontal, dentro del viewport. Verificación visual normal17px en320px. Capturas móvil/tablet y matriz JSON en `docs/tickets/evidence/EVP-69-limpieza/`.
- «Revisar cambios» visible en edición local; no se guardó ningún registro. Servidor propio3001 detenido; proceso ajeno3000 intacto. Cambio generado por Next en AGENTS.md excluido.

## Entrega y límites

Álvaro autorizó expresamente commit, push y PR y, si CI aprueba, merge y despliegue exclusivamente en staging el 27/10/2026. La prueba remota queda pendiente hasta activar este seguimiento. Los PR85/86 anteriores continúan integrados; no se modificó producción.

Salir mediante Cancelar, enlaces, navegación o cerrar la página aún puede descartar cambios sin esta confirmación. No se afirma protección global de borradores. Sin dispositivo físico, lector de pantalla ni zoom200%; normal/Grande no equivalen a zoom real.
