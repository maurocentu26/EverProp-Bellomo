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
