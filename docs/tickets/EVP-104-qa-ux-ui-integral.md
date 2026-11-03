# EVP-104 — QA UX/UI integral: unificación de escala visual, accesibilidad, borradores y resiliencia de Kanban

## 1. Resumen del ticket
- **Clave Jira:** `EVP-104`
- **Estado:** En revisión
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

## 4. Cómo se probó
- **Tests unitarios y de regresión:**
  - `node --test tests/qa-ux-ui-regression.test.mjs` -> 4/4 tests en verde.
  - `node --test tests/conversation-composer.test.mjs tests/leads-redesign.test.mjs tests/inventory-redesign.test.mjs tests/web-projects-redesign.test.mjs tests/mi-day-conformity.test.mjs tests/stats-redesign.test.mjs tests/knowledge-redesign.test.mjs tests/settings-redesign.test.mjs tests/projects-redesign.test.mjs tests/lots-matrix-redesign.test.mjs` -> todos en verde.
- **Build de producción Next.js:**
  - `npm run build` -> compilación y generación de rutas exitosa sin errores de tipos.

## 5. Riesgos y pendientes
- Este cambio es puramente de frontend en `everprop-public` (no incluye forwards SQL ni cambios de variables de entorno).
- Queda pendiente la validación con API real autenticada y lector de pantalla físico en los flujos de edición Web y alta de usuarios/asesores que estaban restringidos en el entorno demo.
- **Recordatorio para producción:** antes de cualquier pase a producción, verificar/configurar los accesos de producción (`schema_versions` vs forwards SQL pendientes, dominios definitivos, CORS/R2, hosts/Sanctum/cookies en `tenant_domains`, credenciales y permisos de proveedores, base de datos y storage).
