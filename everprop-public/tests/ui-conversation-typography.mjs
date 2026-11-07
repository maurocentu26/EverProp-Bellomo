// Local mock mode only. PLAYWRIGHT_PATH may point to an existing Playwright installation.
// Alternatively validate DOM measurements captured through the browser tool: --snapshot <json>.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

export function measureTypography() {
  const font = selector => getComputedStyle(document.querySelector(selector)).fontSize;
  const send = document.querySelector('.conversation-send').getBoundingClientRect();
  return {
    mode: document.documentElement.dataset.panelTextSize, width: innerWidth, height: innerHeight,
    title: font('.conversation-workspace-heading h1'), tab: font('.conversation-tabs button'),
    count: font('.conversation-tabs button span'), body: font('.wa-bubble p:not(.conversation-sender):not(.wa-meta)'),
    editor: font('#reply'), control: font('.conversation-composer button:not(.conversation-send)'),
    send: font('.conversation-send'), meta: font('.wa-meta'),
    drawerBody: font('.conversation-client-drawer-body'), drawerTitle: font('.conversation-client-drawer h2'),
    drawerDescription: font('.conversation-client-drawer [data-slot="sheet-description"]'),
    sendBottom: send.bottom, sendHeight: send.height, overflow: document.documentElement.scrollWidth > innerWidth + 2,
  };
}

export function checkTypography(samples) {
  assert.ok(samples.length >= 6, 'Measure both sizes at desktop, tablet and mobile widths');
  for (const sample of samples) {
    const scale = sample.mode === 'grande' ? 1.2 : 1;
    const expected = { title:24, tab:15, count:15, body:17, editor:17, control:15, send:15, meta:13, drawerBody:17, drawerTitle:20, drawerDescription:14 };
    for (const [role, pixels] of Object.entries(expected)) {
      assert.ok(Math.abs(parseFloat(sample[role]) - pixels * scale) < .1, `${sample.width}/${sample.mode} ${role}: ${sample[role]}, expected ${pixels * scale}px`);
    }
    assert.equal(sample.overflow, false, 'No horizontal page overflow');
    assert.ok(sample.sendBottom <= sample.height + 2, 'Send stays inside viewport');
    assert.ok(sample.sendHeight >= (sample.width < 768 ? 52 : 44) - 1, 'Touch target retains minimum height');
  }
  for (const width of [1440,768,320]) for (const mode of ['actual','grande']) {
    assert.ok(samples.some(sample => sample.width === width && sample.mode === mode), `${width}/${mode} measured`);
  }
  const layers = samples.find(sample => sample.layers)?.layers;
  assert.ok(layers, 'Nested confirmation dialog layers measured');
  assert.ok(Number(layers.popup) > Number(layers.drawer), 'Confirmation above client drawer');
  if (layers.overlay !== null) assert.ok(Number(layers.overlay) > Number(layers.drawer), 'Confirmation backdrop above client drawer');
}

if (process.argv[2] === '--snapshot') {
  const samples = JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
  checkTypography(samples);
  console.log(`PASS ${samples.length} browser-measured typography/geometry samples`);
} else {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
  const origin = process.env.UI_QA_ORIGIN || 'http://127.0.0.1:3217';
  assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname), 'Local demo only');
  const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
  try {
    const page = await browser.newPage();
    await page.goto(origin+'/login');
    await page.getByRole('button',{name:/Lucas Albarracín ADVISOR.*mock/}).click();
    await page.waitForURL('**/admin');
    const samples=[];
    for (const width of [1440,768,320]) for (const mode of ['actual','grande']) {
      await page.setViewportSize({width,height:width===320?568:1000});
      await page.goto(origin+'/admin/conversaciones');
      await page.getByRole('button',{name:/Tamaño de texto:/}).click();
      await page.getByRole('radio',{name:mode==='grande'?/Grande/:/Actual/}).check();
      await page.keyboard.press('Escape');
      await page.getByRole('button',{name:/Tomás Quiroga/}).click();
      await page.locator('#reply').waitFor();
      const sample = await page.evaluate(measureTypography);
      if (width===1440 && mode==='actual') {
        await page.getByRole('button',{name:'Ver cliente',exact:true}).click();
        await page.getByRole('button',{name:'Revisar y confirmar visita'}).click();
        sample.layers = await page.evaluate(() => ({
          popup:getComputedStyle(document.querySelector('.wa-inbox[data-slot="dialog-content"]')).zIndex,
          overlay:document.querySelector('[data-slot="dialog-overlay"]') ? getComputedStyle(document.querySelector('[data-slot="dialog-overlay"]')).zIndex : null,
          drawer:getComputedStyle(document.querySelector('.conversation-client-drawer')).zIndex,
        }));
        await page.getByRole('button',{name:'Todavía no',exact:true}).click();
        await page.getByRole('button',{name:'Cerrar',exact:true}).click();
      }
      samples.push(sample);
    }
    checkTypography(samples);
    console.log(`PASS ${samples.length} browser-measured typography/geometry samples`);
  } finally { await browser.close(); }
}
