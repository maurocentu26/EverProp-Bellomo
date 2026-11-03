# EVP-105 — Navbar que se oculta al hacer scroll y tamaños de texto Chica y Grande

Rama `ticket/EVP-105-navbar-scroll-tamanos-texto` · fecha 2026-11-03 · autor: Claude (agente) con Mauro Centurión

## 1. Qué pedía el ticket

Ganar espacio de trabajo en el panel y dejar claros los dos tamaños de texto, con layouts que además de legibles se vean bien en ambos.

- La barra superior se oculta al bajar y reaparece al subir, sin parpadear con movimientos mínimos, accesible por teclado y respetando `prefers-reduced-motion`.
- «Actual» pasa a llamarse «Chica», sin cambiar el tamaño ni perder las preferencias guardadas.
- Ningún texto queda más chico en Grande que en Chica, y los textos de botones se leen completos en todos los tamaños y anchos, reorganizando el layout si hace falta.

Fuera de alcance: cambiar el tamaño base de 17 px, rediseñar pantallas y la ficha del cliente, trabajada en EVP-104.

## 2. Qué se implementó

- **Barra superior:**
  - [topbar-scroll.ts](../../everprop-public/src/lib/topbar-scroll.ts) decide si mostrar u ocultar: siempre visible cerca del inicio o si la página apenas tiene scroll, y un umbral de 8 px para no parpadear.
  - [AdminNavbar.tsx](../../everprop-public/src/components/admin/AdminNavbar.tsx) escucha el scroll de `[data-admin-scroll-container]` y saca la barra del flujo con un margen negativo, de modo que el contenido gana su alto. La muestra al recibir foco y no la oculta mientras tiene foco visible o un menú abierto.
  - Conversaciones no mueve ese contenedor, así que su barra sigue visible.
- **Tamaños:** [PanelTextSize.tsx](../../everprop-public/src/components/theme/PanelTextSize.tsx) y [settings/page.tsx](../../everprop-public/src/app/admin/settings/page.tsx) muestran «Chica». El valor guardado sigue siendo `actual`, por eso las preferencias existentes se conservan.
- **Escala**, en [panel-text-size.css](../../everprop-public/src/app/panel-text-size.css):
  - En las vistas `.mi-day`, los textos con tamaño fijo chico pasan a `--panel-meta` (15 px en Chica, 18 px en Grande). Antes daban 17 px en Chica y 12-13 px en Grande.
  - Las cifras destacadas de Mi Día, Mis Leads, Agenda, Cobranzas y Activos ahora escalan 1.2 en Grande.
  - Los encabezados de tabla pasan a `--panel-meta` en Grande: daban 15 px en Chica y 13,2 px en Grande.
- **Botones y layouts:**
  - Menú lateral: las etiquetas bajan de línea en vez de cortarse ([AdminNavigationMenu.tsx](../../everprop-public/src/components/admin/AdminNavigationMenu.tsx)).
  - Catálogo web: botones en una sola línea y pie de tarjeta que baja de fila ([ProjectWebEditor.tsx](../../everprop-public/src/components/admin/ProjectWebEditor.tsx)).
  - Mis Leads: «Nuevo lead» no se parte; las acciones por lead caben en móvil y van en una columna bajo 360 px.
  - Cobranzas en móvil: «Por vencer · 7 días» ocupa toda la fila.
  - Conversaciones: la fila usa fecha corta («20 oct») con `dayLabel(..., "short")` en [conversations-api.ts](../../everprop-public/src/lib/conversations-api.ts), y las pestañas van de a dos bajo 360 px.
  - Estadísticas: en Grande, la tabla ya no desborda 40 px.

Sin cambios de esquema, variables de entorno, dominios, CORS, Sanctum ni proveedores.

## 3. Por qué esta solución

