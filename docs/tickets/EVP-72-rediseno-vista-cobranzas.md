# EVP-72 — Rediseño vista Cobranzas & Cuotas

Rama autorizada `ticket/EVP-65-rediseno-visual` · 2026-10-25 · Codex. Usuario confirma Jira En curso. Trabajo individual, sin commit, push ni PR; sin leer entornos ni secretos. La instrucción explícita autoriza continuar la serie visual en esta rama.

## 1. Plan previo a código
- Revisar ruta, hook, contratos, todos los llamadores del formato monetario, muestras existentes e informes EVP-66 a EVP-71 y prototipos PC/teléfono.
- Destacar la cuota vencida más antigua o próxima pendiente con cliente, unidad, saldo, moneda y vencimiento. Mantener filtros, historial, exportaciones y permisos. Corporate slate/azul, Lucide, 17 px, controles con wrap y tarjetas móviles.
- Revisar todos los datos antes de registrar un pago, conservar borrador y bloqueo de doble envío. Moneda nula explícita y fuera de totales ARS/USD. Reutilizar muestras mock con fechas relativas y helper de fechas.
- Ejecutar lint, TypeScript y tests/; agregar prueba pequeña para lógica modificada y documentar límites de API y verificaciones pendientes.

## 2. Qué se implementó

- `everprop-public/src/app/admin/cobranzas/page.tsx`: composición de los dos prototipos adaptada a datos reales. Tarjeta slate con la cuota pendiente más antigua (vencida primero o próxima por fecha), cliente, proyecto/unidad, número de cuota, saldo, moneda y vencimiento; acceso a cliente y registro de pago. La prioridad no desaparece al filtrar la lista. Se excluyen pagadas/canceladas.
- Resumen de cobros del mes por moneda y vencimientos cercanos. Las cuotas sin moneda se cuentan pero sus importes no se asignan a ARS/USD; aviso explícito. Filtros Todas/Vencidas/Hoy/Por vencer en siete días/Pagadas con wrap y estado accesible; Por vencer incluye hoy. Pagadas cuenta todas las cuotas pagadas, no solo el mes. Búsqueda y proyecto conservados y etiquetados.
- Lista única de tarjetas de 17 px en PC y teléfono: dos columnas cuando el contenedor supera 850 px, una columna por debajo. Cada tarjeta muestra cliente/teléfono, plan/unidad, «Cuota N de total», estado con icono y texto, vencimiento y monto grande con moneda. WhatsApp, Registrar pago y Ver cliente tienen texto; se mantienen las condiciones de estado/datos/permisos de cada acción. Historial y email siguen disponibles. Exportar permanece secundario; la cabecera móvil apila botones de ancho completo. Filtros móviles en dos columnas iguales, Todas ocupa ambas. Se conserva historial, email, WhatsApp, exportaciones, nuevo plan, carga/error, permisos y sus clientes HTTP. No se agrega Atrás: lo resuelve MainLayout. Formularios del plan conservan hasta dos columnas y ahora asocian etiquetas con controles.
- El registro de pago usa el Dialog accesible existente, con edición y revisión separadas. Revisa cliente, proyecto/unidad, acuerdo, cuota, vencimiento, importe, saldo, monto/moneda del pago, medio, fecha, referencia, notas y usuario. Volver conserva el borrador; cancelar no escribe. El hook existente conserva bloqueo de doble envío, errores e idempotencia del cliente HTTP. Cierre y edición bloqueados durante el envío. Monto finito, positivo y hasta el saldo; sin moneda no se habilita el cobro. El permiso también se verifica en el handler.
- Nuevo plan usa también Dialog accesible, máximo dos columnas y una en teléfono; el cliente y la selección de proyecto/unidad se muestran además como texto que puede ocupar varias líneas. Revisar no crea el plan; la confirmación muestra cliente, proyecto/unidad, precio, anticipo, saldo, moneda, cantidad de cuotas, modalidad, interés, fecha de inicio e importe/fecha de la primera cuota. Volver conserva el borrador; solo Confirmar escribe. La proyección inicial incluye interés en API y su redondeo en centavos; mock conserva el cálculo existente sin interés. Se bloquean cierre y edición durante el envío.
- «Cobrado este mes» distingue dólares/pesos cobrados y singular/plural («1 cuota con pagos»).
- `everprop-public/src/components/admin/ExportLocalCollections.tsx`: etiqueta «Exportar», sin cambiar el archivo ni la lógica de descarga.
- `everprop-public/src/lib/installment-notifications.ts`: el formato común usa códigos explícitos ARS/USD y conserva es-AR y muestra el importe seguido de «Moneda sin confirmar» para null/undefined o moneda desconocida. Se revisaron todos sus llamadores: ruta, ficha de financiación, historial, almacenamiento y mensaje WhatsApp. Se reutiliza `formatDueDate`; sin duplicar helpers.
- `everprop-public/src/app/admin-design.css`: estilos acotados a cobranzas y su diálogo, 17 px, Grande 20,4 px, slate/azul, foco visible, controles de 44/52 px, sin truncate ni letra de 10/11 px. En móvil el diálogo ocupa la pantalla y usa `--tw-translate-x/y: 0px` para Lightning CSS.
- `everprop-public/tests/collections-redesign.test.mjs`: dos pruebas para formato es-AR/moneda desconocida, tarjetas sin tabla, teléfono/acciones, singular/plural y revisión/edición/cancelación/confirmación de pago y plan (incluido interés y cambio de año del primer vencimiento). Verifican que revisar y cancelar no escriban, todos los datos sean visibles y solo confirmar invoque el registro.

