import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  SessionError,
  createSessionFile,
  findLatestSessionFile,
  loadSession,
  pruneOldSessions,
  saveSession,
  sessionsDir,
} from '../src/session.js';
import type { Message } from '../src/providers/types.js';

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

test('saveSession then loadSession round-trips messages, including tool calls', () => {
  withFakeHome(() => {
    const history: Message[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'list files' },
      { role: 'assistant', content: '', toolCalls: [{ id: '1', name: 'list_files', args: { path: '.' } }] },
      { role: 'tool', toolCallId: '1', name: 'list_files', content: 'a.txt' },
      { role: 'assistant', content: 'done' },
    ];
    const file = createSessionFile();
    saveSession(file, history);
    assert.deepEqual(loadSession(file), history);
  });
});

test('findLatestSessionFile returns undefined when no sessions exist', () => {
  withFakeHome(() => {
    assert.equal(findLatestSessionFile(), undefined);
  });
});

test('findLatestSessionFile returns the most recently created file', () => {
  withFakeHome(() => {
    saveSession(createSessionFile(), [{ role: 'system', content: 'first' }]);

    // Force a distinct, later timestamp so filename ordering is unambiguous.
    const dir = sessionsDir();
    const laterName = `${new Date(Date.now() + 60_000).toISOString().replace(/[:.]/g, '-')}.json`;
    const later = path.join(dir, laterName);
    saveSession(later, [{ role: 'system', content: 'later' }]);

    assert.equal(findLatestSessionFile(), later);
  });
});

test('loadSession throws a clear error on malformed JSON', () => {
  withFakeHome(() => {
    const file = createSessionFile();
    writeFileSync(file, '{ not json');
    assert.throws(() => loadSession(file), (error: unknown) => {
      assert.ok(error instanceof SessionError);
      assert.match(error.message, /not valid JSON/);
      return true;
    });
  });
});

test('loadSession throws a clear error when the content is not an array', () => {
  withFakeHome(() => {
    const file = createSessionFile();
    writeFileSync(file, JSON.stringify({ not: 'an array' }));
    assert.throws(() => loadSession(file), (error: unknown) => {
      assert.ok(error instanceof SessionError);
      assert.match(error.message, /JSON array of messages/);
      return true;
    });
  });
});

test('loadSession names the specific invalid message', () => {
  withFakeHome(() => {
    const file = createSessionFile();
    writeFileSync(file, JSON.stringify([{ role: 'user', content: 'ok' }, { role: 'user' }]));
    assert.throws(() => loadSession(file), (error: unknown) => {
      assert.ok(error instanceof SessionError);
      assert.match(error.message, /\[1\]/);
      return true;
    });
  });
});

test('loadSession rejects an unknown role', () => {
  withFakeHome(() => {
    const file = createSessionFile();
    writeFileSync(file, JSON.stringify([{ role: 'sneaky', content: 'hi' }]));
    assert.throws(() => loadSession(file), (error: unknown) => {
      assert.ok(error instanceof SessionError);
      assert.match(error.message, /unknown role/i);
      return true;
    });
  });
});

test('pruneOldSessions keeps only the most recent 20 files', () => {
  withFakeHome(() => {
    const dir = sessionsDir();
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 25; i++) {
      const file = path.join(dir, `2026-01-01T00-00-${String(i).padStart(2, '0')}-000Z.json`);
      saveSession(file, [{ role: 'system', content: String(i) }]);
    }

    pruneOldSessions();

    const remaining = readdirSync(dir).sort();
    assert.equal(remaining.length, 20);
    assert.equal(remaining[0], '2026-01-01T00-00-05-000Z.json');
    assert.equal(remaining[remaining.length - 1], '2026-01-01T00-00-24-000Z.json');
  });
});
