// harness/src/types.ts
// 共有型定義。Stage 0互換を維持しつつ、Stage 1 model/API provenanceを追加する。

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
  // Stage 0 historical conditions. Do not remove or silently reinterpret.
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

  // Stage 1: Axis A — Inheritance / Transmission.
  MOI: {
    name: "MOI",
    axis: "axis-a-inheritance-transmission",
    inheritance: "artifact-plus-observable-history",
    inheritsObservableHistory: true,
    repositoryAccess: "full",
    // MOI has no B_work working-set limit, but its one-generation observable
    // interaction record is operationally bounded by common episode/tool/output limits.
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

  // Artifact-Full is the hub shared by both research axes.
  AF: {
    name: "AF",
    axis: "hub",
    inheritance: "artifact-only",
    inheritsObservableHistory: false,
    repositoryAccess: "full",
    budget: { kind: "none", finite: false },
    legacy: false,
  },

  // Stage 1: Axis B — Observation / Retrieval.
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

// ---- 設定 ----

export interface RunConfig {
  experimentId: string;
  lineageId: string;
  /** runの科学的位置づけ。freeze gateはstage名ではなくこの値で判定する。 */
  runClass: RunClass;
  backend: BackendType;
  /** config/logにはstable identifierを保存し、runtime metadataはgetContextCondition()で参照する。 */
  condition: ContextConditionName;
  /** 1世代あたりのtoken budget（"full"は全ファイルを渡す） */
  contextBudget: number | "full";
  generations: number;
  /** 使用するtask IDのリスト。Stage 1/2 scientific runでは循環再利用しない */
  tasks: string[];
  /** requested model identifier */
  model?: string;
  /** OpenAI reasoning effort。Stage 1 OpenAI runでは明示freezeする */
  reasoningEffort?: ReasoningEffort;
  /** responseあたりのmax output（reasoning tokensを含む） */
  maxOutputTokens?: number;
  /** provider SDK timeout */
  requestTimeoutMs?: number;
  /** provider SDK retry回数 */
  maxRetries?: number;
  /** OpenAI Responsesをserver-side storeするか。Stage 1ではfalse固定 */
  storeResponses?: boolean;
  /** 1 episode内のfunction-tool continuation上限 */
  maxToolRounds?: number;
  /** requested service tier。primary Sync runではdefaultを明示する */
  serviceTier?: OpenAIServiceTier;
  /** GPT-5.6 prompt caching mode。Stage 1では明示freezeする */
  promptCacheMode?: PromptCacheMode;
  /** Stageディレクトリ名（例: "stage0"）。runs/<stage>/ 配下に出力する */
  stage?: string;
  /** synthetic-world ディレクトリへの絶対パス */
  syntheticWorldDir: string;
  /** runs/ ディレクトリへの絶対パス */
  runsDir: string;
}

// ---- テスト結果 ----

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
  /** jest が出力した生のJSON */
  rawJestOutput: unknown;
  /** テスト実行そのものに失敗した場合のエラー（jest起動失敗等） */
  executionError?: string;
}

// ---- エージェント結果 ----

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

// ---- Stage 0.5 測定結果型 ----

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

// ---- 1世代分のログ ----

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
  context_contents: Record<string, string>;
  agent_prompt: string;
  agent_response: string;
  observable_assistant_messages: string[];
  explicit_working_note: string | null;
  tool_calls: unknown[];
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
