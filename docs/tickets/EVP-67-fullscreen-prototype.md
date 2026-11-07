# EVP-67 — Rediseño de la vista de Conversaciones (pantalla completa)

Rama `ticket/EVP-67-rediseno-vista-conversaciones` · commits `eb4d5d9`, `3e0c28f`, `dfb07a5` (más sincronizaciones con `develop`: `5946575`, `49118d5`) · fecha 2026-11-07 · autor: Claude (agente) con Mauro Centurión

## 1. Qué pedía el ticket

Rediseñar `/admin/conversaciones` para que no sobrecargue la pantalla. Que ocupe toda la pantalla en desktop y en mobile, con un estilo parecido a WhatsApp y las acciones importantes más a mano. Tiene que verse bien con texto chico (17 px) y con texto grande (20,4 px, `data-panel-text-size="grande"`).

**Fuera de alcance:**
- La lógica de mensajería, los permisos, los estados de la conversación y la API.
- Las otras rutas del panel, que mantienen su layout.

## 2. Qué se implementó

**Primera iteración** (`eb4d5d9`, `3e0c28f`, del 2026-10-30):
- En [MainLayout.tsx](../../everprop-public/src/components/admin/MainLayout.tsx), solo la ruta exacta `/admin/conversaciones` oculta la barra lateral y la superior del panel.
- Se normalizaron los tamaños de texto en [conversation-typography.css](../../everprop-public/src/app/conversation-typography.css).
- Se corrigió el orden de capas de los diálogos anidados: la confirmación de visita quedaba detrás del panel del cliente (z-index 81 contra 71).

**Segunda iteración, layout v2** (`dfb07a5`). Diseño previo en Claude Design, con artboards de desktop y mobile en texto chico y grande:

- **Estructura** ([ConversationInbox.tsx](../../everprop-public/src/components/admin/conversations/ConversationInbox.tsx)):
  - Una barra angosta en desktop ([:590](../../everprop-public/src/components/admin/conversations/ConversationInbox.tsx:590)) con volver al panel, Chats (con la cantidad sin leer), el tamaño de texto y el tema.
  - La lista de conversaciones y el chat.
  - En mobile, una pantalla por vez: primero la lista y después el chat, con botón de volver.
- **Ficha del cliente:**
  - A partir de 1280 px y con texto chico, queda fija al costado del chat ([:125](../../everprop-public/src/components/admin/conversations/ConversationInbox.tsx:125), [:1112](../../everprop-public/src/components/admin/conversations/ConversationInbox.tsx:1112)).
  - En pantallas más angostas, o con texto grande, se abre como panel deslizable.
  - `VisitRequestsBoard` se monta una sola vez, para no perder lo que se está editando.
- **Encabezado del chat:**
  - Al tocar el nombre se abre la ficha.
  - Los botones visibles son "Devolver a la IA", "Finalizar" y "Ver cliente". Lo demás está en el menú "Más" ([:981](../../everprop-public/src/components/admin/conversations/ConversationInbox.tsx:981)).
  - En mobile, ese menú y el resumen se abren como hojas que suben desde abajo.
  - El encabezado se adapta al ancho del chat con container queries ([admin-design.css:483](../../everprop-public/src/app/admin-design.css:483)): si no entra, los botones quedan solo con ícono. Esto mantiene el encabezado legible cuando la ficha está fija al costado.
- **Lista:**
  - Pestañas de bandeja y filtros en chips, reordenados: Todas, Esperando, Sin leer, Mías.
  - Avatar con un punto que indica el canal.
  - Se quitó el texto visible "Se actualiza solo · hora". El estado de actualización sigue anunciándose a lectores de pantalla ([:677](../../everprop-public/src/components/admin/conversations/ConversationInbox.tsx:677)).
- **Zona de respuesta:**
  - Selector "Responder a X" / "Nota interna".
  - Botón `+` que muestra Adjuntar, Respuestas rápidas, Sugerir y Nota.
  - Al escribir `/` se filtran las respuestas rápidas. Elegir una reemplaza lo escrito y Enter inserta la primera que coincide.
  - Tarjeta de sugerencia del copiloto ([:879](../../everprop-public/src/components/admin/conversations/ConversationInbox.tsx:879)).
  - "Tomar control y responder" cuando la IA tiene la conversación.
