# EVP-78 — Rediseño de la vista Configuración

Rama `ticket/EVP-65-rediseno-visual` · sin commit, push ni PR · 2026-10-25 · Codex, por solicitud del usuario.

## 1. Qué pedía el ticket

Completar el último módulo del rediseño sobre `/admin/settings`, con tarjetas legibles, controles personales grandes, confirmación de cambios compartidos, consulta sin acciones para cuentas sin permiso y muestras exclusivas del modo mock. Conservar permisos y contratos existentes, sin build ni acceso a secretos.

El usuario confirmó que EVP-78 existe en Jira y está En curso, y que EVP-77 fue revisado, aprobado y commiteado en `ac2adb2`. Por instrucción expresa no se consultó ni actualizó Jira. También autorizó trabajar sobre la rama maestra del rediseño y dejar los cambios sin commit, excepciones al flujo habitual de ramas y cierre.

## 2. Qué se implementó

- `src/app/admin/settings/page.tsx`: cuenta con valores faltantes explícitos; explicación por sección; preferencias con estado visible; enlace Atrás solo si no lo aporta ya el contenedor del asesor. Conserva la ruta y el guard de `layout.tsx`, que no necesitó cambios.
- `src/app/admin-design.css`: estilos `settings-*`, texto base de 17 px, superficies del panel, foco visible, controles de 44 px como mínimo, contraste con colores del tema, una columna y botones de ancho completo en teléfono. Las reglas móviles existentes conservan su orden final para no romper las verificaciones de Estadísticas.
- `src/components/theme/ThemeToggle.tsx` y `PanelTextSize.tsx`: opción `showLabel` usada en Configuración para mostrar Claro/Oscuro y Actual/Grande. Los demás llamadores conservan su presentación.
- `src/components/admin/SettingsConfirmation.tsx`: diálogo existente del panel, con título, explicación, valor anterior, valor nuevo, cancelar y confirmar. Reutiliza la gestión de foco, teclado y cierre de Dialog; bloquea el cierre durante el guardado.
- `AiSettings.tsx`, `BusinessHoursSettings.tsx`, `WhatsAppConnect.tsx`: confirmación antes de guardar el modo de atención, horarios/aviso/feriados, conectar o desconectar WhatsApp. Cancelar no escribe. Las denegaciones del servidor muestran tarjetas informativas sin acciones. Los errores de guardado mantienen el borrador y muestran una explicación simple fuera del diálogo.
- `PushPreferences.tsx` y `OutOfHoursAlerts.tsx`: estados de avisos en palabras y operación local de las muestras cuando `isMockDataMode` está activo, sin registrar dispositivos ni pedir permiso del navegador en ese modo.
- Las muestras de horarios, modo de atención y conexión de empresa se habilitan exclusivamente en mock para perfiles administrativos de muestra; los demás perfiles conservan la vista de consulta. En modo real se mantienen las solicitudes y autorizaciones existentes del servidor.
- Los datos de conexión no se imprimen: se muestra Configurado/Sin configurar; los identificadores siguen siendo referencias internas de las operaciones. Tampoco se muestran errores crudos del proveedor o del servidor. No se leyeron archivos de credenciales ni se modificaron contratos, permisos o configuración de entorno.
- `tests/settings-redesign.test.mjs`: siete pruebas ejecutables con TypeScript y VM, siguiendo el estilo de Conocimiento; cubren denegación, ausencia de acciones, confirmaciones, cancelación, contenido anterior/nuevo, ocultamiento de valores sensibles sintéticos, errores simples y separación del modo mock.

## 3. Por qué esta solución

Se conservaron los componentes y los flujos de guardado existentes. Solo se agregó una pieza compartida para las confirmaciones requeridas. No hay dependencias nuevas, rutas duplicadas ni cambios de backend. Se consultaron los prototipos de escritorio/teléfono y los estilos ya aprobados de Inventario, Proyectos, Estadísticas y Conocimiento.

### Lo que la API no informa o no permite consultar

Según los contratos que ya consume el frontend, sin realizar consultas nuevas al servicio:

