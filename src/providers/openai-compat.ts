import type { Tool } from '../tools/types.js';
import type { Message, ModelReply, Provider, ToolCall } from './types.js';

export class ProviderError extends Error {}

export interface OpenAiCompatConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

interface WireToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface WireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: WireToolCall[];
  tool_call_id?: string;
  name?: string;
}

/**
 * A Provider for any OpenAI-shaped /v1/chat/completions endpoint: Groq,
 * OpenRouter, Ollama's OpenAI-compatible route, and similar.
 */
export function createOpenAiCompatProvider(config: OpenAiCompatConfig): Provider {
  return {
    id: 'openai-compat',
    async chat(messages: Message[], tools: Tool[], signal: AbortSignal): Promise<ModelReply> {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (config.apiKey) {
        headers['authorization'] = `Bearer ${config.apiKey}`;
      }

      const requestBody = {
        model: config.model,
        messages: messages.map(toWireMessage),
        ...(tools.length > 0 ? { tools: tools.map(toWireTool) } : {}),
      };

      let response: Response;
      try {
        response = await fetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal,
        });
      } catch (cause) {
        if (cause instanceof Error && cause.name === 'AbortError') throw cause;
        throw new ProviderError(`Could not reach ${config.baseUrl}: ${(cause as Error).message}`);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new ProviderError(
          `Model provider returned ${response.status} ${response.statusText}${body ? `: ${body}` : ''}`,
        );
      }

      return toModelReply(await response.json());
    },
  };
}

function toWireMessage(message: Message): WireMessage {
  switch (message.role) {
    case 'system':
    case 'user':
      return { role: message.role, content: message.content };
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        ...(message.toolCalls ? { tool_calls: message.toolCalls.map(toWireToolCall) } : {}),
      };
    case 'tool':
      return {
        role: 'tool',
        content: message.content,
        tool_call_id: message.toolCallId,
        name: message.name,
      };
  }
}

function toWireToolCall(call: ToolCall): WireToolCall {
  return { id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) } };
}

function toWireTool(tool: Tool): unknown {
  return { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toModelReply(data: unknown): ModelReply {
  if (!isRecord(data) || !Array.isArray(data['choices'])) {
    throw new ProviderError('Model provider response was not in the expected shape (missing "choices").');
  }

  const first: unknown = data['choices'][0];
  if (!isRecord(first) || !isRecord(first['message'])) {
    throw new ProviderError('Model provider response did not include a message.');
  }

  const message = first['message'];
  const rawToolCalls = message['tool_calls'];

  if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
    return { kind: 'tool_calls', calls: rawToolCalls.map(toToolCall) };
  }

  const content = message['content'];
  return { kind: 'text', text: typeof content === 'string' ? content : '' };
}

function toToolCall(raw: unknown): ToolCall {
  if (!isRecord(raw) || typeof raw['id'] !== 'string' || !isRecord(raw['function'])) {
    throw new ProviderError(`Model provider returned a malformed tool call: ${JSON.stringify(raw)}`);
  }
  const fn = raw['function'];
  const name = fn['name'];
  const argsText = fn['arguments'];
  if (typeof name !== 'string' || typeof argsText !== 'string') {
    throw new ProviderError(`Model provider returned a malformed tool call: ${JSON.stringify(raw)}`);
  }

  let args: unknown = {};
  try {
    args = argsText.length > 0 ? JSON.parse(argsText) : {};
  } catch (cause) {
    throw new ProviderError(`Model returned malformed JSON arguments for tool "${name}": ${(cause as Error).message}`);
  }

  return { id: raw['id'], name, args };
}
