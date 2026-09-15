import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../public/notifications-sw.js', import.meta.url), 'utf8');
function worker(windows = []) {
  const handlers = {}, opened = [], shown = [];
  vm.runInNewContext(source, { URL, self: {
    location: { origin: 'https://crm.example.com' },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    clients: { matchAll: async () => windows, openWindow: async url => { opened.push(url); } },
    registration: { showNotification: async (title, options) => { shown.push({ title, options }); } },
  }});
  return { handlers, opened, shown };
}
for (const url of ['http://[', 'https://external.example/admin', '/administrator', 'javascript:alert(1)']) {
  test(`unsafe or malformed notification destination falls back to panel: ${url}`, async () => {
    const w = worker(); let pending;
    w.handlers.notificationclick({ notification: { data: { url }, close() {} }, waitUntil: p => { pending = p; } });
    await pending;
    assert.deepEqual(w.opened, ['https://crm.example.com/admin']);
  });
}
test('notification reuses an existing panel window and opens the requested internal page', async () => {
  const navigated = []; let focused = false, pending;
  const w = worker([{ url: 'https://crm.example.com/admin/leads', navigate: async url => { navigated.push(url); }, focus: async () => { focused = true; } }]);
  w.handlers.notificationclick({ notification: { data: { url: '/admin/notifications' }, close() {} }, waitUntil: p => { pending = p; } });
  await pending;
  assert.deepEqual(navigated, ['https://crm.example.com/admin/notifications']);
  assert.equal(focused, true); assert.equal(w.opened.length, 0);
});
test('malformed push payload still shows a visible notification with sound requested', async () => {
  const w = worker(); let pending;
  w.handlers.push({ data: { json() { throw Error('Invalid JSON'); } }, waitUntil: p => { pending = p; } });
  await pending;
  assert.equal(w.shown[0].title, 'Bellomo');
  assert.equal(w.shown[0].options.silent, false);
  assert.equal(w.shown[0].options.requireInteraction, true);
});
