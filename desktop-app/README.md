# Expense Tracker — Desktop (Tauri)

This packages the same tracker (`../index.html`) as an installable Windows/Mac/Linux desktop app, using [Tauri](https://tauri.app). It uses the OS's built-in webview instead of bundling a browser, so installers come out around 5–10MB instead of Electron's 150MB+.

**There is no separate desktop codebase.** The real app is `index.html` at the project root — that's the only file you should ever edit. Tauri itself runs `npm run sync` automatically before every dev/build (configured as `beforeDevCommand`/`beforeBuildCommand` in `tauri.conf.json`), copying it into `src/index.html`, so this folder never drifts out of sync with the web version and this happens no matter how the build is triggered (locally, or in CI).

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

Produces a native installer for your current OS in `src-tauri/target/release/bundle/` — an `.msi`/`.exe` on Windows, a `.dmg`/`.app` on Mac, an `.AppImage`/`.deb` on Linux. Cross-compiling to a different OS than you're building on isn't supported by Tauri directly — build each platform's installer on that platform (or in CI, below).

## Building via GitHub Actions (recommended)

A workflow at `../.github/workflows/desktop-build.yml` builds installers for **Windows, Mac, and Linux in parallel** on GitHub's own runners. This is the recommended way to build the Windows installer in particular, since some locally-managed Windows machines (e.g. with **Smart App Control** enabled) block the unsigned build tools Rust produces during compilation — GitHub's runners have no such restriction.

To use it:
1. Push this project to a GitHub repository (see below if you haven't yet).
2. On GitHub, go to the **Actions** tab → **Build Desktop App** → **Run workflow**.
3. When it finishes, download the installers from the run's **Artifacts** section (one zip per platform).

It also runs automatically whenever you push a tag like `v1.0.0` — useful once you're cutting real releases.

### First time pushing to GitHub

```
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

(Create the empty repo on GitHub first — github.com → New repository — then use the URL it gives you above. No need to add a README or license there; this project already has one.)

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
