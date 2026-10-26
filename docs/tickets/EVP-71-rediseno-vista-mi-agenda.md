# EVP-71 — Rediseño vista Mi Agenda

Rama autorizada `ticket/EVP-65-rediseno-visual` · 2026-10-25 · Codex. Ticket existente y En curso confirmado por el usuario; lectura de Jira no disponible (`Unknown tool`). Trabajo individual, sin commit, push ni PR. Sin lectura de entornos ni secretos.

## 1. Plan previo a código

- Revisar Agenda y sus dos llamadores, alta de citas, contratos de visitas/seguimientos, fechas comunes, informes EVP-66 a EVP-69 y ambos prototipos.
- Reutilizar el sistema corporativo existente: slate, CTA azul, Lucide, texto de 17 px, próxima actividad de hoy destacada, navegación Día/Semana/Mes y lista cronológica con cliente/unidad. Controles con wrap y adaptación a teléfono sin duplicar Atrás.
- Conservar consultas, permisos y persistencia. Revisar todos los datos antes de crear/cancelar; no inferir cancelaciones por vencimiento ni inventar duración, tareas o endpoints ausentes. Muestras solo bajo la guarda mock existente.
- Verificar lint, TypeScript y suite `tests/`; dejar una prueba pequeña de lógica nueva. Documentar resultados, límites de API y comprobaciones pendientes.

## 2. Qué se implementó

- `everprop-public/src/components/admin/CalendarAgenda.tsx`: Mi Agenda con destacada slate para la próxima visita/seguimiento de hoy, hora grande, cliente, unidad y notas. Día/Semana/Mes, navegación Anterior/Hoy/Siguiente y selección de fecha. Semana con siete días seleccionables; mes con calendario a todo el ancho y lista debajo en PC. Teléfono apila los bloques y acomoda controles en varias líneas, sin agregar Atrás. Lista cronológica con estados escritos, contactos, asesor, notas, Ver cliente, WhatsApp y Cancelar cita. Se revisaron sus dos llamadores (`/admin/agenda` y `AgendaView`).
- Mantiene las lecturas/polling y el filtrado por asesor existentes. Ya no convierte las visitas vencidas en canceladas; conserva el estado recibido. El mensaje de WhatsApp identifica la fecha real en lugar de afirmar «hoy». Los seguimientos mock se consultan desde la ficha y no se envían al endpoint de cancelación de visitas.
- La cancelación revisa cliente, unidad, fecha/hora, asesor, contactos y notas. Conservar cita no escribe; la referencia de guardado evita doble solicitud y bloquea el cierre durante la operación. En mock se explica la eliminación real del almacenamiento; en API se mantiene el historial existente.
- `everprop-public/src/components/admin/NewVisitModal.tsx` (un único llamador): formulario de hasta dos columnas y revisión de todos los datos antes de agendar. Volver a editar conserva el borrador; un fallo conserva la revisión y permite reintentar. Referencia para bloquear doble envío. En mock exige cliente o unidad vinculados porque ese almacenamiento no conserva citas independientes; evita anunciar éxito perdiendo la cita.
- `everprop-public/src/app/admin-design.css`: estilos acotados a `.mi-agenda`, texto de 17 px y preferencia Grande, botones escritos, wrap, foco visible, slate/azul y Lucide. Sin emojis, degradados ni truncate. Calendario mensual con etiquetas mínimas de 12 px; formularios y lista mantienen 17 px. Diálogos móviles con `--tw-translate-x/y: 0px` para Lightning CSS y acciones de 52 px.
- `everprop-public/tests/agenda-redesign.test.mjs`: dos pruebas pequeñas con el patrón VM/TypeScript ya utilizado. Cubren orden horario, revisión/cancelación sin escribir, visita vencida conservada como programada, alta con revisión de campos, vuelta a edición y bloqueo de doble envío.

No se agregaron endpoints, dependencias, variables ni cambios de backend. Las muestras y su almacenamiento permanecen exclusivamente dentro de las guardas `isMockDataMode` existentes.

## 3. Por qué esta solución

