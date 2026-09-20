// The desktop app mirrors every save to a plain file via Rust and can
// self-heal from it. Here `window.__TAURI__.core.invoke` is mocked, so this
// tests the JavaScript side of that contract (the Rust side is checked
// statically in integrity.test.js and compiled in CI).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { STORAGE_KEY, plain, tick, v7Backup, bootWith, loadApp } = require('./helpers');

function mockTauri(fileContents){
  const calls = [];
  const invoke = (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === 'load_state_file') return Promise.resolve(fileContents === undefined ? null : fileContents);
    return Promise.resolve();
  };
  return { invoke, calls, saves: () => calls.filter(c => c.cmd === 'save_state_file') };
}
const goodFile = () => {
  const s = loadApp().app.freshState();
  s.accounts.checking = 777;
  s.accounts.creditCard1 = -50;
  return JSON.stringify(s);
};

describe('mirroring saves to the Rust-side file', () => {
  test('every save is mirrored with the full state as the payload', async () => {
    const t = mockTauri();
    const h = bootWith(v7Backup(), { tauri: t.invoke }); // existing data -> no recovery wait
    h.app.applyWeekBalance('2026-09-04', { checking: 4321 });
    const last = t.saves().at(-1);
    assert.ok(last, 'a save must have been mirrored');
    assert.equal(JSON.parse(last.args.contents).accounts.checking, 4321);
    assert.equal(last.args.contents, h.localStorage.getItem(STORAGE_KEY), 'file and localStorage hold identical bytes');
  });

  test('web version (no Tauri): saving works and nothing tries to call Tauri', () => {
    const h = loadApp();
    assert.doesNotThrow(() => h.app.saveState());
    assert.equal(JSON.parse(h.localStorage.getItem(STORAGE_KEY)).version, 8);
  });

  test('a failing Rust command never breaks saving (localStorage still gets the data)', async () => {
    const h = bootWith(v7Backup(), { tauri: () => Promise.reject(new Error('disk full')) });
    assert.doesNotThrow(() => h.app.applyWeekBalance('2026-09-04', { checking: 5 }));
    await tick();
    assert.equal(JSON.parse(h.localStorage.getItem(STORAGE_KEY)).accounts.checking, 5);
  });
});

describe('self-healing when browser storage comes back empty', () => {
  test('nothing is mirrored during boot, so a blank first-render state can never overwrite the backup', () => {
    const t = mockTauri(goodFile());
    loadApp({ tauri: t.invoke });
    assert.equal(t.calls.length, 0);
  });

  test('empty localStorage + valid backup file: data is restored, persisted, and the user is told', async () => {
    const t = mockTauri(goodFile());
    const h = loadApp({ tauri: t.invoke });
    h.fireDOMContentLoaded();
    await tick();

    assert.equal(h.get('state').accounts.checking, 777);
    assert.equal(h.get('state').accounts.creditCard1, -50);
    assert.equal(JSON.parse(h.localStorage.getItem(STORAGE_KEY)).accounts.checking, 777, 'written back to localStorage');
    assert.ok(t.calls.findIndex(c => c.cmd === 'load_state_file') < t.calls.findIndex(c => c.cmd === 'save_state_file'), 'read happens BEFORE any write');
  });

  test('recovers an older-schema (v7) backup file too, migrating it', async () => {
    const t = mockTauri(JSON.stringify(v7Backup()));
    const h = loadApp({ tauri: t.invoke });
    h.fireDOMContentLoaded();
    await tick();
    assert.equal(h.get('state').version, 8);
    assert.equal(h.get('state').accounts.savings, 34132);
    assert.equal(h.get('state').accountDefs.length, 6);
  });

  test('no backup file yet: stays fresh, then starts mirroring', async () => {
    const t = mockTauri(undefined);
    const h = loadApp({ tauri: t.invoke });
    h.fireDOMContentLoaded();
    await tick();
    assert.equal(h.get('state').accounts.checking, 0);
    assert.ok(t.saves().length >= 1, 'mirroring resumes once there is nothing to recover');
  });

  test('unreadable backup file: no crash, the raw text is preserved before anything can overwrite it', async () => {
    const t = mockTauri('{"version":8,"acc');
    const h = loadApp({ tauri: t.invoke });
    h.fireDOMContentLoaded();
    await tick();
    const keys = Object.keys(h.localStorage._dump()).filter(k => k.includes('.file-recovery-'));
    assert.equal(keys.length, 1);
    assert.equal(h.localStorage.getItem(keys[0]), '{"version":8,"acc');
  });

  test('a rejected load never wedges the app: mirroring still resumes', async () => {
    const t = mockTauri();
    const invoke = (cmd, args) => cmd === 'load_state_file' ? Promise.reject(new Error('boom')) : t.invoke(cmd, args);
    const h = loadApp({ tauri: invoke });
    h.fireDOMContentLoaded();
    await tick();
    h.app.applyWeekBalance('2026-09-04', { checking: 9 });
    assert.ok(t.saves().length >= 1);
  });

  test('existing localStorage data is never replaced by the file (no recovery attempted at all)', async () => {
    const t = mockTauri(goodFile());
    const h = bootWith(v7Backup(), { tauri: t.invoke });
    h.fireDOMContentLoaded();
    await tick();
    assert.equal(t.calls.filter(c => c.cmd === 'load_state_file').length, 0);
    assert.equal(h.get('state').accounts.checking, 11747);
  });

  test('desktop launch without Tauri available yet: recovery is skipped cleanly and mirroring is not left paused', async () => {
    const h = loadApp(); // no tauri
    h.fireDOMContentLoaded();
    await tick();
    assert.equal(h.get('awaitingTauriRecovery'), false);
  });
});
