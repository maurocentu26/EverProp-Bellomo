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

## Verificación

Pendiente de ejecución en trabajo de verificación de la rama.
