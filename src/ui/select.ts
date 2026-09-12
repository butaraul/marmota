import { cursorTo, emitKeypressEvents, moveCursor } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { abortError, bold, dim, isInteractive, nextFallbackLine } from './prompt.js';

export interface SelectOption<T> {
  label: string;
  value: T;
  hint?: string;
}

/** An arrow-key selection list, falling back to numbered input when not a TTY. */
export async function selectOne<T>(title: string, options: Array<SelectOption<T>>): Promise<T> {
  if (options.length === 0) {
    throw new Error(`No options available for "${title}".`);
  }
  console.log(bold(title));
  return isInteractive() ? selectWithArrowKeys(options) : selectByNumber(options);
}

async function selectByNumber<T>(options: Array<SelectOption<T>>): Promise<T> {
  options.forEach((opt, i) => {
    console.log(`  ${i + 1}) ${opt.label}${opt.hint ? dim(` -- ${opt.hint}`) : ''}`);
  });

  while (true) {
    const answer = await nextFallbackLine(`Enter a number (1-${options.length}): `);
    const index = Number.parseInt(answer, 10);
    if (Number.isInteger(index) && index >= 1 && index <= options.length) {
      return options[index - 1]!.value;
    }
    console.log(`"${answer}" is not a valid choice.`);
  }
}

async function selectWithArrowKeys<T>(options: Array<SelectOption<T>>): Promise<T> {
  return new Promise((resolve, reject) => {
    let index = 0;

    const render = (first: boolean): void => {
      if (!first) moveCursor(stdout, 0, -options.length);
      for (let i = 0; i < options.length; i++) {
        cursorTo(stdout, 0);
        stdout.write('\x1b[K');
        const opt = options[i]!;
        const marker = i === index ? '> ' : '  ';
        const label = i === index ? bold(opt.label) : opt.label;
        stdout.write(`${marker}${label}${opt.hint ? dim(` -- ${opt.hint}`) : ''}\n`);
      }
    };

    render(true);
    emitKeypressEvents(stdin);
    const wasRaw = stdin.isRaw ?? false;
    stdin.setRawMode(true);
    stdin.resume();

    const cleanup = (): void => {
      stdin.removeListener('keypress', onKeypress);
      stdin.setRawMode(wasRaw);
    };

    const onKeypress = (_str: string | undefined, key: { name?: string; ctrl?: boolean }): void => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(abortError('Selection cancelled.'));
      } else if (key.name === 'up' || key.name === 'k') {
        index = (index - 1 + options.length) % options.length;
        render(false);
      } else if (key.name === 'down' || key.name === 'j') {
        index = (index + 1) % options.length;
        render(false);
      } else if (key.name === 'return') {
        cleanup();
        resolve(options[index]!.value);
      } else if (key.name === 'escape' || key.name === 'q') {
        cleanup();
        reject(abortError('Selection cancelled.'));
      }
    };

    stdin.on('keypress', onKeypress);
  });
}
