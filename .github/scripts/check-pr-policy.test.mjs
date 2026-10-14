import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkBranch, checkMainTree } from './check-pr-policy.mjs';

test('develop keeps the existing ticket formats and main exception', () => {
  for (const head of ['main', 'ticket/EVP-14-feriados', 'ticket/EVP-L01-copiloto', 'ticket/EVP-0.1-reglas']) checkBranch('develop', head);
  for (const head of ['develop', 'feature/foo', 'ticket/EVP-14', 'release/1.0']) assert.throws(() => checkBranch('develop', head));
});

test('main accepts release/hotfix only and rejects direct develop/ticket PRs', () => {
  for (const head of ['release/1.0.0', 'hotfix/arreglar-login']) checkBranch('main', head);
  for (const head of ['develop', 'main', 'ticket/EVP-17-reglas', 'release/', 'hotfix/']) assert.throws(() => checkBranch('main', head));
});

test('checks the full tree: inherited modules and dangling imports fail, clean release passes', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'evp17-policy-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const add = (path, text) => { mkdirSync(dirname(join(cwd, path)), { recursive: true }); writeFileSync(join(cwd, path), text); };
  const commit = () => { git('add', '.'); git('-c', 'user.name=Policy test', '-c', 'user.email=policy@example.invalid', 'commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  try {
    git('init', '-q');
    add('everprop-api/routes/api.php', '<?php // CRM only');
    checkMainTree(commit(), cwd);
    const module = 'everprop-api/app/Domain/AgentRuntime/Llm/Client.php';
    add(module, '<?php'); commit();
    add('README.md', 'Release only changes documentation');
    assert.throws(() => checkMainTree(commit(), cwd), /IA\/conversaciones/);
    rmSync(join(cwd, module));
    add('everprop-api/routes/api.php', '<?php use App\\Domain\\Conversations\\Http\\Controllers\\PublicChatController;');
    assert.throws(() => checkMainTree(commit(), cwd), /referencias/);
    add('everprop-api/routes/api.php', '<?php // CRM only');
    add('everprop-public/src/app/manifest.ts', 'export default { start_url: "/admin/conversaciones" };');
    assert.throws(() => checkMainTree(commit(), cwd), /referencias/);
    rmSync(join(cwd, 'everprop-public/src/app/manifest.ts'));
    checkMainTree(commit(), cwd);
    assert.throws(() => checkMainTree('--all', cwd), /SHA/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});


test('trusted policy rejects a PR even when its own script always succeeds', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'evp17-untrusted-'));
  try {
    mkdirSync(join(cwd, '.github/scripts'), { recursive: true });
    writeFileSync(join(cwd, '.github/scripts/check-pr-policy.mjs'), 'process.exit(0);');
    const policy = fileURLToPath(new URL('./check-pr-policy.mjs', import.meta.url));
    assert.throws(() => execFileSync(process.execPath, [policy], {
      cwd, env: { ...process.env, BASE: 'main', HEAD: 'develop' }, stdio: 'pipe',
    }), (error) => error.status === 1 && /main solo admite/.test(String(error.stderr)));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
