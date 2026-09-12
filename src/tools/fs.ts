import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { firstLines, unifiedDiff } from './diff.js';
import { safePath } from './safe-path.js';
import type { Tool, ToolContext } from './types.js';

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

interface ListFilesArgs {
  path?: string;
}

function isListFilesArgs(value: unknown): value is ListFilesArgs {
  if (typeof value !== 'object' || value === null) return false;
  const path = (value as Record<string, unknown>)['path'];
  return path === undefined || typeof path === 'string';
}

export const listFilesTool: Tool = {
  name: 'list_files',
  description:
    'List the files and directories at a path inside the working directory. Directory names end with "/".',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path relative to the working directory. Defaults to "." (the working directory root).',
      },
    },
    additionalProperties: false,
  },
  risk: 'safe',
  async run(args: unknown, ctx: ToolContext): Promise<string> {
    if (!isListFilesArgs(args)) {
      throw new Error('Expected an object with an optional string "path" field.');
    }

    const resolved = safePath(ctx.workingDir, args.path ?? '.');
    const entries = await readdir(resolved, { withFileTypes: true });

    if (entries.length === 0) {
      return '(empty directory)';
    }

    return entries
      .map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`)
      .sort()
      .join('\n');
  },
};

interface ReadFileArgs {
  path: string;
}

function isReadFileArgs(value: unknown): value is ReadFileArgs {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as Record<string, unknown>)['path'] === 'string';
}

export const readFileTool: Tool = {
  name: 'read_file',
  description: 'Read the full text contents of a file inside the working directory.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path relative to the working directory.' },
    },
    required: ['path'],
    additionalProperties: false,
  },
  risk: 'safe',
  async run(args: unknown, ctx: ToolContext): Promise<string> {
    if (!isReadFileArgs(args)) {
      throw new Error('Expected an object with a string "path" field.');
    }
    return readFile(safePath(ctx.workingDir, args.path), 'utf8');
  },
};

interface WriteFileArgs {
  path: string;
  content: string;
}

function isWriteFileArgs(value: unknown): value is WriteFileArgs {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v['path'] === 'string' && typeof v['content'] === 'string';
}

export const writeFileTool: Tool = {
  name: 'write_file',
  description:
    'Write content to a file inside the working directory, creating it (and its parent directories) if needed. Overwrites any existing content. Requires user confirmation.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path relative to the working directory.' },
      content: { type: 'string', description: 'The full new content of the file.' },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  },
  risk: 'confirm',
  async run(args: unknown, ctx: ToolContext): Promise<string> {
    if (!isWriteFileArgs(args)) {
      throw new Error('Expected an object with string "path" and "content" fields.');
    }

    const resolved = safePath(ctx.workingDir, args.path);

    let existed = true;
    let previousContent = '';
    try {
      previousContent = await readFile(resolved, 'utf8');
    } catch (cause) {
      if (isErrnoException(cause) && cause.code === 'ENOENT') {
        existed = false;
      } else {
        throw cause;
      }
    }

    const summary = `write_file ${resolved} (${existed ? 'overwrite' : 'create'})`;
    const detail = existed
      ? unifiedDiff(previousContent, args.content)
      : `New file. First 20 lines:\n${firstLines(args.content, 20)}`;

    const approved = await ctx.confirm(summary, detail);
    if (!approved) {
      return `The user declined to write to "${args.path}". The file was not modified.`;
    }

    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, args.content, 'utf8');
    return `Wrote ${args.content.length} characters to "${args.path}".`;
  },
};
