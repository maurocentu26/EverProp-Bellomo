# EVP-73 — Rediseño vista Activos & Unidades

Rama autorizada `ticket/EVP-65-rediseno-visual` · 2026-10-25 · Codex. Usuario confirma ticket en Jira En curso y autoriza continuar la serie en esta rama. Trabajo individual, sin commit, push ni PR; sin leer entornos ni secretos.

## 1. Plan previo a código
- Revisar listado, ficha, edición, adaptador y llamadores, informes anteriores y prototipos PC/teléfono.
- Reutilizar corporate-design-system y admin-design.css: slate, CTA azul, Lucide, texto de 17 px, tarjetas en todos los tamaños, filtros proyecto/tipo/disponibilidad/manzana con wrap y dos columnas móviles.
- Conservar código completo, precio y moneda originales de Inventory para la presentación; distinguir precio ausente y moneda null, sin inferir disponibilidad. Mantener permisos, paginación y muestras exclusivamente mock.
- Adaptar ficha y edición con revisión completa antes de guardar. Ejecutar lint, TypeScript y tests/ con una prueba renderizada para 12/12A/12B y moneda null. Documentar limitaciones reales y resultados.

## 2. Qué se implementó

- `everprop-public/src/app/admin/properties/page.tsx`: ruta del menú Activos & Unidades, con encabezado, aviso slate sobre códigos completos y grilla de tarjetas. Filtros nativos proyecto/tipo/disponibilidad/manzana que bajan de línea y forman dos columnas en teléfono. Se corrige el filtrado mock, que antes ignoraba proyecto y estado. Se mantiene la consulta paginada, con error recuperable al cargar más; se descartan respuestas de una selección anterior y se bloquea la carga duplicada.
- `everprop-public/src/components/admin/PropertyList.tsx`: una sola representación de tarjetas PC/teléfono, sin tabla. Código exacto (`unitNumber`, sin parsear ni agrupar), proyecto, tipo, sector, superficie m², importe es-AR, estado recibido con Lucide/texto y Ver ficha. Acciones móviles a todo el ancho. Se revisaron sus dos llamadores: listado y resumen del dashboard. El llamador del dashboard conserva la lista; si no entrega proyectos, no se inventa su nombre.
- `everprop-public/src/components/admin/PropertyDetailView.tsx`: ficha existente con un único Atrás, código completo, proyecto, tipo, operación y disponibilidad reales. Se elimina el distintivo fijo «EN VENTA», la galería ficticia y la inferencia de ochava a partir de descripción. El precio comparte el formato del listado. Se conservan visitas, interesados, copia de enlace interno, permisos y escritura versionada; el cambio de disponibilidad pide confirmación con identidad, estado actual/nuevo y precio.
- `everprop-public/src/components/admin/EditPropertyModal.tsx`: formulario de hasta dos columnas, revisión completa de sus doce campos y confirmación antes de guardar. Volver a editar conserva el borrador; error conserva la revisión; referencia bloquea doble envío. No se elige USD cuando Inventory trae null. Editar otro campo conserva precio/moneda ausentes y solo envía cambios monetarios explícitos. Se permite corregir solo moneda sin sobrescribir precio. No se permite vaciar precio/moneda existentes porque el contrato de actualización actual no admite null para ellos.
- `everprop-public/src/lib/everprop-api.ts`, `src/data/admin-sample.ts` y `src/lib/inventory-labels.ts`: se conservan para esta presentación `inventoryPrice` e `inventoryCurrency`, incluidos los nulls recibidos. Los campos legados price/currency y priceKnown siguen disponibles para consumidores externos a esta vista; no se amplía su contrato global ni se cambia el backend. El helper muestra «Precio a consultar» cuando falta precio y «Moneda sin confirmar» cuando falta moneda, incluso si hay importe, conserva cero y no atribuye USD a ese importe en la vista nueva.
- Tres muestras con identificadores distintos para 12, 12A y 12B en el seed existente; solo se cargan mediante las guardas mock del listado/ficha. 12A está reservado y 12B tiene precio/moneda ausentes. No hay fallback de muestras ante errores de API.
- `everprop-public/src/app/admin-design.css`: reglas acotadas, slate, CTA azul, Lucide, cuerpo de 17 px y preferencia Grande, sin degradados ni emojis. Ficha sin truncate ni letra de 10/11 px, contraste sobre aviso oscuro, botones móviles apilados y formulario móvil con variables `--tw-translate-x/y: 0px` para Lightning CSS.
- `everprop-public/tests/inventory-redesign.test.mjs`: prueba del HTML real renderizado de las tarjetas y revisión/confirmación de edición con hooks simulados. `tests/inventory-api.test.mjs`: prueba del adaptador desde respuesta Inventory con códigos exactos, cero y nulls.

