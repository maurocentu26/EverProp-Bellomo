// node --test .claude/hooks/guard.test.mjs — regresión del hook guardián (evasiones de push y .env).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const guard = fileURLToPath(new URL('./guard.mjs', import.meta.url));
const run = (tool, command) =>
  spawnSync(process.execPath, [guard], { input: JSON.stringify({ tool_name: tool, tool_input: { command }, cwd: process.cwd() }) }).status;

const blocked = [
  'git push', 'Git push origin main', '& git push', 'git -C . push', 'git -C "C:\\a b" push origin x',
  'git.exe push', 'C:\\Git\\bin\\git.exe push', 'cmd /c "git push"', 'echo $(git push)', 'pwsh -NoProfile -Command "git push"',
  'git --no-pager push', 'git status && git push',
  'cat .env', 'Get-Content everprop-api\\.env.production.local', 'cat everprop-api/.env.staging', 'cat everprop-api/.en*',
  'docker volume rm x', 'GIT RESET --HARD',
];
const allowed = [
  'git status', 'git log --grep push', 'grep "git push" docs', 'rg "git push"', 'Select-String -Pattern "git push" x.md',
  'cp .env.example x', 'git diff -- composer.json', 'npm run lint', 'git commit -m "push notifications"',
];

for (const tool of ['Bash', 'PowerShell']) {
  for (const c of blocked) test(`${tool} bloquea: ${c}`, () => assert.equal(run(tool, c), 2));
  for (const c of allowed) test(`${tool} permite: ${c}`, () => assert.equal(run(tool, c), 0));
}
