# EVP-83 — Conversaciones como WhatsApp (EVP-82 / EVP-84)

Rama `ticket/EVP-83-conversaciones-como-whatsapp` · fecha 2026-10-27 · autor Codex para Ramiro · cambios sin commit ni push.

## 1. Qué pedía el ticket

Historial y compositor móviles sin saltos, huecos ni solapamientos; encabezado compacto; acciones secundarias reunidas; escritorio con columnas que ocupan el área de trabajo. Solo frontend, sin API, contratos ni datos.

Ramiro y Claude, orquestador con acceso a Jira, confirmaron en el chat que EVP-82, EVP-83 y EVP-84 existen, están asignados a Ramiro y En curso, y autorizaron el alcance conjunto en esta rama y avanzar sin esperar la revisión anterior. El conector de esta sesión devolvió `Unknown tool`: no pude leer ni actualizar Jira directamente.

## 2. Qué se implementó

Archivos:

- `everprop-public/src/components/admin/conversations/ConversationInbox.tsx`: viewport, seguimiento del historial, encabezado, compositor y hoja de acciones.
- `everprop-public/src/app/admin-design.css`: layout de chat y escritorio, burbujas, foco táctil y hoja responsive. Reglas móviles nuevas bajo `@media (width < 768px)`.
- `everprop-public/tests/conversation-composer.test.mjs`: adaptación al diálogo existente y cobertura de nota/adjuntos y permisos de lectura.
- `everprop-public/tests/conversation-whatsapp-layout.test.mjs`: regresión del padding, botones duplicados y comportamiento real del hook con viewport/rAF simulados.
- Este informe.

Causas y correcciones de los síntomas:

| Síntoma | Evidencia / causa | Cambio |
| --- | --- | --- |
| Historial trabado | `visualViewport.scroll` llamaba directamente a `fit`, reescribiendo top/height aun sin cambios. | Eventos agrupados por rAF; solo escribir dimensiones distintas; ignorar scroll sin teclado y pinch zoom. Scroller nativo con overscroll contenido. ResizeObserver conserva el final ante cambios de compositor/viewport; carga de imágenes también lo conserva. |
| Cuadrado azul al abrir teclado | No reproducido visualmente. Había un hueco de fondo y el textarea recibía outline azul con `:focus-visible`; los campos de texto pueden coincidir con ese selector incluso con interacción táctil. Tap highlight solo estaba neutralizado para botones/enlaces. | Eliminar hueco, fondo continuo del chat, tap highlight transparente también en campos/labels y suprimir outline/ring táctil móvil. Tab físico habilita el foco visible; pointerdown vuelve a modalidad táctil. Confirmación pendiente en celular real. |
| Última burbuja tapada / espacio vacío | `.advisor-mobile-shell .wa-inbox .wa-fullscreen` reservaba `100px` para un dock oculto. Reglas CSS de grilla competían con las clases flex del compositor. | Eliminar reserva del dock y grilla; columna con alto de viewport visual, historial `flex:1; min-height:0` y compositor que ocupa su espacio real. El botón de nuevos queda dentro del área del historial. |
| Encabezado alto/desordenado | Grilla móvil de tres columnas, avatar oculto, estado independiente y controles secundarios; reglas permitían partir nombre y estado. | Una fila con volver, avatar y bloque de identidad; nombre y canal/estado/ventana con elipsis y title completo. |
| Acciones dispersas | Rápidas, nota, adjunto, sugerencia, cliente y control repartidos en header/compositor/Más; acciones de control y ficha duplicadas. | Un único acceso junto al campo; hoja móvil y popup de escritorio, acciones agrupadas, deshabilitadas con explicación y sin duplicados de lanzamiento. |

Compositor: textarea con borrador controlado, crecimiento hasta aproximadamente cinco líneas y scroll interno; ajuste de altura también para navegadores sin field-sizing. Envío circular; `enterKeyHint="send"`, `inputMode="text"`, `autoComplete="off"`; mantiene salto de línea táctil y no envía durante composición IME. La nota conserva su color y el borrador de respuesta; Adjuntar se deshabilita durante una nota para impedir enviar un caption oculto.

