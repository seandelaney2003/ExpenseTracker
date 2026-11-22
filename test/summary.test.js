// The Summary tab: a read-only snapshot of what's set up in Budget.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain, STORAGE_KEY } = require('./helpers');

function setUp(){
  const h = loadApp();
  const category = (id) => [...h.get('state').categories.income, ...h.get('state').categories.expense].find(c => c.id === id);
  const set = (id, estimate, extra = {}) => Object.assign(category(id), { estimate, ...extra });
  const snap = () => plain(h.app.budgetSnapshot());
  const html = () => { h.app.renderSummary(); return h.app.document.getElementById('summary-body').innerHTML; };
  return { h, category, set, snap, html };
}

describe('yearly amounts for each schedule', () => {
  for (const [frequency, times] of [['weekly', 52], ['biweekly', 26], ['monthly', 12], ['quarterly', 4], ['biannual', 2], ['yearly', 1]]) {
    test(`${frequency} counts ${times} times a year`, () => {
      const { set, snap } = setUp();
      set('food', 100, { frequency, biweeklyAnchor: '2026-01-02' });
      assert.equal(snap().yearly.spending, 100 * times);
    });
  }
  test('a missing schedule counts as monthly', () => {
    const { set, snap } = setUp();
    set('food', 100, { frequency: undefined });
    assert.equal(snap().yearly.spending, 1200);
  });

  // The forecast is the authority: over a year with 52 Fridays both must agree.
  const schedules = [
    { frequency: 'weekly' },
    { frequency: 'biweekly', biweeklyAnchor: '2026-01-09' },
    { frequency: 'biweekly', biweeklyAnchor: null },
    { frequency: 'monthly', monthlyWeek: 4 },
    { frequency: 'monthly', monthlyWeek: 'last' },
    { frequency: 'quarterly', anchorMonth: 1 },
    { frequency: 'biannual', anchorMonth: 5 },
    { frequency: 'yearly', anchorMonth: 11 },
  ];
  for (const schedule of schedules) {
    test(`matches the forecast for ${JSON.stringify(schedule)}`, () => {
      const { h, set, snap } = setUp();
      set('food', 100, schedule);
      let forecast = 0;
      for (let m = 1; m <= 12; m++) forecast += h.app.monthTotals(`2026-${String(m).padStart(2, '0')}`).estExpense;
      assert.equal(snap().yearly.spending, forecast);
    });
  }
});

describe('totals', () => {
  test('savings is separate from spending', () => {
    const { set, snap } = setUp();
    set('paycheck1', 5000); set('mortgage', 1800); set('savings_transfer', 500);
    const s = snap();
    assert.deepEqual(s.monthly, { income: 5000, spending: 1800, savings: 500, left: 2700 });
    assert.deepEqual(s.groups.map(g => g.name), ['Housing']);
  });
  test('the rounded monthly figures add up', () => {
    const { set, snap } = setUp();
    set('paycheck1', 1001, { frequency: 'weekly' });
    set('food', 101, { frequency: 'weekly' });
    set('savings_transfer', 77, { frequency: 'weekly' });
    const m = snap().monthly;
    assert.equal(m.income, m.spending + m.savings + m.left);
  });
  test('an over-budget plan goes negative', () => {
    const { set, snap, html } = setUp();
    set('paycheck1', 1000); set('mortgage', 1600);
    assert.equal(snap().monthly.left, -600);
    assert.match(html(), /Short each month/);
  });
  test('bills with no income show no nonsense numbers', () => {
    const { set, html } = setUp();
    set('mortgage', 1600);
    const out = html();
    assert.match(out, /No income is entered/);
    assert.doesNotMatch(out, /NaN|Infinity|undefined/);
  });
  test('"Rec" off is left out and named, even with an old amount still stored', () => {
    const { set, snap, html } = setUp();
    set('paycheck1', 1000); set('water', 70, { recurring: false });
    assert.equal(snap().yearly.spending, 0);
    assert.deepEqual(snap().changing, ['Water']);
    assert.match(html(), /Not included:<\/b> Water/);
  });
  test('a one-week change does not alter the standing budget', () => {
    const { h, set, snap } = setUp();
    set('food', 400);
    h.app.onFieldChange(h.app.currentWeekKeyForToday(), 'expense', 'food', 'override', '999');
    assert.equal(snap().monthly.spending, 400);
  });
  test('an unknown group is counted under Other', () => {
    const { set, snap } = setUp();
    set('food', 90, { group: 'Something old' });
    assert.equal(snap().groups[0].name, 'Other');
  });
});

describe('ring chart', () => {
  const groups = (...names) => names.map((name, i) => ({ name, yearly: 1000 - i * 100 }));

  test('six or fewer groups each get a slice', () => {
    const { h } = setUp();
    assert.equal(h.app.summarySlices(groups('Housing', 'Food', 'Utilities', 'Insurance', 'Personal', 'Other')).length, 6);
  });
  test('more than six fold into "Everything else" without losing money', () => {
    const { h } = setUp();
    const all = groups('Other', 'Housing', 'Food', 'Utilities', 'Insurance', 'Personal', 'Childcare', 'Transportation');
    const slices = plain(h.app.summarySlices(all));
    assert.equal(slices.length, 6);
    assert.equal(slices[5].name, 'Everything else');
    assert.ok(!slices.some(x => x.name === 'Other'));
    assert.equal(slices.reduce((n, x) => n + x.yearly, 0), all.reduce((n, x) => n + x.yearly, 0));
  });
  test('zero and negative groups never become slices', () => {
    const { h } = setUp();
    assert.deepEqual(plain(h.app.summarySlices([{ name: 'Food', yearly: 0 }, { name: 'Other', yearly: -50 }])), []);
  });
});

describe('the tab', () => {
  test('a new install points to Budget', () => {
    assert.match(setUp().html(), /Nothing to summarize yet[\s\S]*showTab\('budget'\)/);
  });
  test('names are escaped', () => {
    const { h, set, html } = setUp();
    const bad = '<img src=x onerror=alert(1)>';
    set('food', 100, { name: bad }); set('paycheck1', 100, { name: bad }); set('water', 0, { name: bad, recurring: false });
    const account = h.get('state').accountDefs[0];
    account.name = bad;
    h.get('state').accounts[account.id] = 10;
    assert.doesNotMatch(html(), /<img/);
  });
  test('account totals agree with Home', () => {
    const { h, html } = setUp();
    Object.assign(h.get('state').accounts, { checking: 2000, creditCard1: -750 });
    assert.equal(h.app.currentAccountsTotal(), 1250);
    assert.match(html(), /Total<\/span><span class="sum-amt ">\$1,250</);
  });
  test('opening it never changes or saves data', () => {
    const { h, set } = setUp();
    set('paycheck1', 5000); set('mortgage', 1800);
    const state = JSON.stringify(h.get('state'));
    const saved = h.localStorage.getItem(STORAGE_KEY);
    h.app.showTab('summary');
    assert.equal(JSON.stringify(h.get('state')), state);
    assert.equal(h.localStorage.getItem(STORAGE_KEY), saved);
  });
  test('it picks up Budget edits the next time it opens', () => {
    const { h } = setUp();
    h.app.showTab('budget');
    h.app.reestimateCategory('expense', 'mortgage', '1750');
    h.app.showTab('summary');
    assert.match(h.app.document.getElementById('summary-body').innerHTML, /\$1,750/);
  });
});
