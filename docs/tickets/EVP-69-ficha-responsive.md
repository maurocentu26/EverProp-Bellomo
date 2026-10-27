# EVP-69 — Tarjeta de seguimiento sin recortes

27/10/2026 · Álvaro con Codex · rama `ticket/EVP-69-ficha-responsive`, base develop `f07b2df`.

## Alcance y causa

Seguimiento del objetivo de lectura responsive dentro de EVP69, asignado a Álvaro y En curso. Aviso Jira 10176 previo al cambio. No cambia el parche de etapas ya desplegado mediante PR85.

La ficha ficticia de staging a 320px con texto Grande mostraba desborde interno de «Tu próximo paso»: sección de 278px y botón de 284.375px (right322.375px). Medir solo scrollWidth del documento no lo detectaba, porque otro contenedor recorta el contenido. Reproducido también con el lead mock l1 antes del ajuste.

El Grid sin una columna explícita usa el ancho mínimo intrínseco del contenido. Además, una regla posterior de `.lead-detail [data-slot="button"]` obliga a mantener el texto en una sola línea.

## Implementación

Solo `everprop-public/src/app/admin-design.css`: columna `minmax(0, 1fr)` en `.lead-next-step` y excepción limitada a su botón para `height: auto; white-space: normal`. Se conserva fuente, padding, iconos, permisos, estado disabled y lógica. Sin API, esquema, dependencias o variables nuevas.

## Verificación

- Antes: desborde reproducido con fuente20.4px en 320px, sección y botón excedidos.
- Después: seis anchos320/375/390/768/1024/1440px con fuente17px y20.4px. Doce mediciones sin hijos recortados dentro de la tarjeta; botón sin overflow y altura mínima conservada. A320px Grande el texto ocupa dos líneas y el botón mide83.22px de alto; su ancho queda dentro de la tarjeta.
- Fuente y cantidad de líneas verificadas en navegador. En pantallas estrechas se conserva desplazamiento vertical y las etiquetas pueden saltar de línea.
- Suite frontend186/186 y build webpack aprobados. `git diff --check` aprobado. Ajuste CSS de bajo impacto comprobado visualmente, sin pruebas artificiales de cadenas CSS.
- Evidencia en `docs/tickets/evidence/EVP-69-ficha/`: captura móvil320px y matriz JSON antes/después.
- Puerto3000 ocupado por un proceso ajeno; se usó3001 sin interrumpirlo. Servidor propio detenido. Cambio automático de Next en AGENTS.md excluido.

## Entrega y límites

Álvaro autorizó expresamente commit, push y PR y, si CI aprueba, merge y despliegue de este seguimiento exclusivamente en staging el 27/10/2026. La verificación remota queda pendiente hasta que Railway active el nuevo commit. No se modificó producción ni configuración de entorno.

No se creó ni modificó ningún lead, seguimiento, visita o asignación. No se probó dispositivo físico, lector de pantalla ni zoom200%. Esto verifica la tarjeta de seguimiento, no certifica toda la ficha ni el panel.
