import { listFilesTool, readFileTool, writeFileTool } from './fs.js';
import { createRunCommandTool, runCommandTool } from './shell.js';
import type { JSONSchema, Tool } from './types.js';

export const tools: Tool[] = [listFilesTool, readFileTool, writeFileTool, runCommandTool];

/** Builds the tool set with run_command's timeout taken from the user's config. */
export function buildTools(commandTimeoutMs: number): Tool[] {
  return [listFilesTool, readFileTool, writeFileTool, createRunCommandTool(commandTimeoutMs)];
}

export class ToolValidationError extends Error {}

/**
 * A minimal, hand-rolled JSON Schema validator covering the subset of
 * schema used by marmota's tool definitions (object/string/number/boolean/
 * array, properties, required, enum, additionalProperties). Models send
 * malformed tool arguments regularly; this turns that into a clear error
 * fed back to the model instead of a crash.
 */
export function validateArgs(schema: JSONSchema, value: unknown): void {
  const errors = collectSchemaErrors(schema, value, 'args');
  if (errors.length > 0) {
    throw new ToolValidationError(errors.join('; '));
  }
}

function collectSchemaErrors(schema: JSONSchema, value: unknown, at: string): string[] {
  switch (schema.type) {
    case 'object':
      return collectObjectErrors(schema, value, at);
    case 'string':
      return collectStringErrors(schema, value, at);
    case 'number':
      return typeof value === 'number' ? [] : [`${at} must be a number`];
    case 'boolean':
      return typeof value === 'boolean' ? [] : [`${at} must be a boolean`];
    case 'array':
      return collectArrayErrors(schema, value, at);
    default:
      return [];
  }
}

function collectObjectErrors(schema: JSONSchema, value: unknown, at: string): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [`${at} must be an object`];
  }

  const errors: string[] = [];
  const obj = value as Record<string, unknown>;
  const properties = schema.properties ?? {};

  for (const key of schema.required ?? []) {
    if (!(key in obj)) {
      errors.push(`${at}.${key} is required`);
    }
  }

  for (const [key, propSchema] of Object.entries(properties)) {
    if (key in obj) {
      errors.push(...collectSchemaErrors(propSchema, obj[key], `${at}.${key}`));
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(obj)) {
      if (!(key in properties)) {
        errors.push(`${at}.${key} is not a recognised field`);
      }
    }
  }

  return errors;
}

function collectStringErrors(schema: JSONSchema, value: unknown, at: string): string[] {
  if (typeof value !== 'string') {
    return [`${at} must be a string`];
  }
  if (schema.enum && !schema.enum.includes(value)) {
    return [`${at} must be one of ${JSON.stringify(schema.enum)}`];
  }
  return [];
}

function collectArrayErrors(schema: JSONSchema, value: unknown, at: string): string[] {
  if (!Array.isArray(value)) {
    return [`${at} must be an array`];
  }
  if (!schema.items) {
    return [];
  }
  const items = schema.items;
  return value.flatMap((item, index) => collectSchemaErrors(items, item, `${at}[${index}]`));
}
