// State lifecycle: fresh install, loading saved data, migrating old schemas,
// and — most importantly — never silently losing data. Nearly every real bug
// this app has shipped lived in this area.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { STORAGE_KEY, plain, tick, v7Backup, bootWith, loadApp } = require('./helpers');

const BADGE_KEY = 'expenseTrackerData.v1.seenBudgetStartBadge';

describe('fresh install', () => {
  test('boots with the default six accounts, version 8, no weeks/months', () => {
    const h = loadApp();
    const state = h.get('state');
    assert.equal(state.version, 8);
    assert.deepEqual(plain(state.accountDefs.map(a => a.id)), ['checking', 'savings', 'otherBank', 'creditCard1', 'creditCard2', 'otherDebt']);
    assert.deepEqual(plain(state.accountDefs.filter(a => a.debt).map(a => a.id)), ['creditCard1', 'creditCard2', 'otherDebt']);
    for (const a of state.accountDefs) assert.equal(state.accounts[a.id], 0);
    // weeks/months are created lazily by the first render; what matters is
    // that they hold no user-entered data
    for (const w of Object.values(state.weeks)) {
      for (const a of state.accountDefs) assert.equal(w[a.id], null);
      for (const e of Object.values(w.expense)) assert.deepEqual(plain(e), { override: null, actual: null, checked: false });
    }
    assert.deepEqual(plain(h.app.freshState().weeks), {});
  });

  test('freshState() returns independent copies (mutating one never leaks into the defaults)', () => {
    const h = loadApp();
    const a = h.app.freshState();
    a.accountDefs.push({ id: 'x', name: 'X', debt: false });
    a.categories.expense.push({ id: 'zzz' });
    const b = h.app.freshState();
    assert.equal(b.accountDefs.length, 6);
    assert.ok(!b.categories.expense.some(c => c.id === 'zzz'));
    assert.equal(h.get('DEFAULT_ACCOUNTS').length, 6);
  });

  test('a fresh install does NOT pre-suppress the Budget "Start here" badge', () => {
    const h = loadApp();
    assert.equal(h.localStorage.getItem(BADGE_KEY), null);
  });
});

describe('loading saved data', () => {
  test('valid current-version data loads exactly as saved', () => {
    const seed = loadApp().app.freshState();
    seed.accounts.checking = 555;
    seed.accounts.creditCard1 = -200;
    const h = bootWith(seed);
    assert.equal(h.get('state').accounts.checking, 555);
    assert.equal(h.get('state').accounts.creditCard1, -200);
  });

  test('anyone with existing data has the "Start here" badge suppressed at load', () => {
    const h = bootWith(v7Backup());
    assert.equal(h.localStorage.getItem(BADGE_KEY), '1');
  });

  test('visiting the Budget tab suppresses the badge for a brand-new user', () => {
    const h = loadApp();
    assert.equal(h.localStorage.getItem(BADGE_KEY), null);
    h.app.showTab('budget');
    assert.equal(h.localStorage.getItem(BADGE_KEY), '1');
  });
});