Burbujas: máximo 80%, saltos naturales de palabras y `overflow-wrap:anywhere` para cadenas que no entran. Hora y estado siguen en una fila separada dentro de la burbuja y pueden envolver. Se conservan tokens oscuros y tamaño Grande.

Escritorio: sin padding exterior del área de conversaciones ni separación/tarjetas entre columnas. Lista, historial y ficha mantienen scroll propio. La ficha se muestra como tercera columna desde el breakpoint existente (1200px); en pantallas intermedias conserva la apertura del panel.

Inventario de acciones: respuestas rápidas (insertar/guardar/borrar en su editor), nota interna / volver a respuesta, adjuntar, sugerencia de IA (revisar/usar/descartar), plantilla aprobada (elegir/completar/enviar), ver cliente/solicitudes, lead y visita, tomar control, pasar a IA con motivo, liberar envío sin confirmar, reabrir y cerrar conversación. Guardar/borrar rápidas y completar plantillas son pasos de sus editores, no lanzadores duplicados.

El único acceso «Acciones» está a la izquierda del compositor: es el lugar estable para acciones sobre lo que se escribe, incluso en modo nota o sin control. Se eligió esa alternativa del brief en lugar de repetir un segundo lanzador en el encabezado. En lectura solamente queda disponible para consultar cliente y explica por qué no se permiten mutaciones.

Se reutilizó `Dialog` del proyecto (Base UI): foco atrapado, Esc, backdrop y botón cerrar. Al cancelar devuelve foco al lanzador; al elegir nota, cliente o devolución a IA lo lleva al destino correspondiente. Hoja desplazable con safe-area y límites del viewport visual. Cerrar conversación, liberar envío y borrar una respuesta rápida piden confirmación. No se agregaron dependencias.

Se conservan los handlers y llamadas existentes de selección profunda `?c=`, título/contadores, history, handoff/epoch, idempotencia, envío y límites de adjuntos. No hay esquema, variables ni configuración de entorno nuevos.

## 3. Por qué esta solución

Se corrigieron reglas compartidas que causaban el layout y el listener existente de viewport, evitando guards por pantalla. No se reemplazó el transporte ni se creó otro sistema de scroll o de borradores. La única observación nueva de tamaño sigue el fondo cuando el usuario ya estaba allí; si está leyendo arriba, conserva su posición y el aviso de mensajes nuevos.

Se eliminaron CSS de grilla y controles duplicados antes de añadir el layout definitivo. Los cambios al área de trabajo usan `:has(.wa-inbox)` para limitar su alcance a conversaciones, sin modificar el shell de otras páginas.

## 4. Cómo se verificó

- `npx tsc --noEmit`: código 0.
- `npx eslint src/components/admin/conversations/ConversationInbox.tsx tests/conversation-composer.test.mjs tests/conversation-whatsapp-layout.test.mjs`: código 0, **0 errores**, 1 advertencia preexistente de `react-hooks/set-state-in-effect` en el efecto de deep link.
- `node --test --test-isolation=none tests/*.test.mjs`: **183 tests, 174 pasan, 9 fallan**. Las 6 fallas de `notifications-worker.test.mjs` corresponden a `navigator.clearAppBadge/setAppBadge` del mock conocido. Además, la rama ya contiene 3 fallas en `mi-day-conformity.test.mjs`: falta el mock de `LeadConversationLink`. Se ejecutó ese archivo aisladamente y se verificó con `git diff --exit-code HEAD` que el test, AdvisorCockpit y sus módulos de cálculo no tienen cambios. No se corrigieron problemas ajenos a este alcance.
- Los 7 tests de compositor y layout pasan; cubren borrador de sugerencia, envío con atribución, nota que impide adjuntar, lectura sin mutaciones, destino de foco al cliente y retorno al lanzador, ausencia de reserva de dock/duplicados y agrupación rAF con escrituras solo al cambiar dimensiones y limpieza al cerrar.
- `git diff --check`: sin errores.
- Detector Impeccable sobre TSX y CSS: 3 advertencias `gray-on-color` en CSS preexistente de otra superficie (línea 130), sin hallazgos sobre reglas nuevas.
- Revisión independiente de frontend/aislamiento: corrigió los dos hallazgos de adjuntos en nota y foco al abrir cliente; segunda revisión sin otras regresiones materiales. No se modificaron contratos ni aislamiento de servidor.

