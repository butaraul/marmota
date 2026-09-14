import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { Interface } from 'node:readline/promises';
import { renderConfirmBlock } from './render.js';

export function isInteractive(): boolean {
  return stdin.isTTY === true && stdout.isTTY === true;
}

export function abortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

// The non-interactive (piped) fallback reads its answers from a small line
// queue, slurped from stdin once and consumed one line per prompt, rather
// than issuing repeated readline.question() calls. That's not a style
// choice: on a piped (non-TTY) stdin, Node's readline delivers every
// buffered line to whichever 'line' listener is attached at the moment the
// pipe is drained, which in practice means only the *first* question() on
// an Interface ever gets an answer -- later calls hang forever, as if stdin
// had gone silent. Reading everything up front sidesteps that entirely.
// Shared with ui/select.ts's numbered fallback for the same reason.
let fallbackLines: string[] | undefined;
let fallbackLineIndex = 0;

export async function nextFallbackLine(prompt: string): Promise<string> {
  stdout.write(prompt);
  if (fallbackLines === undefined) {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    fallbackLines = Buffer.concat(chunks).toString('utf8').split('\n');
  }
  if (fallbackLineIndex >= fallbackLines.length) {
    throw new Error('No more input available on stdin to answer this prompt.');
  }
  const line = fallbackLines[fallbackLineIndex++]!.trim();
  stdout.write(`${line}\n`); // nothing else echoes it back for a piped stdin
  return line;
}

/**
 * Builds the ctx.confirm() used for one turn. Reuses the CLI's single
 * readline interface -- a second one attached to the same stdin would race
 * it for keystrokes -- and wires in the turn's AbortSignal so Ctrl-C cancels
 * a pending confirmation instead of leaving it stuck waiting for input.
 */
export function createConfirm(rl: Interface, signal: AbortSignal): (summary: string, detail: string) => Promise<boolean> {
  return async (summary: string, detail: string): Promise<boolean> => {
    console.log(renderConfirmBlock(summary, detail));

    const answer = await rl.question('Proceed? [y/N] ', { signal });
    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  };
}

/** A plain text question with an optional default. */
export async function promptText(question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const label = `${question}${suffix} `;

  const answer = isInteractive() ? await questionOnce(label) : await nextFallbackLine(label);
  return answer.length > 0 ? answer : (defaultValue ?? '');
}

/** A standalone yes/no prompt for the setup wizard (no per-turn AbortSignal to wire in). */
export async function confirmYesNo(question: string): Promise<boolean> {
  const label = `${question} [y/N] `;
  const answer = (isInteractive() ? await questionOnce(label) : await nextFallbackLine(label)).toLowerCase();
  return answer === 'y' || answer === 'yes';
}

/** A one-off readline interface for a single interactive (TTY) question. Safe to open and close per call. */
async function questionOnce(prompt: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
}

/** Reads a line without echoing keystrokes. Falls back to a plain (echoing) prompt when not a TTY. */
export async function promptSecret(question: string): Promise<string> {
  if (!isInteractive()) {
    return promptText(`${question} (input will be visible: not a terminal)`);
  }

  return new Promise((resolve, reject) => {
    stdout.write(question);
    let value = '';
    emitKeypressEvents(stdin);
    const wasRaw = stdin.isRaw ?? false;
    stdin.setRawMode(true);
    stdin.resume();

    const cleanup = (): void => {
      stdin.removeListener('keypress', onKeypress);
      stdin.setRawMode(wasRaw);
    };

    const onKeypress = (str: string | undefined, key: { name?: string; ctrl?: boolean }): void => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(abortError('Input cancelled.'));
      } else if (key.name === 'return') {
        cleanup();
        stdout.write('\n');
        resolve(value);
      } else if (key.name === 'backspace') {
        value = value.slice(0, -1);
      } else if (str && !key.ctrl) {
        value += str;
      }
    };

    stdin.on('keypress', onKeypress);
  });
}
