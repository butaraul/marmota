import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ConfigError,
  loadConfig,
  marmotaDir,
  readApiKey,
  redactSecrets,
  saveApiKey,
  saveConfig,
  validateConfig,
} from '../src/config.js';
import type { Config } from '../src/config.js';

function withFakeHome<T>(run: () => T): T {
  const home = mkdtempSync(path.join(tmpdir(), 'marmota-home-'));
  const originalHome = process.env['HOME'];
  process.env['HOME'] = home;
  try {
    return run();
  } finally {
    if (originalHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = originalHome;
    rmSync(home, { recursive: true, force: true });
  }
}

function sampleConfig(): Config {
  return {
    version: 1,
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    baseUrl: 'https://api.groq.com/openai/v1',
    workingDir: '/tmp/marmota-workspace',
    maxIterations: 25,
    commandTimeoutMs: 30_000,
  };
}

test('marmotaDir fails loudly rather than silently using a relative path when $HOME is empty', () => {
  const originalHome = process.env['HOME'];
  process.env['HOME'] = '';
  try {
    assert.throws(() => marmotaDir(), (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.match(error.message, /home directory/);
      return true;
    });
  } finally {
    if (originalHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = originalHome;
  }
});

test('loadConfig throws a clear error when no config file exists', () => {
  withFakeHome(() => {
    assert.throws(() => loadConfig(), (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.match(error.message, /No configuration found/);
      assert.match(error.message, /marmota setup/);
      return true;
    });
  });
});

test('saveConfig then loadConfig round-trips the same values', () => {
  withFakeHome(() => {
    const config = sampleConfig();
    saveConfig(config);
    assert.deepEqual(loadConfig(), config);
  });
});

test('loadConfig throws a clear error on malformed JSON', () => {
  withFakeHome(() => {
    const dir = marmotaDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'config.json'), '{ not json');

    assert.throws(() => loadConfig(), (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.match(error.message, /not valid JSON/);
      return true;
    });
  });
});

test('validateConfig rejects an unsupported version by name', () => {
  const bad = { ...sampleConfig(), version: 2 };
  assert.throws(() => validateConfig(bad, 'test'), (error: unknown) => {
    assert.ok(error instanceof ConfigError);
    assert.match(error.message, /version/);
    assert.match(error.message, /marmota setup/);
    return true;
  });
});

test('validateConfig names the specific missing/invalid field', () => {
  const bad: Record<string, unknown> = { ...sampleConfig() };
  delete bad['model'];
  assert.throws(() => validateConfig(bad, 'test'), (error: unknown) => {
    assert.ok(error instanceof ConfigError);
    assert.match(error.message, /"model"/);
    return true;
  });
});

test('validateConfig rejects a non-positive maxIterations by name', () => {
  const bad = { ...sampleConfig(), maxIterations: 0 };
  assert.throws(() => validateConfig(bad, 'test'), (error: unknown) => {
    assert.ok(error instanceof ConfigError);
    assert.match(error.message, /"maxIterations"/);
    return true;
  });
});

test('readApiKey returns undefined when no .env file exists', () => {
  withFakeHome(() => {
    assert.equal(readApiKey(), undefined);
  });
});

test('saveApiKey writes a mode-600 file that readApiKey can parse back', () => {
  withFakeHome(() => {
    saveApiKey('sk-test-123');
    const dir = marmotaDir();
    const stat = statSync(path.join(dir, '.env'));
    assert.equal(stat.mode & 0o777, 0o600);
    assert.equal(readApiKey(), 'sk-test-123');
  });
});

test('redactSecrets leaves ordinary config fields untouched', () => {
  const config = sampleConfig();
  const redacted = redactSecrets(config);
  assert.equal(redacted['provider'], 'groq');
  assert.equal(redacted['baseUrl'], config.baseUrl);
});

test('redactSecrets masks any field whose name looks secret-shaped', () => {
  const withExtra = { ...sampleConfig(), apiKey: 'sk-should-not-appear' } as unknown as Config;
  const redacted = redactSecrets(withExtra);
  assert.equal(redacted['apiKey'], '<redacted>');
});
