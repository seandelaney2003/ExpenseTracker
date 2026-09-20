// Recurring schedules, the "freeze on check" history protection, and
// category editing. These rules decide which week a bill lands in, so a
// regression here silently corrupts every forecast.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { plain, loadApp, addCategoryDirect } = require('./helpers');

// September 2026 Fridays: 4, 11, 18, 25.  October: 2, 9, 16, 23, 30.
const applies = (h, cat, weekKey) => h.app.categoryAppliesToWeek(cat, weekKey);

describe('date helpers', () => {
  test('nearestFriday lands on a Friday and never moves backwards', () => {
    const h = loadApp();
    const sun = h.app.nearestFriday(new Date(2026, 8, 20)); // Sun Sep 20
    assert.equal(h.app.toKey(sun), '2026-09-25');
    const fri = h.app.nearestFriday(new Date(2026, 8, 25));
    assert.equal(h.app.toKey(fri), '2026-09-25');
    const sat = h.app.nearestFriday(new Date(2026, 8, 26));
    assert.equal(h.app.toKey(sat), '2026-10-02');
  });
  test('fridaysInMonth lists every Friday of the month', () => {
    const h = loadApp();
    assert.deepEqual(plain(h.app.fridaysInMonth(2026, 8).map(h.app.toKey)), ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25']);
    assert.equal(h.app.fridaysInMonth(2026, 9).length, 5);
  });
  test('toKey / parseKey round-trip', () => {
    const h = loadApp();
    assert.equal(h.app.toKey(h.app.parseKey('2027-01-01')), '2027-01-01');
  });
});

describe('categoryAppliesToWeek', () => {
  test('weekly: every Friday', () => {
    const h = loadApp();
    for (const k of ['2026-09-04', '2026-09-11', '2026-10-30']) assert.equal(applies(h, { frequency: 'weekly' }, k), true);
  });
  test('biweekly: every other Friday counted from the anchor, in both directions', () => {
    const h = loadApp();
    const c = { frequency: 'biweekly', biweeklyAnchor: '2026-09-04' };
    assert.equal(applies(h, c, '2026-09-04'), true);
    assert.equal(applies(h, c, '2026-09-11'), false);
    assert.equal(applies(h, c, '2026-09-18'), true);
    assert.equal(applies(h, c, '2026-08-28'), false, 'week before anchor');
    assert.equal(applies(h, c, '2026-08-21'), true, 'two weeks before anchor');
  });
  test('monthly: only the chosen Friday of the month (1st..4th, or last)', () => {
    const h = loadApp();
    assert.equal(applies(h, { frequency: 'monthly', monthlyWeek: 1 }, '2026-09-04'), true);
    assert.equal(applies(h, { frequency: 'monthly', monthlyWeek: 1 }, '2026-09-11'), false);
    assert.equal(applies(h, { frequency: 'monthly', monthlyWeek: 3 }, '2026-09-18'), true);
    assert.equal(applies(h, { frequency: 'monthly', monthlyWeek: 'last' }, '2026-09-25'), true);
    assert.equal(applies(h, { frequency: 'monthly', monthlyWeek: 'last' }, '2026-10-30'), true, 'last of a 5-Friday month');
    assert.equal(applies(h, { frequency: 'monthly', monthlyWeek: 'last' }, '2026-10-23'), false);
  });
  test('monthly defaults to the 1st Friday when unspecified', () => {
    const h = loadApp();
    assert.equal(applies(h, { frequency: 'monthly' }, '2026-09-04'), true);
    assert.equal(applies(h, {}, '2026-09-04'), true, 'no frequency at all defaults to monthly');
  });
  test('quarterly: only every third month from the anchor month', () => {
    const h = loadApp();
    const c = { frequency: 'quarterly', anchorMonth: 0, monthlyWeek: 1 }; // Jan, Apr, Jul, Oct
    assert.equal(applies(h, c, '2026-10-02'), true);
    assert.equal(applies(h, c, '2026-09-04'), false);
    assert.equal(applies(h, c, '2026-11-06'), false);
    assert.equal(applies(h, c, '2027-01-01'), true);
  });
  test('biannual: every sixth month', () => {
    const h = loadApp();
    const c = { frequency: 'biannual', anchorMonth: 2, monthlyWeek: 1 }; // Mar, Sep
    assert.equal(applies(h, c, '2026-09-04'), true);
    assert.equal(applies(h, c, '2026-10-02'), false);
    assert.equal(applies(h, c, '2027-03-05'), true);
  });
  test('yearly: only the anchor month', () => {
    const h = loadApp();
    const c = { frequency: 'yearly', anchorMonth: 8, monthlyWeek: 1 }; // September
    assert.equal(applies(h, c, '2026-09-04'), true);
    assert.equal(applies(h, c, '2026-10-02'), false);
    assert.equal(applies(h, c, '2027-09-03'), true);
  });
});

describe('planned amounts', () => {
  function withBill(freq, extra){
    const h = loadApp();
    addCategoryDirect(h, 'expense', Object.assign({ id: 'bill', name: 'Bill', estimate: 100, frequency: freq }, extra));
    return h;
  }
  test('an off-schedule week plans $0', () => {
    const h = withBill('monthly', { monthlyWeek: 1 });
    const w = h.app.ensureWeek('2026-09-11');
    assert.equal(h.app.effectiveEstimate('expense', 'bill', w.expense.bill, '2026-09-11'), 0);
    const on = h.app.ensureWeek('2026-09-04');
    assert.equal(h.app.effectiveEstimate('expense', 'bill', on.expense.bill, '2026-09-04'), 100);
  });
  test('a per-week override always wins, even in an off-schedule week', () => {
    const h = withBill('monthly', { monthlyWeek: 1 });
    h.app.onFieldChange('2026-09-11', 'expense', 'bill', 'override', '250');
    const w = h.get('state').weeks['2026-09-11'];
    assert.equal(h.app.effectiveEstimate('expense', 'bill', w.expense.bill, '2026-09-11'), 250);
    assert.equal(h.app.isOverridden(w.expense.bill), true);
  });
  test('clearing an override goes back to the plan', () => {
    const h = withBill('weekly');
    h.app.onFieldChange('2026-09-04', 'expense', 'bill', 'override', '250');
    h.app.onFieldChange('2026-09-04', 'expense', 'bill', 'override', '');
    const w = h.get('state').weeks['2026-09-04'];
    assert.equal(h.app.effectiveEstimate('expense', 'bill', w.expense.bill, '2026-09-04'), 100);
  });
  test('typed amounts are stored as whole dollars', () => {
    const h = withBill('weekly');
    h.app.onFieldChange('2026-09-04', 'expense', 'bill', 'override', '99.6');
    assert.equal(h.get('state').weeks['2026-09-04'].expense.bill.override, 100);
  });
});

describe('freeze on check (history is never rewritten)', () => {
  test('checking an item freezes its plan amount as the actual', () => {
    const h = loadApp();
    addCategoryDirect(h, 'expense', { id: 'bill', name: 'Bill', estimate: 100, frequency: 'weekly' });
    h.app.onCheckChange('2026-09-04', 'expense', 'bill', true);
    const e = h.get('state').weeks['2026-09-04'].expense.bill;
    assert.equal(e.checked, true);
    assert.equal(e.actual, 100);
  });
  test('changing the recurring plan later does NOT change a week already checked off', () => {
    const h = loadApp();
    addCategoryDirect(h, 'expense', { id: 'bill', name: 'Bill', estimate: 100, frequency: 'weekly' });
    h.app.onCheckChange('2026-09-04', 'expense', 'bill', true);
    h.app.reestimateCategory('expense', 'bill', '999');
    assert.equal(h.get('state').weeks['2026-09-04'].expense.bill.actual, 100);
    h.app.onCheckChange('2026-09-11', 'expense', 'bill', true);
    assert.equal(h.get('state').weeks['2026-09-11'].expense.bill.actual, 999, 'new weeks use the new plan');
  });
  test('an actual the user typed is kept, not replaced by the plan, when checking', () => {
    const h = loadApp();
    addCategoryDirect(h, 'expense', { id: 'bill', name: 'Bill', estimate: 100, frequency: 'weekly' });
    h.app.onFieldChange('2026-09-04', 'expense', 'bill', 'actual', '87');
    h.app.onCheckChange('2026-09-04', 'expense', 'bill', true);
    assert.equal(h.get('state').weeks['2026-09-04'].expense.bill.actual, 87);
  });
  test('unchecking keeps the frozen actual (no silent change)', () => {
    const h = loadApp();
    addCategoryDirect(h, 'expense', { id: 'bill', name: 'Bill', estimate: 100, frequency: 'weekly' });
    h.app.onCheckChange('2026-09-04', 'expense', 'bill', true);
    h.app.onCheckChange('2026-09-04', 'expense', 'bill', false);
    const e = h.get('state').weeks['2026-09-04'].expense.bill;
    assert.equal(e.checked, false);
    assert.equal(e.actual, 100);
  });
});

describe('category editing', () => {
  test('addCategory creates a recurring category (expenses get a group) and persists', () => {
    const h = loadApp();
    h.app.addCategory('expense');
    h.app.addCategory('income');
    const s = h.get('state');
    const exp = s.categories.expense.at(-1);
    assert.equal(exp.name, 'New category');
    assert.equal(exp.group, 'Other');
    assert.equal(exp.recurring, true);
    assert.equal(s.categories.income.at(-1).group, undefined);
    assert.ok(JSON.parse(h.localStorage.getItem('expenseTrackerData.v1')).categories.expense.some(c => c.id === exp.id));
  });
  test('removeCategory removes it and every screen still renders', () => {
    const h = loadApp();
    h.app.removeCategory('expense', 'mortgage');
    assert.ok(!h.get('state').categories.expense.some(c => c.id === 'mortgage'));
    for (const tab of ['dashboard', 'weekly', 'monthly', 'budget']) assert.doesNotThrow(() => h.app.showTab(tab), tab);
  });
  test('setFrequency fills sensible defaults for the new schedule', () => {
    const h = loadApp();
    h.app.setFrequency('expense', 'mortgage', 'biweekly');
    assert.ok(h.get('state').categories.expense.find(c => c.id === 'mortgage').biweeklyAnchor);
    h.app.setFrequency('expense', 'mortgage', 'yearly');
    const c = h.get('state').categories.expense.find(c => c.id === 'mortgage');
    assert.equal(c.monthlyWeek, 1);
    assert.equal(typeof c.anchorMonth, 'number');
  });
  test('due day is clamped to 1..31, and empty clears it', () => {
    const h = loadApp();
    const c = () => h.get('state').categories.expense.find(c => c.id === 'mortgage');
    h.app.setDueDay('expense', 'mortgage', '45');
    assert.equal(c().dueDay, 31);
    h.app.setDueDay('expense', 'mortgage', '0');
    assert.equal(c().dueDay, 1);
    h.app.setDueDay('expense', 'mortgage', '');
    assert.equal(c().dueDay, null);
  });
  test('reestimateCategory stores whole dollars', () => {
    const h = loadApp();
    h.app.reestimateCategory('expense', 'mortgage', '1800.4');
    assert.equal(h.get('state').categories.expense.find(c => c.id === 'mortgage').estimate, 1800);
  });
});

describe('every screen renders (guards against ReferenceErrors in render paths)', () => {
  test('a heavily-populated state renders on all four tabs and projects future months', () => {
    const h = loadApp();
    for (const freq of ['weekly', 'biweekly', 'monthly', 'quarterly', 'biannual', 'yearly']) {
      addCategoryDirect(h, 'expense', { id: 'x_' + freq, name: freq, estimate: 50, frequency: freq, biweeklyAnchor: '2026-09-04', dueDay: 15, group: 'Other' });
    }
    h.app.applyWeekBalance('2026-09-04', { checking: 100, creditCard1: 50 });
    h.app.onCheckChange('2026-09-04', 'expense', 'x_weekly', true);
    for (const tab of ['dashboard', 'weekly', 'monthly', 'budget']) assert.doesNotThrow(() => h.app.showTab(tab), tab);
    assert.doesNotThrow(() => h.app.projectFutureMonths(6));
    assert.doesNotThrow(() => h.app.monthSummary('2026-09'));
  });
});
