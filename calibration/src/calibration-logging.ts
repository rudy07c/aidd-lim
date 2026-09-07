// calibration/src/calibration-logging.ts
//
// 較正実行結果を runs/stage0_5/<run_id>/ へ書き出す。
//
// ディレクトリ構造:
//
//   runs/stage0_5/<run_id>/
//     run_meta.json            実行設定（backend, model, budgets, tasks, timestamp）
//     summary.json             dose-response サマリー（系統1・系統2それぞれのbudget別集計）
//     system1/
//       B0/ B1K/ B2K/ B4K/ B8K/ BFull/
//         meta.json            accuracy, byType, latencyMs, tokenUsage
//         context_contents.json  agentに渡したファイル群
//         agent_prompt_batch0.json  バッチ0の送信プロンプト
//         agent_response_batch0.json  バッチ0の受信レスポンス
//         probe_results.json   per-probe: probeId, type, correct, agentAnswer, correctAnswer
//     system2/
//       B0/ B1K/ B2K/ B4K/ B8K/ BFull/
//         summary.json         passRate, numPassed, numTotal
//         <taskId>/
//           meta.json          passed, vis/hid/taskspec counts, latencyMs, tokenUsage, contractViolated
//           context_contents.json
//           agent_response.json
//           task_specific_test_result.json  testCases[] を含む詳細
//           visible_test_results.json
//           hidden_test_results.json
//           repository_after/  agentが出力したファイル群

import * as fs from "fs";
import * as path from "path";
import type { CalibrationRunResult, System1BudgetResult, System2BudgetResult, System2TaskResult } from "./calibration-runner";
import type { BudgetValue } from "./budget-assembler";

// ---- 公開型 ----

export interface CalibrationLogOptions {
  /** runs/ ディレクトリへの絶対パス */
  runsDir: string;
  /** 実行ID（省略時は自動生成）。例: "stage0_5-8task-anthropic" */
  runId?: string;
  /** 実行設定の補足情報（tasks一覧, model名など） */
  meta?: Record<string, unknown>;
}

// ---- メイン関数 ----

export function writeCalibrationLog(
  result: CalibrationRunResult,
  options: CalibrationLogOptions
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const baseId = options.runId ?? `stage0_5-${result.backend}`;
  const runId = `${baseId}__${timestamp}`;
  const runDir = path.join(options.runsDir, "stage0_5", runId);

  fs.mkdirSync(runDir, { recursive: true });

  // run_meta.json
  writeJson(runDir, "run_meta.json", {
    runId,
    backend: result.backend,
    timestamp,
    ...options.meta,
  });

  // summary.json
  const summary = {
    system1: result.system1.map((s1) => ({
      budget: s1.budget,
      contextTokens: s1.contextTokens,
      // 主指標: boolean型プローブのみ（mc/stpはreference。F9参照）
      boolAccuracy: s1.boolAccuracy,
      boolNumCorrect: s1.boolNumCorrect,
      boolNumTotal: s1.boolNumTotal,
      // 参考: 全プローブ集計
      accuracy: s1.accuracy,
      numCorrect: s1.numCorrect,
      numTotal: s1.numTotal,
      byType: s1.byType,
      latencyMs: s1.latencyMs,
      tokenUsage: s1.tokenUsage,
    })),
    system2: result.system2.map((s2) => ({
      budget: s2.budget,
      contextTokens: s2.contextTokens,
      passRate: s2.passRate,
      numPassed: s2.numPassed,
      numTotal: s2.numTotal,
      taskSummary: s2.taskResults.map((t) => ({
        taskId: t.taskId,
        passed: t.passed,
        visiblePassed: t.visiblePassed,
        visibleTotal: t.visibleTotal,
        hiddenPassed: t.hiddenPassed,
        hiddenTotal: t.hiddenTotal,
        taskSpecificPassed: t.taskSpecificPassed,
        taskSpecificTotal: t.taskSpecificTotal,
        protocolContractViolated: t.protocolContractViolated,
        latencyMs: t.latencyMs,
        tokenUsage: t.tokenUsage,
        error: t.error,
      })),
    })),
  };
  writeJson(runDir, "summary.json", summary);

  // system1/
  for (const s1 of result.system1) {
    writeSystem1BudgetLog(runDir, s1);
  }

  // system2/
  for (const s2 of result.system2) {
    writeSystem2BudgetLog(runDir, s2);
  }

  console.log(`[calibration-log] Run logs written to: ${runDir}`);
  return runDir;
}

// ---- 系統1 ----

