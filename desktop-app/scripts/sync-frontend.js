// Copies the real app (index.html, living at the project root — the same
// file used on the web) into src/ so Tauri bundles the exact same code.
// This keeps the root index.html as the single source of truth; nothing
// under desktop-app/ should ever be hand-edited directly.
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const src = path.join(root, 'index.html');
const destDir = path.join(here, '..', 'src');
const dest = path.join(destDir, 'index.html');

if (!existsSync(src)) {
  console.error(`Could not find ${src} — expected the tracker's index.html at the project root.`);
  process.exit(1);
}
if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`Synced ${src} -> ${dest}`);