## 3. Por qué esta solución

Se reutilizan la API, los hooks financieros y sus permisos, el bloqueo de `useCollectionAction`, la idempotencia existente, las primitivas Dialog, Lucide, el helper monetario y de fecha y el sistema visual de EVP-66 a EVP-71. El rediseño se limita a la ruta solicitada; no cambia el flujo de pago de la ficha del cliente.

Las muestras ya existen en `sampleInstallments`/`samplePaymentAgreements` con `getRelativeDateStr`, incluidas cuotas vencidas, futuras y pagadas. Se conservan: `collections-api` solo utiliza esas semillas en su rama `isMockDataMode`; en API consulta paginación real. No se duplica el dataset ni se sobreescriben pagos mock guardados por el usuario. El estado mock persiste con el mecanismo anterior.

Sin cambios de API, dependencias, esquema, variables ni infraestructura. No se inventan moneda, unidades ausentes, métricas del prototipo ni endpoints. No se leen archivos de entorno ni secretos, ni se inicia Docker.

## 4. Cómo se verificó

En `C:\w65\everprop-public`:

- `npm run lint`: PASS, **0 errores y 141 advertencias** del proyecto.
- `./node_modules/.bin/tsc.cmd --noEmit`: PASS.
- `node --test --test-isolation=none tests/*.test.mjs`: **128 pruebas, 122 PASS y 6 FAIL**. Las dos del ticket pasan, incluidas las revisiones sin escritura y confirmaciones de pago y plan. Las seis fallas son las ya documentadas en EVP-66/71: sandbox de `notifications-worker.test.mjs` sin `self.navigator` para `clearAppBadge`/`setAppBadge`. El worker `public/notifications-sw.js` y su test coinciden con HEAD; no se modificaron.
- `git diff --check`: PASS; solo avisos de normalización CRLF/LF.
- Detector Impeccable: conserva los tres avisos previos `gray-on-color` sobre compatibilidad global en CSS:130, sin hallazgos nuevos en cobranzas.
- Revisión manual del flujo, guardas de permisos, mock, llamadores y CSS responsive. No equivale a validación visual: computer use devuelve `apps: []`, `browsers: []`; no se pudieron obtener capturas PC/teléfono ni comprobar teclado/foco en navegador. La navegación con Chrome DevTools fue rechazada por aprobación automática («MCP tool call requires approval, but approval policy is never»). Playwright CLI no está instalado ni disponible en caché y no se instalaron dependencias. No se verificaron visualmente 1440×900 ni 375×812.
- `npm run build`: compilación de producción PASS; la fase TypeScript del build no pudo iniciar su proceso hijo (`spawn EPERM`). El TypeScript independiente sí pasa; el build completo queda pendiente.
- Jira: la lectura mínima de recursos Atlassian devuelve `Unknown tool`. Se usa la confirmación explícita del usuario de ticket existente En curso; no se pudo verificar asignación ni actualizar Jira.

## 5. Pendientes y riesgos

- Validar visualmente PC y teléfono, oscuro/Grande, foco y retorno de diálogos en un navegador disponible. La revisión JSX usa hooks simulados, no una integración real con backend.
- El contrato tipa ARS/USD, pero si llega null se informa sin inferir moneda y se bloquea cobrar. Confirmar/corregir la moneda requiere un flujo de datos del servidor; no se agrega aquí.
- Cuando no viene unidad/cliente/proyecto se informa «sin confirmar»/«sin identificar». No se infiere inventario a partir del texto ni se agregan consultas de API. El recibo, autor y hora auditables siguen dependiendo del historial real existente; la pantalla no genera comprobantes nuevos ni inventa auditoría.
- Los seis tests de notificaciones pendientes se resuelven en su ticket. El build completo está bloqueado por `spawn EPERM`. No hubo despliegue, pruebas sobre datos reales ni configuración de staging/producción.
- Entrega exclusivamente local en la rama autorizada, sin commit, push, PR, merge ni migraciones.

## Revisión solicitada el 2026-10-25

Correcciones de la revisión de Claude implementadas en la misma rama y archivos locales, sin commit. Se sustituyó completamente la tabla PC, reutilizando el contenido de las tarjetas; no se duplican listas por breakpoint. Los resultados de verificación anteriores corresponden a esta revisión. Sigue pendiente la inspección visual en 1440×900 y 375×812 por los bloqueos del navegador descritos arriba; los tests JSX no prueban medidas reales, foco ni ausencia visual de truncados. Sin cambios de queries, policies, jobs, caché, permisos ni IA: no aplican revisiones especializadas de aislamiento/LLM a estas correcciones.