Se reutilizan el sistema corporativo aplicado en EVP-66/67/68/69, componentes de diálogo/botón, `DateTimeFields`, `QuickScheduleButtons`, clientes de visitas y el helper `formatArgentinaDateTime`. La API de visitas solo entrega inicio: se muestra «Martes 27/10, 10:00», sin inventar un final para construir un intervalo. `formatSlot` se conserva para solicitudes que sí tienen inicio/fin. Se respeta la composición de calendario PC y lista móvil de ambos HTML, adaptada a los datos reales; no se replican acciones simuladas del prototipo.

## 4. Cómo se verificó

Desde `C:\w65\everprop-public`:

- `npm run lint`: PASS, 0 errores y 144 advertencias del proyecto.
- `./node_modules/.bin/tsc.cmd --noEmit`: PASS.
- `node --test --test-isolation=none tests/*.test.mjs`: 126 pruebas, **120 PASS y 6 FAIL**. Las cuatro pruebas de Agenda pasan. Se usa la misma opción sin procesos hijos de EVP-69 por las restricciones de spawn del entorno.
- Los seis fallos corresponden a `tests/notifications-worker.test.mjs`, ya registrados en EVP-69: ausencia de `self.navigator` para `clearAppBadge`/`setAppBadge`. No se modificaron ese test ni el worker.
- `git diff --check`: PASS.
- Detector Impeccable: solo tres avisos previos de gray-on-color en el selector compartido con purple, fuera de Agenda. Sin hallazgos nuevos en las vistas cambiadas.
- Se revisaron las secciones Agenda de ambos prototipos, informes EVP-66/67/68/69 y guía local Next de Link. No había servidor escuchando en 3000–3003. No se inició Next porque cargaría archivos de entorno; **sin verificación visual en navegador ni build**. Las pruebas con hooks simulados no certifican layout, foco real ni integración API.

No se leyeron entornos ni secretos. Sin Docker, commit, push, PR, merge o despliegue. Jira no pudo verificarse ni actualizarse; se conserva la confirmación del usuario.

## 5. Pendientes y riesgos

- Falta revisión visual en PC y teléfono, temas claro/oscuro y tamaño Grande. Verificar calendario mensual, wrap, diálogos y sus acciones con teclado en un entorno autorizado.
- La API de agenda no entrega fin de visita ni tareas comerciales independientes. No se inventan duración, firmas, cobros, reprogramación, «marcar como hecho» ni avisos enviados. Los seguimientos solo existen en la rama mock que ya los cargaba; en API se muestran las visitas recibidas. El calendario semanal permite elegir día; no promete arrastrar o modificar horarios como el prototipo.
- La revisión de alta mantiene los contactos que el formulario ya admite; el correo se completa desde el cliente seleccionado. No se agregó un campo ni cambió el contrato.
- La próxima actividad corresponde exclusivamente a hoy y se recalcula al actualizar la agenda. Sin próximas hoy aparece un vacío explícito, sin completar con muestras en API.
- Persisten los seis fallos del worker ajenos al ticket. No presentar la suite completa como verde.
- No se configura staging ni producción; no hubo cambios de esquema, proveedores o accesos. Todo queda local en la rama expresamente autorizada.


## Correcciones de revisión de Claude — 2026-10-25

