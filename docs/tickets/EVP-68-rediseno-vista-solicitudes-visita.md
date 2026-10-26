# EVP-68 — Rediseño de la vista Solicitudes de visita

Rama existente `ticket/EVP-65-rediseno-visual`, paraguas EVP-65, sobre EVP-66 `78ac2af` y EVP-67 `f51a68b`. Fecha: 2026-10-24. Autor: Codex, por pedido del usuario. Cambios locales sin commit, push, PR, merge ni despliegue.

## 1. Qué pedía el ticket

Traducir la composición aprobada de «Mi Gestión · Solicitudes de visita» de `bellomo-panel-app.html`, la vista móvil de `bellomo-iphone-app.html` y `capturas/s4.png` al sistema corporativo ya utilizado en Mi Día y Conversaciones. Se consultaron el HTML/CSS de ambas referencias, la captura, la skill corporativa y los informes EVP-66/67.

El usuario confirmó que EVP-68 existe en Jira y está En curso y autorizó continuar en la rama paraguas. El conector Atlassian devolvió `Unknown tool`; no se pudo verificar asignación ni actualizar Jira. Se respeta el flujo ODD: Codex implementa, Claude revisa en navegador, tests verifican y el usuario aprueba.

Fuera de alcance: backend, contratos HTTP, permisos, nuevas dependencias y configuración de entornos.

## 2. Qué se implementó

- `everprop-public/src/components/admin/assistant/VisitRequestsBoard.tsx`: composición independiente con título y bajada solicitada, pestañas Por confirmar / Confirmadas / Pasadas con contadores y sin saltos internos. Grilla con la solicitud más cercana en slate-900, fecha grande, cliente, código exacto y proyecto, canal, fecha del pedido, mensaje entre comillas y estado escrito. Los demás pedidos usan amber semántico con texto. Debajo se muestran las visitas confirmadas; las pestañas filtran el contenido sin navegar ni escribir datos.
- Confirmar y Revisar y confirmar visita llaman al mismo handler y abren la revisión D12 existente: cliente, unidad completa, fecha y hora. Solo Confirmar y agendar persiste. Cancelar no escribe; un error conserva la revisión para reintentar. Proponer otro horario / Otro horario despliegan el campo existente de fecha y acceso a la conversación para acordarlo antes de confirmar. No se envían propuestas automáticamente. Se conserva Rechazar detrás del editor y de la confirmación existente. READ_ONLY oculta los controles de escritura y el diálogo y también tiene guardas en handlers.
- Se preserva el panel embebido de EVP-67, su filtro exacto por conversación y su consulta exclusiva de REQUESTED. El tablero independiente consulta los cuatro estados mediante el cliente existente. Ordena las opciones por fecha. Las confirmadas recuperan el horario real por `visit_id` desde la lectura existente de agenda; no muestran el horario pedido como si fuera el acordado. Una cancelación en agenda se refleja como cancelada. El canal se cruza por `conversation_id` con la bandeja existente. No se cruzan nombres ni unidades parecidas.
- Pasadas incluye confirmadas cuyo inicio ya ocurrió, rechazadas, canceladas y pedidos con todas sus opciones vencidas. Estos últimos conservan «Solicitada · horario vencido», sin convertirse en confirmados. La clasificación se recalcula al cargar/actualizar. Las confirmadas sin horario accesible permanecen en Confirmadas con «Horario acordado no disponible».
- `everprop-public/src/app/admin-design.css`: tarjetas de 24 px, botones en pastilla, tipografía de Mi Día y colores corporativos. Tres columnas desde 1200 px, dos columnas con destacada a todo el ancho entre 768 y 1199 px, tarjetas y filas apiladas bajo 768 px. Botones de acción móviles de 52 px a todo el ancho, padding lateral de 16 px y wrap de textos largos. Se reutilizan el dock de asesores y la reserva de safe-area de EVP-66, sin duplicarlos. La revisión conserva la regla móvil existente que anula `--tw-translate-x/y` para Lightning CSS. Tema oscuro, foco visible y movimiento reducido heredados.
- `everprop-public/src/lib/assistant-api.ts`: seis muestras exclusivamente mock, tres REQUESTED y tres CONFIRMED, con unidades distintas `12`, `12A`, `4B` de Torre Sur, clientes/canales consistentes con conversaciones mock, fechas y confirmadores sintéticos. Confirmar cambia solo memoria y conserva el horario efectivamente elegido y un ID único. En modo API no hay fallback a muestras ni cambios de endpoints/payloads. Los metadatos de presentación son opcionales; no amplían el contrato del servidor.
- `everprop-public/tests/visit-confirmation.test.mjs` y `tests/conversations-mock.test.mjs`: regresiones D12, revisión/cancelación/error/reintento, propuesta de horario, READ_ONLY, panel embebido, estados y pasadas, cruces por ID exacto, ausencia de autor inventado, seis muestras y aislamiento mock/API.

