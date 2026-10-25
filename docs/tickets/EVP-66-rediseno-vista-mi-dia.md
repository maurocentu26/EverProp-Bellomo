# EVP-66 — Rediseño de la vista Mi Día · tercera pasada

Rama existente `ticket/EVP-65-rediseno-visual`, paraguas EVP-65. Fecha 2026-10-24. Autor: Codex, a pedido del usuario. Se partió de los cambios locales anteriores. Sin commit, push, PR, merge ni despliegue por instrucción expresa.

## 1. Qué pedía el ticket

Reemplazar la composición heredada de EVP-49 por la de los prototipos aprobados `bellomo-panel-app.html` y `bellomo-iphone-app.html`: tres columnas en PC, prioridad clara, tipografía grande y generosa, tarjetas de 24 px, botones en pastilla y una experiencia guiada para asesores grandes. Se usaron también las capturas s2/iphone y las secciones 6, 7, 12 y 13 de CONTEXTO-CODEX.md.

La traducción visual solicitada prevalece sobre los colores originales: slate en superficies, slate-900 para la tarjeta destacada, blue-600 para acciones principales, colores semánticos con texto, Lucide y sin degradados. Se conservan el tema oscuro, la preferencia Grande y el aviso mock existente.

Se mantiene la confirmación del usuario, registrada en la primera pasada, de que EVP-66 existe en Jira y está En curso y de trabajar sobre la rama paraguas actual. El conector Atlassian volvió a responder `Unknown tool`: no se pudo verificar la asignación ni actualizar Jira. Es continuación del mismo ticket.

## 2. Qué se implementó

### Correspondencia con el prototipo

| Pieza | Qué quedó igual | Adaptación y motivo |
| --- | --- | --- |
| Encabezado | Fecha argentina y «Buen día, nombre» con título de 30–34 px | Se omiten racha y resueltos hoy: no hay datos con ese significado. Se conservan los accesos a nuevo lead y balance en escritorio. |
| Composición PC | Prioridad y contadores a la izquierda; tres clientes en curso y próxima acción al centro; agenda y mensajes a la derecha | En anchos intermedios de 768–1199 px se usan dos columnas para mantener legibilidad; desde 1200 px, tres. |
| Tarjeta destacada | «Esperan tu llamado», número de 56 px, barra y botón blanco «Empezar a llamar» | Cantidad de entradas prioritarias de la cola comercial. La barra representa contactos atrasados sobre pendientes, con valor accesible. Sin porcentaje inventado. |
| Contadores | Dos tarjetas reales debajo de la destacada | Consultas nuevas y contactos para hoy. Las solicitudes por confirmar no están cargadas por esta vista. |
| Cuotas | Bloque propio con estado visible y acceso a cobranzas | Muestra el contador real de cuotas vencidas y conserva errores de carga. No inventa importes ni mezcla monedas. |
| Clientes en curso | Tres tarjetas semánticas, unidad, cliente, etapa, barra y «Ver cliente ›» | Se muestran hasta tres leads abiertos que ya avanzaron de Nuevo. Las cinco posiciones corresponden a las etapas existentes Nuevo, Contactado, Visita Agendada, Negociación y Cerrado/Ganado; no se inventan Reserva/Boleto. |
| Próximo paso | Avatar con iniciales, nombre, motivo en chip y acciones con verbo | Orden comercial existente. El motivo usa el detalle del plazo real cuando existe. Se conserva búsqueda, filtros y carga incremental bajo un desplegable. Los cambios de etapa y de intereses detallados se consultan desde la ficha; se conserva la sugerencia de etapa después de registrar un contacto. |
| Agenda | Hora en chip, actividad y cliente | Solo visitas agendadas que ya carga la vista. Sin mezclar solicitudes todavía no confirmadas. Estado vacío y error diferenciados. |
| Mensajes | Tarjeta lateral y acceso a la bandeja | Estado informativo: esta vista no carga conversaciones. No muestra un último mensaje ni un contador de no leídos ficticio. |
| Ayuda | «¿Cómo hago…?» visible | Instrucción breve y acceso a configuración; sin copiar el teléfono de soporte de ejemplo. |
| Móvil | Saludo, destacada, próxima acción, carrusel con snap de clientes y agenda; dock oscuro con cuatro destinos | El DOM sigue ese orden. Los contadores, cuotas, mensajes y ayuda siguen debajo. Se reutiliza el menú global para «Más»; se oculta su disparador superior solo bajo 768 px para el asesor. Se reserva espacio para dock/safe-area y se agrega «‹ Atrás» en rutas internas. |
| Guiado | Bienvenida oscura, hasta cuatro prioridades, iniciales, progreso, cliente por paso y botón grande | Diálogo Base UI en PC y pantalla completa móvil; «¿Qué pasó?» abre el editor existente como hoja móvil. Captura el orden al abrir y no cambia de cliente por polling. |
| Cierre | Resumen honesto y vuelta al tablero | Cuenta seguimientos efectivamente guardados y contactos saltados, mostrando cuántos siguen prioritarios. Guardado no se interpreta como resuelto: casillas registradas en amber, saltadas con guion, sin check final de resolución. |
| Movimiento | Entrada escalonada de 70 ms, barras, respuesta al presionar y guardado con feedback | Se reutiliza «Guardando seguimiento…» del editor y se muestra «Listo · seguimiento guardado» y «Listo · seguir» solo después de persistir. `prefers-reduced-motion` elimina movimiento y escalado de botones. |

