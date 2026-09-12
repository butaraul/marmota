import { stdout } from 'node:process';
import type { Interface } from 'node:readline/promises';

function colorEnabled(): boolean {
  return stdout.isTTY === true && !process.env['NO_COLOR'];
}

function dim(text: string): string {
  return colorEnabled() ? `\x1b[2m${text}\x1b[0m` : text;
}

function bold(text: string): string {
  return colorEnabled() ? `\x1b[1m${text}\x1b[0m` : text;
}

/**
 * Builds the ctx.confirm() used for one turn. Reuses the CLI's single
 * readline interface -- a second one attached to the same stdin would race
 * it for keystrokes -- and wires in the turn's AbortSignal so Ctrl-C cancels
 * a pending confirmation instead of leaving it stuck waiting for input.
 */
export function createConfirm(rl: Interface, signal: AbortSignal): (summary: string, detail: string) => Promise<boolean> {
  return async (summary: string, detail: string): Promise<boolean> => {
    const rule = dim('-'.repeat(60));
    console.log(`\n${rule}\n${bold(summary)}\n${detail}\n${rule}`);

    const answer = await rl.question('Proceed? [y/N] ', { signal });
    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  };
}
