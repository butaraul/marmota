import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { safePath, SandboxError } from '../src/tools/safe-path.js';

function makeSandbox(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'marmota-safepath-'));
  return realpathSync(dir);
}

test('plain relative path resolves inside the working directory', () => {
  const root = makeSandbox();
  try {
    assert.equal(safePath(root, 'notes.txt'), path.join(root, 'notes.txt'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('.. traversal is rejected', () => {
  const root = makeSandbox();
  try {
    assert.throws(() => safePath(root, '../escape.txt'), SandboxError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('deeply nested .. traversal is rejected', () => {
  const root = makeSandbox();
  try {
    assert.throws(() => safePath(root, 'a/../../../escape.txt'), SandboxError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('.. traversal that stays inside the root is allowed', () => {
  const root = makeSandbox();
  try {
    assert.equal(safePath(root, 'a/../b.txt'), path.join(root, 'b.txt'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('absolute path outside the root is rejected', () => {
  const root = makeSandbox();
  try {
    assert.throws(() => safePath(root, '/etc/passwd'), SandboxError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('absolute path inside the root is allowed', () => {
  const root = makeSandbox();
  try {
    const target = path.join(root, 'inside.txt');
    assert.equal(safePath(root, target), target);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a symlink pointing outside the root is rejected', () => {
  const root = makeSandbox();
  const outside = mkdtempSync(path.join(tmpdir(), 'marmota-outside-'));
  try {
    symlinkSync(outside, path.join(root, 'escape-link'));
    assert.throws(() => safePath(root, 'escape-link'), SandboxError);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('traversing through a symlink to outside the root is rejected', () => {
  const root = makeSandbox();
  const outside = mkdtempSync(path.join(tmpdir(), 'marmota-outside-'));
  try {
    symlinkSync(outside, path.join(root, 'escape-link'));
    assert.throws(() => safePath(root, 'escape-link/secret.txt'), SandboxError);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('a non-existent path resolves against its nearest existing ancestor', () => {
  const root = makeSandbox();
  try {
    assert.equal(
      safePath(root, 'new-dir/new-file.txt'),
      path.join(root, 'new-dir', 'new-file.txt'),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a non-existent path behind a symlinked ancestor pointing outside is rejected', () => {
  const root = makeSandbox();
  const outside = mkdtempSync(path.join(tmpdir(), 'marmota-outside-'));
  try {
    symlinkSync(outside, path.join(root, 'escape-link'));
    assert.throws(() => safePath(root, 'escape-link/does-not-exist.txt'), SandboxError);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('the working directory itself is allowed', () => {
  const root = makeSandbox();
  try {
    assert.equal(safePath(root, '.'), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an empty string resolves to the working directory', () => {
  const root = makeSandbox();
  try {
    assert.equal(safePath(root, ''), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a tilde is treated as a literal path segment, never expanded to home', () => {
  const root = makeSandbox();
  try {
    assert.equal(safePath(root, '~'), path.join(root, '~'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a null byte in the requested path is rejected', () => {
  const root = makeSandbox();
  try {
    assert.throws(() => safePath(root, 'foo\0bar'), SandboxError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