describe('unreadable saved data is NEVER silently discarded', () => {
  test('corrupt JSON: alerts the user and keeps a byte-identical copy under a recovery key', async () => {
    const alerts = [];
    const raw = '{"version":8,"accounts":{"checking":11747';
    const h = bootWith(raw, { alert: (m) => alerts.push(m) });
    await tick();

    assert.equal(alerts.length, 1, 'user must be told');
    assert.match(alerts[0], /could not be read/i);
    assert.match(alerts[0], /Nothing has been erased/);

    const dump = h.localStorage._dump();
    const recoveryKeys = Object.keys(dump).filter(k => k.startsWith(STORAGE_KEY + '.recovery-'));
    assert.equal(recoveryKeys.length, 1);
    assert.equal(dump[recoveryKeys[0]], raw, 'recovery copy must be byte-identical');
    assert.equal(h.get('state').accounts.checking, 0, 'app falls back to a usable fresh state');
  });

  test('valid JSON but missing required fields: same recovery path', async () => {
    const alerts = [];
    const h = bootWith({ hello: 'world' }, { alert: (m) => alerts.push(m) });
    await tick();
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /incomplete/i);
    const recoveryKeys = Object.keys(h.localStorage._dump()).filter(k => k.includes('.recovery-'));
    assert.equal(recoveryKeys.length, 1);
  });

  // Regression: an exception thrown while migrating used to be caught and turned
  // into a silent blank state — indistinguishable from "no data yet" — which the
  // next save then overwrote the real data with.
  test('parses fine but blows up while loading/migrating: never silent, raw copy preserved', async () => {
    const alerts = [];
    const raw = JSON.stringify({ version: 8, accounts: { checking: 5 }, categories: {}, weeks: {}, months: {} });
    const h = bootWith(raw, { alert: (m) => alerts.push(m) });
    await tick();
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /Something went wrong while opening your saved data/);
    const keys = Object.keys(h.localStorage._dump()).filter(k => k.includes('.recovery-'));
    assert.equal(keys.length, 1);
    assert.equal(h.localStorage.getItem(keys[0]), raw);
  });

  test('healthy data never triggers an alert or writes a recovery key', async () => {
    const alerts = [];
    const h = bootWith(v7Backup(), { alert: (m) => alerts.push(m) });
    await tick();
    assert.equal(alerts.length, 0);
    assert.equal(Object.keys(h.localStorage._dump()).filter(k => k.includes('.recovery-')).length, 0);
  });
});

describe('migrations from every historical schema', () => {
  test('a v7 backup (the real-world shape) migrates to v8 keeping every balance and adding accountDefs', () => {
    const h = bootWith(v7Backup());
    const s = h.get('state');
    assert.equal(s.version, 8);
    assert.equal(s.accountDefs.length, 6);
    assert.equal(s.accounts.checking, 11747);
    assert.equal(s.accounts.savings, 34132);
    assert.equal(s.accounts.creditCard1, -3045);
    assert.equal(s.accounts.creditCard2, -4181);
    assert.ok(s.categories.income.some(c => c.id === 'paycheck1'));
    assert.ok(s.categories.expense.some(c => c.id === 'mortgage'));
  });

  // Regression: v4/v5 migration blocks once referenced state.accountDefs,
  // which doesn't exist yet while migrateState() runs inside loadState() at
  // startup — a TDZ crash on ANY pre-v8 data. Booting at all is the assertion.
  for (const version of [1, 2, 3, 4, 5, 6, 7]) {
    test(`booting from version ${version} data does not throw (no use-before-init in migration blocks)`, () => {
      const old = v7Backup({ version });
      if (version < 4) {
        old.accounts = { updatedAt: null, checking: 100, savings: 200 };
        old.months = { '2026-08': { startChecking: 1, startSavings: 2 } };
      }
      assert.doesNotThrow(() => bootWith(old));
      assert.equal(bootWith(old).get('state').version, 8);
    });
  }

  test('v1 -> v2: per-week `estimate` becomes an `override` only when it differs from the category default', () => {
    const old = v7Backup({ version: 1 });
    old.weeks = { '2026-09-04': { income: { paycheck1: { estimate: 3421 } }, expense: { mortgage: { estimate: 1500 } } } };
    const w = bootWith(old).get('state').weeks['2026-09-04'];
    assert.equal(w.income.paycheck1.override, null, 'same as default -> no override');
    assert.equal(w.expense.mortgage.override, 1500, 'differs from default -> override kept');
    assert.equal(w.expense.mortgage.checked, false);
  });

  test('v3 -> v4: flat month-start fields fold into the nested `start` object for every account', () => {
    const old = v7Backup({ version: 3 });
    old.months = { '2026-08': { startChecking: 10, startSavings: 20, startOtherBank: 30 } };
    const m = bootWith(old).get('state').months['2026-08'];
    assert.equal(m.start.checking, 10);
    assert.equal(m.start.savings, 20);
    assert.equal(m.start.otherBank, 30);
    for (const id of ['creditCard1', 'creditCard2', 'otherDebt']) assert.ok(m.start[id] === 0); // (-0 === 0)
    assert.equal(m.startChecking, undefined);
  });

  test('v4 -> v5: debt balances entered as positive numbers are forced negative everywhere', () => {
    const old = v7Backup({ version: 4 });
    old.accounts.creditCard1 = 500;
    old.months = { '2026-08': { start: { checking: 1, creditCard1: 300 } } };
    old.weeks = { '2026-09-04': { income: {}, expense: {}, creditCard1: 100, checking: 50 } };
    const s = bootWith(old).get('state');
    assert.equal(s.accounts.creditCard1, -500);
    assert.equal(s.months['2026-08'].start.creditCard1, -300);
    assert.equal(s.weeks['2026-09-04'].creditCard1, -100);
    assert.equal(s.weeks['2026-09-04'].checking, 50, 'non-debt accounts are left alone');
  });

  test('v5 -> v6: default names are updated, but a name the user changed themselves is never overwritten', () => {
    const old = v7Backup({ version: 5 });
    old.categories.expense.push(
      { id: 'gas', name: 'Gas', estimate: 0, recurring: true },
      { id: 'food', name: 'My Custom Groceries', estimate: 0, recurring: true },
    );
    const exp = bootWith(old).get('state').categories.expense;
    assert.equal(exp.find(c => c.id === 'gas').name, 'Gas for Home');
    assert.equal(exp.find(c => c.id === 'food').name, 'My Custom Groceries');
  });

  test('v6 -> v7: uncategorised expenses get a group; unknown custom ones land in "Other"', () => {
    const old = v7Backup({ version: 6 });
    old.categories.expense = [
      { id: 'mortgage', name: 'Mortgage', estimate: 1800, recurring: true },
      { id: 'custom_thing', name: 'Custom', estimate: 5, recurring: true },
    ];
    const exp = bootWith(old).get('state').categories.expense;
    assert.equal(exp.find(c => c.id === 'mortgage').group, 'Housing');
    assert.equal(exp.find(c => c.id === 'custom_thing').group, 'Other');
  });

  test('migration is idempotent: re-running it on already-current data changes nothing', () => {
    const h = bootWith(v7Backup());
    const once = JSON.parse(JSON.stringify(h.get('state')));
    const twice = h.app.migrateState(JSON.parse(JSON.stringify(once)));
    assert.deepEqual(plain(twice), once);
  });

  test('ensureBaselineCategories adds newer built-in categories once, and never re-adds one a user deleted', () => {
    const h = bootWith(v7Backup());
    const s = h.get('state');
    assert.ok(s.categories.expense.some(c => c.id === 'oil'));
    s.categories.expense = s.categories.expense.filter(c => c.id !== 'oil');
    h.app.ensureBaselineCategories(s);
    assert.ok(!s.categories.expense.some(c => c.id === 'oil'), 'deleted category must stay deleted');
  });
});