- `everprop-public/src/lib/mock-agenda.ts`: seis visitas de muestra vinculadas a los leads y unidades de Lucas (`usr-sales`): dos hoy, una mañana, una en tres días, una realizada ayer y una cancelada en dos días. La primera está a 90 minutos del momento de inicialización. Usa fecha de Argentina y desplazamientos de calendario. La guarda mock impide leer o escribir estas muestras en API. Se inicializan una vez por día y se conservan las ediciones/cancelaciones durante ese día; al cambiar el día se renuevan únicamente las seis muestras identificadas por su prefijo, conservando las demás visitas.
- La destacada conserva hora grande, cliente y unidad y agrega Abrir ficha y WhatsApp con texto. Mes ocupa todo el ancho con lista debajo, celdas de 64 px y contador; comienza en lunes como Semana. Se probaron los doce meses de 2026, incluidos los que empiezan en domingo.
- NewVisitModal conserva un máximo de dos columnas, revisión de cliente, unidad, fecha/hora, asesor, teléfono, correo y notas antes de escribir. Los selectores muestran además el nombre completo del cliente/unidad seleccionado fuera del control nativo para que su ancho no oculte información. Se ajustaron mínimos de ancho, alto de selects y wrap de acciones del diálogo.
- Verificación posterior: lint PASS (0 errores, 144 advertencias), TypeScript `tsc --noEmit` PASS; suite 126 pruebas: 120 PASS y los mismos 6 FAIL del worker de notificaciones. Las cuatro pruebas de Agenda pasan, incluyendo aislamiento mock/API, fechas relativas, persistencia de cancelaciones y renovación diaria. `git diff --check` PASS. Detector: los mismos tres avisos previos de purple en el CSS compartido, fuera de Agenda.
- Jira volvió a responder `Unknown tool`; se conserva la confirmación previa de ticket En curso. No hubo commit, push, PR, Docker ni despliegue. Solo archivos bajo `C:\w65`.
- Pendiente: comprobación visual real a 1440×900 y 375×812; no había servidor en 3000–3003 y no se inició uno. Las pruebas de componentes no certifican geometría ni selectores nativos. Límite temporal: si faltan menos de 90 minutos para medianoche, no es posible tener simultáneamente una visita hoy y a 90 minutos; se conserva hoy a las 12:00. Las muestras se renuevan por día, no desplazan su hora con cada polling.


## Revisión visual — Codex, 2026-10-26

Rama de integración autorizada: `ticket/EVP-65-rediseno-visual`. Primera pasada implementada; **no terminada ni aprobada visualmente**. Ticket existente y En curso según confirmación expresa del usuario; sin cambios de estado en Jira.

- Referencia: diapositiva 7, captura local `C:/Users/L A T I T U D E/Downloads/bellomo-rediseno-codex/capturas/s8.png` y sección Mi Agenda del prototipo `prototipos/bellomo-panel-app.html`. Las capturas tienen una lámina inicial adicional; se cotejó el título, no solo el número.
- Cambios frente a la referencia: Agenda semanal con horas y clientes reales, ordenados cronológicamente; chips pastel por estado, selección negra en los filtros y foco negro con acciones blancas. Se conserva la revisión completa antes de cancelar. Se quitó «muestras» del diálogo de cancelación.
- Archivos de pantalla: everprop-public/src/components/admin/CalendarAgenda.tsx; everprop-public/tests/agenda-redesign.test.mjs. Estilos únicamente en `everprop-public/src/app/admin-catalog.css`, importado inmediatamente después de admin-design.css en layout.tsx; no se editó la hoja compartida.
- Evidencia anterior existente: docs/tickets/evidence/EVP-71/1-pc-semana.jpg; docs/tickets/evidence/EVP-71/5-telefono-dia.jpg. No se presenta como evidencia de esta pasada.
- Capturas posteriores requeridas: `docs/tickets/evidence/EVP-71/mi-agenda-pc.png` y `mi-agenda-telefono.png`: **no generadas**.
- Solapamiento a 1440 y 375: **no ejecutado**, no se afirma `[]`. Scroll horizontal, palabras partidas, botones solo ícono y horarios: pendientes de comprobar en DOM real.
- Uso real demo admin/asesor, agregar/editar/confirmar/cancelar, búsqueda/filtros, vacío y error: no verificados en navegador. Las pruebas de componentes existentes no reemplazan estos controles.
- Oscuro, Grande y reducción de movimiento: reglas conservadas/extendidas, **sin inspección visual**. Objetivos de 17/20,4 px y botones 44/52 px pendientes de medición real.
- Límite concreto: no hay navegador en CUA. Playwright CLI instalado no puede lanzar su proceso (`spawn EPERM`). Chrome DevTools permite listar una página vacía pero rechaza abrir/navegar con «MCP tool call requires approval, but approval policy is never». No se puede conceder esa aprobación desde esta sesión.
- Comprobaciones disponibles: suite sin aislamiento de procesos, lint, TypeScript directo y detector; ver resultados finales en `docs/tickets/evidence/CODEX-PROGRESO.md`. Build compiló y falló al lanzar TypeScript (`spawn EPERM`); no es build OK.
- Límites y diferencias pendientes: La referencia usa una grilla horaria. Esta pasada conserva la selección de día y suma hasta tres actividades visibles por día; no implementa duraciones ni arrastre que la API no entrega. En teléfono propone dos columnas semanales legibles; falta comprobarlas. NewVisitModal es compartido con otras pantallas y conserva el mensaje «modo de muestra»; lo debe decidir Claude.

