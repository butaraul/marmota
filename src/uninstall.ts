import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { marmotaDir } from './config.js';
import { detectOllamaModels, loadCatalogue } from './providers/index.js';
import { confirmYesNo } from './ui/prompt.js';

interface FileItem {
  path: string;
  bytes: number;
}

function collectItems(dir: string): FileItem[] {
  if (!existsSync(dir)) return [];
  const items: FileItem[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        items.push({ path: full, bytes: statSync(full).size });
      }
    }
  };
  walk(dir);
  return items;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export async function runUninstall(): Promise<void> {
  const dir = marmotaDir();
  const items = collectItems(dir);

  if (items.length === 0) {
    console.log(`Nothing to remove -- ${dir} does not exist.`);
    return;
  }

  console.log(`This will remove ${dir}:\n`);
  for (const item of items) {
    console.log(`  ${path.relative(dir, item.path)} (${formatBytes(item.bytes)})`);
  }
  const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0);
  console.log(`\nTotal: ${formatBytes(totalBytes)}`);

  await noteOllamaModels();

  console.log('');
  if (!(await confirmYesNo('Remove all of this?'))) {
    console.log('Cancelled -- nothing was removed.');
    return;
  }

  rmSync(dir, { recursive: true, force: true });
  console.log(`\nRemoved ${dir} (${formatBytes(totalBytes)} freed).`);
  console.log('Run `npm uninstall -g marmota` to remove the CLI itself.');
}

/** Ollama models are never marmota's to delete -- this is purely informational. */
async function noteOllamaModels(): Promise<void> {
  const catalogue = await loadCatalogue();
  const ollama = catalogue.providers.find((p) => p.id === 'ollama');
  if (!ollama?.detect) return;

  const models = await detectOllamaModels(ollama.detect);
  if (!models || models.length === 0) return;

  console.log('\nOllama models are managed by Ollama, not marmota -- these will be left untouched:');
  for (const name of models) {
    console.log(`  ${name}  (remove with: ollama rm ${name})`);
  }
}
