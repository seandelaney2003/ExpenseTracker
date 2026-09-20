// A minimal fake browser environment — just enough surface area for the
// real index.html script to run start-to-finish under Node's `vm` module
// without a real DOM. It does NOT track a real element tree; every element
// is an independent stateful stand-in with the handful of properties/
// methods this app's rendering code actually touches. That's deliberate:
// these tests exist to catch data/logic regressions (the kind that have
// actually broken this app in the wild), not to verify pixel-perfect
// rendering — a real DOM (jsdom) would be needed for that and isn't worth
// the added dependency for what this app needs tested.

function makeClassList(){
  const set = new Set();
  return {
    add: (...names) => names.forEach(n => set.add(n)),
    remove: (...names) => names.forEach(n => set.delete(n)),
    toggle: (name, force) => {
      const has = set.has(name);
      const shouldHave = force === undefined ? !has : force;
      if(shouldHave) set.add(name); else set.delete(name);
      return shouldHave;
    },
    contains: (name) => set.has(name),
  };
}

function makeFakeElement(){
  const el = {
    _innerHTML: '',
    style: {},
    dataset: {},
    children: [],
    classList: makeClassList(),
    value: '',
    checked: false,
    textContent: '',
    files: [],
    addEventListener(){},
    removeEventListener(){},
    setAttribute(){},
    getAttribute(){ return null; },
    removeAttribute(){},
    appendChild(child){ el.children.push(child); return child; },
    removeChild(){},
    remove(){},
    click(){},
    focus(){},
    blur(){},
    select(){},
    scrollIntoView(){},
    scrollTo(){},
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    closest(){ return null; },
    getBoundingClientRect(){ return { top:0, left:0, width:0, height:0, bottom:0, right:0 }; },
  };
  Object.defineProperty(el, 'innerHTML', {
    get(){ return el._innerHTML; },
    set(v){ el._innerHTML = v; },
  });
  return el;
}

function makeLocalStorage(seed){
  const store = Object.assign({}, seed || {});
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for(const k of Object.keys(store)) delete store[k]; },
    key: (i) => Object.keys(store)[i] ?? null,
    get length(){ return Object.keys(store).length; },
    _dump: () => Object.assign({}, store),
  };
}

// Builds a fresh sandbox (global scope) for one run of the app script.
// `opts.localStorageSeed` pre-populates localStorage before the script runs
// (e.g. to simulate an existing install). `opts.tauri` — a mock
// `window.__TAURI__.core.invoke` implementation — omit for "web version"/
// "no Tauri" behavior.
function makeSandbox(opts){
  opts = opts || {};
  const localStorage = makeLocalStorage(opts.localStorageSeed);
  const domContentLoadedListeners = [];
  const eventListeners = {};

  const documentStub = {
    body: makeFakeElement(),
    documentElement: makeFakeElement(),
    getElementById(){ return makeFakeElement(); },
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    createElement(){ return makeFakeElement(); },
    addEventListener(evt, cb){
      (eventListeners[evt] = eventListeners[evt] || []).push(cb);
    },
    removeEventListener(){},
  };

  const windowStub = {
    localStorage,
    document: documentStub,
    addEventListener(evt, cb){
      if(evt === 'DOMContentLoaded') domContentLoadedListeners.push(cb);
      (eventListeners[evt] = eventListeners[evt] || []).push(cb);
    },
    removeEventListener(){},
    scrollTo(){},
    matchMedia(){ return { matches:false, addListener(){}, removeListener(){} }; },
    requestAnimationFrame(cb){ return setTimeout(cb, 0); },
    location: { replace(){}, href:'' },
  };
  if(opts.tauri){
    windowStub.__TAURI__ = { core: { invoke: opts.tauri } };
  }

  const sandbox = {
    window: windowStub,
    document: documentStub,
    localStorage,
    navigator: { userAgent: 'node-test' },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: windowStub.requestAnimationFrame,
    alert: opts.alert || (() => {}),
    confirm: opts.confirm || (() => true),
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    // Blob remembers its contents (sandbox.__lastBlob) so tests can inspect
    // exactly what exportData() would have downloaded.
    Blob: function Blob(parts, blobOpts){
      this.parts = parts;
      this.type = blobOpts && blobOpts.type;
      sandbox.__lastBlob = this;
    },
    // FileReader stub: a "file" here is { __text: '...contents...' }.
    FileReader: function FileReader(){
      this.readAsText = (file) => {
        this.result = file.__text;
        setTimeout(() => this.onload && this.onload(), 0);
      };
    },
    Date,
    JSON,
    Math,
    performance: (typeof performance !== 'undefined') ? performance : { now: () => Date.now() },
  };
  sandbox.globalThis = sandbox;
  sandbox.window.window = sandbox.window;

  return {
    sandbox,
    localStorage,
    fireDOMContentLoaded(){ domContentLoadedListeners.forEach(cb => cb()); },
  };
}

module.exports = { makeSandbox, makeFakeElement, makeLocalStorage };