### Archivos y flujo

- `everprop-public/src/components/admin/advisor/AdvisorCockpit.tsx`: reemplazo de la estructura anterior; conserva carga autorizada, polling, aislamiento de muestras mock, clasificación comercial, errores, balance y guardado de seguimientos. La misma función de persistencia recibe el cliente del tablero o del guiado.
- `everprop-public/src/components/admin/advisor/AdvisorDayGuide.tsx`: ronda diaria por usuario/origen, bienvenida, progreso, saltos y editor anidado. Solo un guardado exitoso cambia la casilla a «seguimiento registrado». Error y cancelación no avanzan ni registran resultados. No guarda datos de clientes en almacenamiento persistente del navegador.
- `everprop-public/src/lib/advisor-day-guide.ts`: primeras cuatro prioridades, marca diaria, motivo e iniciales reales. No cambia pesos ni reglas de la cola.
- `everprop-public/src/app/admin-design.css`: composición, responsive, 17 px de base y 20,4 px en Grande, tarjetas de 24 px, controles de 44/52 px, tema oscuro, foco, dock y movimiento reducido.
- `everprop-public/src/components/admin/AdminNavbar.tsx`: dock para asesores y reutilización de `AdminFullscreenMenu` para Más. El resto de roles conserva su navegación.
- `everprop-public/src/components/admin/MainLayout.tsx`: espacio inferior del dock y enlace Atrás en las pantallas internas del asesor. El aviso mock no se modificó.
- `LeadFollowUpEditor.tsx`: título opcional «¿Qué pasó?» para el guiado y clase opcional de la primera pasada; el título normal y las validaciones se conservan para los otros llamadores.
- Se conservan los cambios locales anteriores en `LeadStageUpdateModal.tsx` y `assistant/VisitRequestsBoard.tsx`: escala de Mi Día y revisión completa de cliente, unidad, fecha y hora antes de confirmar una visita. La confirmación sigue bloqueada en READ_ONLY y conserva el error para reintentar.
- `tests/advisor-day-guide.test.mjs`: selección, marca diaria, pluralización, iniciales, motivo, saltos, cierre sin éxito ficticio, error/reintento/cancelación y estabilidad de la ronda ante refrescos. Se conserva `tests/visit-confirmation.test.mjs`.

Sin cambios de API, esquema, variables, proveedores, dominios ni dependencias. No se abrieron archivos de entorno ni carpetas de secretos. No se inició Docker.

## 3. Por qué esta solución

