# EVP-67 — Rediseño de la vista Conversaciones

Rama existente `ticket/EVP-65-rediseno-visual`, paraguas EVP-65. Base `78ac2af` (EVP-66). Fecha 2026-10-24. Autor: Codex, a pedido del usuario. Cambios locales sin commit, push, PR, merge ni despliegue.

## 1. Qué pedía el ticket

Traducir la pantalla «Mi Gestión · Conversaciones» de `bellomo-panel-app.html`, la lista Mensajes y el chat de `bellomo-iphone-app.html`, y la captura `s3.png`, al sistema corporativo usado en Mi Día. Conservar acciones, contratos, permisos, epoch, handoff y lógica de IA. Usar datos reales en modo API y, en la segunda pasada autorizada, muestras sintéticas exclusivamente en modo mock; texto de 17 px, Grande +20 %, oscuro, foco visible, controles de 44/52 px y movimiento reducido.

Se leyeron CLAUDE.md, AGENTS.md, las instrucciones de frontend, TICKETS.md, la skill corporativa, Ponytail full y el informe EVP-66. El usuario autorizó expresamente continuar sobre la rama paraguas existente. Jira devolvió `Unknown tool` al consultar los recursos de Atlassian; se conserva la confirmación del usuario de que EVP-67 existe y está En curso. No se pudo verificar su asignación ni actualizar Jira.

### Plan seguido antes de editar

1. Trazar carga, polling, selección, envío, borradores, control humano, copiloto y acceso a ficha; revisar los contratos de conversaciones y solicitudes de visita.
2. Reorganizar la presentación en bandeja, chat y cliente, conservando las acciones existentes.
3. Adaptar navegación apilada, compositor y espacio del dock; aplicar escala, tema y accesibilidad.
4. Ejecutar lint, TypeScript y las pruebas existentes/ampliadas; dejar evidencia y entregar a Claude para revisión en navegador y al usuario para aprobación (ODD).

## 2. Qué se implementó

- `everprop-public/src/components/admin/conversations/ConversationInbox.tsx`: pestañas Para vos / Atiende la IA / Cerradas con contadores sobre la respuesta autorizada; filtros anteriores conservados en Mostrar y búsqueda existente. Filas con iniciales, nombre, hora, último mensaje de una línea, motivo derivado del estado real y canal. Panel del cliente por conversación. Etiquetas visibles Cliente, IA, Asesor y Sistema en las burbujas; colores distintos para cliente, IA y asesor. Estado «Ahora atendés vos» y acceso directo «Devolver a la IA» al formulario existente. Sugerencia real del copiloto destacada, Usar esta respuesta, Escribir otra y Enviar visible.
- `everprop-public/src/lib/conversation-presentation.ts`: agrupación de los seis estados existentes en tres bandejas y etiquetas de motivo. TRANSITION_PENDING sigue siendo control pendiente; no se presenta como control confirmado ni se inventa una derivación de IA.
- `everprop-public/src/components/admin/assistant/VisitRequestsBoard.tsx`: modo embebido opcional por `conversationId`, reutilizando carga, edición de fecha, revisión, confirmación, rechazo y protección READ_ONLY. Solo muestra las solicitudes de la conversación abierta; incluye cliente, código completo de unidad, fechas/horas propuestas y fecha acordada. El estado permanece «Solicitada · por confirmar» hasta persistir la confirmación. El tablero independiente conserva su uso sin props.
- `everprop-public/src/app/admin-design.css`: reemplazo de la apariencia WhatsApp por superficies corporativas, CTA blue-600, tarjetas de 24 px, panel de visita slate-900, colores semánticos con texto, sin degradados nuevos. 17 px / 20,4 px, foco visible, controles de 44 px y 52 px móvil y movimiento reducido. Tres columnas desde 1200 px; dos de 768 a 1199 px con acceso Ver cliente. Bajo 768 px, lista/chat apilados, Atrás visible y chat fijo al visualViewport con compositor al pie, reserva de dock/safe-area y ajuste al teclado. Se anulan explícitamente `--tw-translate-x/y` junto con translate/transform.
- `everprop-public/src/components/admin/MainLayout.tsx`: el contenedor de Conversaciones usa el mismo breakpoint de 768 px del chat; las condiciones son exclusivas de esa ruta.
- `everprop-public/tests/conversation-presentation.test.mjs`: estados, contadores y motivos sin inferencias ficticias.
- `everprop-public/tests/visit-confirmation.test.mjs`: conserva revisión, cancelación, error/reintento y READ_ONLY; agrega filtrado por conversación y ausencia de escrituras al renderizar el panel.

Flujo: se consulta la bandeja mediante el endpoint existente con filtro Todas por defecto, se agrupa visualmente la respuesta y se abre un hilo mediante el flujo previo. Las pestañas no cambian la autorización del servidor. El panel consulta solicitudes pendientes mediante el cliente existente y filtra por ID exacto. Confirmar sigue pasando por la revisión existente. Abrir ficha invoca únicamente por clic la acción existente `openConversationLead` y navega al lead resultante.

