// calibration/src/calibration-runner.ts
//
// Phase 3: mock-noop / mock-oracle で系統1・系統2のパイプラインを通す。
// Phase 4: anthropic バックエンドで実際のAIを使った較正を実行する。
// （docs/stage0_5_plan.md Phase 3・4参照）
//
// 系統1（意味的再構成, R^sem_B）:
//   - budget-assembler で context を構築
//   - probe-bank.json 全問をまとめて「回答」させる
//     * mock: 全問空回答 → Phase 4では real agent に差し替え
//   - probe-scorer.ts で採点
//
// 系統2（機能的継続, M̂_B）:
//   - 各 held-out task に対して agent を呼び出す
//   - 【backendごとのcontext渡し方の違い】
//     * mock-noop / mock-oracle: full repository を backend に渡す
//       （oracle は context に関係なく正解実装を生成するため、
//       budget-limited context を渡すと oracle patch が broken になる。
//       noop も context 不問で何もしない）
//     * anthropic: budget-assembler で構築した limited context を agent に渡す
//       （有限 context の効果を実際に測るための設計。Stage 0 の
//       orchestrator.ts と同じパターン）
//   - agentが返した modifiedFiles を full repository にマージしてから runScoring()
//   - visible/hidden/task-specific test + 契約違反判定を一括取得

import * as fs from "fs";
import * as path from "path";

import Anthropic from "@anthropic-ai/sdk";
import { assembleContext, ALL_BUDGETS, BudgetValue, AssemblyMode } from "./budget-assembler";
import { scoreProbes, summarizeScores } from "./probe-scorer";
import type { GeneratedProbe } from "./probe-generator";
import { runScoring } from "../../harness/src/scoring";
import { MockNoopBackend } from "../../harness/src/agent-backend/mock-noop";
import { MockOracleBackend } from "../../harness/src/agent-backend/mock-oracle";
import { AnthropicBackend } from "../../harness/src/agent-backend/anthropic";
import type { AgentBackend } from "../../harness/src/agent-backend/types";
import type { TestCaseResult } from "../../harness/src/types";

// ---- 公開型 ----

export type CalibrationBackend = "mock-noop" | "mock-oracle" | "anthropic";

export interface CalibrationOptions {
  backend: CalibrationBackend;
  budgets?: BudgetValue[];
  /** anthropic backend でのみ使用するモデル名 */
  model?: string;
  /** 実行するtaskIdのリスト。省略時は全タスク */
  taskFilter?: string[];
}

export interface System1TaskResult {
  probeId: string;
  type: string;
  correct: boolean;
  agentAnswer: string;
  correctAnswer: string;
  parseError?: string;
}

export interface System1BudgetResult {
  budget: BudgetValue;
  contextTokens: number;
  numCorrect: number;
  numTotal: number;
  accuracy: number;
  /**
   * R^sem_B の主指標（boolean型プローブのみ）。
   *
   * mc/stp型はprotocol_adapter.tsのoperationTableや命名規則から
   * コードを読まずに回答できることが判明（F9: 構造的類推問題）。
   * boolean型（invariant違反チェック）はコードを読まなければ解けないため、
   * コードへの意味理解を測定する主指標として採用。
   *
   * mc/stpはリファレンスとして引き続き記録するが主指標には含めない。
   */
  boolNumCorrect: number;
  boolNumTotal: number;
  boolAccuracy: number;
  byType: Record<string, { total: number;  correct: number; accuracy: number }>;
  probeDetails: System1TaskResult[];
  /** anthropic backend のみ。API呼び出し1回分の所要時間（ms） */
  latencyMs?: number;
  /** anthropic backend のみ。API呼び出し1回分のトークン使用量 */
  tokenUsage?: { input: number; output: number };
  // ログ用詳細データ（anthropic backend のみ）
  contextFiles?: Record<string, string>;
  /** バッチごとの送信プロンプト（[batch0, batch1, ...]） */
  agentPromptBatches?: string[];
  /** バッチごとの受信レスポンス（[batch0, batch1, ...]） */
  agentResponseBatches?: string[];
}

