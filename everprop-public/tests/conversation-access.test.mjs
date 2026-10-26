import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const navbar = read('src/components/admin/AdminNavbar.tsx');

test('conversation shortcuts keep both roles, shared badge, accessible labels and chat hiding', () => {
  assert.match(navbar, /canViewConversations = isAdmin \|\| isAdvisor/);
  assert.match(navbar, /canViewConversations && <Link href="\/admin\/conversaciones" aria-label=\{conversationLabel\}/);
  assert.match(navbar, /Conversaciones, \$\{conversationCount\} pendientes/);
  assert.match(navbar, /conversationCount > 0 && <span[^>]+>[{]conversationCount[}]<\/span>/);
  const dock = navbar.slice(navbar.indexOf('{canViewConversations && <nav'));
  assert.match(dock, /href="\/admin\/conversaciones" aria-label=\{conversationLabel\}/);
  assert.match(dock, /\{conversationBadge\}/);
  for (const label of ['Mi Día', 'Mensajes', 'Leads', 'Agenda']) assert.ok(dock.includes(label));
  assert.match(dock, /href="\/admin\/agenda"/);
  assert.match(read('src/components/admin/advisor/AdvisorCockpit.tsx'), /className="mi-day-secondary" href="\/admin\/conversaciones"><MessageCircle aria-hidden \/>Conversaciones/);
  const css = read('src/app/admin-design.css');
  assert.match(css, /html\.wa-chat-open \.advisor-dock\s*\{\s*display: none/);
  assert.match(css, /:has\(\.advisor-dock\) \[data-admin-scroll-container\].*padding-bottom: calc\(112px \+ env\(safe-area-inset-bottom\)\)/);
});

test('badge deduplicates waiting and unread, refreshes on focus and 60s, clears on failure and cleans up', async () => {
  const effect = navbar.slice(navbar.indexOf('    setConversationCount(0);'), navbar.indexOf('  }, [user?.id, canViewConversations]);'));
  let count, fail = false, interval, focus, removed, cleared;
  const filters = [];
  const cleanup = vm.runInNewContext(`(function () { ${effect} })()`, {
    user: { id: 'advisor' }, canViewConversations: true, Set,
    setConversationCount: value => { count = value; },
    listConversations: async filter => {
      filters.push(filter);
      if (fail) throw Error('offline');
      return { data: filter === 'waiting' ? [{ id: 'both' }, { id: 'waiting' }] : [{ id: 'both' }, { id: 'unread' }] };
    },
    window: {
      setInterval: (callback, ms) => { assert.equal(ms, 60_000); interval = callback; return 7; },
      clearInterval: id => { cleared = id; },
      addEventListener: (name, callback) => { assert.equal(name, 'focus'); focus = callback; },
      removeEventListener: (name, callback) => { removed = name === 'focus' && callback === focus; },
    },
  });
  await new Promise(setImmediate);
  assert.equal(count, 3);
  assert.deepEqual(filters, ['waiting', 'unread']);
  fail = true;
  await focus();
  assert.equal(count, 0);
  fail = false;
  interval();
  await new Promise(setImmediate);
  assert.equal(count, 3);
  cleanup();
  assert.equal(cleared, 7);
  assert.equal(removed, true);
  interval();
  await new Promise(setImmediate);
  assert.equal(filters.length, 6);
});