describe('persistence round-trip (the contract behind "my data is still there after I reopen")', () => {
  test('anything saved is exactly what the next launch loads', () => {
    const first = loadApp();
    first.app.addAccount();
    first.app.applyWeekBalance('2026-09-04', { checking: 1234, creditCard1: 99 });
    first.app.onCheckChange('2026-09-04', 'income', first.get('state').categories.income[0].id, true);
    first.app.saveState();
    const saved = first.get('state');

    const second = loadApp({ localStorageSeed: first.localStorage._dump() });
    const loaded = second.get('state');
    const expected = JSON.parse(JSON.stringify(saved));
    assert.deepEqual(plain(loaded.accounts), expected.accounts);
    assert.deepEqual(plain(loaded.accountDefs), expected.accountDefs);
    assert.deepEqual(plain(loaded.categories), expected.categories);
    assert.deepEqual(plain(loaded.weeks['2026-09-04']), expected.weeks['2026-09-04']);
    assert.deepEqual(plain(Object.keys(loaded.months)), Object.keys(expected.months));
  });

  test('every mutating action persists to localStorage immediately (nothing waits for app close)', () => {
    const h = loadApp();
    const persisted = () => JSON.parse(h.localStorage.getItem(STORAGE_KEY));
    h.app.addAccount();
    assert.equal(persisted().accountDefs.length, 7);
    h.app.addCategory('expense');
    assert.ok(persisted().categories.expense.some(c => c.name === 'New category'));
    h.app.applyWeekBalance('2026-09-04', { checking: 42 });
    assert.equal(persisted().accounts.checking, 42);
    h.app.resetAllData();
    assert.equal(persisted().accounts.checking, 0);
  });
});
