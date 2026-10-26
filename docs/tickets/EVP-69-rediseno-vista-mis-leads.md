# EVP-69 — Rediseño vista Mis Leads

Rama autorizada `ticket/EVP-65-rediseno-visual` · 2026-10-24 · Codex. El usuario confirma ticket existente y En curso en Jira. Trabajo individual; sin commit, push, PR ni despliegue. No se leen entornos ni secretos.

## 1. Plan previo a código

- **Mis Leads:** `everprop-public/src/app/admin/leads/page.tsx`, `LeadTable.tsx` y `src/app/admin-design.css`. Encabezado, prioridad destacada real, filtros horizontales, contadores por etapa y lista móvil/tabla PC con acciones escritas. Reutilizar filtros, permisos, seguimiento y persistencia. Riesgos: contadores parciales por paginación y falta de mensajes/estadísticas del prototipo; no presentarlos como totales globales.
- **Ficha del lead:** `LeadDetailView.tsx` y CSS compartido. Datos/contacto a la izquierda, próximo paso destacado, intereses e historial arriba; financiación secundaria plegable al final, compatible con el orden pedido para EVP-58. Conservar validación comercial y autorizaciones. Riesgos: conflicto futuro con EVP-58 y textos/datos de confirmaciones destructivas; revisar diff antes de integrar ambos tickets.
- **Nuevo lead:** `NewLeadForm.tsx` y CSS compartido. Formulario claro de 17 px, instrucciones y revisión completa antes de guardar; conservar campos/validación/asignación reales. Revisar todos sus llamadores (alta y edición). Riesgos: no prometer deduplicación o asignación automática que la API no garantice; cancelar revisión debe conservar el borrador.
- **Verificación:** lint, TypeScript, todos los tests de `tests/`, prueba pequeña para lógica nueva y revisión responsive si es viable sin abrir entornos. Muestras exclusivamente en modo mock, sin cambios de API ni dependencias.

## 2. Qué se implementó

- `everprop-public/src/app/admin/leads/page.tsx`: título Mis Leads, próximo contacto pendiente entre los resultados visibles (excluye ganados y descartados), contadores por etapa con alcance «clientes cargados», pestañas de tipo de interés y filtros de etapa/origen/seguimiento/asesor en una sola tira desplazable. Conserva búsquedas, permisos, orden comercial y registro de seguimiento. En mock no aparece «Cargar más» porque ese botón consulta la API.
- `everprop-public/src/components/admin/LeadTable.tsx`: acciones con texto también en PC; tabla desde 1120 px de contenedor y lista en anchos menores. Conserva selectores de etapa, guardas comerciales, WhatsApp, llamada y acceso a ficha.
- `everprop-public/src/components/admin/LeadDetailView.tsx`: tres columnas PC (identidad/contacto, contenido comercial, próximo paso/asesor); dos en ancho intermedio y una en teléfono. Etapa visible, intereses e historial primero; información pendiente/notas y acuerdos después; calculadora secundaria plegable. Las confirmaciones de eliminación identifican al cliente y al interés. El lookup de asesores de muestra queda exclusivamente en mock; en API usa el nombre recibido o «Asesor asignado», sin atribuir nombres inventados.
- `everprop-public/src/components/admin/NewLeadForm.tsx`: alta y edición con escala de 17 px, foco «Antes de guardar», campos existentes, CTA escrito y acciones laterales en PC. Validación antes de abrir una revisión de nombre/contactos/origen/etapa/asesor/interés/proyecto/activo/unidad/importe/notas; presupuesto/prioridad se revisan en alta. Volver conserva el borrador, error conserva la revisión y una referencia bloquea doble confirmación incluso antes del siguiente render. En edición no se ofrecen presupuesto/prioridad que ese flujo no guardaba. La lectura del almacenamiento de muestras en edición ahora está dentro de la guarda mock.
- `everprop-public/src/components/admin/LeadFollowUpTimeline.tsx`: escala del diálogo y consulta de asesores de muestra solo en mock. Conserva los datos históricos de la API.
- `everprop-public/src/components/admin/VisitManager.tsx`: fechas uniformes, «Cancelar cita» con texto y revisión de cliente/fecha/contactos/activo/notas antes de cancelar. Se revisaron sus dos llamadores: ficha de lead y ficha de propiedad. Conserva la operación, el historial, los errores y el bloqueo durante guardado.
- `everprop-public/src/lib/lead-follow-up.ts`: reutiliza el formateador común con zona argentina y salida «Martes 27/10, 10:00». También lo consumen los estados de seguimiento y `AdminMonthBalanceWidget`; cambia únicamente la presentación, sin alterar plazos ni fechas persistidas. Se revisaron todos sus llamadores.
- `everprop-public/src/app/admin-design.css`: reglas acotadas a estas vistas, slate/CTA azul, tarjetas de 24 px, texto de 17 px y preferencia Grande heredada, acciones de al menos 44 px (52 px en móvil), filtros sin wrap, foco visible y confirmaciones móviles con `--tw-translate-x/y: 0px`. Se reutiliza el movimiento reducido del sistema Mi Día. Sin emojis ni degradados nuevos.
- `everprop-public/tests/leads-redesign.test.mjs`: cuatro pruebas con el patrón VM/TypeScript existente, sin dependencias nuevas: validación/revisión/cancelación/doble confirmación, error de API y reintento, fecha argentina incluso al cruzar medianoche UTC y revisión de cancelación de cita.