export interface System2TaskResult {
  taskId: string;
  passed: boolean;
  visiblePassed: number;
  visibleTotal: number;
  hiddenPassed: number;
  hiddenTotal: number;
  taskSpecificPassed: number | null;
  taskSpecificTotal: number | null;
  protocolContractViolated: boolean;
  latencyMs?: number;
  tokenUsage?: { input: number; output: number };
  error?: string;
  // ログ用詳細データ（anthropic backend のみ）
  agentResponse?: string;
  contextFiles?: Record<string, string>;
  repositoryAfter?: Record<string, string>;
  visibleTestCases?: TestCaseResult[];
  hiddenTestCases?: TestCaseResult[];
  taskSpecificTestCases?: TestCaseResult[];
}

export interface System2BudgetResult {
  budget: BudgetValue;
  contextTokens: number;
  passRate: number;
  numPassed: number;
  numTotal: number;
  taskResults: System2TaskResult[];
}

export interface CalibrationRunResult {
  backend: CalibrationBackend;
  system1: System1BudgetResult[];
  system2: System2BudgetResult[];
}

// ---- ファイルロードユーティリティ ----

function loadDirRecursive(
  dir: string,
  baseDir: string,
  out: Record<string, string>
): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadDirRecursive(fullPath, baseDir, out);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      const rel = path.relative(baseDir, fullPath).replace(/\\/g, "/");
      out[rel] = fs.readFileSync(fullPath, "utf8");
    }
  }
}

// ---- 系統1: セマンティックプローブ採点 ----

const PROBE_SYSTEM_PROMPT = `You are answering questions about a TypeScript software system.
Study the provided repository files carefully and answer every question using only what you can infer from the code.
Do not guess or use outside knowledge. If the answer cannot be determined from the code, pick the most plausible option.`;

/**
 * 全probeを1つのユーザーメッセージに整形する。
 * 選択肢形式のタイプ（multiple_choice / set_selection / graph_edge_prediction /
 * state_transition_prediction）はoptionsを列挙する。
 * booleanは "true" or "false" のみ。
 */
function buildProbePrompt(
  contextSection: string,
  probes: GeneratedProbe[]
): string {
  const questionLines: string[] = [];

  for (let i = 0; i < probes.length; i++) {
    const p = probes[i];
    const lines: string[] = [`[Q${i + 1}] ${p.probeId} (${p.type})`];
    lines.push(p.prompt);

    if (p.type === "boolean") {
      lines.push(`Answer format: "true" or "false"`);
    } else if (p.type === "set_selection") {
      lines.push(`Options: ${(p.options ?? []).join(", ")}`);
      lines.push(`Answer format: JSON array of selected options, e.g. ["A","B"]`);
    } else if (p.options && p.options.length > 0) {
      // graph_edge_prediction（選択肢あり）
      lines.push(`Options: ${p.options.join(", ")}`);
      lines.push(`Answer format: one of the option strings exactly as listed`);
    } else {
      // multiple_choice / state_transition_prediction（記述式）: 設問文に指示が含まれる
      lines.push(`Answer format: a single exact string as described in the question (function name or state/result)`);
    }

    questionLines.push(lines.join("\n"));
  }

  const exampleId = probes[0]?.probeId ?? "probe-id";
  return `${contextSection}

QUESTIONS:
${questionLines.join("\n\n")}

OUTPUT FORMAT:
Respond with a JSON object inside <probe_answers> tags. Keys are probe IDs (exactly as shown), values are answers.
- multiple_choice / state_transition_prediction (記述式): answer is a string (exact function name, state name, or "operation fails" as described in the question)
- graph_edge_prediction: answer is a string (exact option from the listed options)
- boolean: answer is "true" or "false"
- set_selection: answer is a JSON array of selected option strings

Example:
<probe_answers>
{
  "${exampleId}": "someOption"
}
</probe_answers>

Now answer all ${probes.length} questions:`;
}

interface ProbeAPIResult {
  answers: Record<string, string>;
  latencyMs: number;
  tokenUsage: { input: number; output: number };
  promptBatches: string[];
  responseBatches: string[];
}

/** probe数が増えても max_tokens 超過で出力が切れないよう、バッチ分割する単位 */
const PROBE_BATCH_SIZE = 20;

/**
 * Anthropic APIを呼び出してprobeに回答する。
 * probe数が PROBE_BATCH_SIZE を超える場合は複数回に分割して呼び出し、結果を結合する。
 * 回答（probeId → answer string）、latency合計、tokenUsage合計をまとめて返す。
 * set_selection の値は JSON 配列を文字列化して返す（probe-scorer が JSON.parse する）。
 */