- No hay información general de empresa editable en esta página: no se inventaron razón social, dirección ni campos de empresa ajenos a las secciones existentes.
- Los contratos de horarios e IA no incluyen capacidades separadas de lectura y escritura. Se mantiene el mecanismo previo de autorización mediante la respuesta del servidor; no se inventan permisos en el cliente para datos reales.
- Si el servidor devuelve acceso denegado, tampoco entrega los valores de empresa para mostrarlos en consulta. La tarjeta explica esa limitación y no fabrica valores reales ni permite editar.
- La cuenta y el número nuevos de WhatsApp se eligen dentro de Meta después de la confirmación del panel. El diálogo compara el estado anterior con el efecto de conectar la cuenta que se elija, sin prometer un número que aún no se conoce ni mostrar valores sensibles.
- La configuración de conexión no informa un indicador general sobre secretos guardados. Configurado/Sin configurar describe la información de conexión disponible; no pretende verificar credenciales.
- Los avisos no ofrecen preferencias independientes por tipo de evento; se conservan la activación por dispositivo y la opción fuera de horario. Tampoco se agregó un modo de tema automático que el proveedor de temas actual no ofrece.

## 4. Cómo se verificó

- `npm run lint`: terminó con código 0, cero errores y 127 advertencias. La comprobación acotada de los archivos cambiados tuvo cero errores y cinco advertencias `react-hooks/set-state-in-effect` por la carga de estado, incluidas las ramas mock; no se ocultaron reglas.
- `npx tsc --noEmit`: aprobado; se volvió a ejecutar tras los ajustes finales.
- `node --test --experimental-test-isolation=none tests/settings-redesign.test.mjs`: 7/7 aprobadas.
- Configuración + Conocimiento + Estadísticas: 20/20 aprobadas.
- `node --test --experimental-test-isolation=none tests/*.test.mjs`: 162 pruebas, 156 aprobadas y 6 fallidas en `tests/notifications-worker.test.mjs`. Sus simulaciones no incluyen `self.navigator`, usado por `clearAppBadge`/`setAppBadge`. Tanto ese test como `public/notifications-sw.js` coinciden con HEAD (`git diff --exit-code` sin diferencias); esos fallos quedan fuera del ticket.
- El comando habitual `node --test` no pudo crear procesos por `spawn EPERM`; se usó la opción de Node para ejecutar sin aislamiento por procesos.
- Detector de Impeccable: tres advertencias de gris sobre fondo violeta en la línea 130 preexistente del CSS compartido; ninguna señalada en los estilos nuevos de Configuración. No se amplió el alcance para corregir otras vistas.
- No se ejecutó build. No se inició Docker ni se alteró el servidor local existente.
- Revisión visual de escritorio y 375 px pendiente: no hay navegadores disponibles en la herramienta de navegador. El arranque habitual de Next fue rechazado por `spawn EPERM`; el intento directo encontró el servidor existente en 3165 y se cerró sin reemplazarlo. No se afirma haber validado visualmente ni medido el desborde en un navegador. Los tests comprueban las reglas de contención del CSS, no su resultado visual.

## 5. Pendientes y riesgos

- Revisar en navegador a 375 px y escritorio, ambos temas y tamaño Grande; verificar foco/cierre de diálogos, ausencia de desborde y un único Atrás con ambos perfiles.
- Probar las operaciones reales con usuarios autorizados y sin permiso en el entorno de destino. Las pruebas del ticket simulan los contratos y no validan la configuración ni credenciales del servicio o de Meta.
- La lectura de valores de empresa para perfiles denegados necesita soporte del servicio si se desea mostrar esos valores en el futuro; no se cambió la autorización para conseguirlo.
- Corregir las seis pruebas preexistentes del trabajador de avisos en otro ticket.
- Ningún despliegue realizado: no se configuraron accesos de staging o producción. No hay cambios SQL ni variables nuevas. Si se propone pasar a producción, sigue pendiente verificar forwards en `schema_versions`, dominios definitivos, CORS/R2, hosts/Sanctum/cookies y `tenant_domains`, credenciales y permisos de proveedores, base de datos y storage; las pruebas locales no validan producción.

Informe creado en la ruta solicitada fuera de `everprop-public`; los cambios de implementación están limitados a ese proyecto. Todo queda sin commit para revisión.
