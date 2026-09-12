import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxError';
  }
}

/**
 * Resolves `requested` against `workingDir` and guarantees the result lies
 * inside `workingDir`. This is the only boundary between the agent and the
 * rest of the filesystem -- every tool that touches disk must go through it.
 */
export function safePath(workingDir: string, requested: string): string {
  if (requested.includes('\0')) {
    throw new SandboxError(`Path contains a null byte: ${JSON.stringify(requested)}`);
  }

  const root = realpathSync(workingDir);
  const normalized = path.resolve(root, requested);

  const ancestor = nearestExistingAncestor(normalized);
  const relativeFromAncestor = path.relative(ancestor.path, normalized);
  const resolved = path.normalize(path.join(ancestor.real, relativeFromAncestor));

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new SandboxError(
      `Path escapes the working directory: "${requested}" resolves to "${resolved}", which is outside "${root}".`,
    );
  }

  return resolved;
}

/**
 * Walks up from `target` until it finds a path that actually exists, then
 * returns both that path and its symlink-resolved real path. Needed because
 * a symlink further up the chain (e.g. a directory that doesn't exist yet,
 * created under a symlinked parent) can still smuggle the final path outside
 * the sandbox root.
 */
function nearestExistingAncestor(target: string): { path: string; real: string } {
  let current = target;
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      return { path: current, real: current };
    }
    current = parent;
  }
  return { path: current, real: realpathSync(current) };
}