Sin cambios de backend, API, permisos, esquema, configuración de entornos, variables ni dependencias. Sin llamadas automáticas a creación de leads al seleccionar una conversación. No se abrieron archivos de entorno ni secretos.

## 3. Por qué esta solución

Se reutiliza el componente de conversaciones y sus handlers; no se crea otro mecanismo de envío, control, copiloto ni confirmación de visitas. El tablero de solicitudes admite un modo embebido para compartir la revisión de cliente/unidad/fecha en lugar de duplicarla.

Adaptaciones obligadas por los datos disponibles:

- La respuesta de bandeja no expone el motivo de handoff por fila. El chip describe el estado y el fuera de horario reales; el resumen de derivación sigue mostrando el motivo real cuando se carga el hilo.
- Los contadores describen las conversaciones cargadas en el filtro/búsqueda actual, con una ayuda discreta en las pestañas (title). No son totales globales del tenant. Para vos agrupa atención humana dentro de lo autorizado por el servidor; los responsables con vista de equipo conservan ese alcance, y Mías sigue disponible.
- La conversación no entrega un vínculo de lectura al lead ni su etapa comercial, interés completo u origen de campaña. El interés del panel sale de las unidades de solicitudes pendientes. La etapa remite a la ficha y el origen se identifica expresamente como canal de la conversación. No se adivinan datos por nombre ni se interpreta texto de IA como información comercial verificada.
- `openConversationLead` puede crear/asignar un lead y requiere escritura: se conserva detrás de un clic y se oculta para READ_ONLY, igual que la acción anterior. No se usa para precargar información.
- Usar esta respuesta carga el compositor; Enviar sigue siendo la acción que manda el mensaje. Escribir otra descarta la sugerencia del compositor. No se copia el envío automático de los prototipos.

## 4. Cómo se verificó

Entorno local Windows, `C:\w65\everprop-public`. Sin Docker, despliegue ni operaciones sobre datos reales.

- `npm run lint`: PASS, 0 errores y 150 advertencias del proyecto.
- `npx tsc --noEmit`: PASS.
- `node --test --test-isolation=none tests/conversations-api.test.mjs tests/conversation-presentation.test.mjs tests/visit-confirmation.test.mjs tests/chat-session.test.mjs`: **21/21 PASS**. Incluye las pruebas existentes de API, cursor/polling, merge de mensajes, idempotencia de envío, epoch al reabrir, notas y sesión del widget, más presentación y confirmación.
- `git diff --check`: PASS; Git avisa normalización CRLF/LF.
- Detector Impeccable sobre los dos componentes y CSS: tres avisos `gray-on-color` en `admin-design.css:130`, anteriores y ya registrados por EVP-66. No certifica contraste calculado en navegador.

Las pruebas de componentes ejercitan handlers con hooks simulados; no equivalen a una integración de navegador/API. No se corrió build ni la suite completa ajena a Conversaciones. No se modificaron tests de notificaciones ni sus fallas registradas en EVP-66.

## 5. Pendientes y riesgos

- **Segunda revisión de Claude en navegador pendiente**, tras corregir los defectos reportados en su primera revisión; aprobación final del usuario pendiente. Verificar PC 1440 px, ancho intermedio y móvil 375 px; claro/oscuro, Normal/Grande, foco, adjuntos/notas/plantillas, sugerencia y envío, confirmación/error de visita, Atrás, teclado iOS y dock/safe-area. La implementación CSS no se presenta como equivalencia visual certificada.
- Etapa, intereses completos, campaña de origen y totales globales no se pueden completar con el contrato de lectura actual. Si deben estar íntegros en esta pantalla, requieren ampliar el contrato en otro alcance autorizado; no se hizo en EVP-67 por la prohibición expresa de cambios de API.
- El panel de visitas carga al abrir la conversación y se refresca con Actualizar o después de resolver una solicitud, como el tablero existente; no se agregó otro polling.
- Revisar la navegación responsive con el teclado real y los menús existentes: la altura sigue el visualViewport; en móvil el dock se oculta durante la escritura para evitar solapamientos.
- No se configuró ni desplegó staging o producción. No hubo commit, push ni PR. El estado queda local para revisión.


## Segunda pasada — revisión de Claude (2026-10-24)

Se parte de los cambios locales anteriores, sin revertirlos ni cambiar de rama. Alcance solicitado: datos de QA exclusivamente mock y cuatro correcciones visibles. Se leyeron Ponytail full, Impeccable y la guía instalada de variables de entorno de Next. La consulta mínima del conector Jira volvió a fallar con `Unknown tool`; se conserva la confirmación previa registrada de EVP-67 En curso. No se modificó Jira.