async function answerProbesWithAnthropicAPI(
  contextFiles: Record<string, string>,
  probes: GeneratedProbe[],
  model: string
): Promise<ProbeAPIResult> {
  const client = new Anthropic();

  // REPOSITORY FILES セクションを構築（全バッチで共有）
  const fileLines: string[] = ["REPOSITORY FILES:"];
  for (const [filePath, content] of Object.entries(contextFiles)) {
    fileLines.push(`\n--- ${filePath} ---\n${content}`);
  }
  const contextSection = fileLines.join("");

  // probeをバッチに分割
  const batches: GeneratedProbe[][] = [];
  for (let i = 0; i < probes.length; i += PROBE_BATCH_SIZE) {
    batches.push(probes.slice(i, i + PROBE_BATCH_SIZE));
  }

  const allAnswers: Record<string, string> = {};
  let totalLatencyMs = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const promptBatches: string[] = [];
  const responseBatches: string[] = [];

  const emptyBatchAnswers = (batch: GeneratedProbe[]): Record<string, string> => {
    const m: Record<string, string> = {};
    for (const p of batch) m[p.probeId] = "";
    return m;
  };

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    if (batches.length > 1) {
      console.log(`[system1] batch ${batchIdx + 1}/${batches.length} (${batch.length} probes)`);
    }

    const userMessage = buildProbePrompt(contextSection, batch);
    promptBatches.push(userMessage);

    const start = Date.now();
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: PROBE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    totalLatencyMs += Date.now() - start;
    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    const rawText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    responseBatches.push(rawText);

    const match = rawText.match(/<probe_answers>([\s\S]*?)<\/probe_answers>/);
    if (!match) {
      console.warn(`[system1] batch ${batchIdx + 1}/${batches.length}: <probe_answers> tag not found. Returning empty answers for this batch.`);
      Object.assign(allAnswers, emptyBatchAnswers(batch));
      continue;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch (e) {
      console.error(`[system1] batch ${batchIdx + 1}/${batches.length}: Failed to parse probe_answers JSON:`, e);
      Object.assign(allAnswers, emptyBatchAnswers(batch));
      continue;
    }

    for (let batchLocalIdx = 0; batchLocalIdx < batch.length; batchLocalIdx++) {
      const p = batch[batchLocalIdx];
      // モデルが "Q{n}" 形式（プロンプト表示番号）で回答する場合があるため、
      // probeId でのルックアップが失敗したときは "Q{batchLocalIdx+1}" でフォールバックする
      const raw = parsed[p.probeId] ?? parsed[`Q${batchLocalIdx + 1}`];
      if (raw === undefined || raw === null) {
        allAnswers[p.probeId] = "";
      } else if (Array.isArray(raw)) {
        // set_selection: 配列 → JSON 文字列（probe-scorer が JSON.parse する）
        allAnswers[p.probeId] = JSON.stringify(raw);
      } else {
        allAnswers[p.probeId] = String(raw);
      }
    }
  }

  return {
    answers: allAnswers,
    latencyMs: totalLatencyMs,
    tokenUsage: { input: totalInputTokens, output: totalOutputTokens },
    promptBatches,
    responseBatches,
  };
}

/**
 * mock probe answerer: returns empty string for all probes (all wrong).
 * mock-noop / mock-oracle バックエンドで使用。
 */
function mockAnswerProbes(probes: GeneratedProbe[]): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const p of probes) {
    answers[p.probeId] = "";
  }
  return answers;
}