Se reutilizan `commercialQueueGroups`, los datos que ya carga Mi Día, las primitivas accesibles Dialog/Button, el menú global y el editor de seguimientos. El rediseño cambia la composición completa, sin implementar otra clasificación comercial ni una segunda bandeja.

El contrato de seguimiento admite resultado de texto libre. Por eso el guiado registra lo ocurrido con el formulario real y distingue ese guardado de una resolución. Un llamado o un enlace a WhatsApp no incrementan contadores ni se guardan como resultado por sí solos. No se implementó deshacer sin un contrato de reversión real.

La fidelidad visual se adaptó únicamente donde faltan datos o donde el espacio disponible requiere otra distribución. No se copiaron nombres, teléfonos, importes, rachas, conversaciones ni estadísticas de las muestras del prototipo a la app.

## 4. Cómo se verificó

- Cuarta pasada (2026-10-24): clientes en una tira sin wrap, tarjetas PC de 240 px con scroll-snap y carrusel móvil conservado; paso guiado con nombre/motivo únicos en el bloque central mediante DialogTitle/DialogDescription, arriba solo Atrás/progreso; intacta la corrección móvil de Claude con --tw-translate-x/y; npm run lint OK (0 errores, 150 advertencias), npx tsc --noEmit OK, flujo guiado/cola/visitas 24/24 PASS con regresión del encabezado único y git diff --check OK; detector conserva tres avisos anteriores en CSS:130; sin QA visual a 1440 px ni build en esta pasada, Jira sigue inaccesible (Unknown tool) y se conserva la confirmación previa; solo C:\w65, sin archivos de entorno, commit/push/PR ni Docker.

### Tercera pasada tras revisión de Claude (2026-10-24)

Se corrigieron los cinco defectos reportados conservando la composición:

- Diálogo guiado móvil: selector específico por `data-slot`, con `inset/top/left: 0` y `transform/translate: none` prioritarios bajo 768 px. Evita que las utilidades de centrado desplacen la pantalla completa. Las reglas de centrado de la primitiva en PC no se modifican.
- Bienvenida: «Empezamos por tu prioridad» para una; «Empezamos por tus N prioridades» para las demás cantidades. El test renderizado comprueba el título para 0, 1, 2 y más de cuatro entradas, además del contador de pendientes.
- Tarjeta oscura: «Sin atrasados» con cero, singular con uno, chip sin saltos y encabezado que permite reubicarlo completo.
- Próximo paso móvil: dos columnas para avatar y nombre/motivo; las acciones ocupan el ancho de la fila debajo. WhatsApp y Llamar vuelven a estar visibles; Registrar resultado tiene su propia fila debajo para conservar su acceso sin apretar los otros botones.
- Clientes en curso: grid automático con mínimo de 230 px por tarjeta, limitado al ancho del contenedor cuando es menor. Conserva hasta tres clientes y los redistribuye en filas según el espacio disponible, sin truncar contenido. Se conserva el carrusel móvil.

Comprobaciones de esta pasada:

- `npm run lint`: código 0, 0 errores y 150 advertencias existentes.
- `npx tsc --noEmit`: código 0.
- `node --test --test-isolation=none tests/advisor-day-guide.test.mjs tests/commercial-queue.test.mjs tests/visit-confirmation.test.mjs`: **23/23 PASS**.
- Suite completa `node --test --test-isolation=none tests/*.test.mjs`: código 1; repite las seis fallas previas de `notifications-worker.test.mjs` por `self.navigator` ausente (`clearAppBadge`/`setAppBadge`). No se editaron el worker ni sus pruebas.
- `git diff --check`: sin errores de espacios; Git avisa normalización CRLF/LF en archivos locales.
- Detector Impeccable: los mismos tres avisos `gray-on-color` de compatibilidad en `admin-design.css:130`.
- QA visual **pendiente**: el inventario de computer use devuelve `apps: []`, `browsers: []`. `npx --no-install playwright-cli --help` falla con `ENOTCACHED`; no se instaló software ni se abrieron archivos de entorno. No se obtuvieron nuevos `getBoundingClientRect` ni capturas a 375×812 o PC; el centrado se revisó en CSS, no se certifica en navegador.
- Jira: nueva lectura de EVP-66 vuelve a fallar con `Unknown tool`; se conserva la confirmación anterior del usuario. Sin escrituras remotas.

