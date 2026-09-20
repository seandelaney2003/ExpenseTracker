// Loads and executes the ACTUAL, unmodified <script> from index.html inside
// a sandboxed VM context — never a hand-copied excerpt. A copy would drift
// out of sync with the real app the moment a function boundary changes, and
// the tests would keep passing against code that no longer exists.
//
// Node's vm exposes top-level `function` declarations on the sandbox, but
// NOT top-level `let`/`const` (state, STORAGE_KEY, DEFAULT_ACCOUNTS, ...).
// So the script is run with a tiny epilogue defining `__eval`, a function
// whose direct eval sees the script's full lexical scope. Tests use
// app.get('state') / app.set('state', ...) / app.run('expr').
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeSandbox } = require('./dom-stub');

const INDEX_HTML_PATH = path.join(__dirname, '..', 'index.html');

function extractScript(html){
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  if(!match) throw new Error('Could not find <script> block in index.html');
  return match[1];
}

// opts:
//   localStorageSeed — { key: value } present in localStorage BEFORE the
//                      script runs (simulates an existing install)
//   tauri            — (cmd, args) => Promise, mocks window.__TAURI__.core.invoke
//   alert / confirm  — override the stubbed implementations
function loadApp(opts){
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const script = extractScript(html) + '\nfunction __eval(code){ return eval(code); }\n';
  const { sandbox, localStorage, fireDOMContentLoaded } = makeSandbox(opts);
  const context = vm.createContext(sandbox);
  vm.runInContext(script, context, { filename: 'index.html>inline-script' });

  const run = (code) => sandbox.__eval(code);
  return {
    // top-level functions (loadState, addAccount, ...) are directly on `app`
    app: sandbox,
    // read a top-level let/const binding, e.g. get('state')
    get: (name) => run(name),
    // assign a top-level let binding, e.g. set('state', freshState())
    set: (name, value) => { sandbox.__tmp = value; run(`${name} = __tmp`); delete sandbox.__tmp; },
    // evaluate any expression inside the app's own scope
    run,
    localStorage,
    fireDOMContentLoaded,
  };
}

module.exports = { loadApp, extractScript, INDEX_HTML_PATH };
