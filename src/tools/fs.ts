import { readdir } from 'node:fs/promises';
import { safePath } from './safe-path.js';
import type { Tool, ToolContext } from './types.js';

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
