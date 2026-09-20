// Account editing (add / rename / remove / debt toggle) and the sign rules
// that keep debts subtracting from the total automatically.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { plain, tick, v7Backup, bootWith, loadApp } = require('./helpers');

const wait2ms = () => tick(3); // addAccount() ids are Date.now()-based

describe('normalizeAccountValue', () => {
  test('debt accounts are always stored negative, however the number was typed', () => {
    const h = loadApp();
    assert.equal(h.app.normalizeAccountValue('creditCard1', 450), -450);
    assert.equal(h.app.normalizeAccountValue('creditCard1', -450), -450);
    assert.equal(h.app.normalizeAccountValue('otherDebt', 1), -1);
  });
  test('non-debt accounts keep their sign (a negative checking balance is legitimate)', () => {
    const h = loadApp();
    assert.equal(h.app.normalizeAccountValue('checking', 450), 450);
    assert.equal(h.app.normalizeAccountValue('checking', -75), -75);
  });
  test('null/undefined pass through untouched (means "no entry")', () => {
    const h = loadApp();
    assert.equal(h.app.normalizeAccountValue('creditCard1', null), null);
    assert.equal(h.app.normalizeAccountValue('creditCard1', undefined), undefined);
  });
  test('unknown account ids are not treated as debt', () => {
    const h = loadApp();
    assert.equal(h.app.normalizeAccountValue('nope', 9), 9);
  });
});

describe('total balance', () => {
  test('debts subtract from the total automatically', () => {
    const h = bootWith(v7Backup());
    // 11747 + 34132 + 1100 - 3045 - 4181 + 0
    assert.equal(h.app.currentAccountsTotal(), 39753);
  });
  test('the sum covers newly added accounts too', () => {
    const h = bootWith(v7Backup());
    h.app.addAccount();
    const id = h.get('state').accountDefs.at(-1).id;
    h.get('state').accounts[id] = 1000;
    assert.equal(h.app.currentAccountsTotal(), 40753);
  });
});

describe('addAccount', () => {
  test('adds a non-debt "New account" with a $0 balance and persists it', () => {
    const h = loadApp();
    h.app.addAccount();
    const s = h.get('state');
    const added = s.accountDefs.at(-1);
    assert.equal(s.accountDefs.length, 7);
    assert.equal(added.name, 'New account');
    assert.equal(added.debt, false);
    assert.equal(s.accounts[added.id], 0);
    assert.equal(JSON.parse(h.localStorage.getItem('expenseTrackerData.v1')).accountDefs.length, 7);
  });
  test('two accounts added in a row get distinct ids', async () => {
    const h = loadApp();
    h.app.addAccount();
    await wait2ms();
    h.app.addAccount();
    const ids = h.get('state').accountDefs.map(a => a.id);
    assert.equal(new Set(ids).size, ids.length);
  });
  test('a new account appears in weeks that already exist', () => {
    const h = loadApp();
    h.app.addAccount();
    const id = h.get('state').accountDefs.at(-1).id;
    const w = h.app.ensureWeek('2026-09-04');
    assert.equal(w[id], null);
  });
});

describe('renameAccount', () => {
  test('renames and persists', () => {
    const h = loadApp();
    h.app.renameAccount('savings', 'Rainy Day Fund');
    assert.equal(h.get('state').accountDefs.find(a => a.id === 'savings').name, 'Rainy Day Fund');
    assert.equal(JSON.parse(h.localStorage.getItem('expenseTrackerData.v1')).accountDefs.find(a => a.id === 'savings').name, 'Rainy Day Fund');
  });
  test('an unknown id is a harmless no-op', () => {
    const h = loadApp();
    assert.doesNotThrow(() => h.app.renameAccount('ghost', 'x'));
  });
});

describe('removeAccount', () => {
  test('removes the account from the list and from the total', () => {
    const h = bootWith(v7Backup());
    h.app.removeAccount('creditCard2');
    assert.ok(!h.get('state').accountDefs.some(a => a.id === 'creditCard2'));
    assert.equal(h.app.currentAccountsTotal(), 11747 + 34132 + 1100 - 3045);
  });
  test('the last remaining account can never be removed', () => {
    const h = loadApp();
    for (const a of plain(h.get('state').accountDefs)) h.app.removeAccount(a.id);
    assert.equal(h.get('state').accountDefs.length, 1);
  });
  test('every screen still renders after removing accounts (no dangling references)', () => {
    const h = bootWith(v7Backup());
    h.app.removeAccount('checking');
    h.app.removeAccount('creditCard1');
    for (const tab of ['dashboard', 'weekly', 'monthly', 'budget']) assert.doesNotThrow(() => h.app.showTab(tab), tab);
  });
});

describe('toggleAccountDebt', () => {
  test('marking an account as debt flips existing positive balances negative everywhere', () => {
    const h = bootWith(v7Backup());
    h.get('state').accounts.savings = 500;
    h.app.applyWeekBalance('2026-09-04', { savings: 500 });
    h.app.toggleAccountDebt('savings', true);
    const s = h.get('state');
    assert.equal(s.accountDefs.find(a => a.id === 'savings').debt, true);
    assert.equal(s.accounts.savings, -500);
    assert.equal(s.weeks['2026-09-04'].savings, -500);
  });
  test('after toggling, new entries obey the debt rule', () => {
    const h = loadApp();
    h.app.toggleAccountDebt('checking', true);
    h.app.applyWeekBalance('2026-09-04', { checking: 250 });
    assert.equal(h.get('state').weeks['2026-09-04'].checking, -250);
  });
  test('un-marking debt stops forcing negatives', () => {
    const h = loadApp();
    h.app.toggleAccountDebt('creditCard1', false);
    h.app.applyWeekBalance('2026-09-04', { creditCard1: 250 });
    assert.equal(h.get('state').weeks['2026-09-04'].creditCard1, 250);
  });
});

describe('balance snapshots', () => {
  test('the most recent snapshot becomes the live "what you have today" balance', () => {
    const h = loadApp();
    h.app.applyWeekBalance('2026-09-04', { checking: 100 });
    h.app.applyWeekBalance('2026-09-11', { checking: 200 });
    assert.equal(h.get('state').accounts.checking, 200);
  });
  test('editing an OLDER week never overwrites the live balance', () => {
    const h = loadApp();
    h.app.applyWeekBalance('2026-09-11', { checking: 200 });
    h.app.applyWeekBalance('2026-09-04', { checking: 999 });
    assert.equal(h.get('state').accounts.checking, 200);
    assert.equal(h.get('state').weeks['2026-09-04'].checking, 999);
  });
  test('whole dollars only: cents are rounded, junk becomes 0', () => {
    const h = loadApp();
    assert.equal(h.app.wholeDollar('12.6'), 13);
    assert.equal(h.app.wholeDollar('abc'), 0);
    assert.equal(h.app.wholeDollar(''), 0);
    assert.equal(h.app.wholeDollar('-7.4'), -7);
  });
});
