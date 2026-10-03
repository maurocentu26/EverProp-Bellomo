import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(fs.readFileSync(new URL('../src/lib/whatsapp-signup.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const scope = { exports: {}, URL };
vm.runInNewContext(source, scope);
const { isMetaOrigin, parseSignupMessage, connectPayload } = scope.exports;

const finish = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: '1001', phone_number_id: '2002', business_id: '3003' } };

test('only https Facebook origins are trusted', () => {
  assert.equal(isMetaOrigin('https://www.facebook.com'), true);
  assert.equal(isMetaOrigin('https://web.facebook.com'), true);
  assert.equal(isMetaOrigin('http://www.facebook.com'), false);
  assert.equal(isMetaOrigin('https://facebook.com.evil.example'), false);
  assert.equal(isMetaOrigin('https://evilfacebook.com'), false);
  assert.equal(isMetaOrigin('null'), false);
  assert.equal(parseSignupMessage('https://evil.example', finish), null);
});

test('a finished signup yields numeric ids from objects or JSON strings', () => {
  const parsed = parseSignupMessage('https://www.facebook.com', JSON.stringify(finish));
  assert.equal(parsed.kind, 'finish');
  assert.equal(parsed.session.waba_id, '1001');
  assert.equal(parsed.session.phone_number_id, '2002');
  assert.equal(parsed.session.business_id, '3003');
  assert.equal(parseSignupMessage('https://www.facebook.com', { ...finish, data: { ...finish.data, business_id: undefined } }).session.business_id, null);
});

test('tampered ids, cancel, errors and unrelated messages are handled without sending', () => {
  assert.equal(parseSignupMessage('https://www.facebook.com', { ...finish, data: { waba_id: '../me', phone_number_id: '2002' } }).kind, 'error');
  assert.equal(parseSignupMessage('https://www.facebook.com', { type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', data: { current_step: 'PHONE_NUMBER_SETUP' } }).step, 'PHONE_NUMBER_SETUP');
  assert.equal(parseSignupMessage('https://www.facebook.com', { type: 'WA_EMBEDDED_SIGNUP', event: 'ERROR', data: { error_message: 'x' } }).kind, 'error');
  assert.equal(parseSignupMessage('https://www.facebook.com', { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_ONLY_WABA', data: { waba_id: '1' } }).kind, 'error');
  assert.equal(parseSignupMessage('https://www.facebook.com', { type: 'OTHER' }), null);
  assert.equal(parseSignupMessage('https://www.facebook.com', 'not json'), null);
});

test('the connect body exists only when both the code and the ids arrived', () => {
  const session = { waba_id: '1001', phone_number_id: '2002', business_id: null };
  assert.equal(connectPayload(null, session), null);
  assert.equal(connectPayload('code', null), null);
  assert.equal(JSON.stringify(connectPayload('code', session)), JSON.stringify({ code: 'code', waba_id: '1001', phone_number_id: '2002', business_id: null }));
});