## 3. Por qué esta solución

Se reutilizaron las rutas existentes, las consultas y permisos, el helper de etiquetas, Lucide, Link/Button/Dialog y el patrón VM/TypeScript de tests/. Se revisaron los HTML PC (sección Catálogo · Activos & Unidades) y teléfono (`activos`), los informes previos disponibles y admin-design.css. Se aplica el sistema corporativo aprobado en lugar de copiar colores del prototipo. No se agregó Ofrecer: el prototipo simula una acción que esta pantalla no tiene implementada; Ver ficha mantiene las acciones reales existentes.

No hay dependencias nuevas, cambios de backend/API HTTP, esquema, variables, entornos ni Docker. El adaptador agrega datos de presentación sin alterar endpoints ni normalizar códigos. No se modificó la disponibilidad a partir de precio, moneda o texto.

## 4. Cómo se verificó

- `npm run lint` desde `everprop-public`: **0 errores, 130 advertencias** (exit 0). Las advertencias restantes incluyen deuda existente; no se hizo limpieza general ajena al ticket.
- `node node_modules/typescript/bin/tsc --noEmit`: **PASS**, exit 0.
- `node --test --test-isolation=none tests/*.test.mjs`: **131 pruebas; 125 PASS, 6 FAIL**. Todas las pruebas de Inventory/rediseño pasan. Los seis fallos son de `notifications-worker.test.mjs`: `self.navigator` ausente en las simulaciones de `clearAppBadge`/`setAppBadge`, ya documentados en EVP-69/71/72. No se modificaron ese worker ni sus tests.
- Prueba focalizada `node --test --test-isolation=none tests/inventory-redesign.test.mjs tests/inventory-api.test.mjs`: **10 PASS**, sin fallos. Cubre tres tarjetas separadas y enlaces 12/12A/12B, moneda null, precio ausente/cero, formato es-AR, estado reservado, m², ausencia de tabla, confirmación de todos los campos, vuelta al borrador, ninguna escritura antes de confirmar y un solo envío con confirmación duplicada.
- El runner predeterminado `node --test` falló al crear procesos (`spawn EPERM`); se ejecutó la suite completa con el aislamiento desactivado, igual que en los tickets anteriores. El primer intento de TypeScript desde la raíz no encontró el ejecutable en caché; luego se usó el TypeScript ya instalado del frontend y pasó.
- Detector mecánico Impeccable sobre las cuatro vistas: `[]`, sin hallazgos. Revisión estática responsive/oscuro/Grande y del flujo de datos. **No constituye prueba visual**: Computer Use devuelve `apps: []`, `browsers: []`; no fue posible comprobar medidas reales, teclado/foco ni capturas 1440×900 y 375×812.
- Jira: lectura mínima de recursos Atlassian devuelve `Unknown tool`; se usa la confirmación del usuario de que EVP-73 existe y está En curso. No se verificó asignación ni se actualizó Jira.
- Sin cambios de tenant queries, policies, jobs ni IA; no aplican revisiones especializadas de aislamiento/LLM a este cambio visual.

## 5. Pendientes y riesgos

