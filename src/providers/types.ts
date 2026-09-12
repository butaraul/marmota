import type { Tool } from '../tools/types.js';

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export type ModelReply = { kind: 'text'; text: string } | { kind: 'tool_calls'; calls: ToolCall[] };

export interface Provider {
  id: string;
  chat(messages: Message[], tools: Tool[], signal: AbortSignal): Promise<ModelReply>;
}
