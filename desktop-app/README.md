# Expense Tracker — Desktop (Tauri)

This packages the same tracker (`../index.html`) as an installable Windows/Mac/Linux desktop app, using [Tauri](https://tauri.app). It uses the OS's built-in webview instead of bundling a browser, so installers come out around 5–10MB instead of Electron's 150MB+.

**There is no separate desktop codebase.** The real app is `index.html` at the project root — that's the only file you should ever edit. Every dev/build run here copies it into `src/index.html` automatically (`npm run sync`, wired up as a `pre`-step on both `dev` and `build`), so this folder never drifts out of sync with the web version.

## Prerequisites

- [Node.js](https://nodejs.org) (already required for the tooling)
- [Rust](https://www.rust-lang.org/tools/install) — `rustup` recommended
- Windows: the **MSVC C++ Build Tools** (Visual Studio Build Tools, "Desktop development with C++" workload) and the WebView2 runtime (already built into Windows 10/11)
- Mac: Xcode Command Line Tools (`xcode-select --install`)
- Linux: see [Tauri's Linux prerequisites](https://tauri.app/start/prerequisites/#linux) (webkit2gtk, etc.)

Full details: https://tauri.app/start/prerequisites/

## Setup

```
cd desktop-app
npm install
```

## Run in development

```
npm run dev
```

Opens the app in a native window with hot-reload disabled (there's no build step for a static HTML app — just re-run `npm run dev` after editing `../index.html` to see changes).

## Build an installer

```
npm run build
```

Produces a native installer for your current OS in `src-tauri/target/release/bundle/` — an `.msi`/`.exe` on Windows, a `.dmg`/`.app` on Mac, an `.AppImage`/`.deb` on Linux. Cross-compiling to a different OS than you're building on isn't supported by Tauri directly — build each platform's installer on that platform (or in CI).

## App identity

Configured in `src-tauri/tauri.conf.json`:
- `productName`, `version`, `identifier` (the app's unique bundle ID — change `com.expensetracker.app` before shipping if you're branding this differently)
- Window size/title under `app.windows`
- Icons under `bundle.icon`, sourced from `src-tauri/icons/` — currently the Tauri scaffold's default icon set. **Replace these before selling the app.** The easiest way, once you have a square source PNG (ideally 1024×1024):
  ```
  npm run tauri icon path/to/your-logo.png
  ```
  This regenerates every required size/format automatically.

## Notes

- `src/` in this folder is **generated** (git-ignored) — never edit it directly, it's overwritten by the sync step every time.
- No native Rust commands are wired up (`src-tauri/src/lib.rs` just hosts the webview) — the app doesn't need any OS-level integration beyond what a browser already provides.
