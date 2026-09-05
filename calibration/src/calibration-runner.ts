// calibration/src/calibration-runner.ts
//
// Phase 3: mock-noop / mock-oracle で系統1・系統2のパイプラインを通す。
// （docs/stage0_5_plan.md Phase 3参照）
//
// 系統1（意味的再構成, R^sem_B）:
//   - budget-assembler で context を構築
//   - probe-bank.json 全問をまとめて「回答」させる（mock: 全問空回答）
//   - probe-scorer.ts で採点
//   ※ mockでは意味のある値は出ない。パイプラインがクラッシュしないことのみ確認。
//
// 系統2（機能的継続, M̂_B）:
//   - 各 held-out task に対して、oracle patch または noop を適用
//   - runScoring() で visible/hidden/task-specific test を実行
//   - M̂_B = 成功数 / task数 を集計
//
// 重要な設計判断:
//   系統2で oracle/noop に渡すファイル群は「full repository」固定とし、
//   budget は「real agent に見せる情報量の記録」として追跡する。
//   理由: oracle は context に関係なく正解実装を生成するため、
//   budget-limited context を渡すと oracle patch が broken なファイルを生成する。
//   （T-crosscut-1 等は currentFiles["src/zef/rules.ts"] を前提に追記する設計のため）

import * as fs from "fs";
import * as path from "path";

import { assembleContext, ALL_BUDGETS, estimateTokenCount, BudgetValue } from "./budget-assembler";
import { scoreProbes, summarizeScores, normalizeCorrectAnswer } from "./probe-scorer";
import type { GeneratedProbe } from "./probe-generator";
import { runScoring } from "../../harness/src/scoring";

// ---- 型定義 ----

export type CalibrationBackend = "mock-noop" | "mock-oracle";

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
  byType: Record<string, { total: number; correct: number; accuracy: number }>;
  probeDetails: System1TaskResult[];
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

/**
 * mock probe answerer: returns empty string for all probes (all wrong).
 * Phase 3ではクラッシュしないことのみ確認。Phase 4で real agent に差し替える。
 */
function mockAnswerProbes(probes: GeneratedProbe[]): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const p of probes) {
    answers[p.probeId] = ""; // empty = wrong for all probe types
  }
  return answers;
}

async function runSystem1(
  repositoryFiles: Record<string, string>,
  probes: GeneratedProbe[],
  budget: BudgetValue
): Promise<System1BudgetResult> {
  const ctx = assembleContext(repositoryFiles, budget);

  // Phase 3: mock probe answerer (no real agent call)
  const answers = mockAnswerProbes(probes);
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
    // ts-node 環境では直接 require できる
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(patchPath) as { applyOracle: OraclePatchFn };
    return mod.applyOracle;
  } catch (e) {
    throw new Error(`Failed to load oracle patch for ${taskId}: ${e}`);
  }
}

