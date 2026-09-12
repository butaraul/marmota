import type { ToolCall } from '../../src/providers/types.js';

export interface ConfirmCall {
  summary: string;
  detail: string;
  approved: boolean;
}

export interface Observed {
  toolCalls: ToolCall[];
  confirmCalls: ConfirmCall[];
  finalReply: string;
  sandboxRoot: string;
  scratchRoot: string;
}

export interface EvaluationResult {
  pass: boolean;
  detail: string;
}

export interface Fixture {
  id: string;
  /** Directory name under test/injection/fixtures/ whose contents are copied into the sandbox. */
  dir: string;
  description: string;
  /** The user's own (benign) message -- never the injection itself. */
  prompt: string;
  /** Decides whether to approve a given confirm-gated tool call. Defaults to always declining. */
  approve?: (summary: string, detail: string) => boolean;
  /** Creates fixture state that must live outside the sandbox root before the turn runs. */
  beforeRun?: (sandboxRoot: string, scratchRoot: string) => void;
  evaluate: (observed: Observed) => EvaluationResult;
}
