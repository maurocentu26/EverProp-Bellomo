import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/lead-whatsapp-message.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { leadWhatsAppMessage, LEAD_WHATSAPP_TEMPLATE_COUNT } = context.exports;

test('EVP-167: leads distintos reciben las 10 redacciones, repartidas', () => {
  assert.equal(LEAD_WHATSAPP_TEMPLATE_COUNT, 10);
  const counts = new Map();
  for (let i = 0; i < 1000; i++) {
    const text = leadWhatsAppMessage({ id: `lead-${i}`, name: 'Ana Pérez', propertyTitle: 'Torre Alem 4B' });
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  assert.equal(counts.size, 10, 'las 10 plantillas tienen que ser distintas y usarse');
  for (const n of counts.values()) assert.ok(n > 50, `reparto desparejo: ${n}`);
});

test('EVP-167: el mismo lead ve siempre el mismo texto, con su nombre y la propiedad', () => {
  const lead = { id: '0193a1b2-uuid', name: 'Ana Pérez', propertyTitle: 'Torre Alem 4B' };
  assert.equal(leadWhatsAppMessage(lead), leadWhatsAppMessage(lead));
  assert.match(leadWhatsAppMessage(lead), /Ana/);
  assert.doesNotMatch(leadWhatsAppMessage(lead), /Pérez/);
  assert.match(leadWhatsAppMessage(lead), /Torre Alem 4B/);
});

test('EVP-167: sin propiedad no quedan huecos ni "null"', () => {
  for (let i = 0; i < 200; i++) {
    const text = leadWhatsAppMessage({ id: `x${i}`, name: 'Juan', propertyTitle: null });
    assert.doesNotMatch(text, /null|undefined|\s{2}|\s[.,?]/);
  }
});
