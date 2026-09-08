import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function adapter(apiFetch) {
  const storage = new Map();
  const context = {
    exports: {}, crypto: webcrypto, TextEncoder, Event,
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    window: { dispatchEvent() {} },
    BroadcastChannel: class { postMessage() {} close() {} },
    require(name) {
      if (name.endsWith('/data-mode')) return { isMockDataMode: false };
      if (name.endsWith('/everprop-api')) return { apiFetch };
      if (name.endsWith('/admin-storage')) return new Proxy({}, { get() { throw Error('Online flow accessed local financial storage'); } });
      throw Error(`Unexpected dependency ${name}`);
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/collections-api.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, context);
  return context.exports;
}

test('online lists traverse pagination and never fall back to browser seed data', async () => {
  const urls = [];
  const client = adapter(async url => { urls.push(url); return { data: [{ id: `page-${urls.length}` }], meta: { last_page: 2 } }; });
  const rows = await client.loadInstallmentList([{ id: 'sample' }], 'c1', 'real-lead');
  assert.deepEqual(Array.from(rows, row => row.id), ['page-1', 'page-2']);
  assert.match(urls[1], /leadId=real-lead&page=2$/);
  const failed = adapter(async () => { throw Error('API unavailable'); });
  await assert.rejects(failed.loadInstallmentList([{ id: 'sample' }]), /API unavailable/);
});

const agreement = { leadId: 'real-lead', advisorId: 'untrusted-advisor', totalPrice: 100, downPayment: 0,
  financedBalance: 100, currency: 'ARS', modality: 'FIXED', monthlyRatePct: 3.5,
  totalInstallments: 3, dayOfMonthDue: 31, startDate: '2026-01-31' };

test('agreement creation forwards the interest rate and lets the server own tenant, advisor and balance', async () => {
  let payload;
  const client = adapter(async (url, init) => {
    if (init) { payload = JSON.parse(init.body); return { data: { id: 'agreement' } }; }
    return { data: [], meta: { last_page: 1 } };
  });
  await client.createAgreementWithInstallments(agreement, [], [], 'fake-company');
  assert.equal(payload.monthlyRatePct, 3.5);
  assert.equal(payload.advisorId, undefined);
  assert.equal(payload.companyId, undefined);
  assert.equal(payload.financedBalance, undefined);
  assert.match(payload.idempotencyKey, /^[a-f0-9-]{36}$/);
  await assert.rejects(client.createAgreementWithInstallments({ ...agreement, modality: 'CAC' }, [], []), /cuotas fijas/);
});

test('ambiguous payment failures reuse the request key; a subsequent completed payment gets a new key', async () => {
  const keys = [];
  let fail = true;
  const client = adapter(async (url, init) => {
    if (init) {
      keys.push(JSON.parse(init.body).idempotencyKey);
      if (fail) { fail = false; throw Error('Connection lost after payment committed'); }
      return { data: [] };
    }
    return { data: [], meta: { last_page: 1 } };
  });
  const payment = { amountPaid: 40, paymentMethod: 'CASH', paymentReceiptNumber: 'REAL', paidAt: '2026-02-01' };
  await assert.rejects(client.recordInstallmentPayment('inst', payment, []), /Connection lost/);
  await client.recordInstallmentPayment('inst', payment, []);
  await client.recordInstallmentPayment('inst', payment, []);
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[1], keys[2]);
});

test('a refresh failure after agreement creation retains idempotency for the retry', async () => {
  const keys = [];
  let failRead = true;
  const client = adapter(async (url, init) => {
    if (init) { keys.push(JSON.parse(init.body).idempotencyKey); return { data: { id: 'same-agreement' } }; }
    if (failRead) { failRead = false; throw Error('Refresh failed'); }
    return { data: [], meta: { last_page: 1 } };
  });
  await assert.rejects(client.createAgreementWithInstallments(agreement, [], []), /Refresh failed/);
  await client.createAgreementWithInstallments(agreement, [], []);
  assert.equal(keys[0], keys[1]);
});
