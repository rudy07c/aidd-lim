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
import { assembleContext, ALL_BUDGETS, BudgetValue } from "./budget-assembler";
import { scoreProbes, summarizeScores } from "./probe-scorer";
import type { GeneratedProbe } from "./probe-generator";
import { runScoring } from "../../harness/src/scoring";
import { MockNoopBackend } from "../../harness/src/agent-backend/mock-noop";
import { MockOracleBackend } from "../../harness/src/agent-backend/mock-oracle";
import { AnthropicBackend } from "../../harness/src/agent-backend/anthropic";
import type { AgentBackend } from "../../harness/src/agent-backend/types";

// ---- 公開型 ----

export type CalibrationBackend = "mock-noop" | "mock-oracle" | "anthropic";

export interface CalibrationOptions {
  backend: CalibrationBackend;
  budgets?: BudgetValue[];
  /** anthropic backend でのみ使用するモデル名 */
  model?: string;
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
  byType: Record<string, { total: number;  correct: number; accuracy: number }>;
  probeDetails: System1TaskResult[];
  /** anthropic backend のみ。API呼び出し1回分の所要時間（ms） */
  latencyMs?: number;
  /** anthropic backend のみ。API呼び出し1回分のトークン使用量 */
  tokenUsage?: { input: number; output: number };
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
    } else {
      // multiple_choice / graph_edge_prediction / state_transition_prediction
      lines.push(`Options: ${(p.options ?? []).join(", ")}`);
      lines.push(`Answer format: one of the option strings exactly as listed`);
    }

    questionLines.push(lines.join("\n"));
  }

  const exampleId = probes[0]?.probeId ?? "probe-id";
  return `${contextSection}

QUESTIONS:
${questionLines.join("\n\n")}

OUTPUT FORMAT:
Respond with a JSON object inside <probe_answers> tags. Keys are probe IDs (exactly as shown), values are answers.
- multiple_choice / graph_edge_prediction / state_transition_prediction: answer is a string (exact option)
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
}

/**
 * Anthropic APIを直接呼び出してprobeに回答する。
 * 回答（probeId → answer string）、latency、tokenUsageをまとめて返す。
 * set_selection の値は JSON 配列を文字列化して返す（probe-scorer が JSON.parse する）。
 */
async function answerProbesWithAnthropicAPI(
  contextFiles: Record<string, string>,
  probes: GeneratedProbe[],
  model: string
): Promise<ProbeAPIResult> {
  const client = new Anthropic();

  // REPOSITORY FILES セクションを構築（anthropic.ts の formatContextFiles と同じフォーマット）
  const fileLines: string[] = ["REPOSITORY FILES:"];
  for (const [filePath, content] of Object.entries(contextFiles)) {
    fileLines.push(`\n--- ${filePath} ---\n${content}`);
  }
  const contextSection = fileLines.join("");

  const userMessage = buildProbePrompt(contextSection, probes);

  const start = Date.now();
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: PROBE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });
  const latencyMs = Date.now() - start;
  const tokenUsage = { input: response.usage.input_tokens, output: response.usage.output_tokens };

  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const emptyAnswers = (): Record<string, string> => {
    const m: Record<string, string> = {};
    for (const p of probes) m[p.probeId] = "";
    return m;
  };

  // <probe_answers>...</probe_answers> を抽出してパース
  const match = rawText.match(/<probe_answers>([\s\S]*?)<\/probe_answers>/);
  if (!match) {
    console.warn("[system1] <probe_answers> tag not found in response. Returning empty answers.");
    return { answers: emptyAnswers(), latencyMs, tokenUsage };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch (e) {
    console.error("[system1] Failed to parse probe_answers JSON:", e);
    return { answers: emptyAnswers(), latencyMs, tokenUsage };
  }

  // 各値を文字列に変換（set_selection では配列が返ることがある）
  const answers: Record<string, string> = {};
  for (const p of probes) {
    const raw = parsed[p.probeId];
    if (raw === undefined || raw === null) {
      answers[p.probeId] = "";
    } else if (Array.isArray(raw)) {
      // set_selection: 配列 → JSON 文字列（probe-scorer が JSON.parse する）
      answers[p.probeId] = JSON.stringify(raw);
    } else {
      answers[p.probeId] = String(raw);
    }
  }
  return { answers, latencyMs, tokenUsage };
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
  model: string
): Promise<System1BudgetResult> {
  const ctx = assembleContext(repositoryFiles, budget);

  let answers: Record<string, string>;
  let latencyMs: number | undefined;
  let tokenUsage: { input: number; output: number } | undefined;

  if (backend === "anthropic") {
    const apiResult = await answerProbesWithAnthropicAPI(ctx.files, probes, model);
    answers = apiResult.answers;
    latencyMs = apiResult.latencyMs;
    tokenUsage = apiResult.tokenUsage;
  } else {
    answers = mockAnswerProbes(probes);
  }

  const scoringResults = scoreProbes(probes, answers);
  const summary = summarizeScores(scoringResults, probes);

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

  return {
    budget,
    contextTokens: ctx.totalTokens,
    numCorrect: summary.correct,
    numTotal: summary.total,
    accuracy: summary.accuracy,
    byType: summary.byType,
    probeDetails,
    latencyMs,
    tokenUsage,
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

// ---- メイン実行 ----

export async function runCalibration(
  options: CalibrationOptions
): Promise<CalibrationRunResult> {
  const { backend, budgets = ALL_BUDGETS, model = "claude-haiku-4-5-20251001" } = options;

  const calibrationDir = path.join(__dirname, "..");
  const swDir = path.join(calibrationDir, "../synthetic-world");
  const harnessDir = path.join(calibrationDir, "../harness");
  const repositoryDir = path.join(swDir, "repository");

  const repositoryFiles: Record<string, string> = {};
  loadDirRecursive(repositoryDir, repositoryDir, repositoryFiles);

  const probes: GeneratedProbe[] = JSON.parse(
    fs.readFileSync(path.join(calibrationDir, "fixtures/probe-bank.json"), "utf8")
  );
  const tasks: HeldOutTask[] = JSON.parse(
    fs.readFileSync(path.join(swDir, "heldout_tasks.json"), "utf8")
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
  const backendArg = args.find((a) => a.startsWith("--backend="))?.split("=")[1]
    ?? args[args.indexOf("--backend") + 1];
  const modelArg = args.find((a) => a.startsWith("--model="))?.split("=")[1]
    ?? args[args.indexOf("--model") + 1];
  const backend: CalibrationBackend =
    backendArg === "mock-oracle" ? "mock-oracle"
    : backendArg === "anthropic" ? "anthropic"
    : "mock-noop";
  const model = modelArg ?? "claude-haiku-4-5-20251001";

  console.log(`\n====================================================`);
  console.log(`  Calibration Runner: backend=${backend}${backend === "anthropic" ? ` model=${model}` : ""}`);
  console.log(`====================================================\n`);

  runCalibration({ backend, model }).then((result) => {
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
    console.log("\n├─ 系統1 (R^sem_B): セマンティックプローブ\n│");
    for (const s1 of result.system1) {
      const label = s1.budget === "full" ? "Full" : `${(s1.budget as number) / 1000}K`;
      const extras = [
        s1.latencyMs ? `${s1.latencyMs}ms` : "",
        s1.tokenUsage ? `in=${s1.tokenUsage.input} out=${s1.tokenUsage.output}` : "",
      ].filter(Boolean).join(" ");
      console.log(`│  B=${label} (ctx=${s1.contextTokens}t): ${s1.numCorrect}/${s1.numTotal} correct (acc=${s1.accuracy.toFixed(2)})${extras ? " " + extras : ""}`);
      for (const [type, stat] of Object.entries(s1.byType)) {
        console.log(`│    ${type}: ${stat.correct}/${stat.total}`);
      }
    }

    console.log("\n└─ Done.\n");
  }).catch((e) => {
    console.error("calibration-runner failed:", e);
    process.exit(1);
  });
}
