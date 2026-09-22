// harness/src/types.ts
// 共有型定義。Stage 0互換を維持しつつ、Stage 1 model/API provenanceを追加する。

import type {
  ObservableInteractionRecord,
  OperationalFullFeasibility,
} from "./context/observable-interaction";
import type { RetrievedGenerationLog } from "./context/retrieved-generation-log";
import type { ElStaticExposureLog } from "./context/el-static-exposure";

/**
 * Config / log上で永続化するcondition identifier。
 * Stage 0 historical configとの後方互換性のため legacy 2値を削除しない。
 */
export const CONTEXT_CONDITION_NAMES = [
  "full",
  "simple-limited",
  "MOI",
  "AF",
  "EL",
  "PR",
  "AR",
] as const;
export type ContextConditionName = (typeof CONTEXT_CONDITION_NAMES)[number];
export type LegacyContextConditionName = "full" | "simple-limited";
export type Stage1ContextConditionName = "MOI" | "AF" | "EL" | "PR" | "AR";

export type ContextConditionAxis =
  | "axis-a-inheritance-transmission"
  | "axis-b-observation-retrieval"
  | "hub"
  | "legacy";

export type ContextInheritance =
  | "artifact-only"
  | "artifact-plus-observable-history";

export type ContextRepositoryAccess = "full" | "static-subset";

export type ContextBudget =
  | { kind: "none"; finite: false }
  | { kind: "observable-record"; finite: true }
  | { kind: "static-exposure"; finite: true }
  | { kind: "working-set"; finite: true }
  | { kind: "legacy-static-exposure"; finite: true };

/**
 * Runtimeで参照するcondition descriptor。
 * config上の識別子と、研究上のmechanism metadataを分離して保持する。
 */
export interface ContextCondition {
  name: ContextConditionName;
  axis: ContextConditionAxis;
  inheritance: ContextInheritance;
  inheritsObservableHistory: boolean;
  repositoryAccess: ContextRepositoryAccess;
  budget: ContextBudget;
  legacy: boolean;
}

export const CONTEXT_CONDITIONS: Readonly<Record<ContextConditionName, ContextCondition>> = {
  "full": {
    name: "full",
    axis: "legacy",
    inheritance: "artifact-only",
    inheritsObservableHistory: false,
    repositoryAccess: "full",
    budget: { kind: "none", finite: false },
    legacy: true,
  },
  "simple-limited": {
    name: "simple-limited",
    axis: "legacy",
    inheritance: "artifact-only",
    inheritsObservableHistory: false,
    repositoryAccess: "static-subset",
    budget: { kind: "legacy-static-exposure", finite: true },
    legacy: true,
  },
  MOI: {
    name: "MOI",
    axis: "axis-a-inheritance-transmission",
    inheritance: "artifact-plus-observable-history",
    inheritsObservableHistory: true,
    repositoryAccess: "full",
    budget: { kind: "observable-record", finite: true },
    legacy: false,
  },
  EL: {
    name: "EL",
    axis: "axis-a-inheritance-transmission",
    inheritance: "artifact-only",
    inheritsObservableHistory: false,
    repositoryAccess: "static-subset",
    budget: { kind: "static-exposure", finite: true },
    legacy: false,
  },
  AF: {
    name: "AF",
    axis: "hub",
    inheritance: "artifact-only",
    inheritsObservableHistory: false,
    repositoryAccess: "full",
    budget: { kind: "none", finite: false },
    legacy: false,
  },
  PR: {
    name: "PR",
    axis: "axis-b-observation-retrieval",
    inheritance: "artifact-only",
    inheritsObservableHistory: false,
    repositoryAccess: "full",
    budget: { kind: "working-set", finite: true },
    legacy: false,
  },
  AR: {
    name: "AR",
    axis: "axis-b-observation-retrieval",
    inheritance: "artifact-only",
    inheritsObservableHistory: false,
    repositoryAccess: "full",
    budget: { kind: "working-set", finite: true },
    legacy: false,
  },
};

export const STAGE1_CONTEXT_CONDITION_NAMES: readonly Stage1ContextConditionName[] = [
  "MOI",
  "AF",
  "EL",
  "PR",
  "AR",
];

export function getContextCondition(name: ContextConditionName): ContextCondition {
  return CONTEXT_CONDITIONS[name];
}

export function isStage1ContextConditionName(
  name: ContextConditionName
): name is Stage1ContextConditionName {
  return !CONTEXT_CONDITIONS[name].legacy;
}

export type BackendType = "mock-noop" | "mock-oracle" | "anthropic" | "openai";
export type ModelProvider = "mock" | "anthropic" | "openai";
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";
export type OpenAIServiceTier = "auto" | "default" | "flex" | "fast" | "priority" | "ultrafast";
export type PromptCacheMode = "implicit" | "explicit";
export type PricingMode = "sync" | "batch";
export type RunClass = "historical" | "smoke" | "scientific-calibration" | "scientific-main";