Sin backend, SQL, entornos, secretos, Docker, commit, push ni deploy. No se modificaron primitivas ui, MainLayout, navegación ni archivos de Claude.

## Conformidad — revisión del certificado, 2026-10-26

Fuente cotejada por extracción del PDF local: `C:/Users/L A T I T U D E/Downloads/RECIBO DE PAGO Y CERTIFICADO DE CONFORMIDAD DE ETAPA.pdf` (8/9/2026), apartados 2–6 aplicables. La transcripción funcional del usuario tiene prioridad sobre el diseño.

✓ significa comprobación de código o prueba automatizada descrita, no aprobación visual ni prueba contra API real. ✗ marca lo pendiente. Persistencia MySQL/Sanctum real: no aplica en mock (usa almacenamiento local); su verificación contra el servidor sigue pendiente.

| Punto aplicable | Estado | Evidencia o límite |
|---|---|---|
| 2 · Agenda de visitas | ✓ | Pruebas de alta con cliente/unidad, revisión de datos, volver a editar y bloqueo de envío duplicado en agenda-redesign.test.mjs. Se conserva NewVisitModal y la navegación a fichas. |
| 3 · Próxima acción con fecha/hora | ✓ en lectura mock | CalendarAgenda conserva los próximos contactos provenientes de seguimientos; no modifica su alta ni la sugerencia de etapa, a cargo de Claude. En API la agenda conserva el contrato de visitas; no se inventa un endpoint de seguimientos. |
| 6 · Asesor ve lo suyo; admin ve todo | ✓ en mock | Nueva prueba con dos asesores: usr-sales solo ve sus actividades; usr-admin con filtro Todos ve ambas asignaciones. Se conserva el filtro opcional del admin. API depende de la autorización del servidor y no se verificó contra un backend real. |
| 6 · Demo | ✓ por pruebas de componente; ✗ recorrido real | Fechas relativas, selección de hoy, carga de visitas y aislamiento están probados. El guion completo login→lead→contacto→ficha excede estas pantallas y lo verifica Claude. |
| Corrección visual de Agenda | ✓ implementación; ✗ nueva medición | Día seleccionado negro/blanco, sin borde azul; hoy lleva aria-current=date y punto rojo. La prueba comprueba el día actual y su selección. |

Archivos de esta revisión: CalendarAgenda.tsx, agenda-redesign.test.mjs y admin-catalog.css. No se modificó NewVisitModal compartido ni los archivos de leads/Claude.

Evidencia de Claude recibida en el chat: a 1366 y 375, texto normal y Grande, las seis pantallas anteriores dieron 0 encimados, 0 desbordes y sin scroll horizontal. Es evidencia informada por Claude, no ejecutada por Codex. **Los cambios de esta revisión quedan pendientes de nueva medición y capturas por Claude**, incluidos oscuro y reducir movimiento. No se intentó abrir el navegador ni iniciar servidor.

Suite completa: 171 pruebas, 165 aprobadas y solo las 6 fallas conocidas de notifications-worker. Lint: 0 errores/127 advertencias; TypeScript directo: OK. Build: compiló, luego `spawn EPERM` al lanzar TypeScript; no es build OK. Resultados y pendientes centralizados en CODEX-PROGRESO.md. Sin commit, push, deploy ni cambios fuera del frontend y estos informes autorizados.