- Validación visual PC/teléfono, modo oscuro/Grande y navegación con teclado/foco pendiente en un navegador disponible. Las pruebas JSX/hook no sustituyen integración con un backend real.
- Tipo y manzana filtran **las unidades ya cargadas**, indicado en la pantalla. La consulta frontend existente pagina por proyecto/estado; no se amplió para tipo ni para cargar todo el inventario. Cargar más sigue accesible aun si no hay coincidencias locales.
- Las tarjetas no inventan propietario de reserva, vencimiento de reserva, fecha de boleto, ni acciones Ofrecer ausentes. La ficha usa el nombre de proyecto del catálogo cargado; si no está disponible dice «Proyecto sin identificar».
- Precio/moneda legados aún existen para otros módulos. Esta vista usa los valores Inventory preservados; migrar todos los consumidores a tipos monetarios nullable excede este ticket. Quitar precio/moneda existentes requiere definir soporte del contrato de escritura; aquí se bloquea explícitamente.
- El formulario de alta independiente (`/admin/properties/new`) y la matriz tienen sus propias interfaces y quedan fuera del listado/ficha solicitado. Se conservaron sus enlaces y contratos. La edición mock conserva el comportamiento de callback existente; no se amplió el modelo de persistencia de muestras.
- Se dejaron los seis fallos de notificaciones para su ticket. Sin despliegue ni validación de staging/producción; no se leyeron entornos ni secretos. Entrega exclusivamente local en la rama autorizada, sin commit, push, PR, merge ni migraciones.


## Correcciones de ficha tras revisión de Claude — 2026-10-25

Esta sección reemplaza las descripciones anteriores de cabecera y calendario de la ficha. Continúa el mismo EVP-73 y la rama previamente autorizada; solo C:\w65, sin commit. No se modificaron durante esta corrección el listado, sus tarjetas, filtros, muestras, adaptador, edición ni etiquetas monetarias.

### Alcance y solución

- `PropertyDetailView.tsx`: una sola cabecera sobre superficie clara según tema, con un único h1 («Unidad 12A»), estado como insignia inline con icono/texto, operación y proyecto · tipo · manzana. La ubicación filtra partes vacías antes de unirlas con coma. Conserva `inventoryPriceLabel`: precio ausente = «Precio a consultar» y moneda null = «Moneda sin confirmar».
- `admin-design.css`: reglas nuevas limitadas a `.inventory-detail`, sin afectar la lista aprobada. Rótulos en escritura normal, 17 px y sin tracking; formulario de visitas ancho con hasta dos columnas y cronograma debajo, contador de leads sin corte. En teléfono, grillas de una columna, botones de ancho completo y Atrás interno oculto, conservando el de MainLayout.
- `VisitManager.tsx`: se revisaron sus dos llamadores (ficha de unidad y ficha de lead). Se reutiliza el formulario y su validación; callback opcional `confirmSchedule` antes de persistir, utilizado únicamente desde la ficha de unidad. La confirmación muestra unidad, proyecto, visitante, teléfono, correo, fecha/hora Argentina, asesor y notas. Cancelar conserva el borrador y no llama a `onSchedule`; errores de persistencia conservan la recuperación existente. Sin dependencia nueva ni cambios de API/permisos.
- Estado: la ficha ya impedía escribir a ADVISOR/ENGINEER; ahora esos roles ven texto de lectura, sin selector deshabilitado. Se revisaron `useCurrentSession`, `PropertyPolicy::update` y `InventoryAccess::canUpdate` (capacidad, configuración y scope del servidor). No se ampliaron permisos ni se asumió permiso por ver una unidad. Los roles que conservan el selector reciben confirmación con código exacto, estado anterior/nuevo y precio; elegir el mismo estado no escribe. La autorización final y versión siguen en el backend existente.

### Verificación de esta corrección

- `npm run lint`: exit 0, **0 errores, 130 advertencias** existentes; sin limpieza ajena al ticket.
- `node node_modules/typescript/bin/tsc --noEmit`: **PASS**, exit 0.
- `node --test --test-isolation=none tests/*.test.mjs`: **133 pruebas, 127 PASS, 6 FAIL**. Solo fallan las seis pruebas existentes de `notifications-worker.test.mjs`, por `self.navigator` ausente para clearAppBadge/setAppBadge.
- Inventory/rediseño: **12 PASS**, incluyendo dos pruebas nuevas para la ficha (cabecera única, coma ausente, precio ausente, asesor lectura, confirmación de cambio de estado) y para visitas (datos completos en confirmación, cancelar sin guardar ni borrar borrador y guardar después de aceptar). La última ejecución completa incluye también la comprobación de estado anterior/nuevo del administrador.
- Impeccable detector sobre ficha, VisitManager y CSS: tres advertencias de gray-on-color en CSS compartido preexistente (línea 130), ninguna en el código nuevo de cabecera; no se cambió ese estilo ajeno al alcance.
- Computer Use devuelve `apps: []`, `browsers: []`. No hubo navegador disponible para capturas ni interacción PC/teléfono; revisión de responsive y temas por reglas CSS y tests de componentes, no validación visual real.
- Jira vuelve a responder `Unknown tool`; se conserva la confirmación de existencia/En curso registrada al iniciar EVP-73. Sin actualización de Jira.

