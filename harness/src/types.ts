// harness/src/types.ts
// 共有型定義。docs/experiment_plan_v1.6.md 3.1節のログスキーマに対応。

export type ContextCondition = "full" | "simple-limited";
export type BackendType = "mock-noop" | "mock-oracle" | "anthropic";

// ---- 設定 ----

export interface RunConfig {
  experimentId: string;
  lineageId: string;
  backend: BackendType;
  condition: ContextCondition;
  /** 1世代あたりのtoken budget（"full"は全ファイルを渡す） */
  contextBudget: number | "full";
  generations: number;
  /** 使用するtask IDのリスト。generations > tasks.length のときはラップアラウンド */
  tasks: string[];
  /** 使用するモデル名（anthropic backendのみ使用） */
  model?: string;
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
  tokenUsage?: { input: number; output: number };
  latencyMs: number;
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

// ---- 1世代分のログ（3.1節スキーマ） ----

export interface GenerationLog {
  // --- メタ ---
  experiment_id: string;
  lineage_id: string;
  generation: number;
  condition: ContextCondition;
  model: string | null;

  // --- タスク ---
  task_id: string;

  // --- リポジトリスナップショット ---
  repository_before: Record<string, string>; // path -> content
  repository_after: Record<string, string>;  // path -> content
  git_diff: string;                          // unified diff

  // --- コンテキスト ---
  context_budget: number | "full";
  actual_context_tokens: number;
  /** workerに実際に渡されたファイル群（path -> content） */
  context_contents: Record<string, string>;

  // --- エージェントI/O ---
  agent_prompt: string;
  agent_response: string;
  tool_calls: unknown[];

  // --- スコアリング ---
  visible_test_results: TestSuiteResult;
  hidden_test_results: TestSuiteResult;
  /** タスク固有テスト結果（新operationが実際に動作するかを検証） */
  task_specific_test_result: TestSuiteResult | null;
  /** visible + hidden + task_specific すべてが通ったか */
  functional_task_result: boolean;

  // --- Stage 0.5以降で追加 ---
  semantic_probe_results: SemanticProbeResult[] | null;
  semantic_element_trace: SemanticElementTrace | null;

  // --- パフォーマンス ---
  latency_ms: number;
  token_usage: { input: number; output: number } | null;
  cost: number | null;

  // --- 契約違反フラグ ---
  /** protocol_adapter.ts の固定エクスポートが壊れていたか */
  protocol_contract_violated: boolean;
}