Solo cambios locales dentro de `C:\w65`, sin commit, push, PR, Docker ni despliegue. No se repitió el build; no cambia el resultado pendiente de la pasada anterior.

### Registro de la segunda pasada

Entorno Windows en `C:\w65\everprop-public`, sin Docker ni API nueva.

- `npm run lint`: código 0, 0 errores y 150 advertencias en el proyecto. Los componentes específicos de Mi Día y el helper no tienen advertencias en la comprobación dirigida.
- `npx tsc --noEmit`: código 0.
- `node --test --test-isolation=none tests/advisor-day-guide.test.mjs tests/commercial-queue.test.mjs tests/visit-confirmation.test.mjs`: **23/23 PASS**.
- `node --test --test-isolation=none tests/*.test.mjs`: **97/103 PASS, seis fallas** en `notifications-worker.test.mjs`. Su sandbox no define `self.navigator` y el worker accede a `clearAppBadge`/`setAppBadge`. Worker y tests de notificaciones coinciden con HEAD (`git diff --quiet HEAD -- ...` devuelve 0); no se modificaron por ser ajenos al ticket.
- `npm run build`: Turbopack compiló correctamente; el paso TypeScript no pudo lanzar su proceso (`spawn EPERM`). **Build no aprobado**, aunque la comprobación TypeScript independiente sí pasó.
- `git diff --check`: sin errores de espacios.
- Detector de diseño: tres avisos `gray-on-color` sobre reglas de compatibilidad existentes de `admin-design.css:130`; no son comprobaciones de contraste calculado en navegador.
- No hubo QA visual ni de teclado en navegador: `npm run dev -- --port 3066` falla con `spawn EPERM`. El arranque directo encontró un servidor existente en 3165 (PID 39236) y se detuvo sin reemplazarlo. La herramienta de navegador devolvió `Browser is not available: iab` y el inventario no tiene navegadores ni apps disponibles. No hay capturas nuevas ni afirmación de equivalencia visual verificada. No se detuvo el servidor ajeno a esta tarea.

Las pruebas del guiado usan render de JSX con hooks simulados, no un navegador ni una integración real con la API. Se requiere una pasada visual real en PC/iPhone, tema oscuro y Grande, incluyendo foco de los diálogos anidados y vuelta desde las fichas.

## 5. Pendientes y riesgos

### Lo que falta por API

- Resultados tipados e idempotentes y reversión: necesarios para «resueltos», intentos, reintentos, casillas verdes de resolución, check final y deshacer reales.
- Racha y resumen diario de resoluciones por usuario: indicadores omitidos hasta tener datos reales.
- Últimos mensajes y no leídos disponibles en Mi Día: hoy se ofrece acceso a la bandeja sin inventar contenido.
- Solicitudes de visita pendientes en el snapshot de Mi Día: se usa contactos para hoy como segundo contador y no se inventan confirmaciones dentro del guiado.
- Sincronización de la marca diaria entre dispositivos, si se requiere: actualmente es por usuario y origen en localStorage y solo guarda la fecha.

### Antes de considerar terminada la validación

- Validación visual en navegador a 1440 px y menos de 768 px, con dark/Grande, teclado y safe-area; no se pudo ejecutar en esta sesión.
- Corregir en el ticket correspondiente las seis fallas ajenas del sandbox de notificaciones. Completar el build en un entorno que permita crear procesos.
- La ronda vive durante el montaje: navegar a una ficha y volver no conserva el paso; puede reabrirse manualmente. No se inventó persistencia de clientes en el navegador.
- No se desplegó ni configuró staging o producción. Push/PR/deploy/migraciones requieren sus autorizaciones independientes; esta entrega queda local para revisión.
