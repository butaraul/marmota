import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// TODO: replace <owner> with this repo's real GitHub path once it's pushed.
// Until then this fetch will always fail closed to the bundled models.json
// below, which is exactly the documented fallback behaviour.
const REMOTE_CATALOGUE_URL = 'https://raw.githubusercontent.com/<owner>/marmota/main/models.json';
const FETCH_TIMEOUT_MS = 3000;

export interface CatalogueModel {
  id: string;
  label: string;
  note?: string;
}

export interface CatalogueProvider {
  id: string;
  label: string;
  needsKey: boolean;
  baseUrl: string;
  keyUrl?: string;
  detect?: string;
  models: CatalogueModel[];
  /** Models this provider can download on request (currently only meaningful for Ollama). */
  suggestedPulls?: CatalogueModel[];
}

export interface Catalogue {
  version: number;
  providers: CatalogueProvider[];
}

/** Fetches models.json from GitHub with a short timeout, falling back to the bundled copy. */
export async function loadCatalogue(): Promise<Catalogue> {
  try {
    const response = await fetch(REMOTE_CATALOGUE_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.ok) {
      return parseCatalogue(await response.text(), 'the remote model catalogue');
    }
  } catch {
    // Network error, timeout, or non-OK response: fall through to the bundled copy.
  }
  return parseCatalogue(readFileSync(bundledCataloguePath(), 'utf8'), 'the bundled models.json');
}

function bundledCataloguePath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, '..', '..', 'models.json');
}

/** Probes an Ollama-style /api/tags endpoint. Returns undefined if unreachable. */
export async function detectOllamaModels(detectUrl: string): Promise<string[] | undefined> {
  try {
    const response = await fetch(detectUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return undefined;
    const data: unknown = await response.json();
    if (!isRecord(data) || !Array.isArray(data['models'])) return undefined;
    return data['models']
      .map((entry) => (isRecord(entry) && typeof entry['name'] === 'string' ? entry['name'] : undefined))
      .filter((name): name is string => name !== undefined);
  } catch {
    return undefined;
  }
}

/**
 * Runs `ollama pull <modelId>` with inherited stdio so its own progress bar
 * renders directly in the user's terminal. Throws with a clear message on a
 * missing `ollama` binary or a non-zero exit.
 */
export function pullOllamaModel(modelId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ollama', ['pull', modelId], { stdio: 'inherit' });

    child.on('error', (error) => {
      reject(new Error(`Could not run "ollama pull ${modelId}": ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`"ollama pull ${modelId}" exited with code ${code ?? 'null'}.`));
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseCatalogue(raw: string, source: string): Catalogue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`${source} is not valid JSON: ${(cause as Error).message}`);
  }
  if (!isRecord(parsed) || typeof parsed['version'] !== 'number' || !Array.isArray(parsed['providers'])) {
    throw new Error(`${source} does not have the expected shape (missing "version" or "providers").`);
  }
  return {
    version: parsed['version'],
    providers: parsed['providers'].map((provider, i) => toCatalogueProvider(provider, `${source}.providers[${i}]`)),
  };
}

function toCatalogueProvider(value: unknown, at: string): CatalogueProvider {
  if (!isRecord(value)) throw new Error(`${at} must be an object.`);
  const { id, label, needsKey, baseUrl, keyUrl, detect, models, suggestedPulls } = value;
  if (typeof id !== 'string' || typeof label !== 'string' || typeof needsKey !== 'boolean' || typeof baseUrl !== 'string') {
    throw new Error(`${at} is missing a required string/boolean field (id, label, needsKey, baseUrl).`);
  }
  if (!Array.isArray(models)) throw new Error(`${at}.models must be an array.`);
  if (suggestedPulls !== undefined && !Array.isArray(suggestedPulls)) {
    throw new Error(`${at}.suggestedPulls must be an array.`);
  }
  return {
    id,
    label,
    needsKey,
    baseUrl,
    ...(typeof keyUrl === 'string' ? { keyUrl } : {}),
    ...(typeof detect === 'string' ? { detect } : {}),
    models: models.map((model, i) => toCatalogueModel(model, `${at}.models[${i}]`)),
    ...(suggestedPulls
      ? { suggestedPulls: suggestedPulls.map((model, i) => toCatalogueModel(model, `${at}.suggestedPulls[${i}]`)) }
      : {}),
  };
}

function toCatalogueModel(value: unknown, at: string): CatalogueModel {
  if (!isRecord(value) || typeof value['id'] !== 'string' || typeof value['label'] !== 'string') {
    throw new Error(`${at} must have string "id" and "label" fields.`);
  }
  const note = value['note'];
  return { id: value['id'], label: value['label'], ...(typeof note === 'string' ? { note } : {}) };
}

/** A cheap, non-billable request to confirm a key actually authenticates. */
export async function validateApiKey(baseUrl: string, apiKey: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) return { ok: true };
    return { ok: false, reason: `${response.status} ${response.statusText}` };
  } catch (cause) {
    return { ok: false, reason: (cause as Error).message };
  }
}
