const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname,name),'utf8').replace(/^\uFEFF/,''));
const inventory = read('inventario.json');
const front = read('frontend-source-review.json');
const lint = read('eslint.json');
const php = read('php-syntax.json');
const stan = read('phpstan.json');
const rows = new Map(inventory.map(r=>[r.path,{...r,checks:['Inventario y lectura automatizada']} ]));
function get(file) { if (!rows.has(file)) rows.set(file,{path:file,checks:[]}); return rows.get(file); }
for (const item of front) Object.assign(get(item.file),{symbols:item.symbols.join(', '),reachable:item.reachableFromNextEntry,ast:true});
for (const item of lint) Object.assign(get(item.file),{eslintErrors:item.errors,eslintWarnings:item.warnings,eslint:true});
for (const item of php) Object.assign(get('everprop-api/'+item.file),{phpSyntax:true,syntaxError:item.syntaxError});
for (const [file,item] of Object.entries(stan.files)) Object.assign(get(file.replace('/var/www/html/','everprop-api/')),{phpstanErrors:item.errors});
const findings = {
  'everprop-api/app/Domain/CRM/Http/Controllers/AdminLeadController.php':['A01','A03','A04'],
  'everprop-api/app/Domain/Inventory/Http/Controllers/AdminPropertyController.php':['A02'],
  'everprop-api/routes/api.php':['A04'],
  'everprop-public/src/components/admin/advisor/AdvisorCockpit.tsx':['A05'],
  'everprop-public/src/lib/everprop-api.ts':['A06','R02'],
  'everprop-public/src/hooks/use-current-session.ts':['A06'],
  'everprop-public/src/lib/auth-context.tsx':['A07'],
  'everprop-public/src/components/admin/LeadFinancingAgreements.tsx':['A08'],
  'everprop-public/src/components/admin/LeadKanban.tsx':['A08'],
  'everprop-api/app/Domain/Identity/Http/Controllers/AdminNotificationController.php':['A09'],
  'everprop-public/src/components/admin/AdminNavbar.tsx':['A09'],
  'everprop-public/src/components/admin/InventoryMatrix.tsx':['A10'],
  'everprop-api/scripts/apply-visit-extension.php':['R01'],
  'everprop-api/app/Domain/Identity/Http/Controllers/AuthController.php':['R02'],
  'everprop-api/app/Jobs/SendWebPush.php':['R02'],
};
const detailedNames = new Set(['AdminLeadController.php','AdminLeadFollowUpController.php','AdminVisitController.php','LeadAccessPolicy.php','VisitPolicy.php','InventoryAccess.php','AdminPropertyController.php','AdminProjectController.php','PropertyPolicy.php','TenantMediaService.php','AuthController.php','WebPushController.php','AdminNotificationController.php','TrustedTenantResolver.php','InventoryRoleBoundary.php','CollectionsController.php','CollectionsPolicy.php','RoleCode.php','User.php','SendWebPush.php','ReleaseSchemaTest.php','TodayVisitsTest.php','TenantIsolationAndRbacTest.php','LeadAdvisorsTest.php','api.php','web.php','console.php','auth-context.tsx','data-mode.ts','commercial-queue.ts','lead-follow-up.ts','lead-interests.ts','bellomo-policy.ts','notifications.ts','AdvisorCockpit.tsx','LeadStageUpdateModal.tsx','everprop-api.ts','use-current-session.ts','admin-design.css','panel-text-size.css','apply-visit-extension.php','LoteFields.tsx','LeadFollowUpEditor.tsx','LeadAdvisorEditor.tsx','LeadProfileEditor.tsx','LeadFinancingAgreements.tsx','LeadKanban.tsx','InventoryMatrix.tsx','NewLeadForm.tsx','AdminNavbar.tsx','bellomo-materials.ts','security.php','cors.php','sanctum.php','tenancy.php','trustedproxy.php','webpush.php']);
function moduleName(file) {
  if (/Collections|[Cc]ollection|[Cc]obranzas|Financing|Installment|Payment/.test(file)) return 'Cobranzas';
  if (/Notification|notification|Push|push/.test(file)) return 'Notificaciones';
  if (/Tenancy|tenancy/.test(file)) return 'Aislamiento tenant';
  if (/Identity|auth|login|User|Session|activar|asesores/.test(file)) return 'Identidad y perfiles';
  if (/Inventory|Property|property|Project|propert|desarrollos|inventory/.test(file)) return 'Inventario y desarrollos';
  if (/Lead|lead|CRM|Cockpit|commercial/.test(file)) return 'CRM y cockpit';
  if (/Visit|Agenda|agenda|Schedule/.test(file)) return 'Agenda';
  if (/Integrations|Webhook|webhook/.test(file)) return 'Integraciones';
  if (/material|BellomoResources|bellomo-policy/.test(file)) return 'Materiales';
  if (/scripts|config|bootstrap|schema|Console/.test(file)) return 'Instalación y configuración';
  return 'Interfaz y soporte compartido';
}
for (const row of rows.values()) {
  const full = path.join(root,row.path); const buffer = fs.readFileSync(full);
  row.sha256 = crypto.createHash('sha256').update(buffer).digest('hex'); row.bytes = buffer.length;
  row.binary = /\.(otf|ico)$/.test(row.path); row.lines = row.binary ? 0 : buffer.toString('utf8').split(/\r?\n/).length;
  if (row.phpSyntax) row.checks.push('Parseo PHP 8.4');
  if (row.ast) row.checks.push('AST/importaciones TypeScript');
  if (row.eslint) row.checks.push('ESLint');
  if (/^everprop-api\/(app|routes|tests)\//.test(row.path)) row.checks.push('PHPStan');
  row.review = detailedNames.has(path.basename(row.path)) ? 'Lectura de flujo/fragmentos relevantes + estático' : 'Análisis estático';
  if (row.binary) row.review = 'Metadatos del recurso binario';
  row.module = moduleName(row.path); row.findings = findings[row.path]||[];
  row.observations = [];
  if (row.findings.length) row.observations.push(row.findings.join(', '));
  if (row.phpstanErrors) row.observations.push(`${row.phpstanErrors} incidencias PHPStan`);
  if (row.eslintWarnings) row.observations.push(`${row.eslintWarnings} advertencias ESLint`);
  if (row.reachable===false) row.observations.push('Sin ruta estática desde entrada Next; candidato, no borrado autorizado');
  if (!row.observations.length) row.observations.push('Sin hallazgo específico en los controles aplicados');
}
const sorted = [...rows.values()].sort((a,b)=>a.path.localeCompare(b.path));
fs.writeFileSync(path.join(__dirname,'registro-completo.json'),JSON.stringify(sorted,null,2));
const escape = s=>String(s||'').replaceAll('|','/').replaceAll('\n',' ');
const md = ['# Registro archivo por archivo','',`Total: **${sorted.length} archivos**. Los 309 del inventario inicial se amplían con scripts, pruebas PHP y archivos de configuración examinados por las herramientas.`,
  '', '**Método:** todos tienen controles identificados; la lectura de flujo se concentró en los puntos de entrada, permisos, persistencia y hallazgos. El análisis estático no equivale a leer manualmente cada línea ni a probar todas sus ramas. Las incidencias se explican en [informe.md](informe.md).',
  '', 'Cada fila identifica módulo, comprobación y resultado. El JSON conserva tamaño, SHA-256, líneas y símbolos para reproducir el estado auditado. Los binarios solo tienen revisión de metadatos.',
  '', '| Archivo | Líneas | Módulo | Método / controles | Resultado |','|---|---:|---|---|---|'];
for (const r of sorted) md.push(`| ${escape(r.path)} | ${r.lines} | ${r.module} | ${r.review}; ${r.checks.join(', ')} | ${escape(r.observations.join('; '))} |`);
fs.writeFileSync(path.join(__dirname,'archivos.md'),md.join('\n')+'\n');
console.log(JSON.stringify({total:sorted.length,detailed:sorted.filter(r=>r.review.startsWith('Lectura')).length,php:sorted.filter(r=>r.phpSyntax).length,ast:sorted.filter(r=>r.ast).length,withFindings:sorted.filter(r=>r.findings.length).length}));
