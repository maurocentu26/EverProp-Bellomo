import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const trace = fs.readFileSync(new URL('../src/components/admin/conversations/AssistantTrace.tsx', import.meta.url), 'utf8');
const inbox = fs.readFileSync(new URL('../src/components/admin/conversations/ConversationInbox.tsx', import.meta.url), 'utf8');

test('assistant trace is plain text and only offered to the tenant admin', () => {
  assert.doesNotMatch(trace, /dangerouslySetInnerHTML|innerHTML/);
  assert.match(inbox, /const isAdmin = user\?\.apiRole === "TENANT_ADMIN";/);
  assert.match(inbox, /\{isAdmin && \(\s*<button[^>]*role="menuitem"[\s\S]*?Traza del asistente/);
  assert.match(inbox, /\{isAdmin && selected && <AssistantTrace /);
});