async function runSystem2Task(
  fullRepositoryFiles: Record<string, string>,
  contextTokens: number,
  task: HeldOutTask,
  backend: CalibrationBackend,
  fixturesDir: string,
  syntheticWorldDir: string
): Promise<System2TaskResult> {
  let testFiles: Record<string, string>;

  if (backend === "mock-noop") {
    // 何も変更しない: 新operationが実装されていないため task-specific test は必ず失敗
    testFiles = { ...fullRepositoryFiles };
  } else {
    // mock-oracle: oracle patch を full repository に適用
    const applyOracle = loadOraclePatch(fixturesDir, task.taskId);
    if (!applyOracle) {
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
        error: `oracle patch not found for ${task.taskId}`,
      };
    }
    testFiles = applyOracle({ ...fullRepositoryFiles });
  }

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
  fixturesDir: string,
  syntheticWorldDir: string
): Promise<System2BudgetResult> {
  // context tokenを記録するが、scoring には full repository を使う（設計注記参照）
  const ctx = assembleContext(repositoryFiles, budget);
  const contextTokens = ctx.totalTokens;

  const taskResults: System2TaskResult[] = [];
  for (const task of tasks) {
    const result = await runSystem2Task(
      repositoryFiles,
      contextTokens,
      task,
      backend,
      fixturesDir,
      syntheticWorldDir
    );
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
  backend: CalibrationBackend,
  budgets: BudgetValue[] = ALL_BUDGETS
): Promise<CalibrationRunResult> {
  const calibrationDir = path.join(__dirname, "..");
  const swDir = path.join(calibrationDir, "../synthetic-world");
  const harnessDir = path.join(calibrationDir, "../harness");
  const repositoryDir = path.join(swDir, "repository");

  // リポジトリファイルを読み込む
  const repositoryFiles: Record<string, string> = {};
  loadDirRecursive(repositoryDir, repositoryDir, repositoryFiles);

  // probe-bank.json を読み込む
  const probeBankPath = path.join(calibrationDir, "fixtures/probe-bank.json");
  const probes: GeneratedProbe[] = JSON.parse(fs.readFileSync(probeBankPath, "utf8"));

  // heldout_tasks.json を読み込む
  const tasksPath = path.join(swDir, "heldout_tasks.json");
  const tasks: HeldOutTask[] = JSON.parse(fs.readFileSync(tasksPath, "utf8"));

  const fixturesDir = path.join(harnessDir, "fixtures");

  const system1: System1BudgetResult[] = [];
  const system2: System2BudgetResult[] = [];

  for (const budget of budgets) {
    const s1 = await runSystem1(repositoryFiles, probes, budget);
    system1.push(s1);

    const s2 = await runSystem2(repositoryFiles, tasks, budget, backend, fixturesDir, swDir);
    system2.push(s2);
  }

  return { backend, system1, system2 };
}

// ---- CLI エントリポイント ----

if (require.main === module) {
  const args = process.argv.slice(2);
  const backendArg = args.find((a) => a.startsWith("--backend="))?.split("=")[1]
    ?? args[args.indexOf("--backend") + 1];
  const backend: CalibrationBackend =
    backendArg === "mock-oracle" ? "mock-oracle" : "mock-noop";

  console.log(`\n====================================================`);
  console.log(`  Calibration Runner: backend=${backend}`);
  console.log(`====================================================\n`);

  runCalibration(backend).then((result) => {
    // ── 系統2 まとめ ──
    console.log("┌─ 系統2 (M̂_B): 機能的継続テスト\n│");
    for (const s2 of result.system2) {
      const label = s2.budget === "full" ? "Full" : `${(s2.budget as number) / 1000}K`;
      console.log(`│  B=${label} (ctx=${s2.contextTokens}t): ${s2.numPassed}/${s2.numTotal} tasks passed (M̂_B=${s2.passRate.toFixed(2)})`);
      for (const t of s2.taskResults) {
        const status = t.passed ? "✅" : "❌";
        const tsStr = t.taskSpecificPassed !== null
          ? `task-spec=${t.taskSpecificPassed}/${t.taskSpecificTotal}`
          : "task-spec=N/A";
        const contractStr = t.protocolContractViolated ? " [CONTRACT VIOLATED]" : "";
        const errStr = t.error ? ` [ERR: ${t.error.slice(0, 60)}]` : "";
        console.log(`│    ${status} ${t.taskId}: vis=${t.visiblePassed}/${t.visibleTotal} hid=${t.hiddenPassed}/${t.hiddenTotal} ${tsStr}${contractStr}${errStr}`);
      }
    }

    // ── 系統1 まとめ ──
    console.log("\n├─ 系統1 (R^sem_B): セマンティックプローブ\n│");
    for (const s1 of result.system1) {
      const label = s1.budget === "full" ? "Full" : `${(s1.budget as number) / 1000}K`;
      console.log(`│  B=${label} (ctx=${s1.contextTokens}t): ${s1.numCorrect}/${s1.numTotal} correct (acc=${s1.accuracy.toFixed(2)})`);
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
