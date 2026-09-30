#!/usr/bin/env node
// PreToolUse guard: defensa adicional (no barrera única) contra acciones irreversibles
// o prohibidas por AGENTS.md / ADRs. Exit 2 = bloquear y devolver el motivo a Claude.
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

const block = (why) => { process.stderr.write(`Bloqueado por .claude/hooks/guard.mjs: ${why}\n`); process.exit(2); };

let input;
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { block('entrada de hook ilegible; se falla cerrado.'); }
const tool = input.tool_name ?? '';
const args = input.tool_input ?? {};
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const rel = (p) => relative(root, isAbsolute(p) ? p : resolve(input.cwd || root, p)).replaceAll('\\', '/');

const BASELINE = /\.baseline\.sql$/;
const SECRET = (p) => /(^|\/)\.env(\.[^/]+)?$/.test(p) && !/\.env\.example$/.test(p);

if (['Edit', 'Write', 'MultiEdit'].includes(tool) && args.file_path) {
  const p = rel(args.file_path);
  if (BASELINE.test(p)) block('el baseline SQL es inmutable (ADR 0003). Creá un script en database/schema/forward/.');
  if (SECRET(p)) block('no se editan archivos .env con secretos; usá .env.example.');
  if (/(^|\/)\.docker\/secrets\//.test(p)) block('.docker/secrets está fuera de alcance.');
  if (/database\/schema\/forward\/.+\.sql$/.test(p) && existsSync(resolve(root, p)))
    block('los scripts forward existentes no se reescriben (forward-only). Creá uno nuevo con fecha y secuencia siguientes.');
}

if (tool === 'Bash' && typeof args.command === 'string') {
  // Evaluar cada segmento ejecutable, no el texto completo: `grep "git push" docs` debe pasar.
  const segments = args.command.split(/&&|\|\||[;|\n]/).map((s) => s.trim().replace(/^(sudo|env\s+\S+=\S+)\s+/, ''));
  const rules = [
    [/^(docker\s+compose\b.*\bexec\b.*)?(php\s+)?artisan\s+.*\b(migrate:(fresh|reset|refresh|rollback)|db:wipe)\b/, 'comando destructivo de base: el esquema es baseline + forward-only.'],
    [/^docker\s+compose\b.*\bdown\b.*(\s-v\b|--volumes)/, 'borraría los volúmenes (MySQL con inventario importado).'],
    [/^docker\s+volume\s+(rm|prune)\b/, 'borraría volúmenes de datos.'],
    [/^git\s+push\b/, 'push requiere autorización expresa del usuario (AGENTS.md).'],
    [/^git\s+reset\s+--hard\b|^git\s+clean\s+.*-\S*f|^git\s+(checkout\s+--|restore)\s+\.$/, 'descarta trabajo local de forma irreversible.'],
    [/^(curl|wget|http|https|xh)\b.*(graph\.facebook\.com|api\.whatsapp\.com|business\.facebook\.com)/, 'conexiones a Meta requieren autorización de la fase X01/X04.'],
    [/^(railway|vercel)\s+(up|deploy|--prod)|^vercel\b.*--prod/, 'deploy requiere autorización expresa.'],
    [/^(sed\s+-i|perl\s+-pi)\b.*\.baseline\.sql/, 'el baseline SQL es inmutable.'],
  ];
  for (const seg of segments) for (const [re, why] of rules) if (re.test(seg)) block(why);
}
process.exit(0);