- **Estilos** ([admin-design.css:252](../../everprop-public/src/app/admin-design.css:252)):
  - El bloque "EVP-67 v2" reemplaza al layout anterior y al bloque de ajustes visuales previos.
  - El fondo del hilo es suave y las burbujas entrantes son blancas.
  - La zona de respuesta tiene un ancho máximo de 60 rem.
- **Hook nuevo:** `usePanelTextSize()` en [PanelTextSize.tsx](../../everprop-public/src/components/theme/PanelTextSize.tsx:44), para los layouts que cambian según el tamaño de texto y no solo escalan.
- **Esquema, variables y dependencias:** no hay cambios en ninguno de los tres.

## 3. Por qué esta solución

**Qué se reutilizó:**
- `Sheet` de Base UI (panel deslizable con `keepMounted`), `PanelTextSizeControl` y `ThemeToggle`.
- La lógica existente de `visualViewport`, que maneja el teclado en mobile.
- Los handlers de envío, toma de control y cierre, que no cambiaron.

**Decisiones:**
- **Ficha fija solo cuando entra.** Con texto grande o por debajo de 1280 px, tres columnas dejan el chat demasiado angosto, así que la ficha pasa a ser un panel deslizable.
- **Container queries en lugar de media queries.** El ancho disponible para el encabezado depende de si la ficha está abierta, no del ancho de la ventana.
- **Pocas acciones visibles.** Solo las que se usan en cada conversación están a la vista; las de baja frecuencia (lead y visita, traza, reabrir, cerrar) van al menú.

**Límites:**
- `admin-design.css` no está dentro de una capa de CSS, así que pisa utilidades de Tailwind como `md:hidden`. Los elementos que solo se ven en mobile se ocultan con reglas de media explícitas.

## 4. Cómo se verificó

**Tests y chequeos** (2026-11-07):
- `node --test` sobre los tests de conversaciones: **39 pasan**. Hay dos tests nuevos en `tests/conversation-composer.test.mjs`:
  - El filtro de respuestas rápidas con `/`.
  - La ficha fija en pantalla ancha.
- `tsc --noEmit`: sin errores.
- `npm run lint`: **0 errores**, 123 advertencias. Son preexistentes, sobre todo `any` y variables sin usar en `src/lib`.
- **Build:** `npm run build` (Turbopack) falla en este worktree porque `node_modules` es un symlink que apunta fuera de la carpeta del proyecto. No es un error del código. Con `NEXT_PUBLIC_DATA_MODE=mock npx next build --webpack`, el build termina bien y genera todas las rutas. Conviene que CI o el revisor lo confirmen con el build normal.
- `tests/assistant-trace.test.mjs` también falla en `develop`. Es ajeno a este ticket.

**Navegador** (servidor local en modo mock, datos sintéticos, sin backend):
- **Desktop 1440 px, texto chico y grande:**
  - Ficha fija al costado.
  - Filtro con `/` y envío de un mensaje.
  - Con texto grande, la ficha se abre como panel deslizable.
- **Mobile 375×812 y 320×568 con texto grande:** sin scroll horizontal. Lo confirmé midiendo en el DOM.

**Revisiones:** no tocó datos ni IA (solo presentación), así que no correspondía `tenant-isolation-reviewer` ni `llm-security-reviewer`.

**No verificado:**
- Teclado real en un teléfono.
- La API real.
- Los diálogos de reanudar y de plantillas en el layout nuevo.

## 5. Pendientes y riesgos

- **Encabezado en mobile:** sigue midiendo 85 px de alto, más de lo previsto. Conviene revisarlo en un teléfono real.
- **Layout compartido:** `MainLayout.tsx` lo usan todas las rutas del panel. Solo cambia para la ruta exacta `/admin/conversaciones`; las demás se compararon contra `develop` en la primera iteración.
- **Archivo de tareas:** `odd/tasks/conversations-fullscreen.md` entró en la primera iteración. Es el registro de trabajo del agente; se puede quitar si no se quiere en el repo.
- **Destino:** este módulo es de conversaciones, así que este PR va a `develop` y nunca a `main`.
- **Despliegue:** no se desplegó en staging ni en producción.
