// Cross-file and static checks: contracts between index.html, home.html and
// the Tauri wrapper that can't be exercised by running app logic, but that
// have broken (or would silently break) real installs.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { extractScript } = require('./load-app');
const { STORAGE_KEY } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const indexHtml = read('index.html');
const homeHtml = read('home.html');
const libRs = read('desktop-app', 'src-tauri', 'src', 'lib.rs');
const tauriConf = JSON.parse(read('desktop-app', 'src-tauri', 'tauri.conf.json'));

describe('scripts compile', () => {
  test('index.html script has no syntax errors', () => {
    assert.doesNotThrow(() => new vm.Script(extractScript(indexHtml)));
  });
  test('every inline script in home.html has no syntax errors', () => {
    const scripts = [...homeHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert.ok(scripts.length >= 1);
    for (const s of scripts) assert.doesNotThrow(() => new vm.Script(s));
  });
});

describe('index.html wiring', () => {
  const body = indexHtml.slice(0, indexHtml.indexOf('<script>'));
  const script = extractScript(indexHtml);

  test('every document.getElementById("literal") in the script points at an element that exists', () => {
    const ids = new Set([...script.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]));
    const missing = [...ids].filter(id => !body.includes(`id="${id}"`));
    assert.deepEqual(missing, []);
  });

  test('every function called from an inline HTML handler is actually defined', () => {
    const called = new Set([...body.matchAll(/\son(?:click|change|input|blur|dblclick)="\s*(?:event\.[a-zA-Z]+\(\);\s*)?([A-Za-z_]\w*)\(/g)].map(m => m[1]));
    const undefinedFns = [...called].filter(fn => !new RegExp(`function\\s+${fn}\\s*\\(`).test(script) && fn !== 'document');
    assert.deepEqual(undefinedFns, []);
  });

  test('no leftover reference to the removed hard-coded ACCOUNTS list', () => {
    assert.ok(!/\bACCOUNTS\b/.test(script));
  });

  test('the storage key is unchanged (changing it would orphan every existing user\'s data)', () => {
    assert.equal(STORAGE_KEY, 'expenseTrackerData.v1');
  });
});

describe('fixed theme', () => {
  for (const [name, html] of [['index.html', indexHtml], ['home.html', homeHtml]]) {
    test(`${name} does not switch palettes with the OS light/dark setting`, () => {
      assert.ok(!/prefers-color-scheme/.test(html));
    });
  }
});

describe('desktop wrapper (Tauri)', () => {
  test('every command the page invokes is defined AND registered in Rust', () => {
    const invoked = [...indexHtml.matchAll(/invoke\('([a-z_]+)'/g)].map(m => m[1]);
    assert.ok(invoked.length >= 2, 'expected save_state_file and load_state_file');
    const handler = libRs.match(/generate_handler!\[([^\]]*)\]/);
    assert.ok(handler, 'invoke_handler must be registered');
    for (const cmd of new Set(invoked)) {
      assert.match(libRs, new RegExp(`#\\[tauri::command\\]\\s*fn\\s+${cmd}\\b`), `${cmd} must be a #[tauri::command]`);
      assert.ok(handler[1].split(',').map(s => s.trim()).includes(cmd), `${cmd} must be in generate_handler!`);
    }
  });

  test('the app identifier never changes (WebView2 keys the on-disk profile on it)', () => {
    assert.equal(tauriConf.identifier, 'com.expensetracker.app');
  });

  test('version is valid semver', () => {
    assert.match(tauriConf.version, /^\d+\.\d+\.\d+$/);
  });

  test('the window opens maximized via the setup hook (the config option alone is unreliable)', () => {
    assert.match(libRs, /\.maximize\(\)/);
  });

  test('withGlobalTauri stays enabled (the page uses window.__TAURI__ with no bundler)', () => {
    assert.equal(tauriConf.app.withGlobalTauri, true);
  });
});

describe('home.html returning-user redirect', () => {
  const script = homeHtml.match(/<script>([\s\S]*?)<\/script>/)[1];
  function run({ referrer, saved }){
    let redirectedTo = null;
    const ctx = vm.createContext({
      document: { referrer },
      localStorage: { getItem: (k) => (k === STORAGE_KEY && saved ? '{"x":1}' : null) },
      window: { location: { replace: (u) => { redirectedTo = u; } } },
    });
    vm.runInContext(script, ctx);
    return redirectedTo;
  }
  test('cold launch WITH saved data skips straight to the tracker', () => {
    assert.equal(run({ referrer: '', saved: true }), 'index.html');
  });
  test('cold launch with NO saved data shows the intro page', () => {
    assert.equal(run({ referrer: '', saved: false }), null);
  });
  test('arriving from inside the app (the "?" button) always shows the page, even with saved data', () => {
    assert.equal(run({ referrer: 'https://tauri.localhost/index.html', saved: true }), null);
  });
  test('the key it checks is the same one the app saves under', () => {
    assert.ok(script.includes(STORAGE_KEY));
  });
  test('storage being unavailable never breaks the page', () => {
    const ctx = vm.createContext({
      document: { referrer: '' },
      localStorage: { getItem: () => { throw new Error('denied'); } },
      window: { location: { replace() {} } },
    });
    assert.doesNotThrow(() => vm.runInContext(script, ctx));
  });
});
