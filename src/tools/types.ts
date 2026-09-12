export interface JSONSchema {
  type?: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: unknown[];
  additionalProperties?: boolean;
  description?: string;
}

export interface ToolContext {
  workingDir: string;
  confirm(summary: string, detail: string): Promise<boolean>;
  signal: AbortSignal;
}

export interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  risk: 'safe' | 'confirm';
  run(args: unknown, ctx: ToolContext): Promise<string>;
}