async function runSystem1(
  repositoryFiles: Record<string, string>,
  probes: GeneratedProbe[],
  budget: BudgetValue,
  backend: CalibrationBackend,
  model: string,
  mode: AssemblyMode = "system1"
): Promise<System1BudgetResult> {
  const ctx = assembleContext(repositoryFiles, budget, mode);

  let answers: Record<string, string>;
  let latencyMs: number | undefined;
  let tokenUsage: { input: number; output: number } | undefined;
  let agentPromptBatches: string[] | undefined;
  let agentResponseBatches: string[] | undefined;

  if (backend === "anthropic") {
    const apiResult = await answerProbesWithAnthropicAPI(ctx.files, probes, model);
    answers = apiResult.answers;
    latencyMs = apiResult.latencyMs;
    tokenUsage = apiResult.tokenUsage;
    agentPromptBatches = apiResult.promptBatches;
    agentResponseBatches = apiResult.responseBatches;
  } else {
    answers = mockAnswerProbes(probes);
  }

  const scoringResults = scoreProbes(probes, answers);
  const summary = summarizeScores(scoringResults, probes);

  const probeTypeMap = new Map(probes.map((p) => [p.probeId, p.type]));
  const probeDetails: System1TaskResult[] = scoringResults.map((r) => {
    const probe = probes.find((p) => p.probeId === r.probeId)!;
    return {
      probeId: r.probeId,
      type: probe.type,
      correct: r.correct,
      agentAnswer: r.agentAnswer,
      correctAnswer: r.correctAnswer,
      parseError: r.parseError,
    };
  });

  // boolean型プローブのみを集計（R^sem_B の主指標）
  const boolResults = scoringResults.filter((r) => probeTypeMap.get(r.probeId) === "boolean");
  const boolNumCorrect = boolResults.filter((r) => r.correct).length;
  const boolNumTotal = boolResults.length;
  const boolAccuracy = boolNumTotal > 0 ? boolNumCorrect / boolNumTotal : 0;

  return {
    budget,
    contextTokens: ctx.totalTokens,
    numCorrect: summary.correct,
    numTotal: summary.total,
    accuracy: summary.accuracy,
    boolNumCorrect,
    boolNumTotal,
    boolAccuracy,
    byType: summary.byType,
    probeDetails,
    latencyMs,
    tokenUsage,
    contextFiles: ctx.files,
    agentPromptBatches,
    agentResponseBatches,
  };
}

// ---- 系統2: 機能的継続テスト ----

interface HeldOutTask {
  taskId: string;
  visibleInstruction: string;
  taskSpecificTestCode?: string;
}

type OraclePatchFn = (files: Record<string, string>) => Record<string, string>;

function loadOraclePatch(fixturesDir: string, taskId: string): OraclePatchFn | null {
  const patchPath = path.join(fixturesDir, "oracle-patches", `${taskId}.ts`);
  if (!fs.existsSync(patchPath)) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(patchPath) as { applyOracle: OraclePatchFn };
    return mod.applyOracle;
  } catch (e) {
    throw new Error(`Failed to load oracle patch for ${taskId}: ${e}`);
  }
}

/**
 * mock-noop / mock-oracle は full repository を backend に渡す。
 * （oracle patch は full repo に対して適用されるよう設計されているため）
 */
async function runSystem2TaskMock(
  fullRepositoryFiles: Record<string, string>,
  task: HeldOutTask,
  backend: "mock-noop" | "mock-oracle",
  fixturesDir: string,
  syntheticWorldDir: string
): Promise<System2TaskResult> {
  let mockBackend: AgentBackend;
  if (backend === "mock-noop") {
    mockBackend = new MockNoopBackend();
  } else {
    mockBackend = new MockOracleBackend(task.taskId, fixturesDir);
  }

  // mock backend には full repository を渡す（budgetは記録用のみ）
  const agentResult = await mockBackend.run({
    contextFiles: fullRepositoryFiles,
    visibleInstruction: task.visibleInstruction,
    contextBudget: "full",
  });

  // modifiedFiles を full repository にマージしてから scoring
  const mergedFiles: Record<string, string> = {
    ...fullRepositoryFiles,
    ...agentResult.modifiedFiles,
  };

  return runScoringForTask(mergedFiles, task, syntheticWorldDir);
}

/**
 * anthropic backend は budget-limited context を agent に渡す。
 * agentの modifiedFiles を full repository にマージしてから scoring。
 * （有限 context の効果を測るための設計。Stage 0 orchestrator.ts と同じパターン）
 */
async function runSystem2TaskAnthropicOrOther(
  fullRepositoryFiles: Record<string, string>,
  budget: BudgetValue,
  task: HeldOutTask,
  agentBackend: AgentBackend,
  syntheticWorldDir: string
): Promise<System2TaskResult> {
  // budget-assembler で limited context を構築し、agent に渡す
  const ctx = assembleContext(fullRepositoryFiles, budget);

  const start = Date.now();
  const agentResult = await agentBackend.run({
    contextFiles: ctx.files,
    visibleInstruction: task.visibleInstruction,
    // budget-assembler で既に制限済みのため、AnthropicBackend 内の
    // formatContextFiles では追加切り詰めが起きないよう "full" を渡す
    contextBudget: "full",
  });
  const latencyMs = Date.now() - start;

  // modifiedFiles を full repository にマージ（agent が返していないファイルは元のまま）
  const mergedFiles: Record<string, string> = {
    ...fullRepositoryFiles,
    ...agentResult.modifiedFiles,
  };

  const result = await runScoringForTask(mergedFiles, task, syntheticWorldDir);
  return {
    ...result,
    latencyMs,
    tokenUsage: agentResult.tokenUsage,
    agentResponse: agentResult.rawResponse,
    contextFiles: ctx.files,
    repositoryAfter: agentResult.modifiedFiles,
  };
}

