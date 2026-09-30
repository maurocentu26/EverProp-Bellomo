#!/usr/bin/env node
// Valida evals/cases/*.jsonl contra el contrato mínimo de cases.schema.json (sin dependencias).
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'cases');
const schema = JSON.parse(readFileSync(join(dir, '..', 'cases.schema.json'), 'utf8'));
const P = schema.properties;
const TARGET = { search: 60, 'current-data': 30, crm: 30, security: 40, failures: 20, rioplatense: 20 };
const PREFIX = { search: 'SEARCH', 'current-data': 'DATA', crm: 'CRM', security: 'SEC', failures: 'FAIL', rioplatense: 'RIO' };
const TOOLS = ['buscar_propiedades', 'consultar_propiedad', 'registrar_interes', 'solicitar_visita', 'derivar_a_asesor'];
const ROLES = P.turns.items.properties.role.enum;
const errors = []; const ids = new Set(); const count = {}; const splits = { dev: 0, test: 0 }; let criticalTest = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
  readFileSync(join(dir, file), 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const at = `${file}:${i + 1}`;
    let c; try { c = JSON.parse(line); } catch { return errors.push(`${at} JSON inválido`); }
    for (const k of schema.required) if (!(k in c)) errors.push(`${at} falta "${k}"`);
    for (const k of Object.keys(c)) if (!(k in P)) errors.push(`${at} campo no permitido "${k}"`);
    for (const k of ['segment', 'actor', 'tenant', 'channel', 'split']) if (k in c && !P[k].enum.includes(c[k])) errors.push(`${at} ${k} inválido: ${c[k]}`);
    if (c.id && !new RegExp(P.id.pattern).test(c.id)) errors.push(`${at} id inválido ${c.id}`);
    if (c.id && c.segment && !c.id.startsWith(PREFIX[c.segment] + '-')) errors.push(`${at} id ${c.id} no corresponde al segmento ${c.segment}`);
    if (ids.has(c.id)) errors.push(`${at} id duplicado ${c.id}`); ids.add(c.id);
    if (`${c.segment}.jsonl` !== file) errors.push(`${at} segmento ${c.segment} en archivo ${file}`);
    if (!Array.isArray(c.turns) || !c.turns.length) errors.push(`${at} turns vacío`);
    else c.turns.forEach((t, j) => { if (!ROLES.includes(t?.role) || typeof t?.text !== 'string' || !t.text) errors.push(`${at} turns[${j}] inválido`); });
    const e = c.expected ?? {};
    if (!P.expected.properties.behavior.enum.includes(e.behavior)) errors.push(`${at} expected.behavior inválido`);
    if (!('persisted' in e)) errors.push(`${at} falta expected.persisted`);
    else if (e.persisted !== 'none' && (typeof e.persisted !== 'object' || e.persisted === null || Array.isArray(e.persisted))) errors.push(`${at} expected.persisted debe ser "none" u objeto`);
    for (const t of e.tools ?? []) if (!TOOLS.includes(t)) errors.push(`${at} herramienta fuera de la allowlist: ${t}`);
    for (const k of Object.keys(e)) if (!(k in P.expected.properties)) errors.push(`${at} expected.${k} no permitido`);
    if (typeof c.critical !== 'boolean') errors.push(`${at} critical debe ser boolean`);
    count[c.segment] = (count[c.segment] ?? 0) + 1;
    if (c.split in splits) splits[c.split]++;
    if (c.split === 'test' && c.critical) criticalTest++;
  });
}

for (const [s, n] of Object.entries(TARGET)) console.log(`${s.padEnd(13)} ${String(count[s] ?? 0).padStart(3)}/${n}`);
if (!criticalTest) errors.push('no hay casos críticos en split test: el gate ciego no se puede medir');
console.log(`split dev ${splits.dev} / test ${splits.test} (críticos en test: ${criticalTest})`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`OK: ${ids.size} casos válidos`);
