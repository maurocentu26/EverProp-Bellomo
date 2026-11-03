# EVP-104 — QA UX/UI integral: unificación de escala visual, accesibilidad, borradores y resiliencia de Kanban

## 1. Resumen del ticket
- **Clave Jira:** `EVP-104`
- **Estado:** En revisión (ampliado el 2026-11-03)
- **Rama:** `ticket/EVP-104-qa-ux-ui-integral` (creada desde `develop`)
- **Objetivo:** Resolver de forma transversal los 14 hallazgos documentados en el diagnóstico **"EverProp — QA UX/UI integral: diagnóstico y cobertura"** (`UI-01` a `UI-08` y `CODE-01` a `CODE-06`), unificando el contrato de escala tipográfica (`Actual` y `Grande` `1.2x`), las áreas táctiles mínimas (`44px` escritorio / `52px` móvil), la semántica de teclado en overlays y tablas, la persistencia/confirmación de borradores y el manejo de errores/rollback en el tablero Kanban.

## 2. Causa raíz
1. **Escala visual y modo `Grande` (`UI-01`, `UI-02`):** `.admin-workspace` definía `font-size: 14px` (`16.8px` en `Grande`) y `h1` con `clamp(1.5rem, 2.2vw, 2rem)` (`31.68px` a `1440px` y `24px` a `320px`). En modo `Grande`, el selector `html[data-panel-text-size="grande"] .admin-workspace h1` (`0,2,2`) pisaba a `.leads-workspace h1` y `.visit-heading h1` (`0,1,1`), achicando el `H1` móvil de `30px` a `28.8px`, mientras que `.mi-day.day-board .day-heading h1` (`0,3,1`) tenía `34px`/`28px` fijos y no escalaba, y `.knowledge-view` faltaba en la regla `Grande` de `admin-catalog.css`.
2. **Áreas táctiles y buscador Web (`UI-03`, `UI-04`, `UI-08`):** El selector `.admin-topbar [data-slot="button"]:not([class*="size-"])` nunca coincidía porque `<Button>` incluye `[&_svg:not([class*='size-'])]:size-4`. Los controles de barra superior (`PanelTextSize`, `ThemeToggle`, `GlobalSearch`, `AdminMenuAccount`) y los filtros de `ProjectWebEditor` tenían entre `29.59px` y `40px` de alto. Además, el buscador de `ProjectWebEditor` carecía de `aria-label` y mostraba contadores `(0)` y estado vacío junto con el alerta de error de API.
3. **Kanban de Leads (`CODE-01`, `CODE-02`, `CODE-03`):** En `LeadKanban.tsx`, el bloque `catch` al fallar `loadEverpropLeads()`/`loadEverpropCatalog()` no hacía `return`, cayendo silenciosamente a `sampleLeads`/`sampleProjects`. El cambio de etapa en `handleDragEnd` no guardaba la etapa previa para hacer rollback si `updateEverpropLead` fallaba, y solo se configuraban `MouseSensor` y `TouchSensor` sin `KeyboardSensor` ni selector accesible en la tarjeta.
4. **Overlays de Conversaciones (`UI-06`, `UI-07`):** El disparador `"Más"` y el menú `[role="menu"]` en `ConversationInbox.tsx` no manejaban `ArrowDown`/`ArrowUp`/`Escape`, y el diálogo `"Reanudar Asistente IA"` carecía de `aria-modal="true"` y cierre con `Escape`.
5. **Formularios y tablas (`UI-05`, `CODE-04`, `CODE-05`, `CODE-06`):** `NewLeadForm` perdía el borrador al navegar entre módulos SPA; `LeadTable` usaba `<span onClick={router.push}>` no enfocable por teclado; `NewPropertyForm` y `EditPropertyModal` mostraban errores visuales sin `role="alert"` / `aria-live="assertive"` ni confirmación uniforme de cambios sin guardar.

## 3. Cambios realizados
- **Commit 1 (`fix(EVP-104): unify panel typography scale, grande 1.2x factor, touch targets and web catalog states`):**
  - `src/app/admin-design.css`, `src/app/admin-catalog.css`, `src/app/panel-text-size.css`: contrato único de tokens `--panel-scale` (`1` en `Actual`, `1.2` en `Grande`), `--panel-text` (`17px` / `20.4px`), `--panel-meta` (`15px` / `18px`), `--panel-h1` (`34px` escritorio / `28px` móvil en `Actual`; `40.8px` / `33.6px` en `Grande`), y altura táctil mínima de `44px` en escritorio y `52px` en móvil (`< 768px`).
  - `src/components/theme/PanelTextSize.tsx`, `src/components/theme/ThemeToggle.tsx`, `src/components/admin/AdminMenuAccount.tsx`, `src/components/admin/navbar/GlobalSearch.tsx`, `src/components/admin/AdminNavbar.tsx`: áreas táctiles mínimas `44x44px` (`min-h-11 min-w-11`).
  - `src/components/admin/ProjectWebEditor.tsx`: agregado `aria-label` al buscador (`UI-04`), áreas táctiles `min-h-11` en filtros y buscador (`UI-03`), y separación estricta entre estado de error de API y catálogo vacío (`UI-08`).