async function runScoringForTask(
  testFiles: Record<string, string>,
  task: HeldOutTask,
  syntheticWorldDir: string
): Promise<System2TaskResult> {
  try {
    const result = await runScoring(testFiles, syntheticWorldDir, task.taskSpecificTestCode);
    const tsRes = result.taskSpecificTests;
    const allPassed =
      result.visibleTests.passed &&
      result.hiddenTests.passed &&
      (tsRes === null || tsRes.passed);

    return {
      taskId: task.taskId,
      passed: allPassed,
      visiblePassed: result.visibleTests.numPassed,
      visibleTotal: result.visibleTests.numPassed + result.visibleTests.numFailed,
      hiddenPassed: result.hiddenTests.numPassed,
      hiddenTotal: result.hiddenTests.numPassed + result.hiddenTests.numFailed,
      taskSpecificPassed: tsRes?.numPassed ?? null,
      taskSpecificTotal: tsRes ? tsRes.numPassed + tsRes.numFailed : null,
      protocolContractViolated: result.protocolContractViolated,
      visibleTestCases: result.visibleTests.testCases,
      hiddenTestCases: result.hiddenTests.testCases,
      taskSpecificTestCases: tsRes?.testCases,
    };
  } catch (e) {
    return {
      taskId: task.taskId,
      passed: false,
      visiblePassed: 0,
      visibleTotal: 0,
      hiddenPassed: 0,
      hiddenTotal: 0,
      taskSpecificPassed: null,
      taskSpecificTotal: null,
      protocolContractViolated: false,
      error: String(e),
    };
  }
}

async function runSystem2(
  repositoryFiles: Record<string, string>,
  tasks: HeldOutTask[],
  budget: BudgetValue,
  backend: CalibrationBackend,
  options: { fixturesDir: string; syntheticWorldDir: string; model: string }
): Promise<System2BudgetResult> {
  const ctx = assembleContext(repositoryFiles, budget);
  const contextTokens = ctx.totalTokens;

  const taskResults: System2TaskResult[] = [];

  for (const task of tasks) {
    let result: System2TaskResult;

    if (backend === "anthropic") {
      const agentBackend = new AnthropicBackend(options.model);
      result = await runSystem2TaskAnthropicOrOther(
        repositoryFiles,
        budget,
        task,
        agentBackend,
        options.syntheticWorldDir
      );
    } else {
      result = await runSystem2TaskMock(
        repositoryFiles,
        task,
        backend,
        options.fixturesDir,
        options.syntheticWorldDir
      );
    }

    taskResults.push(result);
  }

  const numPassed = taskResults.filter((r) => r.passed).length;
  return {
    budget,
    contextTokens,
    passRate: tasks.length > 0 ? numPassed / tasks.length : 0,
    numPassed,
    numTotal: tasks.length,
    taskResults,
  };
}

// ---- 命名スキーム整合チェック ----

/**
 * probe-bank が使っている命名スキームの entityNames / operationNames の値が、
 * 実際の repository ファイル群に出現するかをチェックする。
 *
 * 半数未満しか出現しない場合、probe の語彙と repository の実装名が
 * 断絶している可能性が高いため、エラーを出して実行を停止する。
 * （B-fictional ↔ A-obfuscated 語彙断絶問題の再発を機械的に防ぐ。
 *  docs/findings/stage0_5_findings.md F1改訂参照）
 */
