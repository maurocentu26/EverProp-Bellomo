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


## Revisión visual — Codex, 2026-10-26

Rama de integración autorizada: `ticket/EVP-65-rediseno-visual`. Primera pasada implementada; **no terminada ni aprobada visualmente**. Ticket existente y En curso según confirmación expresa del usuario; sin cambios de estado en Jira.

- Referencia: diapositiva 14, captura local `C:/Users/L A T I T U D E/Downloads/bellomo-rediseno-codex/capturas/s15.png` y sección Configuración del prototipo `prototipos/bellomo-panel-app.html`. Las capturas tienen una lámina inicial adicional; se cotejó el título, no solo el número.
- Cambios frente a la referencia: Cuenta y Apariencia en dos columnas de tarjetas de radio 24; una columna en teléfono; campos de cuenta suaves y controles redondos. Se eliminaron nombre y correo de relleno: si faltan se muestra Sin datos. Los diálogos de confirmación conservan composición vertical.
- Archivos de pantalla: everprop-public/src/app/admin/settings/page.tsx. Estilos únicamente en `everprop-public/src/app/admin-catalog.css`, importado inmediatamente después de admin-design.css en layout.tsx; no se editó la hoja compartida.
- Evidencia anterior existente: docs/tickets/evidence/EVP-78/1-pc-preferencias.jpg; docs/tickets/evidence/EVP-78/3-telefono.jpg. No se presenta como evidencia de esta pasada.
- Capturas posteriores requeridas: `docs/tickets/evidence/EVP-78/configuracion-pc.png` y `configuracion-telefono.png`: **no generadas**.
- Solapamiento a 1440 y 375: **no ejecutado**, no se afirma `[]`. Scroll horizontal, palabras partidas, botones solo ícono y horarios: pendientes de comprobar en DOM real.
- Uso real demo admin/asesor, agregar/editar/confirmar/cancelar, búsqueda/filtros, vacío y error: no verificados en navegador. Las pruebas de componentes existentes no reemplazan estos controles.
- Oscuro, Grande y reducción de movimiento: reglas conservadas/extendidas, **sin inspección visual**. Objetivos de 17/20,4 px y botones 44/52 px pendientes de medición real.
- Límite concreto: no hay navegador en CUA. Playwright CLI instalado no puede lanzar su proceso (`spawn EPERM`). Chrome DevTools permite listar una página vacía pero rechaza abrir/navegar con «MCP tool call requires approval, but approval policy is never». No se puede conceder esa aprobación desde esta sesión.
- Comprobaciones disponibles: suite sin aislamiento de procesos, lint, TypeScript directo y detector; ver resultados finales en `docs/tickets/evidence/CODEX-PROGRESO.md`. Build compiló y falló al lanzar TypeScript (`spawn EPERM`); no es build OK.
- Límites y diferencias pendientes: Se mantienen las tarjetas de configuración y sus permisos. No se inventan estados de conexión, avisos ni datos del usuario. Los controles compartidos de tema y tamaño se conservan. Falta revisión real en oscuro/Grande.

Sin backend, SQL, entornos, secretos, Docker, commit, push ni deploy. No se modificaron primitivas ui, MainLayout, navegación ni archivos de Claude.

## Conformidad — revisión del certificado, 2026-10-26

Fuente cotejada por extracción del PDF local: `C:/Users/L A T I T U D E/Downloads/RECIBO DE PAGO Y CERTIFICADO DE CONFORMIDAD DE ETAPA.pdf` (8/9/2026), apartados 2–6 aplicables. La transcripción funcional del usuario tiene prioridad sobre el diseño.

✓ significa comprobación de código o prueba automatizada descrita, no aprobación visual ni prueba contra API real. ✗ marca lo pendiente. Persistencia MySQL/Sanctum real: no aplica en mock (usa almacenamiento local); su verificación contra el servidor sigue pendiente.

| Punto aplicable | Estado | Evidencia o límite |
|---|---|---|
| Alcance del certificado | ✓ preservación | El certificado no enumera una pantalla de Configuración. Se conservan cuenta, tema/tamaño, notificaciones y configuración de empresa existente. |
| 6 · Roles | ✓ | settings-redesign.test.mjs verifica que permisos denegados no ofrecen acciones, tanto en API simulada como en mock. No se habilitaron botones de empresa basándose solo en el rol visual. |
| 6 · Demo | ✓ en pruebas; ✗ uso real nuevo | Las preferencias de notificaciones se mantienen locales; las confirmaciones de IA, horarios y WhatsApp se prueban antes de cualquier escritura. No hay credenciales ni respuestas sensibles en el render. |
| 5 · Acceso a avisos | ✓ revisión de código | Se conserva Ver mis notificaciones. Campana, contador y pestañas/acciones de notifications son componentes compartidos fuera de este reparto; no se modificaron ni se certifican aquí. |
| Radio 24 y mayúsculas | ✓ inspección estática; ✗ nueva captura | Cada grupo conserva radio 24. Se inspeccionaron SettingsPage, PushPreferences, OutOfHoursAlerts, WhatsAppConnect, AiSettings y BusinessHoursSettings sin cadenas/títulos uppercase; regla local elimina text-transform y tracking de .uppercase si lo aporta una clase. No se cambiaron los componentes compartidos. |
| Claro/oscuro/Grande | ✗ revalidación real | Controles y reglas existentes conservados. La medición informada por Claude cubre la pasada previa, no certifica los nuevos cambios. |

Archivos de esta revisión: admin-catalog.css (.settings-view .uppercase); no se editaron componentes compartidos de configuración.

Evidencia de Claude recibida en el chat: a 1366 y 375, texto normal y Grande, las seis pantallas anteriores dieron 0 encimados, 0 desbordes y sin scroll horizontal. Es evidencia informada por Claude, no ejecutada por Codex. **Los cambios de esta revisión quedan pendientes de nueva medición y capturas por Claude**, incluidos oscuro y reducir movimiento. No se intentó abrir el navegador ni iniciar servidor.

Suite completa: 171 pruebas, 165 aprobadas y solo las 6 fallas conocidas de notifications-worker. Lint: 0 errores/127 advertencias; TypeScript directo: OK. Build: compiló, luego `spawn EPERM` al lanzar TypeScript; no es build OK. Resultados y pendientes centralizados en CODEX-PROGRESO.md. Sin commit, push, deploy ni cambios fuera del frontend y estos informes autorizados.
