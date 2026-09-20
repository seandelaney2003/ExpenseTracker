// Shared fixtures and utilities for the test suite.
const { loadApp } = require('./load-app');

const STORAGE_KEY = 'expenseTrackerData.v1';

// Resolves after pending timers/microtasks (deferRenderAll, FileReader,
// mocked Tauri invoke promises, alert deferral) have all had a chance to run.
// Objects built inside the VM sandbox have a different Object.prototype than
// the test's own, so strict deep-equality rejects them even when identical.
// Normalise through JSON before comparing anything that came out of the app.
const plain = (x) => JSON.parse(JSON.stringify(x));

const tick = (ms = 15) => new Promise(resolve => setTimeout(resolve, ms));

// A real-shaped v7 backup — the schema real users have on disk today from
// before accounts became editable (no `accountDefs`).
function v7Backup(overrides){
  return Object.assign({
    version: 7,
    accounts: { updatedAt: '2026-09-20T12:33:37.167Z', checking: 11747, savings: 34132, otherBank: 1100, creditCard1: -3045, creditCard2: -4181, otherDebt: 0 },
    categories: {
      income: [
        { id: 'paycheck1', name: 'Paycheck 1', estimate: 3421, recurring: true, dueDay: null, frequency: 'biweekly', biweeklyAnchor: '2026-09-04', monthlyWeek: 1 },
      ],
      expense: [
        { id: 'mortgage', name: 'Mortgage', estimate: 1800, recurring: true, dueDay: 1, frequency: 'monthly', monthlyWeek: 1, group: 'Housing' },
      ],
    },
    weeks: {},
    months: {},
  }, overrides || {});
}

// Boots the app with `data` (object or raw string) already in localStorage.
function bootWith(data, opts){
  const seed = { [STORAGE_KEY]: typeof data === 'string' ? data : JSON.stringify(data) };
  return loadApp(Object.assign({ localStorageSeed: seed }, opts || {}));
}

// Adds a fully-specified category straight into state (bypasses the UI).
function addCategoryDirect(h, kind, cat){
  const state = h.get('state');
  state.categories[kind].push(Object.assign({
    estimate: 0, recurring: true, dueDay: null, frequency: 'monthly', biweeklyAnchor: null, monthlyWeek: 1, anchorMonth: 0,
  }, cat));
  return state;
}

// Fake import "event" as the file input's onchange would deliver it.
const importEvent = (text) => ({ target: { files: [{ __text: text }], value: 'x' } });

module.exports = { STORAGE_KEY, plain, tick, v7Backup, bootWith, addCategoryDirect, importEvent, loadApp };
