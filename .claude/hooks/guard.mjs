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

// Windows: Claude Code also exposes a PowerShell tool (on by default with claude.ai accounts): same rules.
if ((tool === 'Bash' || tool === 'PowerShell') && typeof args.command === 'string') {
  // Evaluar cada segmento ejecutable, no el texto completo: `grep "git push" docs` debe pasar.
  // Normalizar envoltorios que PowerShell/cmd aceptan (`& git`, `cmd /c "git …"`, `git.exe`, `Git`) para que no esquiven las reglas.
  const normalize = (s) => {
    let prev;
    do {
      prev = s;
      s = s.trim().replace(/^["'`(]+|["'`)]+$/g, '').trim()
        .replace(/^(sudo|env\s+\S+=\S+|&|\.|\$\(|(cmd(\.exe)?\s+\/[ck])|((powershell|pwsh)(\.exe)?\s+(-\w+\s+)*-c(ommand)?)|iex|Invoke-Expression|Start-Process(\s+-FilePath)?)\s+/i, '');
    } while (s !== prev);
    return s.replace(/^(\S*[\\/])?(\w+)\.exe\b/i, '$2');
  };
  const segments = args.command.split(/&&|\|\||[;|\n]/).map(normalize);
  // `git [opciones globales] push` en cualquier parte del segmento (cubre `echo $(git push)`, `git -C . push`).
  const GIT_PUSH = /(^|[\s(&'"`])git(\.exe)?((\s+-[Cc]\s+("[^"]*"|'[^']*'|\S+))|(\s+--?[\w-]+(=\S+)?))*\s+push\b/i;
  const SEARCH = /^(grep|rg|findstr|Select-String|sls|git\s+(grep|log))\b/i;
  const rules = [
    [/^(docker\s+compose\b.*\bexec\b.*)?(php\s+)?artisan\s+.*\b(migrate:(fresh|reset|refresh|rollback)|db:wipe)\b/i, 'comando destructivo de base: el esquema es baseline + forward-only.'],
    [/^docker\s+compose\b.*\bdown\b.*(\s-v\b|--volumes)/i, 'borraría los volúmenes (MySQL con inventario importado).'],
    [/^docker\s+volume\s+(rm|prune)\b/i, 'borraría volúmenes de datos.'],
    [{ test: (s) => !SEARCH.test(s) && GIT_PUSH.test(s) }, 'push requiere autorización expresa del usuario (AGENTS.md).'],
    [/^git\s+reset\s+--hard\b|^git\s+clean\s+.*-\S*f|^git\s+(checkout\s+--|restore)\s+\.$/i, 'descarta trabajo local de forma irreversible.'],
    [/^(curl|wget|http|https|xh|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b.*(graph\.facebook\.com|api\.whatsapp\.com|business\.facebook\.com)/i, 'conexiones a Meta requieren autorización de la fase X01/X04.'],
    [/^(railway|vercel)\s+(up|deploy|--prod)|^vercel\b.*--prod/i, 'deploy requiere autorización expresa.'],
    [/^(sed\s+-i|perl\s+-pi)\b.*\.baseline\.sql/i, 'el baseline SQL es inmutable.'],
    [/^(Remove-Item|rm|del|rd|rmdir)\b.*(-Recurse|\s-[a-z]*r[a-z]*f|\s-[a-z]*f[a-z]*r|\/s\b)/i, 'borrado recursivo: hacelo a mano después de revisar qué se borra.'],
    // Cualquier .env / .env.* salvo .env.example, y comodines que lo alcanzan (`.en*`).
    [/(^|[\s"'\/\\=])(\.env(\.(?!example\b)[\w.-]+)?(?=$|[\s"';|&)])|\.e(nv?)?\*)/i, 'los .env con secretos no se leen ni se escriben desde el agente; usá .env.example.'],
  ];
  for (const seg of segments) for (const [re, why] of rules) if (re.test(seg)) block(why);
}
process.exit(0);
