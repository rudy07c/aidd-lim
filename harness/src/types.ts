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
  /** タスク固有テストの成功可否（visible + hidden両方が通ったか） */
  functional_task_result: boolean;

  // --- Stage 0.5以降で追加 ---
  semantic_probe_results: null;
  semantic_element_trace: null;

  // --- パフォーマンス ---
  latency_ms: number;
  token_usage: { input: number; output: number } | null;
  cost: number | null;

  // --- 契約違反フラグ ---
  /** protocol_adapter.ts の固定エクスポートが壊れていたか */
  protocol_contract_violated: boolean;
}
