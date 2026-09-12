import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFileTool, writeFileTool } from '../src/tools/fs.js';
import { runCommandTool } from '../src/tools/shell.js';
import type { ToolContext } from '../src/tools/types.js';

function makeSandbox(): string {
  return mkdtempSync(path.join(tmpdir(), 'marmota-tools-'));
}

function makeCtx(workingDir: string, confirm: (summary: string, detail: string) => Promise<boolean>): ToolContext {
  return { workingDir, signal: new AbortController().signal, confirm };
}

test('write_file does not touch disk when the confirmation is declined', async () => {
  const root = makeSandbox();
  try {
    let confirmCalls = 0;
    const ctx = makeCtx(root, async () => {
      confirmCalls++;
      return false;
    });

    const result = await writeFileTool.run({ path: 'notes.txt', content: 'hello' }, ctx);

    assert.equal(confirmCalls, 1);
    assert.match(result, /declined/i);
    assert.equal(existsFile(root, 'notes.txt'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('write_file writes to disk once the confirmation is accepted', async () => {
  const root = makeSandbox();
  try {
    const ctx = makeCtx(root, async () => true);
    const result = await writeFileTool.run({ path: 'notes.txt', content: 'hello' }, ctx);

    assert.match(result, /Wrote/);
    assert.equal(readFileSync(path.join(root, 'notes.txt'), 'utf8'), 'hello');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('write_file shows a diff against existing content in the confirmation detail', async () => {
  const root = makeSandbox();
  try {
    writeFileSync(path.join(root, 'existing.txt'), 'line one\nline two\n');
    let seenDetail = '';
    const ctx = makeCtx(root, async (_summary, detail) => {
      seenDetail = detail;
      return true;
    });

    await writeFileTool.run({ path: 'existing.txt', content: 'line one\nline TWO\n' }, ctx);

    assert.match(seenDetail, /-line two/);
    assert.match(seenDetail, /\+line TWO/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('write_file rejects a path that escapes the working directory', async () => {
  const root = makeSandbox();
  try {
    const ctx = makeCtx(root, async () => true);
    await assert.rejects(() => writeFileTool.run({ path: '../escape.txt', content: 'x' }, ctx));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('read_file on a missing file throws a clear error rather than crashing', async () => {
  const root = makeSandbox();
  try {
    const ctx = makeCtx(root, async () => true);
    await assert.rejects(() => readFileTool.run({ path: 'missing.txt' }, ctx));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('read_file returns file contents', async () => {
  const root = makeSandbox();
  try {
    writeFileSync(path.join(root, 'data.txt'), 'file body');
    const ctx = makeCtx(root, async () => true);
    assert.equal(await readFileTool.run({ path: 'data.txt' }, ctx), 'file body');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('run_command does not execute when the confirmation is declined', async () => {
  const root = makeSandbox();
  try {
    const ctx = makeCtx(root, async () => false);
    const result = await runCommandTool.run(
      { command: [process.execPath, '-e', `require('fs').writeFileSync('ran.txt','yes')`] },
      ctx,
    );

    assert.match(result, /declined/i);
    assert.equal(existsFile(root, 'ran.txt'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('run_command runs the exact argv once confirmed, with no shell involved', async () => {
  const root = makeSandbox();
  try {
    const ctx = makeCtx(root, async () => true);
    const result = await runCommandTool.run(
      { command: [process.execPath, '-e', `process.stdout.write('hi;there')`] },
      ctx,
    );

    assert.match(result, /exit code 0/);
    assert.match(result, /hi;there/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('run_command surfaces a non-zero exit without crashing', async () => {
  const root = makeSandbox();
  try {
    const ctx = makeCtx(root, async () => true);
    const result = await runCommandTool.run({ command: [process.execPath, '-e', 'process.exit(2)'] }, ctx);
    assert.match(result, /exit code 2/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function existsFile(root: string, name: string): boolean {
  try {
    readFileSync(path.join(root, name));
    return true;
  } catch {
    return false;
  }
}