- Se reutilizaron el token `--panel-meta`, el contenedor de scroll existente y el patrón de tests con `node --test`. No se agregaron dependencias.
- Margen negativo y no `transform`: con `transform` la barra se iría de la vista, pero el contenido no ganaría ese espacio.
- Se cambió el rótulo y no el valor guardado, para no migrar preferencias de `localStorage`.
- **Límite conocido:** los detalles de 15 y 18 px solo aplican a textos con clase `text-[Npx]`. Los que usan `text-xs` siguen en el tamaño base dentro de `.mi-day`, por lo que la jerarquía mejora pero no es completa en todas las vistas.

## 4. Cómo se verificó

- **Automático:** `tsc --noEmit` sin errores; `node --test tests/*.test.mjs` 206 de 207; `eslint src tests` 0 errores; `npm run build` compila. El test que falla es el falso positivo de `assistant-trace`, ajeno a este ticket.
- `tests/topbar-scroll.test.mjs` cubre dirección, umbral, inicio de página, páginas con poco scroll y overscroll. `tests/qa-ux-ui-regression.test.mjs` cubre rótulos, escala y selectores.
- **Navegador, código final** (worktree propio, `localhost:3106`, `NEXT_PUBLIC_DATA_MODE=mock`, datos de muestra, administrador, tema oscuro):
  - Barra: se oculta al bajar, ignora 4 px, reaparece al subir y con foco, y queda visible cerca del inicio.
  - «Chica» en Configuración y en el nombre accesible del selector.
  - Botones sin desborde ni texto cortado, y página sin desborde: Mi Día, Mis Leads, Cobranzas, Web, Estadísticas y Activos a 1440 px; Mis Leads, Cobranzas y Web a 320 px, en ambos tamaños.
  - Texto más chico en Grande que en Chica: solo los encabezados de tabla, ya corregidos en el código pero no vueltos a medir. Medido en Mi Día, Mis Leads, ficha, Agenda, Cobranzas, Activos, Estadísticas y Configuración a 1440 px.
- **Navegador, con API local y datos reales, antes de reconstruir los cambios** (ver sección 5): asesor y administrador a 1440, 1024, 375 y 320 px según la pantalla, incluidas Conversaciones y el catálogo Web con tarjetas. Esas correcciones se reaplicaron idénticas, pero Web con tarjetas y Conversaciones no se volvieron a medir con el código final, porque la API local solo acepta sesiones desde `localhost:3000`.
- **Sin verificar:**
  - El navegador estaba en segundo plano, así que scroll y foco se despacharon por script. Falta probarlo con rueda, táctil y teclado reales.
  - Tampoco se probó `prefers-reduced-motion` en navegador ni el tema claro.
  - Las medidas cambian el atributo de la página, no usan el selector.

## 5. Pendientes y riesgos

- **Incidente durante el ticket:** otro proceso que trabajaba EVP-106 en la misma carpeta hizo commits sobre esta rama y un `git reset` a las 20:21:12 del 2026-11-03, que descartó estos cambios sin commitear. Se reconstruyeron en el worktree `EverProp-EVP-105`. Los commits de EVP-106 no se tocaron.
- Textos que no crecen en Grande (quedan iguales, no más chicos): varios de Configuración, Estadísticas y Cobranzas tienen tamaños fijos. No se cambiaron en esta tanda.
- Lista de Conversaciones: los nombres muy largos y la vista previa siguen con puntos suspensivos, y las filas son altas (154 px en Chica, 218 px en Grande). Conviene revisarla como ticket propio de diseño.
- Web en móvil: los filtros por categoría siguen en una fila con scroll lateral, a propósito.
- `tests/assistant-trace.test.mjs` sigue fallando por el falso positivo ajeno a este ticket: matchea la palabra `innerHTML` en un comentario de `AssistantTrace.tsx`.
- Falta probar el flujo en el navegador de staging después del merge. Una prueba local o de staging no valida producción: antes de cualquier pase a producción hay que verificar los accesos de producción (`schema_versions` contra forwards SQL pendientes, dominios definitivos, CORS/R2, hosts/Sanctum/cookies en `tenant_domains`, credenciales y permisos de proveedores, base de datos y storage).