No se abrieron archivos de entorno con secretos. Sin Docker ni servicios iniciados.

## 3. Por qué esta solución

Se reutilizan la ruta, el componente, el diálogo, las mutaciones y las lecturas autorizadas existentes. No se crea un segundo flujo de confirmación ni se interpreta el asesor asignado como autor de la confirmación.

Límites del contrato actual:

- **El servidor no entrega el nombre de quien confirmó.** Las muestras lo muestran por nombre; en API se informa «Confirmada · autor no disponible». No se puede completar ese requisito real sin ampliar el contrato en un alcance autorizado.
- La bandeja de conversaciones entrega una ventana de resultados; si una conversación no está en ella, el canal figura «Sin informar». No se infiere por teléfono ni se cargan hilos completos para conseguirlo.
- La agenda tiene su propio alcance autorizado. Una visita no accesible o una lectura fallida no se sustituye por una propuesta. Si falla una lectura auxiliar, aparece aviso con indicación de Actualizar; si falla la carga principal, se muestra error y no se representa como vacío.
- Los contadores corresponden a los registros cargados por el endpoint, limitado a 200 por estado. No son totales globales garantizados. No se inventa un filtro «esta semana» porque se listan las confirmadas cargadas.

## 4. Cómo se verificó

Entorno Windows local, `C:\w65\everprop-public`.

- `npm run lint`: PASS, 0 errores y 150 advertencias del proyecto. Se corrigió durante la implementación una llamada impura a Date.now en render; el corte temporal ahora vive en estado y se actualiza después de las lecturas.
- `npx tsc --noEmit`: PASS.
- `node --test --test-isolation=none tests/visit-confirmation.test.mjs tests/conversations-mock.test.mjs tests/conversations-api.test.mjs tests/conversation-presentation.test.mjs tests/conversation-composer.test.mjs tests/chat-session.test.mjs`: **31/31 PASS**.
- `npm run build`: compilación optimizada PASS; el proceso completo **no terminó**, porque la etapa TypeScript falló al crear un proceso con `spawn EPERM`. El chequeo TypeScript independiente sí pasó. No se afirma build completo exitoso.
- Detector Impeccable sobre componente/CSS: solo los tres avisos previos `gray-on-color` en `admin-design.css:130`, registrados en EVP-66/67. No reemplaza contraste calculado en navegador.
- `git diff --check`: PASS, con avisos Git de normalización CRLF/LF.

Las pruebas usan hooks simulados y clientes mock; no equivalen a una integración con API real ni a una revisión visual.

## 5. Pendientes y riesgos

- **Pendientes revisión de Claude en navegador y aprobación del usuario.** Revisar 1440 px, ancho intermedio y móvil 375 px, temas claro/oscuro, Normal/Grande, pestañas completas en una línea, wrap, foco, dock/safe-area, ausencia de desbordes y botones móviles de 52 px. Probar Confirmar desde destacada y tarjetas, Otro horario, cancelar revisión, error/reintento, READ_ONLY y regresión del panel de Conversaciones.
- Verificar en un entorno API autorizado los alcances de agenda y bandeja y los estados de datos faltantes. La autoría real de confirmación requiere una futura ampliación del contrato; no está disponible hoy.
- Muestras en memoria, reiniciadas al recargar, con fechas fijas del 26 al 28/10/2026: después pasarán a Pasadas y deben actualizarse si se reutilizan para QA. Mock no valida permisos del servidor ni envíos reales.
- Sin suite completa ajena al alcance, navegador por Codex ni build completo. No se configuraron staging ni producción, ni se desplegó. Los cambios quedan locales, sin commit/push/PR.
