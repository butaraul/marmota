import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export class ConfigError extends Error {}

export const CONFIG_VERSION = 1;

export interface Config {
  version: typeof CONFIG_VERSION;
  provider: string;
  model: string;
  baseUrl: string;
  workingDir: string;
  maxIterations: number;
  commandTimeoutMs: number;
}

/** Respects XDG_CONFIG_HOME on Linux; everywhere else it's always ~/.marmota. */
export function marmotaDir(): string {
  const xdg = process.env['XDG_CONFIG_HOME'];
  if (process.platform === 'linux' && xdg) {
    return path.join(xdg, 'marmota');
  }

  const home = os.homedir();
  // os.homedir() returns '' verbatim when $HOME is set but empty, rather than
  // falling back -- left unchecked, that turns into a silent relative
  // ".marmota" under whatever the current directory happens to be.
  if (!home || !path.isAbsolute(home)) {
    throw new ConfigError(`Could not determine a home directory (got ${JSON.stringify(home)}). Set $HOME and try again.`);
  }
  return path.join(home, '.marmota');
}

export function configPath(): string {
  return path.join(marmotaDir(), 'config.json');
}

export function envPath(): string {
  return path.join(marmotaDir(), '.env');
}

export function loadConfig(): Config {
  const file = configPath();
  if (!existsSync(file)) {
    throw new ConfigError(`No configuration found at ${file}. Run \`marmota setup\` to create one.`);
  }

  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (cause) {
    throw new ConfigError(`Could not read ${file}: ${(cause as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new ConfigError(`Config file at ${file} is not valid JSON: ${(cause as Error).message}`);
  }

  return validateConfig(parsed, file);
}

export function validateConfig(value: unknown, source: string): Config {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError(`Config at ${source} must be a JSON object.`);
  }
  const v = value as Record<string, unknown>;

  if (v['version'] !== CONFIG_VERSION) {
    throw new ConfigError(
      `Config at ${source} has version ${JSON.stringify(v['version'])}, but this build expects ${CONFIG_VERSION}. ` +
        'No migration is available for that version -- run `marmota setup` to regenerate your config.',
    );
  }

  for (const field of ['provider', 'model', 'baseUrl', 'workingDir'] as const) {
    if (typeof v[field] !== 'string' || v[field] === '') {
      throw new ConfigError(`Config at ${source}: "${field}" must be a non-empty string, got ${JSON.stringify(v[field])}.`);
    }
  }

  for (const field of ['maxIterations', 'commandTimeoutMs'] as const) {
    const fieldValue = v[field];
    if (typeof fieldValue !== 'number' || !Number.isInteger(fieldValue) || fieldValue <= 0) {
      throw new ConfigError(`Config at ${source}: "${field}" must be a positive integer, got ${JSON.stringify(fieldValue)}.`);
    }
  }

  return {
    version: CONFIG_VERSION,
    provider: v['provider'] as string,
    model: v['model'] as string,
    baseUrl: v['baseUrl'] as string,
    workingDir: v['workingDir'] as string,
    maxIterations: v['maxIterations'] as number,
    commandTimeoutMs: v['commandTimeoutMs'] as number,
  };
}

export function saveConfig(config: Config): void {
  mkdirSync(marmotaDir(), { recursive: true });
  writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

const API_KEY_LINE = /^MARMOTA_API_KEY=(.*)$/;

/** Reads the API key from ~/.marmota/.env, warning (not failing) if its permissions are too loose. */
export function readApiKey(): string | undefined {
  const file = envPath();
  if (!existsSync(file)) return undefined;

  const mode = statSync(file).mode & 0o777;
  if (mode & 0o077) {
    console.error(`Warning: ${file} is readable by others (mode ${mode.toString(8)}). Run \`chmod 600 ${file}\` to restrict it.`);
  }

  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = API_KEY_LINE.exec(line.trim());
    const key = match?.[1];
    if (key !== undefined) return key;
  }
  return undefined;
}

export function saveApiKey(key: string): void {
  mkdirSync(marmotaDir(), { recursive: true });
  const file = envPath();
  writeFileSync(file, `MARMOTA_API_KEY=${key}\n`, { mode: 0o600 });
  chmodSync(file, 0o600); // writeFileSync's mode is only applied when the file is newly created
}

const SECRET_KEY_PATTERN = /key|token|secret|password|authorization/i;

/** Used by `marmota config` -- config.json holds no secrets by design, but this is the stated contract. */
export function redactSecrets(config: Config): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    redacted[key] = SECRET_KEY_PATTERN.test(key) ? '<redacted>' : value;
  }
  return redacted;
}
