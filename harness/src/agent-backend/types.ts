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
  /** condition runnerが最終的にmodelへ提示すると決めたartifact evidence。backendは再truncateしない。 */
  contextFiles: Record<string, string>;
  visibleInstruction: string;
  /** historical backends向け。OpenAI Stage 1 backendはbudget authorityとして使用しない。 */
  contextBudget: number | "full";
  tools?: AgentTool[];
}

export interface AgentResult {
  modifiedFiles: Record<string, string>;
  rawResponse: string;
  /** workerが実際に生成したobservable assistant messages。MOI record生成で使用する。 */
  observableAssistantMessages: string[];
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