- **Commit 2 (`fix(EVP-104): prevent kanban sample fallback on API failure, rollback failed stage updates and support keyboard`):**
  - `src/components/admin/LeadKanban.tsx`, `src/components/admin/kanban/KanbanCard.tsx`, `src/app/admin/page.tsx`: eliminado fallback a `sampleLeads`/`sampleProjects` fuera de modo mock mostrando `role="alert"` con botón `Reintentar` (`CODE-01`); implementado rollback de etapa y mensaje `role="alert"` si falla `updateEverpropLead` (`CODE-02`); agregado `KeyboardSensor` y selector `<select>` accesible por tarjeta (`CODE-03`).
- **Commit 3 (`fix(EVP-104): add keyboard navigation and modal escape semantics to conversation overlays`):**
  - `src/components/admin/conversations/ConversationInbox.tsx`, `tests/conversation-composer.test.mjs`: navegación por teclado (`ArrowDown`, `ArrowUp`, `Escape` con retorno de foco al disparador) en el menú `"Más"` (`UI-06`), y `aria-modal="true"` más cierre con `Escape` en el diálogo `"Reanudar Asistente IA"` (`UI-07`).
- **Commit 4 (`test(EVP-104): add regression suite, form draft persistence, accessible lead rows and ticket report`):**
  - `src/components/admin/LeadTable.tsx`: nombre del lead convertido en `<Link href="/admin/leads/...">` accesible por teclado (`CODE-04`).
  - `src/components/admin/NewPropertyForm.tsx`, `src/components/admin/EditPropertyModal.tsx`: contenedores de error con `role="alert"`, `aria-live="assertive"`, foco programático (`CODE-05`) y protección de cambios sin guardar (`CODE-06`).
  - `src/components/admin/NewLeadForm.tsx`: persistencia de borrador en `sessionStorage` (`everprop:new-lead-draft:${companyId}`), restauración al volver al módulo y confirmación al cancelar (`UI-05`, `CODE-06`).
  - `tests/qa-ux-ui-regression.test.mjs`: suite de regresión para los contratos UX/UI y de código de `EVP-104`.

- **Ampliación del 2026-11-03 (ficha del cliente, commit `87716ed`):**
  - `src/components/admin/LeadDetailView.tsx`: nuevo layout con cabecera fija (nombre, etapa editable, llamar, WhatsApp, seguimiento y menú «Más acciones»), columna de gestión (asesor, presupuesto, prioridad, origen, contacto, notas y datos faltantes; desplegable en móvil), franja «Próximo paso» y tres pestañas operables con flechas, `Home` y `End`: Actividad (historial y visitas), Intereses y Financiación. Se eliminan «Resumen principal» y «Ficha y gestión» como pestañas; eliminar cliente pasa al menú, solo para `ADMIN`.
  - `formatMoney` en la misma vista: un precio o presupuesto sin moneda se muestra como «moneda no confirmada» en lugar de asumir USD.
  - `src/components/admin/LeadStageUpdateModal.tsx`: texto neutro, porque el diálogo ahora también se abre a mano desde la cabecera y no solo después de registrar un contacto. Afecta también a `/admin/leads` y a `AdvisorCockpit`.
  - `src/app/admin-design.css`: estilos de la cabecera, la columna y la barra inferior móvil (elevada sobre `.advisor-dock` para asesores); se borran las reglas del layout anterior que quedaron sin uso.
  - `src/app/admin-design.css`: corrección de una regresión del primer commit de este ticket. `.admin-topbar :is(button, a)[class*="size-"]` también matcheaba botones con texto, porque `Button` incluye `size-` en sus variantes, y recortaba «+ Lead» y «+ Activo» a 44px. Ahora apunta a `.size-11`.
  - Ajustes tras revisar la ficha en Actual y Grande: título de la cabecera en 1.4 veces el texto base, una excepción deliberada al H1 de página porque 34px y 40.8px cortaban el nombre; las acciones bajan de fila cuando no entran y sus rótulos se ocultan en anchos intermedios; la etapa larga ya no desborda; la columna pasa a dos columnas recién desde 1280px, es fija solo en Actual con pantalla alta y sin scroll interno en Grande, con etiqueta sobre valor; «Seguimiento» entra en la barra móvil, y bajo 360px queda el ícono con su nombre accesible; las pestañas bajan de línea en vez de hacer scroll; `LeadFollowUpTimeline.tsx` deja de truncar «Próximo». `VisitManager.tsx`: el email de la visita ahora corta dentro de su tarjeta, porque desbordaba a 320px en Grande.
  - `tests/qa-ux-ui-regression.test.mjs`: el test de la ficha se reescribe para el nuevo layout.

