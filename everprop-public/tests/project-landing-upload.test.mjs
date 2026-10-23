import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(fs.readFileSync(new URL('../src/lib/project-landing.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function setup({ status = 200, networkError = false } = {}) {
  const calls = [];
  const context = { exports: {}, Headers, AbortSignal, Error,
    require: () => ({ apiFetch: async (path, init) => {
      calls.push({ path, init });
      return { data: { upload_url: 'https://r2.example/pending/signed', public_url: 'https://public.example/assets/final', upload_token: 'signed-token',
        headers: { Host: ['r2.example'], 'Content-Length': ['4'], 'Content-Type': ['image/png'], 'x-amz-meta-test': ['ok'] } } };
    } }),
    fetch: async (url, init) => { calls.push({ url, init }); if (networkError) throw new TypeError('Failed to fetch'); return { ok: status < 400 }; },
  };
  vm.runInNewContext(source, context);
  return { upload: context.exports.uploadLandingAsset, calls };
}

test('uploads to R2 without session credentials and returns confirmation only after PUT succeeds', async () => {
  const { upload, calls } = setup();
  const file = new File(['test'], 'foto.png', { type: 'image/png' });
  const pending = await upload('project-uuid', file);
  assert.equal(calls[0].path, '/api/v1/admin/projects/project-uuid/landing/media/upload-url');
  assert.deepEqual(JSON.parse(calls[0].init.body), { filename: 'foto.png', mime_type: 'image/png', file_size: 4 });
  assert.equal(calls[1].init.credentials, 'omit');
  assert.equal(calls[1].init.method, 'PUT');
  assert.equal(calls[1].init.body, file);
  assert.equal(calls[1].init.headers.get('content-type'), 'image/png');
  assert.equal(calls[1].init.headers.has('host'), false);
  assert.equal(calls[1].init.headers.has('content-length'), false);
  assert.equal(pending.upload_token, 'signed-token');
  assert.equal(pending.url, 'https://public.example/assets/final');
});

test('rejects invalid files before requesting a ticket', async () => {
  const { upload, calls } = setup();
  for (const file of [new File(['x'], 'x.svg', { type: 'image/svg+xml' }), new File([], 'x.png', { type: 'image/png' }), { size: 15 * 1024 * 1024 + 1, type: 'image/png' }]) {
    await assert.rejects(upload('project', file), /15 MB/);
  }
  assert.equal(calls.length, 0);
});

test('failed PUT and CORS errors never return a confirmation payload', async () => {
  const file = new File(['test'], 'foto.png', { type: 'image/png' });
  await assert.rejects(setup({ status: 403 }).upload('project', file), /R2 rechazó/);
  await assert.rejects(setup({ networkError: true }).upload('project', file), /CORS/);
});
