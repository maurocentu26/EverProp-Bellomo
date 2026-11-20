# EVP-172 — Release parcial `develop → main`: nueva vista de Leads, Kanban y Toaster

Rama `release/evp-172-vista-leads` cortada desde `origin/main` (`f79fb03`). Migración **100 % frontend** (sin cambios de backend, sin forwards SQL y sin tocar `everprop-api.ts`).

## Alcance incluido

1. **Toaster de avisos (`EVP-168`):**
   - `everprop-public/src/components/admin/MainLayout.tsx`: montaje único de `<Toaster />` dentro de `admin-workspace` respetando tema y offset móvil.
   - `everprop-public/src/app/admin-design.css` y `everprop-public/src/app/panel-text-size.css`: ajuste sobre barra móvil de asesor y texto Grande.
   - `everprop-public/src/components/admin/AdminNavbar.tsx`: sanitización de `actionUrl` (`/admin/*`) y conteo agrupado en toasts entrantes.
2. **Lista "Mis Leads" (`EVP-69` + `EVP-104`, conservando `EVP-123` y `EVP-167`):**
   - `everprop-public/src/app/admin/leads/page.tsx`: encabezado **Mis Leads**, tarjeta destacada **Tu próximo paso** (priorizando `overdue`, `dueSoon` y `none`), tira de filtros (`Tipo de interés`, `Etapa`, `Origen`, `Seguimiento`, `Asesor`), contadores clickeables por etapa y búsqueda sin exigir tildes (`normalizeLeadSearch`). Se conservan íntegros `globalSelectedAgentId`, `useLeadAdvisors`, el filtrado por asesor en `stageCounts` y la carga completa de `loadEverpropLeads()` (**EVP-123**).
   - `everprop-public/src/components/admin/LeadTable.tsx`: acciones escritas en escritorio (`showLabels = true`), breakpoint `@min-[70rem]` y nombres como `<Link>`, conservando las 10 plantillas rotativas de WhatsApp (**EVP-167**) y sin `LeadMessagesLink`.
3. **Ficha del lead (`EVP-69` + `EVP-104`, conservando `EVP-134` y `EVP-167`):**
   - `everprop-public/src/components/admin/LeadDetailView.tsx`: nuevo layout adaptable a texto Normal y Grande con confirmación explícita en acciones destructivas, conservando `isLeadVersionConflict` / `version` (**EVP-134**) y WhatsApp rotativo (**EVP-167**).
   - `everprop-public/src/components/admin/LeadFinancingAgreements.tsx`, `LeadFollowUpTimeline.tsx`, `VisitManager.tsx`, `LeadFollowUpStatus.tsx` y `everprop-public/src/lib/lead-follow-up.ts` (`formatArgentinaDateTime`).
4. **Alta/edición de lead y fixes de Kanban (`EVP-69` + `EVP-104`, conservando `EVP-134` y `EVP-135`):**
   - `everprop-public/src/components/admin/NewLeadForm.tsx` y `NewLeadDrawer.tsx`: revisión previa antes de guardar, diálogo de confirmación al limpiar borrador, persistencia en `sessionStorage` + aviso `beforeunload`, conservando `idempotencyKey` (**EVP-135**) y resolución de conflictos 409 (**EVP-134**).
   - `everprop-public/src/components/admin/LeadKanban.tsx` y `everprop-public/src/components/admin/kanban/KanbanCard.tsx`: sin fallback a muestra cuando falla la API, rollback ante error de etapa y soporte de teclado.
5. **Tests y CI:**
   - Portados `everprop-public/tests/leads-redesign.test.mjs` y `everprop-public/tests/lead-search.test.mjs`.
   - Agregado `npm run test:leads` en `everprop-public/package.json` y `.github/workflows/web.yml`.

## Exclusiones explícitas

- `LeadMessagesLink.tsx`, `lead-messages.test.mjs` y cualquier enlace o referencia a `/admin/conversaciones` o IA.
- Alertas automáticas/push de **EVP-50** (`FollowUpNotification.php`, estado `attention`, `needsFollowUp`, `?seguimiento=1`).
- Backend (`everprop-api/`), base de datos y `everprop-public/src/lib/everprop-api.ts`.

## Ajustes visuales posteriores al preview (`bfb6220`)

- `everprop-public/src/components/ui/popover.tsx`: agregado `className="isolate z-50 outline-none"` en `PopoverPrimitive.Positioner` para que el popover `"Tamaño de texto"` apile por encima del `<thead>` sticky (`z-10`) de la tabla de leads.
- `everprop-public/src/components/admin/LeadTable.tsx` y `everprop-public/src/app/admin-design.css`: eliminada la 6.ª columna `Acciones` (22%), ampliadas las 5 columnas de datos (`26%`, `22%`, `17%`, `12%`, `23%`), incorporados `tabIndex={0} role="region" aria-label="Lista de leads"` y trasladados los botones de acción a una segunda fila a ancho completo (`<td colSpan={5} className="leads-row-actions-cell">`) dentro del `<tbody>` de cada lead (contacto a la izquierda y CRM a la derecha mediante `data-lead-action="crm-start"` con `margin-inline-start: auto`, además de `w-full` en vista card).

## Verificación

Ejecutada sobre el worktree aislado `EverProp-EVP-172-vista-leads` (`npm ci` limpio, sin modificaciones en `everprop-api/` ni en `everprop-api.ts`):

- `node .github/scripts/check-pr-policy.mjs` (`BASE=main`, `HEAD=release/evp-172-vista-leads`): `OK: release/evp-172-vista-leads → main`.
- Grep de exclusiones (`LeadMessagesLink`, `/admin/conversaciones`, `conversations-api`, `needsFollowUp`, `FollowUpNotification`, `seguimiento=1`) sobre `origin/main..HEAD`: 0 coincidencias.
- `npm run lint`: 0 errores.
- `npx tsc --noEmit`: 0 errores.
- `npm run test:leads`: **13/13** (`leads-redesign.test.mjs`, `lead-search.test.mjs`, `leads-api.test.mjs`).
- `npm run test:mi-dia`: **32/32**.
- `npm run test:projects`: **25/25**.
- `npm run test:statistics`: **1/1**.
- `npm run test:materials`: **6/6**.
- `npm run test:password-recovery`: **3/3**.
- `npm run test:collections`: **4/4**.
- `node --test tests/login-password.test.mjs`: **1/1**.
- Total suites frontend: **85/85** aprobadas.
- `npm run build` (`NEXT_PUBLIC_DATA_MODE=api`): compilación y tipeo exitosos (`29/29` páginas estáticas generadas).

### Verificación posterior a `bfb6220`

- `npm run lint`: 0 errores.
- `npx tsc --noEmit`: 0 errores.
- `npm run test:leads`: **13/13**.
- `npm run test:mi-dia`: **32/32**.
- `npm run build` (`NEXT_PUBLIC_DATA_MODE=api` y `NEXT_PUBLIC_DATA_MODE=mock`): compilación exitosa (`29/29` páginas estáticas).
- `node .github/scripts/check-pr-policy.mjs`: `OK: release/evp-172-vista-leads → main`.
- Revisión visual en navegador sobre `http://127.0.0.1:3000/admin/leads` (`1600×900`, modo oscuro, tamaños `Actual` y `20 % más grande`): los botones de acción se alinean en 1 fila horizontal, el popover `"Tamaño de texto"` queda por encima del `<thead>` sticky y no se registraron errores de consola ni de página.
