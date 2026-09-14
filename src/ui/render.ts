import { stdout } from 'node:process';

// Sampled directly from docs/logo.png so the terminal palette matches the real mark.
const CHARCOAL: [number, number, number] = [46, 42, 38];
const CREAM: [number, number, number] = [239, 228, 210];
const GOLD: [number, number, number] = [184, 131, 74];
const GRAY: [number, number, number] = [130, 128, 122];

export function colorEnabled(): boolean {
  return stdout.isTTY === true && !process.env['NO_COLOR'];
}

function truecolor([r, g, b]: [number, number, number], text: string): string {
  return colorEnabled() ? `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m` : text;
}

export const gold = (text: string): string => truecolor(GOLD, text);
export const cream = (text: string): string => truecolor(CREAM, text);
export const gray = (text: string): string => truecolor(GRAY, text);

export function bold(text: string): string {
  return colorEnabled() ? `\x1b[1m${text}\x1b[0m` : text;
}

export function dim(text: string): string {
  return colorEnabled() ? `\x1b[2m${text}\x1b[0m` : text;
}

// 14x14 downsample of the icon mark in docs/logo.png, rendered as 7 rows of
// half-blocks (▀) with independent 24-bit foreground/background per cell for
// 2x vertical resolution. Generated once from the real asset, not at runtime.
const LOGO_ICON: string[] = [
  '\x1b[38;2;46;42;38m\x1b[48;2;46;42;38m▀\x1b[38;2;46;42;38m\x1b[48;2;50;45;41m▀\x1b[38;2;48;45;41m\x1b[48;2;42;39;35m▀\x1b[38;2;49;45;40m\x1b[48;2;35;31;28m▀\x1b[38;2;48;44;40m\x1b[48;2;36;32;29m▀\x1b[38;2;47;43;39m\x1b[48;2;41;37;34m▀\x1b[38;2;48;44;40m\x1b[48;2;38;35;31m▀\x1b[38;2;48;44;40m\x1b[48;2;38;35;31m▀\x1b[38;2;47;43;39m\x1b[48;2;41;37;34m▀\x1b[38;2;48;44;40m\x1b[48;2;36;32;29m▀\x1b[38;2;49;45;40m\x1b[48;2;35;31;28m▀\x1b[38;2;48;45;41m\x1b[48;2;42;39;35m▀\x1b[38;2;46;42;38m\x1b[48;2;50;45;41m▀\x1b[38;2;46;42;38m\x1b[48;2;46;42;38m▀\x1b[0m',
  '\x1b[38;2;47;43;39m\x1b[48;2;50;45;41m▀\x1b[38;2;43;39;35m\x1b[48;2;31;28;25m▀\x1b[38;2;64;60;54m\x1b[48;2;163;155;142m▀\x1b[38;2;181;172;158m\x1b[48;2;255;254;234m▀\x1b[38;2;164;156;143m\x1b[48;2;247;235;217m▀\x1b[38;2;63;58;53m\x1b[48;2;229;218;201m▀\x1b[38;2;82;76;70m\x1b[48;2;241;230;212m▀\x1b[38;2;82;76;70m\x1b[48;2;241;230;212m▀\x1b[38;2;63;58;53m\x1b[48;2;229;218;201m▀\x1b[38;2;164;156;143m\x1b[48;2;247;235;217m▀\x1b[38;2;181;172;158m\x1b[48;2;255;254;234m▀\x1b[38;2;64;60;54m\x1b[48;2;163;155;142m▀\x1b[38;2;43;39;35m\x1b[48;2;31;28;25m▀\x1b[38;2;47;43;39m\x1b[48;2;50;45;41m▀\x1b[0m',
  '\x1b[38;2;48;44;40m\x1b[48;2;46;42;38m▀\x1b[38;2;35;32;28m\x1b[48;2;45;41;37m▀\x1b[38;2;124;117;107m\x1b[48;2;44;40;36m▀\x1b[38;2;243;232;214m\x1b[48;2;210;200;184m▀\x1b[38;2;235;224;206m\x1b[48;2;247;236;217m▀\x1b[38;2;242;231;213m\x1b[48;2;236;226;208m▀\x1b[38;2;239;228;210m\x1b[48;2;239;228;210m▀\x1b[38;2;239;228;210m\x1b[48;2;239;228;210m▀\x1b[38;2;242;231;213m\x1b[48;2;236;226;208m▀\x1b[38;2;235;224;206m\x1b[48;2;247;236;217m▀\x1b[38;2;243;232;214m\x1b[48;2;210;200;184m▀\x1b[38;2;124;117;107m\x1b[48;2;44;40;36m▀\x1b[38;2;35;32;28m\x1b[48;2;45;41;37m▀\x1b[38;2;48;44;40m\x1b[48;2;46;42;38m▀\x1b[0m',
  '\x1b[38;2;47;43;39m\x1b[48;2;47;43;39m▀\x1b[38;2;41;38;34m\x1b[48;2;42;38;34m▀\x1b[38;2;64;60;54m\x1b[48;2;63;58;53m▀\x1b[38;2;239;228;210m\x1b[48;2;233;222;205m▀\x1b[38;2;207;197;182m\x1b[48;2;228;217;200m▀\x1b[38;2;58;54;49m\x1b[48;2;169;161;148m▀\x1b[38;2;224;214;197m\x1b[48;2;230;220;202m▀\x1b[38;2;224;214;197m\x1b[48;2;230;220;202m▀\x1b[38;2;58;54;49m\x1b[48;2;169;161;148m▀\x1b[38;2;207;197;182m\x1b[48;2;228;217;200m▀\x1b[38;2;239;228;210m\x1b[48;2;233;222;205m▀\x1b[38;2;64;60;54m\x1b[48;2;63;58;53m▀\x1b[38;2;41;37;34m\x1b[48;2;42;38;34m▀\x1b[38;2;47;43;39m\x1b[48;2;47;43;39m▀\x1b[0m',
  '\x1b[38;2;46;42;38m\x1b[48;2;46;42;38m▀\x1b[38;2;47;43;39m\x1b[48;2;48;44;40m▀\x1b[38;2;40;36;32m\x1b[48;2;36;32;29m▀\x1b[38;2;195;186;171m\x1b[48;2;100;94;86m▀\x1b[38;2;253;243;224m\x1b[48;2;252;241;222m▀\x1b[38;2;237;226;208m\x1b[48;2;232;222;204m▀\x1b[38;2;64;59;54m\x1b[48;2;125;118;108m▀\x1b[38;2;64;59;54m\x1b[48;2;125;118;108m▀\x1b[38;2;237;226;208m\x1b[48;2;232;222;204m▀\x1b[38;2;253;243;224m\x1b[48;2;252;241;222m▀\x1b[38;2;195;185;171m\x1b[48;2;99;93;86m▀\x1b[38;2;40;36;32m\x1b[48;2;36;32;29m▀\x1b[38;2;47;43;39m\x1b[48;2;48;44;40m▀\x1b[38;2;46;42;38m\x1b[48;2;46;42;38m▀\x1b[0m',
  '\x1b[38;2;46;42;38m\x1b[48;2;46;41;38m▀\x1b[38;2;46;42;38m\x1b[48;2;47;43;39m▀\x1b[38;2;48;44;40m\x1b[48;2;46;42;38m▀\x1b[38;2;35;32;28m\x1b[48;2;47;43;39m▀\x1b[38;2;127;120;110m\x1b[48;2;35;32;28m▀\x1b[38;2;241;229;211m\x1b[48;2;76;71;65m▀\x1b[38;2;200;190;175m\x1b[48;2;93;87;80m▀\x1b[38;2;200;190;175m\x1b[48;2;93;87;80m▀\x1b[38;2;241;230;211m\x1b[48;2;76;71;65m▀\x1b[38;2;127;120;110m\x1b[48;2;35;32;28m▀\x1b[38;2;35;32;28m\x1b[48;2;47;43;39m▀\x1b[38;2;48;44;40m\x1b[48;2;46;42;38m▀\x1b[38;2;46;42;38m\x1b[48;2;47;43;39m▀\x1b[38;2;46;42;38m\x1b[48;2;46;41;38m▀\x1b[0m',
  '\x1b[38;2;46;42;38m\x1b[48;2;46;42;38m▀\x1b[38;2;49;44;40m\x1b[48;2;46;42;38m▀\x1b[38;2;47;43;39m\x1b[48;2;47;44;39m▀\x1b[38;2;46;42;38m\x1b[48;2;46;42;38m▀\x1b[38;2;48;44;40m\x1b[48;2;46;42;38m▀\x1b[38;2;39;36;32m\x1b[48;2;48;44;40m▀\x1b[38;2;38;34;31m\x1b[48;2;48;44;40m▀\x1b[38;2;38;34;31m\x1b[48;2;48;44;40m▀\x1b[38;2;39;36;32m\x1b[48;2;48;44;40m▀\x1b[38;2;48;44;40m\x1b[48;2;46;42;38m▀\x1b[38;2;46;42;38m\x1b[48;2;46;42;38m▀\x1b[38;2;47;43;39m\x1b[48;2;47;44;39m▀\x1b[38;2;49;44;40m\x1b[48;2;46;42;38m▀\x1b[38;2;46;42;38m\x1b[48;2;46;42;38m▀\x1b[0m',
];