function checkNamingSchemeAlignment(
  probes: GeneratedProbe[],
  repositoryFiles: Record<string, string>,
  namingSchemesPath: string
): void {
  if (probes.length === 0) return;

  const schemeId = probes[0].namingScheme;

  interface SchemeEntry {
    schemeId: string;
    entityNames: Record<string, string>;
    operationNames: Record<string, string>;
  }
  const schemes: SchemeEntry[] = JSON.parse(fs.readFileSync(namingSchemesPath, "utf8"));
  const scheme = schemes.find((s) => s.schemeId === schemeId);
  if (!scheme) {
    console.warn(`[alignment-check] scheme "${schemeId}" not found in naming_schemes.json. Skipping.`);
    return;
  }

  const terms = [
    ...Object.values(scheme.entityNames),
    ...Object.values(scheme.operationNames),
  ];
  const repoContent = Object.values(repositoryFiles).join("\n");
  const matched = terms.filter((t) => repoContent.includes(t));
  const rate = terms.length > 0 ? matched.length / terms.length : 1;

  if (rate < 0.5) {
    console.error(`\n[alignment-check] FATAL: probe scheme "${schemeId}" は repository と語彙が断絶しています。`);
    console.error(`  一致: ${matched.length}/${terms.length} (${(rate * 100).toFixed(0)}%) — 一致: [${matched.join(", ")}]`);
    console.error(`  不一致: [${terms.filter((t) => !repoContent.includes(t)).join(", ")}]`);
    console.error(`  → probe-bank.json を repository と同じ命名スキームで再生成してください。`);
    process.exit(1);
  }

  console.log(`[alignment-check] OK: probe scheme "${schemeId}" — ${matched.length}/${terms.length} terms in repository (${(rate * 100).toFixed(0)}%)`);
}

// ---- メイン実行 ----

export async function runCalibration(
  options: CalibrationOptions
): Promise<CalibrationRunResult> {
  const { backend, budgets = ALL_BUDGETS, model = "claude-haiku-4-5-20251001", taskFilter } = options;

  const calibrationDir = path.join(__dirname, "..");
  const swDir = path.join(calibrationDir, "../synthetic-world");
  const harnessDir = path.join(calibrationDir, "../harness");
  const repositoryDir = path.join(swDir, "repository");

  const repositoryFiles: Record<string, string> = {};
  loadDirRecursive(repositoryDir, repositoryDir, repositoryFiles);

  const probes: GeneratedProbe[] = JSON.parse(
    fs.readFileSync(path.join(calibrationDir, "fixtures/probe-bank.json"), "utf8")
  );
  let tasks: HeldOutTask[] = JSON.parse(
    fs.readFileSync(path.join(swDir, "heldout_tasks.json"), "utf8")
  );
  if (taskFilter && taskFilter.length > 0) {
    tasks = tasks.filter((t) => taskFilter.includes(t.taskId));
    console.log(`[task-filter] ${tasks.length} tasks selected: ${tasks.map((t) => t.taskId).join(", ")}`);
  }

  // 命名スキーム整合チェック（語彙断絶を機械的に検知）
  checkNamingSchemeAlignment(
    probes,
    repositoryFiles,
    path.join(swDir, "naming_schemes.json")
  );

  const fixturesDir = path.join(harnessDir, "fixtures");
  const runOptions = { fixturesDir, syntheticWorldDir: swDir, model };

  const system1: System1BudgetResult[] = [];
  const system2: System2BudgetResult[] = [];

  for (const budget of budgets) {
    const [s1, s2] = await Promise.all([
      runSystem1(repositoryFiles, probes, budget, backend, model),
      runSystem2(repositoryFiles, tasks, budget, backend, runOptions),
    ]);
    system1.push(s1);
    system2.push(s2);
  }

  return { backend, system1, system2 };
}

// ---- CLI エントリポイント ----

