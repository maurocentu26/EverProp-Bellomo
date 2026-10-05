// Browser checks (local or CI stack, never production): synthetic host site → widget iframe → panel
// inbox → advisor reply → visitor, desktop and 390px mobile. Needs the panel built and served with
// `next start` on E2E_PANEL_ORIGIN, calling the API as `localhost` (TENANT_HOST_MAP_JSON maps it to
// e2e-a, as Railway maps the API hostname), and PLAYWRIGHT_PATH pointing at an installed playwright.
// Run from everprop-api/ after api-vertical.mjs or alone. Exits 1 if any check fails.
import fs from "node:fs";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_PATH).href);
const P = process.env.COMPOSE_PROJECT_NAME || "everprop-api";
const PANEL = process.env.E2E_PANEL_ORIGIN || "http://127.0.0.1:3000";
const SITE_PORT = 4000;
const SITE = `http://127.0.0.1:${SITE_PORT}`;
const OUT = process.env.E2E_SHOTS || "";
const compose = (...a) => execFileSync("docker", ["compose", "--project-name", P, ...a]).toString().trim();
const sql = (q) => compose("exec", "-T", "everprop-api-mysql", "sh", "-c", 'MYSQL_PWD="$(cat /run/secrets/mysql_root_password)" mysql -uroot -N bellomo_crm -e "$0"', q);
const FX = JSON.parse(compose("exec", "-T", "everprop-api-php", "php", "tests/e2e/seed.php"));
const results = [];
const check = (id, name, ok, detail = "") => { results.push({ id, ok: !!ok }); console.log(`${ok ? "PASS" : "FAIL"} ${id} ${name}${detail ? " — " + detail : ""}`); };
const shot = (page, name) => (OUT ? page.screenshot({ path: `${OUT}/${name}.png` }) : null);
const stamp = Date.now().toString(36);
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const TITLE = "Chateá con A";

