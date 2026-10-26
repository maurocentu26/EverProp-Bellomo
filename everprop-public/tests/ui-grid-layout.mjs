// Run against the local demo with PLAYWRIGHT_PATH pointing to an installed Playwright package.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const origin = process.env.UI_QA_ORIGIN || 'http://127.0.0.1:3000';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Local demo only');
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(10000);
let failures = 0;
const visit = async (path, width) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(origin + path);
  await page.waitForLoadState('networkidle');
};
const fillsLastRow = async (locator, selector = ':scope > *') => {
  const bounds = await locator.evaluate((element, selector) => {
    const style = getComputedStyle(element);
    const parent = element.getBoundingClientRect();
    const children = [...element.querySelectorAll(selector)].map(child => child.getBoundingClientRect()).filter(rect => rect.width > 0);
    const lastY = Math.max(...children.map(rect => rect.y));
    const row = children.filter(rect => Math.abs(rect.y - lastY) < 2);
    return {
      children: children.length,
      expected: parent.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      actual: row.length ? Math.max(...row.map(rect => rect.right)) - Math.min(...row.map(rect => rect.left)) : 0,
    };
  }, selector);
  assert.ok(bounds.children, 'Expected rendered cards');
  assert.ok(Math.abs(bounds.actual - bounds.expected) < 3, `Last row uses ${Math.round(bounds.actual)} of ${Math.round(bounds.expected)} px`);
};
const check = async (name, run) => {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`); }
};
try {
  await visit('/login', 1440);
  await page.locator('input[type="email"]').fill(process.env.UI_QA_EMAIL || 'admin@bellomo.com');
  await page.locator('input[type="password"]').fill(process.env.UI_QA_PASSWORD || 'password123');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/admin');
  await check('UI-01 lead categories fill the final row', async () => {
    await visit('/admin/leads/new', 1440);
    await fillsLastRow(page.locator('.lead-categories'));
  });
  await check('UI-02 mobile asset filters fill the final row', async () => {
    await visit('/admin/properties', 390);
    await fillsLastRow(page.getByRole('region', { name: 'Filtros de activos' }), ':scope > label');
  });
  await check('UI-03 project cards fill the final row at tablet widths', async () => {
    for (const width of [768, 1024]) {
      await visit('/admin/desarrollos', width);
      await fillsLastRow(page.locator('.inventory-cards'));
    }
  });
  await check('UI-04 project documents use all available columns', async () => {
    await visit('/admin/desarrollos', 1440);
    await page.getByRole('link', { name: 'Ver proyecto', exact: true }).first().click();
    await page.waitForLoadState('networkidle');
    const material = page.getByRole('region', { name: 'Material del desarrollo' });
    await material.getByRole('heading', { name: 'Documentación del proyecto' }).waitFor();
    await fillsLastRow(material.locator('article').last().locator('..'));
  });
} finally { await browser.close(); }
process.exitCode = failures ? 1 : 0;
