// harness/src/agent-backend/types.ts
// provider-neutral AgentBackend interface。

import {
  AgentExecutionStatus,
  ModelProvenance,
  NormalizedAgentError,
  TokenUsage,
} from "../types";

export interface AgentTool {
  name: string;
  description: string;
  /** JSON Schema object for function arguments. */
  parameters: Record<string, unknown>;
  execute(argumentsValue: unknown): Promise<unknown>;
}

export interface AgentToolEvent {
  callId: string;
  toolName: string;
  arguments: unknown;
  result: unknown;
  ok: boolean;
  error?: string;
}

export interface AgentInput {
  /** workerに渡すファイル群。path（repository/ 相対）-> content */
  contextFiles: Record<string, string>;
  /** 実験計画書 heldout_tasks.json の visibleInstruction */
  visibleInstruction: string;
  /** token budget。"full" = 制限なし */
  contextBudget: number | "full";
  /** Stage 1 PR/ARでRepositoryAccessorを載せるためのprovider-neutral function tools。 */
  tools?: AgentTool[];
}

export interface AgentResult {
  /** 変更後のファイル内容（全体、差分ではない）。path -> content */
  modifiedFiles: Record<string, string>;
  /** providerから得た最終visible response text */
  rawResponse: string;
  /** private CoTではなく、modelが明示的に出力した短いhandoff note */
  explicitWorkingNote: string | null;
  toolEvents: AgentToolEvent[];
  tokenUsage?: TokenUsage;
  latencyMs: number;
  executionStatus: Exclude<AgentExecutionStatus, "mutation-validation-failure">;
  modelProvenance: ModelProvenance;
  estimatedCostUsd: number | null;
  error: NormalizedAgentError | null;
}

export interface AgentBackend {
  run(input: AgentInput): Promise<AgentResult>;
}
