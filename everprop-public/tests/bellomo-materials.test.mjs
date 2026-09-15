import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/bellomo-policy.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { canReadMaterial, matchesMaterialProject } = context.exports;
const catalog = JSON.parse(fs.readFileSync(new URL('../content/bellomo/catalog.json', import.meta.url)));
const project = catalog.projects.find(p => p.id === 'el-rocio');
const photo = catalog.assets.find(a => a.project === project.id && a.kind === 'photo');
const access = { tenant: 'bellomo', role: 'SALES_ADVISOR', projectNames: ['Remanente El Rocío'] };

test('tenant boundary applies even to administrators', () => {
  for (const role of ['TENANT_ADMIN', 'SUPER_ADMIN', 'SALES_ADVISOR'])
    assert.equal(canReadMaterial(photo, project, { ...access, role, tenant: 'another-company' }), false);
});
test('advisors and managers can only read catalog projects authorized by the API', () => {
  for (const role of ['SALES_ADVISOR', 'SALES_MANAGER', 'READ_ONLY', 'INVENTORY_MANAGER']) {
    assert.equal(canReadMaterial(photo, project, { ...access, role }), true);
    assert.equal(canReadMaterial(photo, project, { ...access, role, projectNames: ['Valle Verde Loteo'] }), false);
  }
  assert.equal(canReadMaterial(photo, project, { ...access, role: 'BOT_OPERATOR' }), false);
  assert.equal(canReadMaterial(photo, project, { ...access, role: 'unknown' }), false);
});
test('institutional originals and review-only material stay out of advisor access', () => {
  assert.equal(canReadMaterial({ ...photo, kind: 'brand' }, project, access), false);
  assert.equal(canReadMaterial({ ...photo, status: 'pending' }, project, access), false);
  assert.equal(canReadMaterial(photo, undefined, access), false);
  assert.equal(canReadMaterial(photo, undefined, { ...access, role: 'TENANT_ADMIN' }), true);
});
test('inventory profile can read plans but not commercial documents', () => {
  const inventory = { ...access, role: 'INVENTORY_MANAGER' };
  assert.equal(canReadMaterial({ ...photo, kind: 'technical' }, project, inventory), true);
  assert.equal(canReadMaterial({ ...photo, kind: 'commercial' }, project, inventory), false);
});
test('matching handles accents and whitespace without mixing development phases', () => {
  assert.equal(matchesMaterialProject(project, '  remanente el rocio  '), true);
  assert.equal(matchesMaterialProject(project, 'El Rocío 2'), false);
  const arbolada = catalog.projects.find(p => p.id === 'la-arbolada');
  assert.equal(matchesMaterialProject(arbolada, 'La Arbolada 2'), false);
});
test('every catalog resource exists, has provenance and a unique safe identifier', () => {
  const ids = new Set();
  const root = path.resolve('content/bellomo');
  for (const asset of catalog.assets) {
    assert.equal(ids.has(asset.id), false, asset.id);
    ids.add(asset.id);
    assert.match(asset.id, /^[a-zA-Z0-9_-]+$/);
    assert.ok(path.resolve(root, asset.file).startsWith(root + path.sep));
    assert.ok(fs.statSync(path.join(root, asset.file)).size > 0, asset.file);
    assert.match(asset.sourceUrl, /^https:\/\/drive\.google\.com\//);
    assert.ok(!asset.sourceUrl.includes('undefined'));
    assert.ok(asset.project === null || catalog.projects.some(p => p.id === asset.project));
  }
});