export type AgentExecutionStatus =
  | "ok"
  | "output-parse-failure"
  | "mutation-validation-failure"
  | "provider-error"
  | "tool-error"
  | "response-incomplete"
  | "response-failed"
  | "response-refusal"
  | "response-not-completed";

export interface TokenUsage {
  input: number;
  output: number;
  cachedInput?: number;
  cacheWriteInput?: number;
  reasoningOutput?: number;
  total?: number;
}

export interface ModelProvenance {
  provider: ModelProvider;
  requestedModel: string | null;
  actualModel: string | null;
  responseId: string | null;
  responseStatus: string | null;
  endpoint: "mock" | "messages" | "responses";
  reasoningEffort: ReasoningEffort | null;
  maxOutputTokens: number | null;
  structuredOutput: boolean;
  storeResponses: boolean | null;
  requestedServiceTier: OpenAIServiceTier | null;
  actualServiceTier: string | null;
  promptCacheMode: PromptCacheMode | null;
  promptVersion: string | null;
  promptHash: string | null;
  schemaVersion: string | null;
  schemaHash: string | null;
  pricingMode: PricingMode | null;
  continuationState: "none" | "encrypted-reasoning" | null;
  incompleteReason: string | null;
  refusal: string | null;
  providerErrorCode: string | null;
  sdkVersion: string | null;
  retryPolicy: {
    maxRetries: number | null;
    timeoutMs: number | null;
  };
}

export interface NormalizedAgentError {
  category: "provider" | "tool" | "output-parse" | "response";
  message: string;
  retryable: boolean | null;
}

export interface RunConfig {
  experimentId: string;
  lineageId: string;
  runClass: RunClass;
  backend: BackendType;
  condition: ContextConditionName;
  /** AF/MOI/legacy context budget, EL B_expose, or PR/AR B_work. */
  contextBudget: number | "full";
  /** EL ArtifactUnit selector granularity; freeze before any EL live execution. */
  staticExposureMaxTokensPerUnit?: number;
  generations: number;
  tasks: string[];
  model?: string;
  reasoningEffort?: ReasoningEffort;
  maxOutputTokens?: number;
  requestTimeoutMs?: number;
  maxRetries?: number;
  storeResponses?: boolean;
  maxToolRounds?: number;
  serviceTier?: OpenAIServiceTier;
  promptCacheMode?: PromptCacheMode;
  /** PR/AR E_max vector. Scientific values are calibrated in P6 and then frozen in config. */
  maxRetrievalOperations?: number;
  maxCumulativeRetrievedTokens?: number;
  maxModelCalls?: number;
  maxDecisionRounds?: number;
  stage?: string;
  syntheticWorldDir: string;
  runsDir: string;
}

export interface TestCaseResult {
  testName: string;
  passed: boolean;
  error?: string;
}

export interface TestSuiteResult {
  passed: boolean;
  numPassed: number;
  numFailed: number;
  testCases: TestCaseResult[];
  rawJestOutput: unknown;
  executionError?: string;
}

export interface AgentOutput {
  modifiedFiles: Record<string, string>;
  rawResponse: string;
  observableAssistantMessages: string[];
  tokenUsage?: TokenUsage;
  latencyMs: number;
  executionStatus: Exclude<AgentExecutionStatus, "mutation-validation-failure">;
  explicitWorkingNote: string | null;
  modelProvenance: ModelProvenance;
  estimatedCostUsd: number | null;
  error: NormalizedAgentError | null;
}

export interface SemanticProbeResult {
  probeId: string;
  correct: boolean;
  agentAnswer: string;
  correctAnswer: string;
}

export interface SemanticElementTrace {
  syntactic: Record<string, boolean>;
  behavioral: Record<string, boolean>;
}

export interface GenerationLog {
  experiment_id: string;
  lineage_id: string;
  generation: number;
  condition: ContextConditionName;
  model: string | null;
  model_provenance: ModelProvenance;
  task_id: string;
  repository_before: Record<string, string>;
  repository_after: Record<string, string>;
  git_diff: string;
  context_budget: number | "full";
  actual_context_tokens: number;
  /** Present for task-aware EL static exposure; absent/null for other conditions and historical logs. */
  static_exposure_log?: ElStaticExposureLog | null;
  context_contents: Record<string, string>;
  agent_prompt: string;
  agent_response: string;
  observable_assistant_messages: string[];
  explicit_working_note: string | null;
  tool_calls: unknown[];
  observable_interaction_record: ObservableInteractionRecord;
  inherited_observable_interaction_hash: string | null;
  operational_full_feasibility: OperationalFullFeasibility;
  retrieved_episode_log: RetrievedGenerationLog | null;
  agent_execution_status: AgentExecutionStatus;
  agent_error: NormalizedAgentError | null;
  visible_test_results: TestSuiteResult;
  hidden_test_results: TestSuiteResult;
  task_specific_test_result: TestSuiteResult | null;
  functional_task_result: boolean;
  semantic_probe_results: SemanticProbeResult[] | null;
  semantic_element_trace: SemanticElementTrace | null;
  latency_ms: number;
  token_usage: TokenUsage | null;
  cost: number | null;
  protocol_contract_violated: boolean;
}
