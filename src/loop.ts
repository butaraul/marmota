import { ToolValidationError, validateArgs } from './tools/index.js';
import type { Tool, ToolContext } from './tools/types.js';
import type { Message, ModelReply, Provider, ToolCall } from './providers/types.js';

export const MAX_ITERATIONS = 25;
export const MAX_TOOL_RESULT_CHARS = 30_000;
const MAX_REPEATED_IDENTICAL_CALLS = 3;

export class LoopLimitError extends Error {}
export class StuckLoopError extends Error {}

export interface LoopEvents {
  onToolCall?(call: ToolCall): void;
  onToolResult?(call: ToolCall, result: string, ok: boolean): void;
}

export interface RunTurnOptions {
  provider: Provider;
  tools: Tool[];
  history: Message[];
  ctx: ToolContext;
  events?: LoopEvents;
}

/**
 * Runs the agent loop for one user message: send history to the model,
 * execute any tool calls it asks for, feed results back, repeat until the
 * model produces a final text reply or a safety limit trips.
 */
export async function runTurn(userMessage: string, options: RunTurnOptions): Promise<string> {
  const { provider, tools, history, ctx, events } = options;
  history.push({ role: 'user', content: userMessage });

  let previousCall: ToolCall | undefined;
  let repeatCount = 0;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const reply: ModelReply = await provider.chat(history, tools, ctx.signal);

    if (reply.kind === 'text') {
      history.push({ role: 'assistant', content: reply.text });
      return reply.text;
    }

    history.push({ role: 'assistant', content: '', toolCalls: reply.calls });

    for (const call of reply.calls) {
      repeatCount = previousCall && isSameCall(previousCall, call) ? repeatCount + 1 : 1;
      previousCall = call;

      if (repeatCount >= MAX_REPEATED_IDENTICAL_CALLS) {
        throw new StuckLoopError(
          `The model called "${call.name}" with identical arguments ${MAX_REPEATED_IDENTICAL_CALLS} times in a row. Stopping.`,
        );
      }

      events?.onToolCall?.(call);
      const result = await executeToolCall(call, tools, ctx);
      events?.onToolResult?.(call, result.content, result.ok);
      history.push({ role: 'tool', toolCallId: call.id, name: call.name, content: result.content });
    }
  }

  throw new LoopLimitError(`Reached the maximum of ${MAX_ITERATIONS} tool-use iterations without a final answer.`);
}

async function executeToolCall(
  call: ToolCall,
  tools: Tool[],
  ctx: ToolContext,
): Promise<{ content: string; ok: boolean }> {
  const tool = tools.find((t) => t.name === call.name);
  if (!tool) {
    return { content: `Error: unknown tool "${call.name}".`, ok: false };
  }

  const args = call.args ?? {};

  try {
    validateArgs(tool.parameters, args);
  } catch (cause) {
    const message = cause instanceof ToolValidationError ? cause.message : String(cause);
    return { content: `Error: invalid arguments for "${call.name}": ${message}`, ok: false };
  }

  try {
    return { content: truncate(await tool.run(args, ctx)), ok: true };
  } catch (cause) {
    // A user-cancelled turn (Ctrl-C during the tool or a pending confirmation)
    // must abort the whole turn, not come back as a tool result the model sees.
    if (cause instanceof Error && cause.name === 'AbortError') {
      throw cause;
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    return { content: `Error: ${message}`, ok: false };
  }
}

function truncate(text: string): string {
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  const omitted = text.length - MAX_TOOL_RESULT_CHARS;
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n[truncated, ${omitted} characters omitted]`;
}

function isSameCall(a: ToolCall, b: ToolCall): boolean {
  return a.name === b.name && deepEqual(a.args, b.args);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}