Navegador: el comando habitual de Next falló por `spawn EPERM`. Un arranque directo del servidor anunció ready en localhost:3165, pero posteriormente también terminó por `spawn EPERM`. Computer Use negó acceso a Google Chrome y Playwright CLI falló al lanzar su daemon por `spawn EPERM`, incluso redirigiendo su caché al workspace. No se obtuvieron capturas ni comprobación de estilos computados/renderizado; no se afirma que se reprodujo el cuadrado azul. Solo se simuló el viewport en el test del hook (800→480, offset 30→0) y se inspeccionó el CSS estático.

No se iniciaron contenedores Docker. El servidor de prueba no quedó activo.

## 5. Pendientes y riesgos

- Verificar en navegador y celular real 320/375/390/430px, vertical/horizontal, teclado normal/numérico y cierre, inercia, notch/safe-area, modo oscuro y Grande. La emulación lógica no prueba WebKit ni animaciones del teclado físico del dispositivo.
- Confirmar visualmente trapping/restauración de foco y ubicación de hoja con teclado; la implementación usa el componente accesible existente, pero la sesión no permitió operarlo.
- Adjuntos reales, ficha/lead y proveedores no fueron ejercitados: el modo mock no sube archivos ni crea clientes. Se conservaron handlers y validaciones.
- Sin staging, deploy, commit, push, PR ni actualización de Jira desde esta sesión. Entregar para revisión; no hay autorización de merge ni despliegue.


## Revisión de dirección de arte EVP-82 — 2026-10-27

El pedido posterior de Ramiro reemplaza la elección anterior del lanzador: ahora existe únicamente ⋮ en el encabezado, también para lectura. El compositor conserva solo campo y envío. Encabezado plano de 56px móvil / 64px escritorio, separador de 1px, volver y ⋮ de 44px, avatar de 40px. El botón de información agrupa avatar y texto y abre la ficha.

Nombre: 17px/22px, peso 600 y title completo. Canal/estado breve: 14px/20px. Ambos campos usan nowrap + elipsis; sus tamaños explícitos no crecen con el ajuste Grande. El bloque central puede encogerse; a 320/375/430px conserva espacio positivo tras descontar controles, avatar, padding y gaps. Esto es comprobación estructural, no una captura renderizada. Sin fechas ni ventana en el encabezado. El aviso de vencimiento se muestra fuera, en una franja de 28px, solamente con plazo positivo menor a dos horas; el plazo se calcula al recibir el polling existente. El detalle sigue en la hoja.

Test actualizado: tres botones exactos (volver, información, ⋮), dos campos de texto, ninguna fecha/ventana/control adicional, medidas y reglas de una línea, y ningún lanzador en compositor. TypeScript pasa; ESLint sin errores (permanece warning previo de deep link). Suite completa: 183 tests, 177 pasan y quedan las 6 fallas previas de push; las 3 de Mi Día ya no aparecen en el estado actual del workspace. Se mantienen las limitaciones de navegador/EPERM descritas arriba: no se validó visualmente 320/375/430, Grande ni oscuro. El diseño usa tokens del tema y medidas de tipografía explícitas; confirmar renderizado en navegador y celular.

## Revisión y cierre de Claude (2026-10-27)

- Codex se trabó en la segunda pasada (comandos de PowerShell); Claude terminó y revisó en navegador a 375 px y 1440 px.
- Agregado: botón «Responder yo» en el compositor cuando la IA tiene el control (toma la conversación en un toque, en lugar de mandar al menú).
- Agregado: las burbujas del contacto no muestran «Cliente» visible (queda para lector de pantalla); IA y Asesor sí.
- Corregido: la hoja de acciones en móvil quedaba centrada fuera de pantalla por las utilidades del diálogo; ahora es hoja inferior.
- Verificación: TypeScript OK, ESLint 0 errores, tests 177 OK y 6 fallas previas de notificaciones push.
- Pendiente en celular real (staging): fluidez del scroll, teclado y el cuadrado azul.
