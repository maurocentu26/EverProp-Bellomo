import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const link = read('src/components/admin/LeadConversationLink.tsx');
const detail = read('src/components/admin/LeadDetailView.tsx');
const cockpit = read('src/components/admin/advisor/AdvisorCockpit.tsx');
const effect = link.slice(link.indexOf('    let active = true;'), link.indexOf('  }, [term]);'));
const termExpression = link.match(/const \[term\] = useState\(\(\) => (.*)\);/)[1];

test('search uses digits first, email fallback, hides empty/failing results and cancels on unmount', async () => {
  for (const [lead, term, data, fails, expectedCalls, expectedId] of [
    [{ phone: '+54 (11) 1234', email: 'other@test.com' }, '54111234', [{ id: 'web-chat', channel: 'WEB_CHAT' }], false, 1, 'web-chat'],
    [{ phone: '', email: ' mail@test.com ' }, 'mail@test.com', [{ id: 'instagram', channel: 'INSTAGRAM_DM' }], false, 1, 'instagram'],
    [{ phone: '---', email: 'mail@test.com' }, 'mail@test.com', [], false, 1, null],
    [{ phone: '12' }, '12', [], true, 1, null],
    [{ phone: '1' }, '1', [], false, 0, null],
    [{}, '', [], false, 0, null],
  ]) {
    assert.equal(vm.runInNewContext(termExpression, { lead }), term);
    let id = null;
    const calls = [];
    const context = {
      term, MIN_SEARCH: 2,
      setConversationId: value => { id = value; },
      listConversations: async (...args) => {
        calls.push(args);
        if (fails) throw Error('offline');
        return { data };
      },
      deferEffectUpdate: callback => {
        let cancelled = false;
        queueMicrotask(() => { if (!cancelled) callback(); });
        return () => { cancelled = true; };
      },
    };
    const run = () => vm.runInNewContext(`(function () { ${effect} })()`, context);
    // React Strict Mode's first setup is cleaned up before the real setup.
    run()();
    const cleanup = run();
    await new Promise(setImmediate);
    assert.equal(calls.length, expectedCalls);
    if (expectedCalls) assert.deepEqual(calls[0], ['all', term]);
    assert.equal(id, expectedId);
    cleanup();
    id = null;
    const unmount = run();
    await Promise.resolve();
    unmount();
    await new Promise(setImmediate);
    assert.equal(id, null);
  }
});

test('both surfaces keep the internal conversation link and external WhatsApp', () => {
  assert.match(link, /if \(!conversationId\) return null/);
  assert.match(link, /href=\{`\/admin\/conversaciones\?c=\$\{encodeURIComponent\(conversationId\)\}`\}>Ver conversación/);
  for (const surface of [detail, cockpit]) {
    assert.match(surface, /<LeadConversationLink key=\{lead.id\} lead=\{lead\} \/>/);
    assert.match(surface, /https:\/\/wa\.me\//);
  }
  assert.match(read('src/app/admin-design.css'), /\.lead-conversation-link \{[^}]*min-height: 44px;[^}]*font-size: var\(--day-text\);[^}]*white-space: normal;[^}]*word-break: normal;/);
});

test('main column starts with interests and history, with financing closed below them', () => {
  const main = detail.slice(detail.indexOf('<div className="lead-detail-main'));
  const interests = main.indexOf('aria-labelledby="lead-interests-title"');
  const history = main.indexOf('aria-labelledby="lead-follow-up-timeline-title"');
  const stage = main.indexOf('className="lead-stage-panel"');
  const financing = main.indexOf('<details className="lead-financing">');
  assert.ok(interests > 0 && history > interests && stage > history && financing > stage);
  assert.match(main, /<details className="lead-financing"><summary>Calculadora de financiación<\/summary>[\s\S]*?<FinancingCalculator[\s\S]*?<\/details>/);
  assert.equal((main.match(/<FinancingCalculator/g) || []).length, 1);
});
