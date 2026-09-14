import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_VERSION, configPath, saveApiKey, saveConfig } from './config.js';
import type { Config } from './config.js';
import { detectOllamaModels, loadCatalogue, pullOllamaModel, validateApiKey } from './providers/index.js';
import type { Catalogue, CatalogueProvider } from './providers/index.js';
import { confirmYesNo, promptSecret, promptText } from './ui/prompt.js';
import { selectOne } from './ui/select.js';
import type { SelectOption } from './ui/select.js';

const DEFAULT_MAX_ITERATIONS = 25;
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

type ModelChoice =
  | { kind: 'ollama-installed'; provider: CatalogueProvider; name: string }
  | { kind: 'ollama-download'; provider: CatalogueProvider; id: string; label: string }
  | { kind: 'hosted'; provider: CatalogueProvider; id: string };

export async function runSetupWizard(): Promise<void> {
  console.log('marmota setup\n');

  const catalogue = await loadCatalogue();
  const options = await buildModelOptions(catalogue);
  if (options.length === 0) {
    console.log('No models available. Install Ollama (https://ollama.com/download) or check models.json.');
    return;
  }

  const choice = await selectOne('Which model?', options);

  let provider: CatalogueProvider;
  let model: string;
  let apiKey: string | undefined;

  if (choice.kind === 'ollama-installed') {
    provider = choice.provider;
    model = choice.name;
  } else if (choice.kind === 'ollama-download') {
    provider = choice.provider;
    console.log(`\nDownloading ${choice.label} (${choice.id}) via \`ollama pull\` -- this can take a while.`);
    try {
      await pullOllamaModel(choice.id);
    } catch (error) {
      console.log(`\n${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    console.log(`Downloaded ${choice.id}.`);
    model = choice.id;
  } else {
    provider = choice.provider;
    model = choice.id;
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

/**
 * One combined list: installed and downloadable local (Ollama) models first,
 * then every hosted provider's models. Ollama being unreachable just means
 * fewer options, not a dead end -- hosted models are still offered.
 */
async function buildModelOptions(catalogue: Catalogue): Promise<Array<SelectOption<ModelChoice>>> {
  const options: Array<SelectOption<ModelChoice>> = [];

  const ollama = catalogue.providers.find((p) => p.id === 'ollama');
  if (ollama?.detect) {
    const installed = await detectOllamaModels(ollama.detect);
    if (installed === undefined) {
      console.log('(Ollama not detected -- install it from https://ollama.com/download to also use local models.)\n');
    } else {
      for (const name of installed) {
        options.push({ label: `${name} (local, installed)`, hint: 'already installed', value: { kind: 'ollama-installed', provider: ollama, name } });
      }
      for (const m of ollama.suggestedPulls ?? []) {
        options.push({
          label: `${m.label} (local, download)`,
          ...(m.note ? { hint: m.note } : {}),
          value: { kind: 'ollama-download', provider: ollama, id: m.id, label: m.label },
        });
      }
    }
  }

  for (const provider of catalogue.providers.filter((p) => p.id !== 'ollama')) {
    for (const m of provider.models) {
      options.push({
        label: `${m.label} (${provider.label})`,
        ...(m.note ? { hint: m.note } : {}),
        value: { kind: 'hosted', provider, id: m.id },
      });
    }
  }

  return options;
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