## 4. Cómo se probó
- **Tests unitarios y de regresión:**
  - `node --test tests/qa-ux-ui-regression.test.mjs` -> 4/4 tests en verde.
  - `node --test tests/conversation-composer.test.mjs tests/leads-redesign.test.mjs tests/inventory-redesign.test.mjs tests/web-projects-redesign.test.mjs tests/mi-day-conformity.test.mjs tests/stats-redesign.test.mjs tests/knowledge-redesign.test.mjs tests/settings-redesign.test.mjs tests/projects-redesign.test.mjs tests/lots-matrix-redesign.test.mjs` -> todos en verde.
- **Build de producción Next.js:**
  - `npm run build` -> compilación y generación de rutas exitosa sin errores de tipos.

- **Verificación completa tras la ampliación (2026-11-03):** `tsc --noEmit` sin errores; `node --test tests/*.test.mjs` 199/200; `eslint src tests` 0 errores y 123 advertencias; `npm run build` compila.
  - El test que falla es `tests/assistant-trace.test.mjs` y no viene de este ticket: `AssistantTrace.tsx` es idéntico a `develop`. La expresión del test matchea la palabra `innerHTML` en un comentario del componente (línea 10), que justamente prohíbe usarlo; no se encontró uso real.
  - `npm run lint` sin acotar a `src` y `tests` da 92 errores, todos en `.agents/skills/remotion-*`, sin versionar y ajenos al ticket.
- **Ampliación de la ficha, navegador local (`localhost:3000`, API local, cuentas de prueba `ADMIN` y `ADVISOR`, 2026-11-03):**
  - 1440×900: cabecera de 74px en Actual y 83px en Grande; contenido desde el píxel 386 y 440; nombre sin cortar en 1440, 1280, 1024, 768, 375 y 320px en ambos tamaños, con un lead de nombre corto; cabecera fija al hacer scroll.
  - Pestañas: `ArrowRight`, `ArrowLeft`, `End` y el ciclo entre extremos mueven foco y panel. Eventos de teclado despachados por script, no con teclado físico.
  - 375×812 con `ADVISOR`: la barra de acciones no se superpone con `.advisor-dock`. 320×700 con `ADMIN`, en Actual y Grande: sin desborde horizontal de la página.
  - Diálogo de etapa y menú «Más acciones»: se abren con sus opciones. No se guardó ningún cambio de etapa, asesor ni eliminación desde la nueva vista.
  - Moneda: «moneda no confirmada» verificada solo por test de código; el lead de prueba no tenía intereses con precio.

- **Entorno:** verificado solo en local. No se desplegó a staging, no hay forwards SQL ni variables nuevas, y no cambian dominios, CORS, Sanctum ni proveedores. Falta probar el flujo en el navegador de staging después del merge.

## 5. Riesgos y pendientes
- En Grande, chips y contadores de la ficha siguen más chicos que en Actual (12 a 13px contra 17px): la causa está en reglas globales de tamaño y se trata en EVP-105, igual que la jerarquía tipográfica plana.
- A 1024px la cabecera ocupa dos filas (130px en Actual, 146px en Grande), y el contenido arranca más abajo que a 1280px o más.
- `FinancingCalculator` sigue recibiendo `USD` como moneda inicial cuando el activo no la tiene (`primaryProperty?.currency ?? "USD"`): es un valor editable del simulador, no se cambió aquí, y conviene revisarlo.
- Historial y visitas quedan apilados dentro de Actividad; fusionarlos en una sola línea de tiempo queda para otro ticket, si hace falta.
- Este cambio es puramente de frontend en `everprop-public` (no incluye forwards SQL ni cambios de variables de entorno).
- Queda pendiente la validación con API real autenticada y lector de pantalla físico en los flujos de edición Web y alta de usuarios/asesores que estaban restringidos en el entorno demo.
- **Recordatorio para producción:** antes de cualquier pase a producción, verificar/configurar los accesos de producción (`schema_versions` vs forwards SQL pendientes, dominios definitivos, CORS/R2, hosts/Sanctum/cookies en `tenant_domains`, credenciales y permisos de proveedores, base de datos y storage).
