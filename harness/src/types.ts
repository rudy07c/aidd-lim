// harness/src/types.ts
// 共有型定義。Stage 0互換を維持しつつ、Stage 1 model/API provenanceを追加する。

export type ContextCondition = "full" | "simple-limited";
export type BackendType = "mock-noop" | "mock-oracle" | "anthropic" | "openai";
export type ModelProvider = "mock" | "anthropic" | "openai";
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

export type AgentExecutionStatus =
  | "ok"
  | "output-parse-failure"
  | "mutation-validation-failure"
  | "provider-error"
  | "tool-error";

export interface TokenUsage {
  input: number;
  output: number;
  cachedInput?: number;
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
  serviceTier: string | null;
  sdkVersion: string | null;
  retryPolicy: {
    maxRetries: number | null;
    timeoutMs: number | null;
  };
}

export interface NormalizedAgentError {
  category: "provider" | "tool" | "output-parse";
  message: string;
  retryable: boolean | null;
}

// ---- 設定 ----

export interface RunConfig {
  experimentId: string;
  lineageId: string;
  backend: BackendType;
  condition: ContextCondition;
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
  /** path -> 新しいファイル全体の内容。変更したファイルのみ含む */
  modifiedFiles: Record<string, string>;
  rawResponse: string;
  tokenUsage?: TokenUsage;
  latencyMs: number;
  executionStatus: Exclude<AgentExecutionStatus, "mutation-validation-failure">;
  explicitWorkingNote: string | null;
  modelProvenance: ModelProvenance;
  estimatedCostUsd: number | null;
  error: NormalizedAgentError | null;
}

// ---- Stage 0.5 測定結果型 ----

/** 1つのsemantic probeに対するagentの回答結果 */
export interface SemanticProbeResult {
  probeId: string;
  correct: boolean;
  agentAnswer: string;
  /** 正解を文字列に正規化したもの（boolean は "true"/"false"、set は ソート済みJSON） */
  correctAnswer: string;
}

/**
 * semantic elementの存在トレース（Present^syn / Present^beh の両軸）。
 * elementId は invariant/dependency/operation の ID（例: "I1", "D2", "O3"）。
 */
export interface SemanticElementTrace {
  /** syntactic presence: コード上にsemantic elementのsyntactic markerが存在するか */
  syntactic: Record<string, boolean>;
  /** behavioral presence: H(G)のmicro-testがそのelementのbehaviorを確認済みか */
  behavioral: Record<string, boolean>;
}

// ---- 1世代分のログ ----

export interface GenerationLog {
  experiment_id: string;
  lineage_id: string;
  generation: number;
  condition: ContextCondition;
  /** historical compatibility: requested model id */
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
