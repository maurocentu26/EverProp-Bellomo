# EVP-66 — Editor del recorrido guiado dentro de pantalla

Rama `ticket/EVP-66-editor-guiado-responsive` desde develop `5e2e416167b06e25888c7d9a464acd44e47c4190` · 2026-10-27 · Codex para Álvaro.

## 1. Qué pedía el ticket

Mi Día y su recorrido guiado deben poder operarse en móvil y escritorio sin recortes y con controles fáciles de pulsar. Este seguimiento corrige el formulario «¿Qué pasó?» de la guía. EVP-66 permanece En curso y asignado a Álvaro, verificado en Jira antes de editar.

## 2. Qué se implementó

En `everprop-public/src/app/admin-design.css`, la variante móvil `.day-guide-editor` elimina con prioridad la traslación de centrado heredada del diálogo. Esa traslación desplazaba el formulario pese a estar anclado al borde inferior. El cierre de esta variante tiene un área mínima de 52 × 52 px y no se comprime en la cabecera.

No cambian el editor compartido, el guardado, validaciones, datos, permisos, API, llamadas ni orden de contactos. Los otros usos de LeadFollowUpEditor no reciben esta clase.

## 3. Por qué esta solución

Se conserva el diálogo existente y el diseño móvil de panel inferior. Dos ajustes CSS resuelven la colisión sin reemplazar componentes ni añadir dependencias. `translate: none !important` evita que la utilidad de centrado de Tailwind vuelva a desplazar esta variante móvil; no modifica el centrado de tablet/escritorio.

## 4. Cómo se verificó

- Reproducción estable en staging, 320 px y texto Grande: editor con left=-160, top=-342 y translate=-50% -50%, después de finalizar la animación. Captura `evp66-editor-recortado-staging-320.png` en los artefactos de sesión.
- `node --test tests/*.test.mjs`: 190 aprobadas, cero fallos. Son pruebas de lógica existente; el posicionamiento se comprueba en el navegador, no mediante una aserción que copie el CSS.
- `npm run lint`: exit 0, cero errores y 126 advertencias existentes.
- `NEXT_PUBLIC_DATA_MODE=mock npm run build -- --webpack`: exit 0, incluye TypeScript. Comprobación sobre build de producción servido localmente, no solo desarrollo.
- Navegador con texto Grande: 320, 375, 390, 480, 767, 768, 1024 y 1440 px. Tras estabilizar transiciones, editor dentro del viewport, sin desborde horizontal; cierre 52 × 52 px. A 320 px: left=0, right=320, top=72, bottom=900. A 768 px: top=19,20 y bottom=880,80 sobre alto de 900 px.
- Campos inferiores accesibles por teclado y desplazamiento interno; cabecera y acciones permanecen accesibles. Cancelar devuelve al mismo contacto, Paso 1 de 2, sin registrar seguimiento. No se pulsaron enlaces de llamadas ni se enviaron mensajes.
- Evidencia fuera de Git: `cierre-meta/evp66-editor-guiado-local-320.png` y `evp66-editor-guiado-mediciones.json` en el directorio de visualizaciones de esta sesión.

## 5. Pendientes y riesgos

Álvaro autorizó commit, push y PR y, si CI pasa, merge y despliegue exclusivamente en staging el 27/10/2026. Solicitó pausar el trabajo al terminar esta entrega. La verificación remota queda pendiente del despliegue de este seguimiento.

Sin validación en Safari/iOS o Android físicos ni con teclado virtual. No se guardaron seguimientos reales; las pruebas existentes cubren éxito/error/cancelación. Este ajuste no certifica todo EVP-66 ni todo el panel. Producción fuera de alcance.
