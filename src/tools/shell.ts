import { spawn } from 'node:child_process';
import type { Tool, ToolContext } from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

// A minimal, non-secret environment. Never the full process.env -- that can
// hold the user's own provider API key, which a shell command must not see.
const SAFE_ENV_KEYS = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR', 'SHELL'] as const;

function buildSafeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

interface RunCommandArgs {
  command: string[];
}

function isRunCommandArgs(value: unknown): value is RunCommandArgs {
  if (typeof value !== 'object' || value === null) return false;
  const command = (value as Record<string, unknown>)['command'];
  return Array.isArray(command) && command.every((item) => typeof item === 'string');
}

export function createRunCommandTool(timeoutMs: number): Tool {
  return {
    name: 'run_command',
    description:
      'Run a command inside the working directory. Provide the executable and its arguments as separate array elements, never as a shell string. Requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'array',
          items: { type: 'string' },
          description: 'The executable followed by its arguments, e.g. ["ls", "-la"].',
        },
      },
      required: ['command'],
      additionalProperties: false,
    },
    risk: 'confirm',
    async run(args: unknown, ctx: ToolContext): Promise<string> {
      if (!isRunCommandArgs(args)) {
        throw new Error('Expected an object with a "command" field: an array of strings.');
      }
      const [executable, ...commandArgs] = args.command;
      if (!executable) {
        throw new Error('The "command" array must contain at least one element (the executable).');
      }

      const summary = `run_command ${JSON.stringify(args.command)}`;
      const detail = `argv: ${JSON.stringify(args.command)}\ncwd: ${ctx.workingDir}\ntimeout: ${timeoutMs}ms`;

      const approved = await ctx.confirm(summary, detail);
      if (!approved) {
        return `The user declined to run ${JSON.stringify(args.command)}. It was not executed.`;
      }

      return runProcess(executable, commandArgs, ctx, timeoutMs);
    },
  };
}

export const runCommandTool: Tool = createRunCommandTool(DEFAULT_TIMEOUT_MS);

function runProcess(executable: string, args: string[], ctx: ToolContext, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: ctx.workingDir,
      env: buildSafeEnv(),
      timeout: timeoutMs,
      signal: ctx.signal,
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).name === 'AbortError') {
        reject(error);
        return;
      }
      reject(new Error(`Failed to run "${executable}": ${error.message}`));
    });

    child.on('close', (code, signal) => {
      const status = signal ? `killed by ${signal}` : `exit code ${code ?? 'null'}`;
      resolve(`(${status})\n--- stdout ---\n${stdout || '(empty)'}\n--- stderr ---\n${stderr || '(empty)'}`);
    });
  });
}
