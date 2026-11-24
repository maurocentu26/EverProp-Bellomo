import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const load = (file, context) => {
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
};
// Plain objects from another vm realm: compare by JSON.
const plain = value => JSON.parse(JSON.stringify(value));
const P = load('../src/lib/lead-extended-profile.ts', { exports: {}, Date });

test('EVP-180: la edad se calcula con la fecha de Argentina, no la UTC', () => {
  // 2026-05-10 01:30 UTC = 2026-05-09 22:30 en Jujuy: todavía no cumplió.
  const lateNight = new Date('2026-05-10T01:30:00Z');
  assert.equal(P.argentinaToday(lateNight), '2026-05-09');
  assert.equal(P.computeAge('1990-05-10', lateNight), 35);
  assert.equal(P.computeAge('1990-05-09', lateNight), 36);
  assert.equal(P.computeAge('1990-05-10', new Date('2026-05-10T03:00:00Z')), 36);
  assert.equal(P.computeAge('', lateNight), null);
  assert.equal(P.computeAge('1990-02-30', lateNight), null, 'fecha inexistente');
  assert.equal(P.computeAge('2030-01-01', lateNight), null, 'fecha futura');
  // 29 de febrero: en años no bisiestos cumple el 1 de marzo.
  assert.equal(P.computeAge('2000-02-29', new Date('2025-02-28T15:00:00Z')), 24);
  assert.equal(P.computeAge('2000-02-29', new Date('2025-03-01T15:00:00Z')), 25);
});

test('EVP-180: validaciones de ingresos, fechas, hijos, cantidades y email', () => {
  const now = new Date('2026-11-24T15:00:00Z');
  const profile = P.emptyProfile();
  assert.deepEqual(plain(P.validateProfile(profile, now)), {});
  profile.personal.birthDate = '2026-11-25';
  profile.personal.childrenCount = '2.5';
  profile.employment.income = '-1';
  profile.employment.email = 'sin-arroba';
  profile.guarantor.income = 'mucho';
  profile.currentHousing.assets = [{ value: '1000', typology: 'Auto', quantity: '1001' }];
  assert.deepEqual(Object.keys(P.validateProfile(profile, now)).sort(), [
    'currentHousing.assets.0.quantity', 'employment.email', 'employment.income', 'guarantor.income', 'personal.birthDate', 'personal.childrenCount',
  ]);
  profile.personal.birthDate = '1899-12-31';
  assert.ok(P.validateProfile(profile, now)['personal.birthDate'], 'anterior a 1900');
  profile.personal.birthDate = '2026-11-24';
  assert.equal(P.validateProfile(profile, now)['personal.birthDate'], undefined, 'hoy es válido (before_or_equal:today)');
});

test('EVP-180: el payload vacía campos con null, descarta filas vacías y convierte números', () => {
  const profile = P.emptyProfile();
  profile.personal.documentNumber = ' 30123456 ';
  profile.personal.childrenCount = '2';
  profile.addresses = [
    { street: 'Belgrano 1234', floorAndUnit: '', neighborhood: 'Centro', city: 'San Salvador de Jujuy', province: 'Jujuy' },
    P.emptyAddress(),
  ];
  profile.employment.income = '850000.50';
  profile.currentHousing.assets = [{ value: '12000', typology: 'Auto', quantity: '1' }, P.emptyAsset()];
  const payload = plain(P.cleanProfile(profile));
  assert.deepEqual(payload.personal, { documentNumber: '30123456', taxId: null, taxCondition: null, nationality: null, maritalStatus: null, birthDate: null, childrenCount: 2 });
  assert.deepEqual(payload.addresses, [{ street: 'Belgrano 1234', floorAndUnit: null, neighborhood: 'Centro', city: 'San Salvador de Jujuy', province: 'Jujuy' }]);
  assert.equal(payload.employment.income, 850000.5);
  assert.equal(payload.guarantor, null, 'bloque vacío = null: el backend lo borra');
  assert.deepEqual(payload.currentHousing, { status: null, notes: null, assets: [{ value: 12000, typology: 'Auto', quantity: 1 }] });
  assert.equal(P.profileHasData(profile), true);
  assert.equal(P.profileHasData(P.emptyProfile()), false);
});

