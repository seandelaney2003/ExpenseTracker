// Copies the real app files — home.html and index.html, living at the
// project root, the same files used on the web — into src/ so Tauri bundles
// the exact same code. This keeps the root files as the single source of
// truth; nothing under desktop-app/ should ever be hand-edited directly.
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const destDir = path.join(here, '..', 'src');

if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });

for (const file of ['home.html', 'index.html']) {
  const src = path.join(root, file);
  const dest = path.join(destDir, file);
  if (!existsSync(src)) {
    console.error(`Could not find ${src} — expected it at the project root.`);
    process.exit(1);
  }
  copyFileSync(src, dest);
  console.log(`Synced ${src} -> ${dest}`);
}