/** The startup banner: icon on the left, wordmark and session info on the right. Plain text when color is off. */
export function renderBanner(info: { provider: string; model: string; workingDir: string }): string {
  if (!colorEnabled()) {
    return 'marmota -- type a message. Ctrl-C cancels a turn, Ctrl-D exits.';
  }

  const infoLines = ['', bold(gold('marmota')), gray('local agent runtime'), '', gray(`${info.provider} · ${info.model}`), gray(info.workingDir), ''];

  const rows = LOGO_ICON.map((iconRow, i) => `  ${iconRow}   ${infoLines[i] ?? ''}`);
  rows.push('');
  rows.push(gray('Type a message. Ctrl-C cancels a turn, Ctrl-D exits.'));
  return rows.join('\n');
}

/** Renders a confirmation prompt as a left-bordered block instead of a fixed-width box, so it never misaligns. */
export function renderConfirmBlock(summary: string, detail: string): string {
  if (!colorEnabled()) {
    const rule = '-'.repeat(60);
    return `\n${rule}\n${summary}\n${detail}\n${rule}`;
  }
  const bar = gold('│');
  const lines = detail.split('\n').map((line) => `${bar} ${line}`);
  return ['', gold(`╭─ ${summary}`), ...lines, gold('╰' + '─'.repeat(Math.max(2, summary.length + 2)))].join('\n');
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Starts an animated "thinking" indicator; returns a function that stops and clears it. No-op animation when not a TTY. */
export function startThinking(): () => void {
  if (!colorEnabled()) {
    stdout.write('thinking...\n');
    return () => {};
  }

  let frame = 0;
  stdout.write('\x1b[?25l');
  const timer = setInterval(() => {
    const glyph = SPINNER_FRAMES[frame % SPINNER_FRAMES.length]!;
    stdout.write(`\r${gold(glyph)} ${gray('thinking...')}`);
    frame++;
  }, 80);

  return () => {
    clearInterval(timer);
    stdout.write('\r\x1b[K\x1b[?25h');
  };
}

const SLEEPING_MARMOT = '(-ω-)zZ';

function promptBoxWidth(): number {
  return Math.max(20, Math.min(stdout.columns ?? 60, 100));
}

/** Top border of the input prompt box -- a sleeping marmot dozing on the rule. Empty string when color is off. */
export function renderPromptTop(): string {
  if (!colorEnabled()) return '';
  const label = ` ${SLEEPING_MARMOT} `;
  const dashes = Math.max(1, promptBoxWidth() - label.length - 1);
  return gold('╭─') + cream(label) + gold('─'.repeat(dashes) + '╮');
}

/** Bottom border of the input prompt box, printed once the user's line is submitted. Empty string when color is off. */
export function renderPromptBottom(): string {
  if (!colorEnabled()) return '';
  return gold('╰' + '─'.repeat(promptBoxWidth()) + '╯');
}

/** The `> ` prompt readline itself prints, left-bordered to match the box. */
export function renderPromptLabel(): string {
  return colorEnabled() ? `${gold('│')} ${gold('❯')} ` : '> ';
}

/** Styled `-> tool_name {...}` line for a tool call. */
export function renderToolCall(name: string, args: unknown): string {
  if (!colorEnabled()) {
    return `→ ${name} ${JSON.stringify(args)}`;
  }
  return `${gold('›')} ${bold(name)} ${gray(JSON.stringify(args))}`;
}
