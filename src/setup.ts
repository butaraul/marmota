import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_VERSION, configPath, saveApiKey, saveConfig } from './config.js';
import type { Config } from './config.js';
import { detectOllamaModels, loadCatalogue, validateApiKey } from './providers/index.js';
import type { CatalogueProvider } from './providers/index.js';
import { confirmYesNo, promptSecret, promptText } from './ui/prompt.js';
import { selectOne } from './ui/select.js';

const DEFAULT_MAX_ITERATIONS = 25;
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

export async function runSetupWizard(): Promise<void> {
  console.log('marmota setup\n');

  const catalogue = await loadCatalogue();
  const ollama = catalogue.providers.find((p) => p.id === 'ollama');
  const hostedProviders = catalogue.providers.filter((p) => p.id !== 'ollama');

  const mode = await selectOne('Local or hosted?', [
    { label: 'Local (Ollama)', value: 'local' as const, hint: 'free and private, but slower and less capable' },
    { label: 'Hosted', value: 'hosted' as const, hint: 'smarter, but needs an API key and sends your data to a third party' },
  ]);

  let provider: CatalogueProvider;
  let model: string;
  let apiKey: string | undefined;

  if (mode === 'local') {
    if (!ollama) {
      throw new Error('The model catalogue has no "ollama" entry -- it may be corrupt. Check models.json.');
    }
    const found = await probeOllama(ollama);
    if (!found) return;
    provider = ollama;
    model = await selectOne('Which installed model?', found.map((name) => ({ label: name, value: name })));
  } else {
    provider = await selectOne('Which provider?', hostedProviders.map((p) => ({ label: p.label, value: p })));
    model = await selectOne(
      'Which model?',
      provider.models.map((m) => ({ label: m.label, value: m.id, ...(m.note ? { hint: m.note } : {}) })),
    );
    apiKey = provider.needsKey ? await collectApiKey(provider) : undefined;
    if (provider.needsKey && apiKey === undefined) {
      console.log('Setup cancelled.');
      return;
    }
  }

  console.log('\nmarmota can only read, write, and run commands inside this working directory -- nothing outside it.');
  const defaultWorkingDir = path.resolve(process.cwd(), 'marmota-workspace');
  const workingDir = path.resolve(await promptText('Working directory', defaultWorkingDir));
  mkdirSync(workingDir, { recursive: true });

  const config: Config = {
    version: CONFIG_VERSION,
    provider: provider.id,
    model,
    baseUrl: provider.baseUrl,
    workingDir,
    maxIterations: DEFAULT_MAX_ITERATIONS,
    commandTimeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
  };

  saveConfig(config);
  if (apiKey) saveApiKey(apiKey);

  console.log(`\nSetup complete. Config written to ${configPath()}.`);
}

/** Returns installed model names, or undefined if Ollama couldn't be reached (already reported to the user). */
async function probeOllama(ollama: CatalogueProvider): Promise<string[] | undefined> {
  if (!ollama.detect) {
    throw new Error('The catalogue\'s "ollama" entry has no "detect" URL -- it may be corrupt.');
  }

  const models = await detectOllamaModels(ollama.detect);
  if (models === undefined) {
    console.log(`\nCould not reach Ollama (checked ${ollama.detect}).`);
    console.log('Install it from https://ollama.com/download, then pull a model, e.g.:');
    console.log('  ollama pull llama3.2');
    console.log('Run `marmota setup` again once it is running.');
    return undefined;
  }
  if (models.length === 0) {
    console.log('\nOllama is running but has no models installed yet.');
    console.log('Pull one first, e.g.: ollama pull llama3.2');
    console.log('Run `marmota setup` again once you have.');
    return undefined;
  }
  return models;
}

/** Prompts for a key and validates it with a cheap request, looping on failure until the user gives up. */
async function collectApiKey(provider: CatalogueProvider): Promise<string | undefined> {
  if (provider.keyUrl) {
    console.log(`\nGet a key at: ${provider.keyUrl}`);
  }

  while (true) {
    const candidate = await promptSecret('API key: ');
    console.log('Checking key...');
    const result = await validateApiKey(provider.baseUrl, candidate);
    if (result.ok) return candidate;

    console.log(`That key did not work (${result.reason}).`);
    if (!(await confirmYesNo('Try again?'))) return undefined;
  }
}
