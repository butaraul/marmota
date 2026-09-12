import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { marmotaDir } from './config.js';
import type { Message, ToolCall } from './providers/types.js';

export class SessionError extends Error {}

const SESSIONS_TO_KEEP = 20;

export function sessionsDir(): string {
  return path.join(marmotaDir(), 'sessions');
}

function listSessionFiles(): string[] {
  const dir = sessionsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => path.join(dir, name));
}

/** Creates a fresh session file for this run and returns its path. */
export function createSessionFile(): string {
  const dir = sessionsDir();
  mkdirSync(dir, { recursive: true });
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  return path.join(dir, name);
}

/** The most recently created session file, if any. */
export function findLatestSessionFile(): string | undefined {
  const files = listSessionFiles();
  return files.length > 0 ? files[files.length - 1] : undefined;
}

export function saveSession(file: string, history: Message[]): void {
  writeFileSync(file, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
}

export function loadSession(file: string): Message[] {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (cause) {
    throw new SessionError(`Could not read session file ${file}: ${(cause as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new SessionError(`Session file ${file} is not valid JSON: ${(cause as Error).message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new SessionError(`Session file ${file} must contain a JSON array of messages.`);
  }
  return parsed.map((entry, i) => toMessage(entry, `${file}[${i}]`));
}

/** Deletes all but the most recent SESSIONS_TO_KEEP session files. */
export function pruneOldSessions(): void {
  const files = listSessionFiles();
  const excess = files.length - SESSIONS_TO_KEEP;
  if (excess <= 0) return;
  for (const file of files.slice(0, excess)) {
    rmSync(file, { force: true });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isToolCall(value: unknown): value is ToolCall {
  return isRecord(value) && typeof value['id'] === 'string' && typeof value['name'] === 'string' && 'args' in value;
}

function toMessage(value: unknown, at: string): Message {
  if (!isRecord(value) || typeof value['role'] !== 'string') {
    throw new SessionError(`${at} must be an object with a "role" field.`);
  }

  const role = value['role'];
  switch (role) {
    case 'system':
    case 'user':
      if (typeof value['content'] !== 'string') {
        throw new SessionError(`${at}: a "${role}" message needs a string "content".`);
      }
      return { role, content: value['content'] };

    case 'assistant': {
      if (typeof value['content'] !== 'string') {
        throw new SessionError(`${at}: an assistant message needs a string "content".`);
      }
      const toolCalls = value['toolCalls'];
      if (toolCalls !== undefined && (!Array.isArray(toolCalls) || !toolCalls.every(isToolCall))) {
        throw new SessionError(`${at}: "toolCalls" must be an array of tool calls.`);
      }
      return {
        role: 'assistant',
        content: value['content'],
        ...(toolCalls !== undefined ? { toolCalls: toolCalls as ToolCall[] } : {}),
      };
    }

    case 'tool':
      if (typeof value['toolCallId'] !== 'string' || typeof value['name'] !== 'string' || typeof value['content'] !== 'string') {
        throw new SessionError(`${at}: a tool message needs string "toolCallId", "name", and "content".`);
      }
      return { role: 'tool', toolCallId: value['toolCallId'], name: value['name'], content: value['content'] };

    default:
      throw new SessionError(`${at}: unknown role ${JSON.stringify(role)}.`);
  }
}
