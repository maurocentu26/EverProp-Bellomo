import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('EVP-104 (UI-01, UI-02, UI-03): unified typography scale, 1.2x Grande factor and >=44px/52px touch targets', () => {
  const designCss = read('../src/app/admin-design.css');
  const catalogCss = read('../src/app/admin-catalog.css');
  const textSizeCss = read('../src/app/panel-text-size.css');

  // UI-01: Root workspace uses 17px body text and unified --panel-h1 (34px desktop, 28px mobile)
  assert.match(designCss, /--panel-scale:\s*1;\s*--panel-text:\s*calc\(17px \* var\(--panel-scale\)\);\s*--panel-meta:\s*calc\(15px \* var\(--panel-scale\)\);\s*--panel-h1:\s*calc\(34px \* var\(--panel-scale\)\)/);
  assert.match(designCss, /\.admin-workspace h1 \{ font-size: var\(--panel-h1\)/);
  assert.match(designCss, /\.admin-workspace \.admin-topbar :is\(button, a, input, \[data-slot="button"\]\) \{ font-size: var\(--panel-text\); min-height: 44px; \}/);

  // UI-02: Grande mode sets --panel-scale: 1.2 (20.4px body, 40.8px desktop H1, 33.6px mobile H1) and includes .knowledge-view
  assert.match(textSizeCss, /html\[data-panel-text-size="grande"\] \.admin-workspace \{ --panel-scale: 1\.2; --day-text: 20\.4px; --agenda-text: 20\.4px; --conversation-text: 20\.4px; font-size: 20\.4px; \}/);
  assert.match(catalogCss, /html\[data-panel-text-size="grande"\] :is\(\.mi-agenda,\.collections-view,\.collections-dialog,\.inventory-view,\.settings-view,\.knowledge-view,\.stats-view\) \{ font-size: 20\.4px; \}/);
  assert.match(designCss, /\.mi-day\.day-board \.day-heading h1 \{ font-size: var\(--panel-h1\)/);

  // UI-03: Touch targets >= 44px desktop and >= 52px mobile
  assert.match(designCss, /\.admin-workspace \[data-slot="button"\] \{ min-height: 44px;/);
  assert.match(designCss, /min-height: 52px;/);
  assert.match(read('../src/components/theme/PanelTextSize.tsx'), /min-h-11 min-w-11/);
  assert.match(read('../src/components/admin/AdminMenuAccount.tsx'), /min-h-11 min-w-11/);
  assert.match(read('../src/components/admin/navbar/GlobalSearch.tsx'), /min-h-11/);
});

test('EVP-104 (UI-04, UI-08): Web catalog search input has aria-label and API error hides misleading empty count', () => {
  const webEditor = read('../src/components/admin/ProjectWebEditor.tsx');
  assert.match(webEditor, /aria-label="Buscar proyectos por nombre, eslogan o ubicación"/);
  assert.match(webEditor, /min-h-11 px-3\.5 py-2/);
  assert.match(webEditor, /!\(error && projects\.length === 0\)/);
});

test('EVP-104 (CODE-01, CODE-02, CODE-03): Kanban avoids sample fallback on API failure, rolls back failed stage changes and supports keyboard', () => {
  const kanban = read('../src/components/admin/LeadKanban.tsx');
  const kanbanCard = read('../src/components/admin/kanban/KanbanCard.tsx');

  // CODE-01: explicit loadError alert and return in catch without falling through to sampleLeads
  assert.match(kanban, /setLoadError\("No se pudieron cargar los leads del tablero/);
  assert.match(kanban, /isMockDataMode \? loadProjectList\(sampleProjects, companyId\) : \[\]/);

  // CODE-02: rollback to previousStage and visible role="alert" error when updateEverpropLead rejects
  assert.match(kanban, /prev\.map\(\(lead\) => \(lead\.id === leadId \? \{ \.\.\.lead, stage: previousStage \} : lead\)\)/);
  assert.match(kanban, /setStageError\(`No se pudo actualizar la etapa de \$\{currentLead\.name\}/);

  // CODE-03: KeyboardSensor + accessible stage select on KanbanCard
  assert.match(kanban, /useSensor\(KeyboardSensor/);
  assert.match(kanbanCard, /aria-label=\{`Cambiar etapa de \$\{lead\.name\}`\}/);
});

test('EVP-104 (UI-05, CODE-04, CODE-05, CODE-06): LeadTable semantic links, asset save role="alert" and form draft persistence', () => {
  const leadTable = read('../src/components/admin/LeadTable.tsx');
  const newLeadForm = read('../src/components/admin/NewLeadForm.tsx');
  const newPropertyForm = read('../src/components/admin/NewPropertyForm.tsx');
  const editPropertyModal = read('../src/components/admin/EditPropertyModal.tsx');

  // CODE-04: LeadTable uses semantic Link to /admin/leads/${lead.id}
  assert.match(leadTable, /<Link\s+href=\{`\/admin\/leads\/\$\{lead\.id\}`\}/);

  // CODE-05: NewPropertyForm and EditPropertyModal announce save errors with role="alert" and aria-live="assertive"
  assert.match(newPropertyForm, /role="alert" aria-live="assertive"/);
  assert.match(editPropertyModal, /role="alert" aria-live="assertive"/);

  // UI-05 & CODE-06: sessionStorage draft persistence and unsaved changes confirmation
  assert.match(newLeadForm, /everprop:new-lead-draft:/);
  assert.match(newLeadForm, /beforeunload/);
  assert.match(newPropertyForm, /beforeunload/);
  assert.match(editPropertyModal, /Hay cambios sin guardar en este activo/);
});

test('EVP-104: la ficha del cliente tiene gestion visible, tres pestanas y moneda sin asumir', () => {
  const leadDetail = read('../src/components/admin/LeadDetailView.tsx');
  const css = read('../src/app/admin-design.css');

  // Tres pestanas operables con flechas; Resumen y Ficha ya no son pestanas.
  assert.match(leadDetail, /type LeadDetailSection = "activity" \| "interests" \| "financing"/);
  assert.match(leadDetail, /role="tablist"/);
  assert.match(leadDetail, /ArrowRight:[\s\S]*ArrowLeft:[\s\S]*Home:[\s\S]*End:/);
  assert.match(leadDetail, /tabIndex=\{isActive \? 0 : -1\}/);
  assert.doesNotMatch(leadDetail, /Resumen principal|Ficha y gestión/);

  // Etapa y asesor se cambian sin salir de la pestana activa.
  assert.match(leadDetail, /aria-label="Gestión del cliente"/);
  assert.match(leadDetail, /Etapa: \$\{[^}]+\}\. Cambiar etapa/);
  assert.match(leadDetail, /Asignar asesor/);
  assert.match(leadDetail, /aria-expanded=\{railOpen\}/);

  // Funciones que no pueden perderse con el nuevo layout.
  for (const required of ['LeadFollowUpTimeline', 'VisitManager', 'LeadFinancingAgreements', 'FinancingCalculator', 'setLeadToDelete(true)', 'setInterestToDelete(interest)']) {
    assert.ok(leadDetail.includes(required), `falta ${required}`);
  }

  // Moneda nula = no confirmada, nunca USD asumido.
  assert.match(leadDetail, /moneda no confirmada/);
  assert.doesNotMatch(leadDetail, /\.currency \|\| "USD"/);

  // Los botones con texto de la barra superior no se recortan a 44px (Button incluye [class*='size-'] en sus variantes).
  assert.doesNotMatch(css, /admin-topbar :is\(button, a\)\[class\*="size-"\]/);

  // En Grande: el nombre no se corta, la columna no tiene scroll interno y Seguimiento entra en su boton.
  assert.match(css, /\.lead-record-header h1#lead-name \{ font-size: calc\(var\(--panel-text\) \* 1\.4\)/);
  assert.match(leadDetail, /lead-record-header sticky z-20 flex flex-wrap/);
  assert.match(css, /html:not\(\[data-panel-text-size="grande"\]\) \.lead-record-rail \{ position: sticky;/);
  assert.match(css, /html\[data-panel-text-size="grande"\] \.lead-record-rail dl > div \{ flex-direction: column;/);

  // Cabecera fija y barra inferior en movil.
  assert.match(leadDetail, /lead-record-header sticky/);
  assert.match(css, /\.lead-record-actions \{ position: fixed;/);
});
