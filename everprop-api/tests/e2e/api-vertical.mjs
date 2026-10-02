// Vertical API checks against the isolated compose stack (local or CI, never production):
// visitor widget → inbox → advisor reply → visitor, with two synthetic tenants and AI off.
// Run from everprop-api/: COMPOSE_PROJECT_NAME=<project> HTTP_PORT=<port> node tests/e2e/api-vertical.mjs
// Exits 1 if any check fails.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const P = process.env.COMPOSE_PROJECT_NAME || "everprop-api";
const API = `http://127.0.0.1:${process.env.HTTP_PORT || "18080"}`;
const PANEL = process.env.E2E_PANEL_ORIGIN || "http://127.0.0.1:3000";
const compose = (...a) => execFileSync("docker", ["compose", "--project-name", P, ...a]).toString().trim();
const sql = (q) => compose("exec", "-T", "everprop-api-mysql", "sh", "-c", 'MYSQL_PWD="$(cat /run/secrets/mysql_root_password)" mysql -uroot -N bellomo_crm -e "$0"', q);
const FX = JSON.parse(compose("exec", "-T", "everprop-api-php", "php", "tests/e2e/seed.php"));
const TENANTS = `${FX.a.id},${FX.b.id}`;
const results = [];
const RUN = Date.now().toString(36);
const ANSWER = `Hola, soy tu asesor ${RUN}`;
const check = (id, name, ok, detail = "") => { results.push({ id, ok: !!ok }); console.log(`${ok ? "PASS" : "FAIL"} ${id} ${name}${detail ? " — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Minimal HTTP client with a cookie jar (Sanctum SPA session + XSRF), same surface the checks use.
function client(headers) {
  const jar = new Map();
  const call = async (method, url, { data, headers: extra = {} } = {}) => {
    const h = { ...headers, ...extra };
    if (jar.size) h.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    if (data !== undefined) h["Content-Type"] = "application/json";
    const r = await fetch(API + url, { method, headers: h, body: data === undefined ? undefined : JSON.stringify(data), redirect: "manual" });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    const body = await r.text();
    return { status: () => r.status, ok: () => r.ok, text: async () => body, json: async () => JSON.parse(body) };
  };
  return { jar, get: (u, o) => call("GET", u, o), post: (u, o) => call("POST", u, o) };
}

async function visitor(k, origin = PANEL) {
  const ctx = client({ Accept: "application/json", "X-Everprop-Tenant": FX[k].slug, Origin: origin });
  const start = await ctx.post("/api/v1/public/chat/sessions", { data: { widget_id: FX[k].widget } });
  const token = start.ok() ? (await start.json()).data.token : null;
  return { ctx, token, status: start.status(),
    send: (text, id = randomUUID(), tok = token) => ctx.post("/api/v1/public/chat/messages", { data: { client_message_id: id, text }, headers: tok ? { Authorization: `Bearer ${tok}` } : {} }),
    read: (after = 0, tok = token) => ctx.get(`/api/v1/public/chat/messages?after=${after}`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} }) };
}

async function staff(k, who) {
  const ctx = client({ Accept: "application/json", "X-Everprop-Tenant": FX[k].slug, Origin: PANEL, Referer: PANEL + "/" });
  await ctx.get("/sanctum/csrf-cookie");
  const post = (url, data) => ctx.post(url, { data, headers: { "X-XSRF-TOKEN": decodeURIComponent(ctx.jar.get("XSRF-TOKEN") ?? "") } });
  const login = await post("/api/v1/auth/login", { email: `${who}.${k}@e2e.invalid`, password: "password" });
  if (!login.ok()) throw new Error(`login ${who}.${k}: ${login.status()} ${await login.text()}`);
  return { post, get: (u) => ctx.get(u) };
}

const convOf = (v) => sql(`SELECT c.public_id FROM public_chat_sessions s JOIN conversations c ON c.id=s.conversation_id AND c.tenant_id=s.tenant_id WHERE s.token_sha256=UNHEX(SHA2('${v.token}',256))`);
const runs = () => sql(`SELECT COUNT(*) FROM chatbot_runs WHERE tenant_id IN (${TENANTS})`);

// ---------- visitor / session ----------
const a = await visitor("a");
check("V1", "alta de sesión del widget (tenant A)", a.status === 201 && a.token, `status=${a.status}`);
const s1 = await a.send("Hola, quiero info del lote 12");
check("V2", "envío del visitante", s1.status() === 201);
const conv = convOf(a);
check("V3", "IA apagada: la conversación entra como 'Espera asesor' y sin run IA",
  sql(`SELECT control_state FROM conversations WHERE public_id='${conv}'`) === "WAITING_HUMAN" && runs() === "0");

const dupId = randomUUID();
const d1 = await a.send(`mensaje con reintento ${RUN}`, dupId); const d2 = await a.send(`mensaje con reintento ${RUN}`, dupId);
const dupCount = sql(`SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.public_id='${conv}' AND m.text_body='mensaje con reintento ${RUN}'`);
check("V4", "reintento con la misma clave = una sola operación", d1.status() === 201 && d2.status() === 200 && (await d2.json()).data.replayed === true && dupCount === "1", `count=${dupCount}`);

const all = await (await a.read(0)).json();
const mid = all.data[0].sequence;
const page = await (await a.read(mid)).json();
check("V5", "lectura incremental por cursor (after/next_after)", page.data.every((m) => m.sequence > mid) && page.next_after >= mid && all.next_after >= page.next_after, `after=${mid} next=${page.next_after}`);

check("V6", "token inválido → 401", (await a.read(0, "token-que-no-existe")).status() === 401 && (await a.send("x", randomUUID(), "nope")).status() === 401);
const b = await visitor("b");
const crossRead = await b.ctx.get("/api/v1/public/chat/messages", { headers: { Authorization: `Bearer ${a.token}` } });
check("V7", "token de tenant A usado contra tenant B → 401", crossRead.status() === 401, `status=${crossRead.status()}`);
const evil = await visitor("a", "http://evil.example");
check("V8", "origen no permitido → 403 al abrir sesión", evil.status === 403, `status=${evil.status}`);
const evilSend = await client({ Accept: "application/json", "X-Everprop-Tenant": FX.a.slug, Origin: "http://evil.example", Authorization: `Bearer ${a.token}` })
  .post("/api/v1/public/chat/messages", { data: { client_message_id: randomUUID(), text: "x" } });
check("V9", "origen no permitido → 403 al enviar con token válido", evilSend.status() === 403, `status=${evilSend.status()}`);

const exp = await visitor("a");
sql(`UPDATE public_chat_sessions SET expires_at = NOW(3) - INTERVAL 1 MINUTE WHERE token_sha256=UNHEX(SHA2('${exp.token}',256))`);
const rev = await visitor("a");
sql(`UPDATE public_chat_sessions SET revoked_at = NOW(3) WHERE token_sha256=UNHEX(SHA2('${rev.token}',256))`);
check("V10", "sesión expirada y revocada → 401", (await exp.read()).status() === 401 && (await rev.read()).status() === 401);

// ---------- staff ----------
const mgrA = await staff("a", "manager"), adv1 = await staff("a", "advisor1"), adv2 = await staff("a", "advisor2"), ro = await staff("a", "readonly"), mgrB = await staff("b", "manager");
const listIds = async (s, q = "") => (await (await s.get(`/api/v1/admin/conversations${q}`)).json()).data.map((c) => c.id);
check("S1", "gerente A ve la conversación; gerente B no la ve ni puede abrirla",
  (await listIds(mgrA)).includes(conv) && !(await listIds(mgrB)).includes(conv) && [403, 404].includes((await mgrB.get(`/api/v1/admin/conversations/${conv}/messages`)).status()));
check("S2", "asesor ve conversaciones sin asignar que esperan asesor", (await listIds(adv1, "?state=WAITING_HUMAN")).includes(conv));

const [t1, t2] = await Promise.all([adv1.post(`/api/v1/admin/conversations/${conv}/takeover`), adv2.post(`/api/v1/admin/conversations/${conv}/takeover`)]);
const codes = [t1.status(), t2.status()].sort();
const winner = t1.status() === 200 ? adv1 : adv2, loser = winner === adv1 ? adv2 : adv1;
const controller = sql(`SELECT u.public_id FROM conversations c JOIN users u ON u.id=c.controlled_by_user_id WHERE c.public_id='${conv}'`);
check("S3", "dos asesores toman control a la vez: gana uno solo (el otro recibe 409 o deja de verla: 404)", codes[0] === 200 && [404, 409].includes(codes[1])
  && sql(`SELECT control_state FROM conversations WHERE public_id='${conv}'`) === "HUMAN_ACTIVE" && [FX.a.users.advisor1, FX.a.users.advisor2].includes(controller), `codes=${codes}`);

check("S4", "READ_ONLY no toma control ni responde", (await ro.post(`/api/v1/admin/conversations/${conv}/takeover`)).status() === 403
  && (await ro.post(`/api/v1/admin/conversations/${conv}/messages`, { text: "x", idempotency_key: "ro-0001-abcdefgh" })).status() === 403);
const loserReply = await loser.post(`/api/v1/admin/conversations/${conv}/messages`, { text: "no debería salir", idempotency_key: "loser-0001-abcdefgh" });
check("S5", "asesor sin control no puede responder", [403, 404, 409].includes(loserReply.status()), `status=${loserReply.status()}`);
check("S6", "asesor sin control no puede cerrar", [403, 404, 409].includes((await loser.post(`/api/v1/admin/conversations/${conv}/close`)).status()));

// Worker restart: stop worker → reply stays queued and invisible; start → delivered once.
compose("stop", "everprop-api-worker"); await sleep(1500);
const r1 = await winner.post(`/api/v1/admin/conversations/${conv}/messages`, { text: ANSWER, idempotency_key: `win-${RUN}-abcdefgh` });
const r2 = await winner.post(`/api/v1/admin/conversations/${conv}/messages`, { text: ANSWER, idempotency_key: `win-${RUN}-abcdefgh` });
const r3 = await winner.post(`/api/v1/admin/conversations/${conv}/messages`, { text: "otro texto", idempotency_key: `win-${RUN}-abcdefgh` });
await sleep(1500);
const seen = async () => (await (await a.read(0)).json()).data.map((m) => m.text);
const queuedState = sql(`SELECT delivery_status FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.public_id='${conv}' AND m.text_body='${ANSWER}'`);
check("S7", "respuesta idempotente: misma clave no duplica, otro texto con misma clave → 409", r1.status() === 202 && r2.ok() && r3.status() === 409, `${r1.status()}/${r2.status()}/${r3.status()}`);
check("S8", "sin worker: la respuesta queda en cola y el visitante no la ve", queuedState === "QUEUED" && !(await seen()).includes(ANSWER), `estado=${queuedState}`);
compose("start", "everprop-api-worker");
let delivered = false; for (let i = 0; i < 30 && !delivered; i++) { await sleep(1000); delivered = (await seen()).filter((t) => t === ANSWER).length === 1; }
check("S9", "worker reiniciado: entrega una sola vez y el visitante la ve", delivered && sql(`SELECT delivery_status FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.public_id='${conv}' AND m.text_body='${ANSWER}'`) === "SENT");

// UNKNOWN is never resent automatically.
sql(`UPDATE outbound_jobs j JOIN messages m ON m.id=j.message_id SET j.status='UNKNOWN', j.last_error_code='DELIVERY_UNKNOWN', m.delivery_status='UNKNOWN' WHERE m.text_body='${ANSWER}'`);
compose("exec", "-T", "everprop-api-php", "php", "artisan", "everprop:conversations:reconcile"); await sleep(2500);
check("S10", "mensaje UNKNOWN: el reconciliador no lo reenvía", sql(`SELECT j.status FROM outbound_jobs j JOIN messages m ON m.id=j.message_id WHERE m.text_body='${ANSWER}'`) === "UNKNOWN");

const close = await winner.post(`/api/v1/admin/conversations/${conv}/close`);
await a.send("Una pregunta más");
check("S11", "cierre por quien controla; nuevo mensaje reabre como 'Espera asesor' (IA apagada)", close.ok() && sql(`SELECT control_state FROM conversations WHERE public_id='${conv}'`) === "WAITING_HUMAN");
check("S12", "tenants E2E: sin leads ni runs de IA", runs() === "0" && sql(`SELECT COUNT(*) FROM leads WHERE tenant_id IN (${TENANTS})`) === "0");

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} PASS`);
process.exit(passed === results.length ? 0 : 1);
