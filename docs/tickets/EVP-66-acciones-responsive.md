# EVP-66 — Acciones y ayuda contenidas en Mi Día

Rama `ticket/EVP-66-acciones-responsive` desde develop `58a312393662e0818f3157c35a5cac708145159c` · 2026-10-27 · Codex para Álvaro.

## 1. Qué pedía el ticket

EVP-66 incluye el tablero y guiado de Mi Día, controles accesibles y adaptación a teléfono, texto Grande y tema oscuro. Este seguimiento resuelve el recorte de acciones y ayuda observado en staging: a 320 px, Llamar/Registrar resultado llegaban a 345,69 px y la ayuda desplegada a 365,30 px.

Álvaro autorizó tomar el ticket a su nombre y preparar este ajuste local en paralelo a la revisión del PR88. Avisos previos en Jira10191/10192; autorización10195 y asignación a Álvaro/En curso comprobadas antes de editar. No se autorizaron publicaciones ni despliegues de este seguimiento.

## 2. Qué se implementó

Solo cambia `everprop-public/src/app/admin-design.css`:

* La rejilla de acciones usa columnas adaptables con un mínimo de 160 px, limitado por el ancho disponible. Si dos acciones no caben completas, pasan a una columna.
* Bajo 1200 px, las acciones ocupan ambas columnas de la fila para no quedar restringidas a la columna estrecha junto al avatar. El tamaño tablet con sidebar también queda cubierto.
* El enlace de ayuda respeta el ancho de su tarjeta y permite varias líneas. El selector específico prevalece sobre la regla posterior que mantenía las acciones en una sola línea.
* Los segmentos largos de nombres de inmuebles permiten saltos de línea. Los botones de inmuebles y acciones conservan un mínimo táctil de44px en escritorio y52px en móvil, prevaleciendo sobre una regla de tarjetas que los reducía a36px.

Sin cambios a API, permisos, cola, datos, mensajes, lógica de seguimiento, guiado ni dependencias.

## 3. Por qué esta solución

Se reutilizan las tarjetas y acciones actuales. La causa estaba en columnas con mínimo intrínseco y en una regla white-space:nowrap más específica. CSS Grid adapta las columnas sin agregar componentes o cálculos de ancho en JavaScript. En escritorio una columna puede reemplazar dos cuando los textos no caben; se prioriza leer la acción completa.

## 4. Cómo se verificó

* Navegador local con datos mock: 320/375/390/480/768/1024/1440 px con Grande; sin controles de acciones/inmuebles fuera del viewport, texto cortado ni alturas menores al objetivo44/52px. La primera comprobación detectó además el caso tablet de1024, corregido antes de la medición final. Ayuda desplegada revisada sin recortes a320.
* Texto habitual:320/768/1024/1440 sin recortes en los mismos controles.
* Tema oscuro a320 revisado visualmente. Guiado abierto manualmente: diálogo contenido entre0 y320, acciones de52,61px de alto; Ver el tablero completo devuelve al tablero. No se guardaron resultados, clientes ni citas ni se enviaron mensajes.
* `node --test tests/*.test.mjs`:190/190 aprobadas, sin skips. `/tmp/evp66-tests.log`.
* `npm run lint`:0 errores/126 advertencias en el frontend existente. `/tmp/evp66-lint.log`.
* `NEXT_PUBLIC_DATA_MODE=mock npm run build -- --webpack`:aprobado, TypeScript incluido; repetido tras el ajuste de nombres largos. `/tmp/evp66-build-final.log`.
* `git diff --check`:aprobado. No se agregaron pruebas que solo reproduzcan reglas CSS; la comprobación relevante es la geometría renderizada y evidencia visual.
* Evidencia: `docs/tickets/evidence/EVP-66-acciones/mediciones.json`, `mobile-grande.png`, `mobile-oscuro.png` y `ayuda-grande.png`. Se reemplazaron capturas inicialmente tapadas por el aviso de notificaciones; no se usan para acreditar la visualización final.

El primer arranque de desarrollo con Turbopack falló por node_modules enlazado fuera de su raíz; se usó webpack sin cambiar dependencias ni configuración. El servidor local3001 se detuvo al terminar. Se restauró únicamente el texto de AGENTS.md regenerado por Next, ajeno al ajuste.

## 5. Pendientes y riesgos

Preparación local sin commit/push/PR/despliegue. Staging y producción no incluyen todavía este ajuste. EVP-66 permanece En curso: este seguimiento no certifica todos los criterios funcionales del ticket, contraste integral, movimiento reducido ni todos los estados del guiado. Falta validación en Safari iOS/Chrome Android físicos y teclado real. El cambio es CSS compartido dentro de Mi Día; la revisión visual cubre los anchos indicados, no todos los datos posibles.
