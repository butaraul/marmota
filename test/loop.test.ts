import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTurn } from '../src/loop.js';
import type { Message, ModelReply, Provider, ToolCall } from '../src/providers/types.js';
import type { Tool, ToolContext } from '../src/tools/types.js';

function makeCtx(signal: AbortSignal = new AbortController().signal): ToolContext {
  return { workingDir: '/tmp', signal, confirm: async () => true };
}

function scriptedProvider(replies: ModelReply[]): Provider {
  let i = 0;
  return {
    id: 'scripted',
    async chat(): Promise<ModelReply> {
      const reply = replies[i];
      if (!reply) throw new Error('scripted provider ran out of replies');
      i++;
      return reply;
    },
  };
}

function callTool(name: string): ToolCall {
  return { id: `call-${name}`, name, args: {} };
}

test('a tool that throws produces a tool result the model can act on, and does not crash', async () => {
  const boom: Tool = {
    name: 'boom',
    description: 'always throws',
    parameters: { type: 'object' },
    risk: 'safe',
    async run(): Promise<string> {
      throw new Error('kaboom');
    },
  };

  const provider = scriptedProvider([
    { kind: 'tool_calls', calls: [callTool('boom')] },
    { kind: 'text', text: 'I saw the error and recovered.' },
  ]);

  const history: Message[] = [{ role: 'system', content: 'sys' }];
  const reply = await runTurn('do it', { provider, tools: [boom], history, ctx: makeCtx() });

  assert.equal(reply, 'I saw the error and recovered.');
  const toolMessage = history.find((m) => m.role === 'tool');
  assert.ok(toolMessage);
  assert.match((toolMessage as { content: string }).content, /Error: kaboom/);
});

test('an unknown tool call is reported back to the model instead of crashing', async () => {
  const provider = scriptedProvider([
    { kind: 'tool_calls', calls: [callTool('does_not_exist')] },
    { kind: 'text', text: 'ok' },
  ]);

  const history: Message[] = [{ role: 'system', content: 'sys' }];
  const reply = await runTurn('do it', { provider, tools: [], history, ctx: makeCtx() });

  assert.equal(reply, 'ok');
  const toolMessage = history.find((m) => m.role === 'tool');
  assert.match((toolMessage as { content: string }).content, /unknown tool/i);
});

test('a cancelled tool call aborts the turn instead of becoming a tool result', async () => {
  const controller = new AbortController();
  const cancelled: Tool = {
    name: 'cancelled',
    description: 'aborts mid-run',
    parameters: { type: 'object' },
    risk: 'safe',
    async run(): Promise<string> {
      controller.abort();
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      throw error;
    },
  };

  const provider = scriptedProvider([{ kind: 'tool_calls', calls: [callTool('cancelled')] }]);
  const history: Message[] = [{ role: 'system', content: 'sys' }];

  await assert.rejects(
    () => runTurn('do it', { provider, tools: [cancelled], history, ctx: makeCtx(controller.signal) }),
    (error: unknown) => error instanceof Error && error.name === 'AbortError',
  );
});

test('invalid tool arguments produce a validation error tool result, not a crash', async () => {
  const strict: Tool = {
    name: 'strict',
    description: 'requires a name',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    risk: 'safe',
    async run(): Promise<string> {
      return 'should not run';
    },
  };

  const provider = scriptedProvider([
    { kind: 'tool_calls', calls: [{ id: '1', name: 'strict', args: {} }] },
    { kind: 'text', text: 'done' },
  ]);

  const history: Message[] = [{ role: 'system', content: 'sys' }];
  await runTurn('do it', { provider, tools: [strict], history, ctx: makeCtx() });

  const toolMessage = history.find((m) => m.role === 'tool');
  assert.match((toolMessage as { content: string }).content, /invalid arguments/i);
});