### Pendientes y riesgos

Quedan pendientes validación visual en navegador, foco/teclado y prueba contra API real. Los seis fallos ajenos de notificaciones siguen abiertos. No se inició Docker, no se leyó configuración privada, no hubo despliegue, migración, commit, push ni PR. No se cambiaron consultas, políticas, contratos de API ni IA, por lo que no aplican revisiones especializadas de tenant/LLM a esta corrección de presentación.


## Revisión visual — Codex, 2026-10-26

Rama de integración autorizada: `ticket/EVP-65-rediseno-visual`. Primera pasada implementada; **no terminada ni aprobada visualmente**. Ticket existente y En curso según confirmación expresa del usuario; sin cambios de estado en Jira.

- Referencia: diapositiva 9, captura local `C:/Users/L A T I T U D E/Downloads/bellomo-rediseno-codex/capturas/s10.png` y sección Activos & Unidades del prototipo `prototipos/bellomo-panel-app.html`. Las capturas tienen una lámina inicial adicional; se cotejó el título, no solo el número.
- Cambios frente a la referencia: Tarjetas blancas de radio 24, precio destacado, disponibilidad en pastillas con palabra, botones redondos y filtros de radio 24. Error del inventario sin «mock». Se conservan códigos completos y el helper de moneda/precio.
- Archivos de pantalla: everprop-public/src/app/admin/properties/page.tsx. Estilos únicamente en `everprop-public/src/app/admin-catalog.css`, importado inmediatamente después de admin-design.css en layout.tsx; no se editó la hoja compartida.
- Evidencia anterior existente: docs/tickets/evidence/EVP-73/1-pc-lista.jpg; docs/tickets/evidence/EVP-73/4-telefono-lista.jpg. No se presenta como evidencia de esta pasada.
- Capturas posteriores requeridas: `docs/tickets/evidence/EVP-73/activos-pc.png` y `activos-telefono.png`: **no generadas**.
- Solapamiento a 1440 y 375: **no ejecutado**, no se afirma `[]`. Scroll horizontal, palabras partidas, botones solo ícono y horarios: pendientes de comprobar en DOM real.
- Uso real demo admin/asesor, agregar/editar/confirmar/cancelar, búsqueda/filtros, vacío y error: no verificados en navegador. Las pruebas de componentes existentes no reemplazan estos controles.
- Oscuro, Grande y reducción de movimiento: reglas conservadas/extendidas, **sin inspección visual**. Objetivos de 17/20,4 px y botones 44/52 px pendientes de medición real.
- Límite concreto: no hay navegador en CUA. Playwright CLI instalado no puede lanzar su proceso (`spawn EPERM`). Chrome DevTools permite listar una página vacía pero rechaza abrir/navegar con «MCP tool call requires approval, but approval policy is never». No se puede conceder esa aprobación desde esta sesión.
- Comprobaciones disponibles: suite sin aislamiento de procesos, lint, TypeScript directo y detector; ver resultados finales en `docs/tickets/evidence/CODEX-PROGRESO.md`. Build compiló y falló al lanzar TypeScript (`spawn EPERM`); no es build OK.
- Límites y diferencias pendientes: No se agregan reservas, plazos ni nombres que el inventario no informa. No se agrega Ofrecer sin flujo existente. Los diálogos, navegación y VisitManager compartidos no se modificaron.

Sin backend, SQL, entornos, secretos, Docker, commit, push ni deploy. No se modificaron primitivas ui, MainLayout, navegación ni archivos de Claude.
