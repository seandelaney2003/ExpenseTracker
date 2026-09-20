// Backup export/import — the user's own safety net. A bad import once
// crashed on any backup saved before accounts became editable.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { STORAGE_KEY, plain, tick, v7Backup, loadApp, importEvent } = require('./helpers');

describe('importData', () => {
  test('imports an older-schema (v7) backup: migrated, persisted, and every screen renders', async () => {
    const alerts = [];
    const h = loadApp({ alert: (m) => alerts.push(m) });
    h.app.importData(importEvent(JSON.stringify(v7Backup())));
    await tick();

    const s = h.get('state');
    assert.equal(alerts.length, 0);
    assert.equal(s.version, 8);
    assert.equal(s.accountDefs.length, 6);
    assert.equal(s.accounts.checking, 11747);
    assert.equal(JSON.parse(h.localStorage.getItem(STORAGE_KEY)).accounts.checking, 11747, 'persisted immediately');
    for (const tab of ['dashboard', 'weekly', 'monthly', 'budget']) assert.doesNotThrow(() => h.app.showTab(tab), tab);
  });

  test('imports a current-version backup unchanged', async () => {
    const source = loadApp();
    source.app.addAccount();
    source.app.applyWeekBalance('2026-09-04', { checking: 321 });
    const json = JSON.stringify(source.get('state'));

    const h = loadApp();
    h.app.importData(importEvent(json));
    await tick();
    assert.equal(h.get('state').accounts.checking, 321);
    assert.equal(h.get('state').accountDefs.length, 7);
  });

  test('a file that is not JSON is rejected with a message and changes nothing', async () => {
    const alerts = [];
    const h = loadApp({ alert: (m) => alerts.push(m) });
    h.get('state').accounts.checking = 42;
    h.app.importData(importEvent('this is not json'));
    await tick();
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /does not look like a valid backup/i);
    assert.equal(h.get('state').accounts.checking, 42);
  });

  test('JSON missing required sections is rejected and changes nothing', async () => {
    const alerts = [];
    const h = loadApp({ alert: (m) => alerts.push(m) });
    h.get('state').accounts.checking = 42;
    for (const bad of [{ weeks: {}, months: {}, accounts: {} }, { categories: {}, weeks: {}, accounts: {} }, { categories: {}, weeks: {}, months: {} }]) {
      h.app.importData(importEvent(JSON.stringify(bad)));
    }
    await tick();
    assert.equal(alerts.length, 3);
    assert.equal(h.get('state').accounts.checking, 42);
  });

  test('choosing no file does nothing', () => {
    const h = loadApp();
    assert.doesNotThrow(() => h.app.importData({ target: { files: [], value: '' } }));
  });
});

describe('exportData', () => {
  test('exports exactly the current state as JSON', () => {
    const h = loadApp();
    h.app.applyWeekBalance('2026-09-04', { checking: 555 });
    h.app.exportData();
    const blob = h.app.__lastBlob;
    assert.equal(blob.type, 'application/json');
    assert.deepEqual(JSON.parse(blob.parts[0]), plain(h.get('state')));
  });

  test('export -> import round-trips into a brand-new install without losing anything', async () => {
    const a = loadApp();
    a.app.addAccount();
    a.app.applyWeekBalance('2026-09-04', { checking: 900, creditCard1: 120 });
    a.app.onCheckChange('2026-09-04', 'income', a.get('state').categories.income[0].id, true);
    a.app.exportData();
    const exported = a.app.__lastBlob.parts[0];

    const b = loadApp();
    b.app.importData(importEvent(exported));
    await tick();
    const sa = plain(a.get('state')), sb = plain(b.get('state'));
    assert.deepEqual(sb.accounts, sa.accounts);
    assert.deepEqual(sb.accountDefs, sa.accountDefs);
    assert.deepEqual(sb.categories.income, sa.categories.income);
    assert.deepEqual(sb.weeks['2026-09-04'], sa.weeks['2026-09-04']);
  });
});

describe('resetAllData', () => {
  test('does nothing if the user cancels the confirmation', () => {
    const h = loadApp({ confirm: () => false });
    h.app.applyWeekBalance('2026-09-04', { checking: 77 });
    h.app.resetAllData();
    assert.equal(h.get('state').accounts.checking, 77);
  });
  test('wipes to a fresh state when confirmed', () => {
    const h = loadApp({ confirm: () => true });
    h.app.applyWeekBalance('2026-09-04', { checking: 77 });
    h.app.resetAllData();
    assert.equal(h.get('state').accounts.checking, 0);
  });
});
