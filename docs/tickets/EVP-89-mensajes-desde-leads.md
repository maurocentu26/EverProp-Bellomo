# EVP-89 — Mensajes desde el listado y el contacto guiado

Rama `ticket/EVP-89-mensajes-desde-leads`, desde `origin/develop` 0844b88. Fecha 2026-10-27. Implementación: Codex para Álvaro, commit `bec86e0`. Álvaro autorizó commit, push y PR hacia develop; merge y despliegue no autorizados.

## 1. Pedido y alcance

Agregar acceso al módulo de Conversaciones desde las acciones de cada lead y desde el paso activo del contacto guiado, conservando llamadas/WhatsApp externo y los controles del backend. EVP-89 existe en Jira, En curso y asignado a Álvaro. Complementa EVP-58; no altera la rama del PR82 ni la asignación de EVP-82/83/84 de Ramiro.

Criterios: móvil/escritorio, email sin teléfono, estado guiado preservado, búsqueda explícita con elección manual, sin llamadas por fila ni envíos automáticos, vacío/error/múltiples resultados, pruebas y revisión independiente.

## 2. Implementación

- `everprop-public/src/components/admin/LeadMessagesLink.tsx`: enlace compartido con etiqueta accesible que identifica al cliente y avisa nueva pestaña. Controles de 52px en móvil y al menos44px en escritorio; sin consulta de datos al renderizar. Si faltan teléfono y email, muestra motivo en vez de un botón sin efecto.
- `LeadTable.tsx`: usa el acceso en las acciones comunes a tarjetas y tabla; mantiene WhatsApp externo, teléfono, seguimiento y ficha.
- `advisor/AdvisorDayGuide.tsx`: acceso en el cliente activo e instrucción de volver para registrar el resultado. La nueva pestaña mantiene la ronda original; abrir mensajes no guarda ni avanza.
- `lib/conversation-presentation.ts`: construye fragmento codificado `#q=...`, normaliza teléfono a un sufijo de8dígitos para tolerar diferencias de prefijo (54/549), usa email si falta teléfono utilizable y limita a100caracteres. Fragmento no llega al servidor en URL HTTP/Referer; sigue existiendo en historial del navegador y la búsqueda se envía al backend autenticado existente. Nunca selecciona una identidad por coincidencia de sufijo.
- `conversations/ConversationInbox.tsx`: inicializa búsqueda desde fragmento antes de consultar. Conserva `?c=<uuid>` existente. Una búsqueda muestra resultados de todas las bandejas para que el asesor elija; borrar restaura las bandejas. Asocia resultados al filtro/término, oculta filas anteriores durante debounce/carga, ignora errores tardíos y vacía filas al fallar la consulta vigente.
- Pruebas: `lead-messages.test.mjs`; casos de navegación y estado en `advisor-day-guide.test.mjs`; adaptación de índices del harness existente `conversation-composer.test.mjs` a dos estados de carga nuevos, manteniendo sus aserciones.

Sin esquema, API, dependencias, permisos, tenant, proveedores ni variables nuevas.

## 3. Solución y límites

Se reutilizan búsqueda y autorización existentes. Un enlace no provoca una consulta por cada lead ni elige ciegamente el primer hilo. Teléfono/email son criterios de búsqueda: también pueden coincidir con texto de mensajes. El asesor debe confirmar el cliente antes de responder. Un contacto Instagram sin teléfono/email enlazable puede no aparecer en esta búsqueda.

El PR82 de Ramiro usa otro componente para ficha/Mi Día y sigue abierto sobre su rama de rediseño. No se copiaron sus cambios ni se modificó ese PR. Integrar las dos ramas requiere revisión humana; no afirmar que ya están ambas desplegadas.

Este ticket abre conversaciones existentes; no crea hilos ni habilita mensajes proactivos fuera de reglas de Meta. Si no existe hilo, se muestra resultado vacío y siguen disponibles los accesos externos en la pantalla original.

## 4. Verificación

- TDD:3pruebas nuevas fallaron inicialmente porque no existían las funciones; luego aprobadas. Se añadieron dos regresiones de respuestas diferidas y carga/filtros.
- Suite completa `node --test tests/*.test.mjs`:186/186 aprobadas, sin omisiones. Las dos pruebas del compositor requirieron adaptar su harness por orden de hooks, sin quitar aserciones.
- TypeScript `tsc --noEmit`:aprobado. ESLint de5archivos modificados:0errores,1aviso preexistente de setState en efecto `?c`.
- Build final `NEXT_PUBLIC_DATA_MODE=mock npm run build -- --webpack`: aprobado, 37 rutas generadas y comprobación TypeScript incluida.
- Revisión independiente obligatoria `/root/evp87_callback_review`: sin bloqueantes tras corregir prefijo telefónico y carrera de búsquedas. Ejecutó5pruebas de búsqueda y11del guiado,16/16, y diffcheck.
- Navegador local con `NEXT_PUBLIC_DATA_MODE=mock`, sin API/Docker: listado en anchos320/375/390/768/1024/1440, sin desborde horizontal de página ni texto del nuevo enlace. Guiado en los mismos6anchos con texto normal17px y Grande20.4px:12mediciones con dimensiones efectivas verificadas, sin desborde horizontal del nuevo control. Las alturas pequeñas permiten desplazamiento vertical.
- Verificado enlace del listado abriendo nueva pestaña; búsqueda por fragmento con vacío explícito; búsqueda `unidad` muestra hilos de bandejas humana e IA sin seleccionarlos; limpiar restaura bandejas. Mensajes desde guiado conserva Paso1; avanzar manualmente muestra acceso por email en lead sin teléfono. Evidencias en `docs/tickets/evidence/EVP-89/`.
- El zoom real200% no pudo verificarse: los atajos del navegador interno no cambiaron escala (devicePixelRatio1 antes/después). No equivale al modo Grande. Teclado táctil, lector de pantalla y celular físico no probados.
- Next Turbopack no acepta el node_modules compartido por symlink de este checkout; se usó webpack instalado sin cambiar dependencias/configuración. Nextdev generó un cambio de AGENTS.md; se excluye/restaura esa modificación automática al detener el servidor.

## 5. Pendientes y riesgos

Falta validación autenticada contra staging con teléfono/email de prueba, permisos efectivos y resultado real del cliente; el mock no tiene teléfonos/email en sus hilos. No se envió ningún mensaje real ni se desplegó. Álvaro autorizó publicar la rama y abrir el PR para revisión. La integración y el despliegue requieren autorización expresa adicional. El ticket se mantiene En curso.

Zoom200%, teclado móvil y celular físico pendientes. No hay certificación de responsive de todo el panel: estas evidencias cubren el listado y guiado afectados por EVP89. El resto de la reunión se organizó como propuestas fuera del repo, sin crear/reasignar tickets adicionales ni inventar datos comerciales.