if (OUT) fs.mkdirSync(OUT, { recursive: true });
const site = http.createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sitio E2E</title></head>
<body><a href="#">Inicio</a><script src="${PANEL}/eversys-widget.js" data-widget-id="${FX.a.widget}" data-title="${TITLE}" defer></script></body></html>`);
}).listen(SITE_PORT, "127.0.0.1");
const browser = await chromium.launch();

try {
  // ---------- visitor on the synthetic site ----------
  const visitorCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const vp = await visitorCtx.newPage();
  await vp.goto(SITE);
  const bubble = vp.getByRole("button", { name: TITLE });
  await bubble.waitFor();
  check("U1", "el sitio muestra el botón del widget con nombre accesible", await bubble.isVisible());

  // Keyboard: Tab reaches the button (after the page link), Enter opens, Escape closes.
  await vp.keyboard.press("Tab"); await vp.keyboard.press("Tab");
  const focused = await vp.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  await vp.keyboard.press("Enter");
  const frameEl = vp.locator("#eversys-widget-frame");
  const openedByKey = await frameEl.isVisible();
  check("U2", "teclado: Tab llega al botón y Enter abre el chat", focused === TITLE && openedByKey, `foco=${focused}`);
  const chat = vp.frameLocator("#eversys-widget-frame");
  const input = chat.getByPlaceholder("Escribí tu consulta…");
  await input.waitFor({ timeout: 30000 });
  await input.focus();
  await vp.keyboard.press("Escape");
  await vp.waitForTimeout(300);
  const backOnButton = await vp.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  check("U3", "Escape con el foco dentro del chat lo cierra y devuelve el foco al botón", !(await frameEl.isVisible()) && backOnButton === TITLE, `foco=${backOnButton}`);
  await bubble.click();
  await input.waitFor({ timeout: 30000 });

  // Network error: the first POST of this message is aborted → no false "sent".
  let aborted = false;
  await visitorCtx.route("**/api/v1/public/chat/messages", (route) => {
    if (route.request().method() === "POST" && !aborted) { aborted = true; return route.abort("failed"); }
    return route.continue();
  });
  const text1 = `Consulta UI ${stamp}`;
  await input.fill(text1); await chat.getByRole("button", { name: "Enviar" }).click();
  const retry = chat.getByRole("button", { name: /No se envió · Reintentar/ });
  await retry.waitFor({ timeout: 15000 });
  check("U4", "error de red: el widget muestra 'No se envió · Reintentar' y no hay mensaje guardado", aborted && sql(`SELECT COUNT(*) FROM messages WHERE text_body='${text1}'`) === "0");
  await retry.click();
  // Wait for the stored outcome, not for the button: it hides as soon as the retry starts.
  const stored = () => sql(`SELECT COUNT(*) FROM messages WHERE text_body='${text1}'`);
  for (let i = 0; i < 30 && stored() === "0"; i++) await vp.waitForTimeout(500);
  await vp.waitForTimeout(1500); // a duplicate would land here
  check("U5", "reintento: se guarda una sola vez", stored() === "1" && !(await retry.isVisible()), `count=${stored()}`);
  await shot(vp, "01-sitio-widget-desktop");

  // ---------- advisor in the panel ----------
  const panel = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pp = await panel.newPage();
  await pp.goto(`${PANEL}/login`);
  await pp.locator('input[type="email"]').fill("manager.a@e2e.invalid");
  await pp.locator('input[type="password"]').fill("password");
  await pp.getByRole("button", { name: "Ingresar" }).click();
  await pp.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  await pp.goto(`${PANEL}/admin/conversaciones`);
  const item = pp.getByRole("button", { name: /Visitante del chat web/ }).first();
  await item.waitFor({ timeout: 30000 });
  check("U6", "la conversación del visitante aparece en 'Esperan asesor'", await item.isVisible());
  await item.click();
  await pp.getByText(text1).waitFor({ timeout: 15000 });
  await pp.getByRole("button", { name: /Tomar control/ }).click();
  // By its accessible label, not the placeholder (the WhatsApp-style composer changed it).
  const reply = pp.getByLabel("Respuesta al cliente");
  await reply.waitFor({ timeout: 15000 });
  const answer = `Respuesta del asesor ${stamp}`;
  await reply.fill(answer); await pp.getByRole("button", { name: "Enviar respuesta" }).click();
  await pp.getByText(answer).waitFor({ timeout: 15000 });
  await shot(pp, "02-bandeja-desktop");

  await chat.getByText(answer).waitFor({ timeout: 30000 });
  check("U7", "el visitante recibe la respuesta del asesor en el widget", true);
  check("U8", "la respuesta queda 'Enviado' (entregada por el worker)", sql(`SELECT delivery_status FROM messages WHERE text_body='${answer}'`) === "SENT");
  await shot(vp, "03-visitante-recibe");

  // ---------- mobile ----------
  const mp = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: await panel.storageState() })).newPage();
  await mp.goto(`${PANEL}/admin/conversaciones`);
  await mp.getByRole("group", { name: "Filtrar conversaciones" }).waitFor({ timeout: 30000 });
  const inboxOk = await noOverflow(mp);
  await shot(mp, "04-bandeja-movil");
  const ms = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await ms.goto(SITE);
  await ms.getByRole("button", { name: TITLE }).click();
  await ms.frameLocator("#eversys-widget-frame").getByPlaceholder("Escribí tu consulta…").waitFor({ timeout: 30000 });
  const box = await ms.locator("#eversys-widget-frame").boundingBox();
  const btn = await ms.getByRole("button", { name: TITLE }).boundingBox();
  const overlap = box && btn && !(btn.y >= box.y + box.height || btn.y + btn.height <= box.y || btn.x >= box.x + box.width || btn.x + btn.width <= box.x);
  await shot(ms, "05-widget-movil");
  check("U9", "móvil 390px: bandeja sin scroll horizontal; widget sin superponerse al botón", inboxOk && (await noOverflow(ms)) && !overlap && box.width <= 390);
} catch (error) {
  check("UX", "el recorrido terminó sin errores", false, String(error?.message ?? error).split("\n")[0]);
} finally {
  await browser.close();
  site.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} PASS`);
process.exit(passed === results.length && results.length === 9 ? 0 : 1);