function writeSystem1BudgetLog(runDir: string, s1: System1BudgetResult): void {
  const budgetLabel = budgetDirName(s1.budget);
  const dir = path.join(runDir, "system1", budgetLabel);
  fs.mkdirSync(dir, { recursive: true });

  writeJson(dir, "meta.json", {
    budget: s1.budget,
    contextTokens: s1.contextTokens,
    // 主指標: boolean型プローブのみ（mc/stpはreference。F9参照）
    boolAccuracy: s1.boolAccuracy,
    boolNumCorrect: s1.boolNumCorrect,
    boolNumTotal: s1.boolNumTotal,
    // 参考: 全プローブ集計
    accuracy: s1.accuracy,
    numCorrect: s1.numCorrect,
    numTotal: s1.numTotal,
    byType: s1.byType,
    latencyMs: s1.latencyMs ?? null,
    tokenUsage: s1.tokenUsage ?? null,
  });

  if (s1.contextFiles) {
    writeJson(dir, "context_contents.json", s1.contextFiles);
  }

  if (s1.agentPromptBatches) {
    for (let i = 0; i < s1.agentPromptBatches.length; i++) {
      writeJson(dir, `agent_prompt_batch${i}.json`, { prompt: s1.agentPromptBatches[i] });
    }
  }

  if (s1.agentResponseBatches) {
    for (let i = 0; i < s1.agentResponseBatches.length; i++) {
      writeJson(dir, `agent_response_batch${i}.json`, { response: s1.agentResponseBatches[i] });
    }
  }

  writeJson(dir, "probe_results.json", s1.probeDetails);
}

// ---- 系統2 ----

function writeSystem2BudgetLog(runDir: string, s2: System2BudgetResult): void {
  const budgetLabel = budgetDirName(s2.budget);
  const budgetDir = path.join(runDir, "system2", budgetLabel);
  fs.mkdirSync(budgetDir, { recursive: true });

  writeJson(budgetDir, "summary.json", {
    budget: s2.budget,
    contextTokens: s2.contextTokens,
    passRate: s2.passRate,
    numPassed: s2.numPassed,
    numTotal: s2.numTotal,
  });

  for (const task of s2.taskResults) {
    writeSystem2TaskLog(budgetDir, task);
  }
}

function writeSystem2TaskLog(budgetDir: string, task: System2TaskResult): void {
  const taskDir = path.join(budgetDir, task.taskId);
  fs.mkdirSync(taskDir, { recursive: true });

  writeJson(taskDir, "meta.json", {
    taskId: task.taskId,
    passed: task.passed,
    visiblePassed: task.visiblePassed,
    visibleTotal: task.visibleTotal,
    hiddenPassed: task.hiddenPassed,
    hiddenTotal: task.hiddenTotal,
    taskSpecificPassed: task.taskSpecificPassed,
    taskSpecificTotal: task.taskSpecificTotal,
    protocolContractViolated: task.protocolContractViolated,
    latencyMs: task.latencyMs ?? null,
    tokenUsage: task.tokenUsage ?? null,
    error: task.error ?? null,
  });

  if (task.contextFiles) {
    writeJson(taskDir, "context_contents.json", task.contextFiles);
  }

  if (task.agentResponse !== undefined) {
    writeJson(taskDir, "agent_response.json", { response: task.agentResponse });
  }

  if (task.visibleTestCases) {
    writeJson(taskDir, "visible_test_results.json", { testCases: task.visibleTestCases });
  }

  if (task.hiddenTestCases) {
    writeJson(taskDir, "hidden_test_results.json", { testCases: task.hiddenTestCases });
  }

  if (task.taskSpecificTestCases !== undefined) {
    writeJson(taskDir, "task_specific_test_result.json", { testCases: task.taskSpecificTestCases });
  }

  if (task.repositoryAfter && Object.keys(task.repositoryAfter).length > 0) {
    const repoAfterDir = path.join(taskDir, "repository_after");
    fs.mkdirSync(repoAfterDir, { recursive: true });
    for (const [relPath, content] of Object.entries(task.repositoryAfter)) {
      const absPath = path.join(repoAfterDir, relPath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content, "utf8");
    }
  }
}

// ---- ユーティリティ ----

function budgetDirName(budget: BudgetValue): string {
  if (budget === "full") return "BFull";
  if (budget === 0) return "B0";
  return `B${budget / 1000}K`;
}

function writeJson(dir: string, filename: string, data: unknown): void {
  fs.writeFileSync(
    path.join(dir, filename),
    JSON.stringify(data, null, 2),
    "utf8"
  );
}
