// harness/src/agent-backend/types.ts
// AgentBackend インターフェース定義。

import { AgentExecutionStatus } from "../types";

export interface AgentInput {
  /** workerに渡すファイル群。path（repository/ 相対）-> content */
  contextFiles: Record<string, string>;
  /** 実験計画書 heldout_tasks.json の visibleInstruction */
  visibleInstruction: string;
  /** token budget。"full" = 制限なし */
  contextBudget: number | "full";
}

export interface AgentResult {
  /** 変更後のファイル内容（全体、差分ではない）。path -> content */
  modifiedFiles: Record<string, string>;
  /** agentの生応答テキスト */
  rawResponse: string;
  tokenUsage?: { input: number; output: number };
  latencyMs: number;
  /** model responseをmutationとして解釈できたか */
  executionStatus: Exclude<AgentExecutionStatus, "mutation-validation-failure">;
}

export interface AgentBackend {
  run(input: AgentInput): Promise<AgentResult>;
}