if (require.main === module) {
  // .env から ANTHROPIC_API_KEY をロード（anthropic backend のみ必要）
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("dotenv").config({ path: path.join(__dirname, "../../harness/.env") });
  } catch {
    // dotenv がない場合はスキップ（環境変数で直接設定済みの場合等）
  }

  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined =>
    args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=")
    ?? (args.indexOf(`--${name}`) !== -1 ? args[args.indexOf(`--${name}`) + 1] : undefined);

  const backendArg = getArg("backend");
  const modelArg = getArg("model");
  const budgetsArg = getArg("budgets");
  const tasksArg = getArg("tasks");

  const backend: CalibrationBackend =
    backendArg === "mock-oracle" ? "mock-oracle"
    : backendArg === "anthropic" ? "anthropic"
    : "mock-noop";
  const model = modelArg ?? "claude-haiku-4-5-20251001";

  // --budgets=0,1000,full など。省略時は ALL_BUDGETS
  let budgets: BudgetValue[] = ALL_BUDGETS;
  if (budgetsArg) {
    budgets = budgetsArg.split(",").map((s) => {
      const t = s.trim();
      if (t === "full") return "full" as const;
      const n = Number(t);
      if (isNaN(n)) throw new Error(`Invalid budget value: ${t}`);
      return n as BudgetValue;
    });
  }

  // --tasks=T-local-1,T-crosscut-3 など。省略時は全タスク
  const taskFilter: string[] | null = tasksArg
    ? tasksArg.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  console.log(`\n====================================================`);
  console.log(`  Calibration Runner: backend=${backend}${backend === "anthropic" ? ` model=${model}` : ""}`);
  console.log(`  budgets: ${budgets.join(", ")}`);
  if (taskFilter) console.log(`  tasks (filtered): ${taskFilter.join(", ")}`);
  console.log(`====================================================\n`);

  runCalibration({ backend, model, budgets, taskFilter: taskFilter ?? undefined }).then((result) => {
    // ── 系統2 ──
    console.log("┌─ 系統2 (M̂_B): 機能的継続テスト\n│");
    for (const s2 of result.system2) {
      const label = s2.budget === "full" ? "Full" : `${(s2.budget as number) / 1000}K`;
      console.log(`│  B=${label} (ctx=${s2.contextTokens}t): ${s2.numPassed}/${s2.numTotal} tasks passed (M̂_B=${s2.passRate.toFixed(2)})`);
      for (const t of s2.taskResults) {
        const status = t.passed ? "✅" : "❌";
        const tsStr = t.taskSpecificPassed !== null
          ? `task-spec=${t.taskSpecificPassed}/${t.taskSpecificTotal}`
          : "task-spec=N/A";
        const extras = [
          t.protocolContractViolated ? "[CONTRACT VIOLATED]" : "",
          t.latencyMs ? `${t.latencyMs}ms` : "",
          t.tokenUsage ? `in=${t.tokenUsage.input} out=${t.tokenUsage.output}` : "",
          t.error ? `ERR:${t.error.slice(0, 50)}` : "",
        ].filter(Boolean).join(" ");
        console.log(`│    ${status} ${t.taskId}: vis=${t.visiblePassed}/${t.visibleTotal} hid=${t.hiddenPassed}/${t.hiddenTotal} ${tsStr}${extras ? " " + extras : ""}`);
      }
    }

    // ── 系統1 ──
    // 主指標: boolean型プローブのみ（R^sem_B）
    // mc/stp型はoperationTableや命名規則から推測可能なため reference のみ（F9参照）
    console.log("\n├─ 系統1 (R^sem_B): セマンティックプローブ\n│  主指標: boolean型のみ / mc・stpはreference\n│");
    for (const s1 of result.system1) {
      const label = s1.budget === "full" ? "Full" : `${(s1.budget as number) / 1000}K`;
      const extras = [
        s1.latencyMs ? `${s1.latencyMs}ms` : "",
        s1.tokenUsage ? `in=${s1.tokenUsage.input} out=${s1.tokenUsage.output}` : "",
      ].filter(Boolean).join(" ");
      console.log(`│  B=${label} (ctx=${s1.contextTokens}t): [PRIMARY] bool=${s1.boolNumCorrect}/${s1.boolNumTotal} (${s1.boolAccuracy.toFixed(2)}) | [REF] total=${s1.numCorrect}/${s1.numTotal} (${s1.accuracy.toFixed(2)})${extras ? " " + extras : ""}`);
      for (const [type, stat] of Object.entries(s1.byType)) {
        const marker = type === "boolean" ? " *" : "";
        console.log(`│    ${type}: ${stat.correct}/${stat.total}${marker}`);
      }
    }

    console.log("\n└─ Done.\n");

    // ── ログ書き出し（anthropic backend のみ）──
    if (backend === "anthropic") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { writeCalibrationLog } = require("./calibration-logging") as typeof import("./calibration-logging");
      const runsDir = path.join(__dirname, "../../runs");
      const runId = [
        "stage0_5",
        taskFilter ? `${taskFilter.length}task` : "alltask",
        backend,
        model.replace(/[^a-zA-Z0-9]/g, "-"),
      ].join("-");
      writeCalibrationLog(result, {
        runsDir,
        runId,
        meta: {
          backend,
          model,
          budgets,
          tasks: taskFilter ?? "all",
        },
      });
    }
  }).catch((e) => {
    console.error("calibration-runner failed:", e);
    process.exit(1);
  });
}