test('EVP-180: agregar y quitar filas no pierde las demás (domicilios y bienes)', () => {
  let profile = P.emptyProfile();
  profile = { ...profile, addresses: [...profile.addresses, { ...P.emptyAddress(), street: 'Uno' }, { ...P.emptyAddress(), street: 'Dos' }, { ...P.emptyAddress(), street: 'Tres' }] };
  profile = { ...profile, addresses: profile.addresses.filter((_, i) => i !== 1) };
  assert.deepEqual(plain(P.cleanProfile(profile).addresses.map(a => a.street)), ['Uno', 'Tres']);
  assert.equal(P.rowHasData(P.emptyAddress()), false);
  assert.equal(P.rowHasData({ ...P.emptyAsset(), typology: ' ' }), false, 'solo espacios no cuenta como dato');
  assert.equal(P.rowHasData({ ...P.emptyAsset(), quantity: '3' }), true);
  // Sin bienes ni situación, la vivienda actual se elimina; quitar todas las filas manda lista vacía.
  assert.equal(P.cleanProfile(profile).currentHousing, null);
  assert.deepEqual(plain(P.cleanProfile(P.emptyProfile()).addresses), []);
});

test('EVP-180: mapeo API → formulario, ida y vuelta, y respuesta de solo lectura', () => {
  const api = {
    version: 1,
    personal: { documentNumber: '30123456', birthDate: '1990-05-10', childrenCount: 2 },
    addresses: [{ street: 'Belgrano 1234', city: 'Palpalá' }],
    employment: { employer: 'Ledesma', income: 900000 },
    guarantor: { name: 'Ana Paz' },
    currentHousing: { status: 'TENANT', notes: null, assets: [{ value: 5000, typology: 'Moto', quantity: 1 }] },
  };
  const form = P.mapApiProfile(api);
  assert.equal(form.personal.childrenCount, '2');
  assert.equal(form.personal.taxId, '');
  assert.equal(form.addresses[0].city, 'Palpalá');
  assert.equal(form.addresses[0].province, '');
  assert.equal(form.currentHousing.status, 'TENANT');
  assert.equal(form.currentHousing.assets[0].value, '5000');
  const payload = plain(P.cleanProfile(form));
  assert.equal(payload.personal.childrenCount, 2);
  assert.equal(payload.employment.income, 900000);
  assert.equal(payload.version, undefined, 'version la pone el backend');
  // null (nunca cargado) y READ_ONLY (sin garante ni DNI) no rompen el formulario.
  assert.deepEqual(plain(P.mapApiProfile(null)), plain(P.emptyProfile()));
  const readOnly = P.mapApiProfile({ personal: { nationality: 'Argentina' } });
  assert.equal(readOnly.guarantor.name, '');
  assert.equal(readOnly.personal.nationality, 'Argentina');
});

test('EVP-180: la API manda el perfil tal cual en alta y edición, y mapLead lo conserva', async () => {
  const calls = [];
  const context = {
    exports: {}, process: { env: {} }, URL, Headers, Event, DOMException, AbortSignal, document: { cookie: '' },
    window: { location: { origin: 'http://localhost:3000' }, dispatchEvent() {} },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return { ok: true, status: 200, json: async () => ({ data: { id: 'lead-1', name: 'Ana', stage: 'NEW', version: 3, profile: { personal: { nationality: 'Argentina' } } } }) };
    },
    require() { throw Error('Unexpected runtime import'); },
  };
  const api = load('../src/lib/everprop-api.ts', context);
  const profile = P.emptyProfile();
  profile.personal.nationality = 'Argentina';
  const payload = P.cleanProfile(profile);
  const created = await api.createEverpropLead({ name: 'Ana', phone: '3885550107', profile: payload });
  assert.deepEqual(JSON.parse(calls[0].init.body).profile, plain(payload));
  assert.deepEqual(plain(created.profile), { personal: { nationality: 'Argentina' } });
  await api.updateEverpropLead('lead-1', { profile: payload, version: 3 });
  const body = JSON.parse(calls[1].init.body);
  assert.equal(calls[1].init.method, 'PUT');
  assert.equal(body.version, 3);
  assert.deepEqual(body.profile, plain(payload));
  await api.updateEverpropLead('lead-1', { notes: 'x' });
  assert.equal('profile' in JSON.parse(calls[2].init.body), false, 'otras ediciones no tocan el perfil');
  await api.createEverpropLead({ name: 'Ana', phone: '3885550107' });
  assert.equal('profile' in JSON.parse(calls[3].init.body), false, 'alta rápida sin perfil');
});
