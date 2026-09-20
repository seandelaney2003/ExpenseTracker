# Tests

Run everything (needs only Node 20+, no installs):

```
npm test        # or:  node --test
```

CI runs this on every push to `main` and every pull request, and **the desktop
installers are not built — and no release is published — unless it passes.**

## How it works

`load-app.js` runs the **real, unmodified `<script>` from `index.html`** inside a
Node `vm` sandbox with a tiny fake browser (`dom-stub.js`: localStorage, a
do-nothing DOM, `FileReader`, `Blob`, and an optional mock of
`window.__TAURI__.core.invoke`). Nothing is copied out of the app, so the tests
can only ever pass against code that actually ships.

```js
const { loadApp, bootWith, v7Backup, plain, tick } = require('./helpers');

const h = loadApp();                     // fresh install
const h2 = bootWith(v7Backup());         // an existing user's saved data
h.app.addAccount();                      // top-level functions are on h.app
h.get('state').accounts.checking;        // top-level let/const via h.get('name')
h.localStorage._dump();                  // inspect what was persisted
```

Gotchas: compare app objects through `plain(...)` (VM objects have a different
`Object.prototype`); `await tick()` after anything deferred (renders, alerts,
FileReader, mocked Tauri promises).

## What's covered

| File | Guards against |
| --- | --- |
| `state.test.js` | Data loss on launch: load / migrate every historical schema / corrupt or unreadable data is never silently dropped / save→reload round-trips |
| `accounts.test.js` | Add / rename / remove accounts, the debt sign rule, totals, balance snapshots |
| `categories.test.js` | Weekly / biweekly / monthly / quarterly / biannual / yearly scheduling, overrides, freeze-on-check, category editing, every tab rendering |
| `import-export.test.js` | Backup import (old schemas included), export, round-trip, reset |
| `tauri-backup.test.js` | The desktop Rust-file mirror and self-healing (incl. never overwriting the backup before reading it) |
| `integrity.test.js` | JS↔Rust command names, stable app identifier + storage key, forced theme, `home.html` returning-user redirect, missing element ids / undefined handlers |

## Known limits

This checks logic, data, and wiring. It does **not** render CSS or run a real
WebView2/WKWebView, so purely visual problems (layout, colours, off-screen
elements) and OS-level behaviour still need eyes on a real build.

## When you fix a bug

Add a test that fails without the fix. Two real bugs (a `const` read before its
declaration line at startup, and a boot-time save racing the backup file) were
found by exactly this kind of test after ad-hoc checking had missed them.
