# EVP-15 — Priorizar consultas fuera de horario al abrir la atención

Rama `ticket/EVP-15-prioridad-manana` · base `630295c` · publicación autorizada 2026-10-14 · validación 2026-10-13 · autor Codex para Alvaro Ruggeri

## 1. Qué pedía el ticket

Las conversaciones derivadas fuera del horario de atención deben verse primero al comenzar la jornada, con una marca visible y el resumen del asistente si existe. Mantener alcance por asesor y tenant. No generar resúmenes ni llamar a un modelo.

## 2. Qué se implementó

- `InboundMessageService.php`: registra si un visitante queda esperando asesor mientras el tenant está cerrado; conserva la marca aunque escriba de nuevo durante el horario de atención.
- `ConversationControl.php`: clasifica la derivación de IA según BusinessHours y limpia la prioridad al tomar control, reanudar IA o cerrar.
- `AdminConversationController.php`: al estar abierto el tenant, ordena pendientes fuera de horario antes del orden habitual por actividad e ID, en SQL antes de paginar. Conserva todos los filtros y la consulta de visibilidad existente. Devuelve `arrived_out_of_hours` y `handoff_summary` (nullable); el resumen reutiliza el texto auditado de la derivación del epoch actual en `domain_outbox`, nunca otra sesión antigua.
- `ConversationInbox.tsx` y `conversations-api.ts`: marca «Llegó fuera de horario» y resumen disponible en cada fila. El resumen es texto escapado por React.
- Forward `2026-10-13.001_conversation_morning_inbox.sql`: columna booleana `conversations.waiting_out_of_hours`, expand-only, rerunnable, sin modificar el baseline, más índice por tenant/conversación/tipo de evento para evitar escanear todo el historial del outbox por cada fila.

Aplicar el forward **antes de desplegar el código de esta rama**. Solo se aplicó en `bellomo_crm_test`; no se modificó la base de demostración ni staging. Sin variables nuevas.

## 3. Por qué esta solución

Se reutilizan horarios, transiciones, outbox y bandeja existentes. Persistir la clasificación evita reinterpretar llegadas antiguas cuando cambia el horario y evita perder la prioridad por mensajes diurnos. Un tenant sin horario sigue siempre abierto. Una falla del servicio de horarios no impide guardar el mensaje ni derivarlo: queda sin la clasificación nueva.

No se reutiliza la prioridad comercial LOW/NORMAL/HIGH/URGENT para otro significado ni se ordena solo la página ya recibida. La marca se borra al comenzar la atención efectiva. Las conversaciones históricas no se reclasifican: su hora de actividad no demuestra cuándo comenzó la espera.

## 4. Cómo se verificó

Harness PHP 8.4 aislado en Docker, reutilizando MySQL 8.4 existente y únicamente la base `bellomo_crm_test`, sin iniciar otro stack ni sobrescribir archivos del checkout principal.

- Primero se escribieron pruebas que fallaron por la ausencia de la columna y del contrato nuevo.
- `php artisan test --filter='MorningInboxTest|ConversationSearchTest|BusinessHoursTest|HandoffAndDispatchTest|ReleaseSchemaTest'`: 30 pruebas, 228 aserciones; incluye seguimiento diurno que conserva la marca.
- Incluye prioridad entre 52 filas / dos páginas sin duplicados, límites de apertura, consulta sin resumen, resumen del epoch actual, aislamiento de tenant/asesor, toma de control/cierre, tenant sin horario y forward ejecutado dos veces sin alterar filas.
- Pint pasó sobre los cinco archivos PHP tocados.
- TypeScript `tsc --noEmit` pasó. ESLint de los dos archivos tocados: cero errores, un warning preexistente `set-state-in-effect` en la apertura por enlace.
- PHPStan `analyse --no-progress --memory-limit=1G`: sin errores (el límite predeterminado de 256 MB fue insuficiente).
- `npm run build -- --webpack`: aprobado, 31 páginas generadas. El build Turbopack falló por el enlace de node_modules fuera de la raíz del worktree; se usó el modo Webpack soportado sin modificar configuración ni dependencias.
- `git diff --check`: aprobado.
- Revisión independiente coordinada por el hilo principal: sin bloqueantes de aislamiento u orden. Observación de rendimiento resuelta con índice en el forward; seguimiento diurno y reapertura diurna cubiertos con regresiones.

Comprobación conjunta con los servicios y tests de EVP-14 sobrepuestos temporalmente: 43 pruebas MySQL / 290 aserciones aprobadas, incluyendo horarios, derivaciones, bandeja y esquema. Se restauraron los archivos de la rama tras ejecutar; no se mezclaron tickets.

## 5. Pendientes y riesgos

Validaciones anteriores realizadas sin despliegue. Commit, push y PR autorizados el 2026-10-14. Falta prueba visual en navegador y móvil. El resumen existente está limitado a los 500 caracteres que ya persiste la derivación y puede no estar disponible si se purga el outbox; en ese caso se muestra solo la marca. La paginación conserva los límites conocidos de offset frente a cambios concurrentes de la bandeja y al cambio de apertura entre peticiones.

Actualización 2026-10-14: se actualiza la base con develop c543f59, que ya incorpora EVP-14 (feriados, PR #22) y EVP-16. Este PR no agrega guardias ni cambia el criterio de feriados sin horario.

Validación posterior al rebase c543f59 (2026-10-14): 36 pruebas / 286 aserciones aprobadas en MySQL, incluyendo MorningInbox, BusinessHours con feriados del PR #22, ConversationSearch, HandoffAndDispatch, ReleaseSchema y ForwardScripts (EVP-16). La prueba temporal con guardias del 13/10 es evidencia histórica; no corresponde al código que se propone integrar hoy.