El flujo conserva los contratos actuales: lista → ficha o alta → revisión → persistencia real → navegación solo tras éxito. No se incorporaron datos de ejemplo de los prototipos. No se cambió API, esquema, configuración, dependencias ni proveedores.

## 3. Por qué esta solución

Reutilizar el sistema corporate-design-system, componentes existentes y contratos actuales. Se adaptan las etapas reales, sin inventar Reserva/Boleto ni actividad de conversaciones.

## 4. Cómo se verificó

Desde `everprop-public`, sobre los archivos finales:

- `npm run lint`: PASS, 0 errores y 148 advertencias. No se hizo limpieza ajena al ticket.
- `./node_modules/.bin/tsc.cmd --noEmit`: PASS. Se utilizó el compilador ya instalado; un intento inicial de `npx tsc` desde la raíz no encontró ese binario en caché y no instaló nada.
- `node --test --test-isolation=none tests/*.test.mjs`: **122 pruebas, 116 PASS, 6 FAIL**. Las cuatro pruebas de EVP-69 pasan. La invocación predeterminada con aislamiento por proceso fue rechazada por el sandbox con `spawn EPERM`, por eso se usó la opción nativa sin procesos hijos.
- Los seis fallos están en `tests/notifications-worker.test.mjs`, cuyo código y `public/notifications-sw.js` no se modificaron: cuatro destinos inválidos y reutilización de ventana fallan por `self.navigator` ausente al consultar `clearAppBadge`; el payload malformado falla al consultar `setAppBadge`. Ya estaban presentes en la primera ejecución de la suite, antes de agregar las pruebas nuevas. No se corrigieron fuera de EVP-69.
- `git diff --check`: PASS.
- Detector Impeccable sobre CSS y vistas: únicamente tres advertencias anteriores en `admin-design.css:130` (texto slate sobre fondo purple). Sin hallazgos nuevos en los targets examinados.
- Se inspeccionaron los fragmentos de Mis Leads/ficha/alta de los dos HTML proporcionados y los informes EVP-66/67/68. Se revisaron las guías locales de Next para navegación y los llamadores compartidos.
- **Sin QA visual en navegador ni build**: no había un servidor local escuchando en 3000–3003 y no se inició Next, que cargaría archivos de entorno. No se puede certificar fidelidad visual, ausencia de overflow, tema oscuro o tamaño Grande con capturas en esta sesión. Queda una pasada PC/teléfono para la revisión.

No se leyeron archivos de entorno ni secretos; no se inició Docker ni se desplegó. El conector Atlassian se descubrió y su lectura mínima `getAccessibleAtlassianResources` devolvió `Unknown tool`; no se pudo verificar ni actualizar Jira.

## 5. Pendientes y riesgos

- Jira: se conserva la confirmación del usuario de EVP-69 En curso; conector inaccesible, sin actualización de estado.
- EVP-58: se respeta intereses/historial antes de financiación. Ambos tickets tocan la ficha; revisar el diff al integrar, sin revertir trabajo del otro desarrollador.
- Datos faltantes: esta vista no carga mensajes entrantes ni su antigüedad, ni un consejo comercial generado. La destacada usa seguimiento real y no inventa «escribió hace 25 min», rachas ni un plan de cuotas sugerido.
- Etapas: se conservan Nuevo/Contactado/Visita Agendada/Negociación/Ganado/Descartado. No se inventan Reserva/Boleto del prototipo.
- Contadores: describen registros cargados, sin afirmar totales globales de una cartera paginada.
- Alta: el contrato actual acepta nombre y teléfono **o correo**, además de origen. Se conserva esa validación, en vez de descartar contactos válidos que solo tienen correo. No se promete detección de teléfono duplicado ni salto automático a una ficha existente: el alta actual no expone ese resultado en el contrato de frontend.
- El alta de API permite asociar un activo, pero no guarda un interés independiente de categoría/proyecto sin activo; esa limitación preexistente no se resuelve con datos locales ni con otra API inventada. Presupuesto/prioridad permanecen en el alta existente; no se ofrecen en edición porque ese flujo no los persistía.
- La reasignación devuelve solo estado, sin el nombre nuevo: hasta recargar la ficha puede mostrarse «Asesor asignado». No se completa con nombres de muestra.
- Falta la pasada visual PC/teléfono y continúan los seis fallos del worker de notificaciones; no presentar la suite completa como verde.
- Sin commit, push, PR, merge o despliegue. Rama compartida autorizada expresamente. No se configura staging ni producción en este ticket.
