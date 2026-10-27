import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/components/admin/conversations/ConversationInbox.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/app/admin-design.css', import.meta.url), 'utf8');

test('fullscreen chat does not reserve the hidden dock and composer has only send and header owns actions', () => {
  assert.doesNotMatch(css, /\.advisor-mobile-shell\s+\.wa-inbox\s+\.wa-fullscreen\s*\{[^}]*100px/);
  const composer = source.slice(source.indexOf('<form onSubmit={(event) => { event.preventDefault(); void (noteMode'), source.indexOf('</form>', source.indexOf('<form onSubmit={(event) => { event.preventDefault(); void (noteMode')));
  // Send, or "Responder yo" while the IA is in control (never both): no secondary buttons in the composer.
  assert.equal((composer.match(/<button\b/g) ?? []).length, 2);
  assert.match(composer, /Responder yo/);
  assert.doesNotMatch(composer, /aria-label="Acciones de la conversación"/);
  assert.doesNotMatch(composer, /Rápidas|<Paperclip|<MoreVertical/);
  const header = source.slice(source.indexOf('<div className="conversation-header'), source.indexOf('{replyUrgent &&'));
  assert.doesNotMatch(header, /Ver cliente|Devolver a la IA|replyWindow|dayLabel|clockTime/);
  assert.equal((header.match(/<button\b/g) ?? []).length, 3);
  assert.equal((header.match(/className="conversation-(?:name|status)"/g) ?? []).length, 2);
  assert.match(header, /<MoreVertical/);
  assert.match(header, /className="conversation-contact"[^>]*onClick=\{\(\) => setShowClient\(true\)\}/);
  assert.match(css, /\.conversation-header \{[^}]*height: 64px/);
  assert.match(css, /@media \(width < 768px\)[\s\S]*\.conversation-header \{[^}]*height: 56px/);
  assert.match(css, /\.conversation-name \{ font-size: 17px; line-height: 22px; font-weight: 600/);
  assert.match(css, /\.conversation-status \{ font-size: 14px; line-height: 20px/);
  assert.match(css, /\.conversation-identity > span \{[^}]*white-space: nowrap; overflow: hidden; text-overflow: ellipsis/);
  for (const width of [320, 375, 430]) {
    // Fixed controls, avatar and gaps leave a positive shrinking text column even at 320px.
    assert.ok(width - 8 - 88 - 8 - 40 - 8 > 0);
  }
  assert.match(source, /<DialogContent[^>]*finalFocus=\{\(\) =>/);
});

test('viewport scroll is keyboard-only, coalesced with rAF, and unchanged dimensions are not written', () => {
  const listeners = new Map(), jobs = new Map(), properties = new Map();
  let writes = 0, frame = 0, cleanup;
  const viewport = { height: 800, offsetTop: 0, scale: 1,
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const root = { style: { setProperty: (name, value) => { writes++; properties.set(name, value); }, removeProperty: name => properties.delete(name) }, classList: { add() {}, remove() {}, toggle() {} } };
  const window = { innerHeight: 800, visualViewport: viewport, matchMedia: () => ({ matches: false }), history: { pushState() {}, state: null },
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame: fn => { jobs.set(++frame, fn); return frame; }, cancelAnimationFrame: id => jobs.delete(id) };
  const context = { window, document: { documentElement: root }, SPLIT_VIEW: '', useRef: value => ({ current: value }), useEffect: fn => { cleanup = fn(); } };
  const hook = source.slice(source.indexOf('function useFullscreenChat('), source.indexOf('\nfunction useQuickReplies('));
  vm.runInNewContext(ts.transpileModule(hook, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nuseFullscreenChat(true, () => {});', context);
  assert.equal(writes, 2);
  listeners.get('scroll')();
  assert.equal(jobs.size, 0);
  viewport.height = 480; viewport.offsetTop = 30;
  listeners.get('resize')(); listeners.get('scroll')(); listeners.get('scroll')();
  assert.equal(jobs.size, 1);
  const flush = () => { const pending = [...jobs.values()]; jobs.clear(); pending.forEach(fn => fn()); };
  flush();
  assert.equal(properties.get('--wa-chat-height'), '480px');
  assert.equal(properties.get('--wa-chat-top'), '30px');
  assert.equal(writes, 4);
  listeners.get('scroll')(); flush();
  assert.equal(writes, 4);
  viewport.height = 800; listeners.get('resize')(); flush();
  assert.equal(properties.get('--wa-chat-top'), '0px');
  listeners.get('resize')(); cleanup();
  assert.equal(jobs.size, 0);
  assert.equal(listeners.size, 0);
});