### Cambios

- `everprop-public/src/lib/conversations-api.ts`: cinco contactos argentinos sintéticos (Lucía Ferreyra, Tomás Quiroga, Martina Sosa, Nicolás Pereyra y Camila Funes), WhatsApp/web, estados humano/IA/cerrado y espera de respuesta. Hilos con cliente, IA y asesor; derivación con resumen real de la muestra y etiqueta «Te la pasó la IA». El botón del copiloto produce una sugerencia sobre la visita, que no se envía hasta que el asesor la usa y envía. Lista, filtros, búsqueda, cursor y acciones operan en memoria cuando `isMockDataMode` es verdadero; en API se mantienen los endpoints existentes sin fallback a muestras. Envíos/notas/plantillas deduplican la misma clave; reapertura verifica el epoch observado. Adjuntos y apertura de ficha explican que requieren API y no llaman al servidor ni navegan a un cliente ficticio.
- `everprop-public/src/lib/assistant-api.ts`: solicitud mock vinculada a Lucía, unidad exacta `12`, proyecto Las Moras, lunes 26/10/2026 de 10:30 a 11:00 hora argentina. Permanece REQUESTED hasta confirmarla mediante la revisión existente; confirmar/rechazar actualiza solo memoria. Se rechazan fechas inválidas/pasadas. Las funciones de conocimiento y consumo no cambian.
- `ConversationInbox.tsx` y `admin-design.css`: panel del cliente con fondo, borde, padding, contención del texto y estado vacío con título y orientación; pestañas sin salto de línea con scroll horizontal cuando falta ancho (también con texto Grande); se elimina la línea de contadores y el estado de actualización queda solo para lector de pantalla. El error de bandeja ofrece «Reintentar» conectado a la actualización existente, con estado ocupado.
- `tests/conversations-mock.test.mjs`: cuatro pruebas nuevas cubren muestras/filtros/hilos, todas las acciones de conversación sin API, solicitud/confirmación/rechazo y ausencia de muestras en modo API. El stub existente de `conversations-api.test.mjs` declara explícitamente modo API.

### Verificación de esta pasada

En `C:\w65\everprop-public`, sin Docker ni archivos de entorno:

- `npm run lint`: PASS, 0 errores, 150 advertencias existentes.
- `npx tsc --noEmit`: PASS.
- `node --test --test-isolation=none tests/conversations-api.test.mjs tests/conversations-mock.test.mjs tests/conversation-presentation.test.mjs tests/visit-confirmation.test.mjs tests/chat-session.test.mjs`: **25/25 PASS**. Los stubs de API fallan ante cualquier llamada en mock; se verifican cero llamadas, y el modo API mantiene los endpoints.
- `git diff --check`: PASS después de normalizar los finales de línea de los clientes API y su test. Solo avisos de normalización CRLF/LF de Git en archivos previos.
- Detector Impeccable: los mismos tres avisos anteriores `gray-on-color` de `admin-design.css:130`; ninguno nuevo en el componente.

No se ejecutó build, suite completa ni una nueva revisión en navegador a 1440×900/móvil; las correcciones de layout requieren esa segunda inspección visual. Mock no representa una API completa ni valida permisos de servidor: se reinicia al recargar, no sube archivos ni abre fichas reales. La fecha de la visita es fija para QA y debe actualizarse si se reutiliza después del 26/10/2026; la confirmación no admite fechas pasadas. Staging y producción no se configuraron ni desplegaron. No hubo commit, push, PR ni lectura de archivos de entorno con secretos.

Tercera pasada (2026-10-24): pestañas completas en segmentado sin scroll; panel derecho con columna mínima de 290 px, contención de grid y wrap; visitas como «Lunes 26/10, de 10:30 a 11:00» en hora argentina; sugerencia visible sobre el compositor sin reemplazar borrador hasta Usar esta respuesta (solo entonces se atribuye al copiloto), Escribir otra conserva el borrador; controles con Rápidas/Nota/Adjuntar/Sugerir/Más; separador de fecha sin sticky; encabezado móvil en dos filas con estado/acciones juntos y derivación plegable para recuperar espacio. npm run lint PASS (0 errores, 150 advertencias existentes), npx tsc --noEmit PASS, suite focal de conversaciones/mock/presentación/compositor/visitas/sesión 28/28 PASS (incluye preservación de borrador, uso/descarte y atribución de sugerencia, fecha argentina y cambio de día UTC), git diff --check PASS; detector con los mismos 3 avisos previos. Sin build, suite completa ni nueva revisión visual: quedan por comprobar PC/móvil, texto Grande, tres burbujas visibles y teclado real; Jira sigue inaccesible (Unknown tool), con estado En curso previamente confirmado. Solo C:\w65, sin Docker, commit, push, PR, despliegue ni lectura de archivos de entorno con secretos.
