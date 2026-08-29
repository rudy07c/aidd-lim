// harness/src/orchestrator.ts
//
// 世代継承ループ本体。
// docs/harness_stage0_plan.md 2.4節「世代の独立性（fresh session）の実装」に準拠。
//
// データフロー（1世代）:
//   [前世代のrepository（ファイル群）]
//     -> context assembler
//     -> agent backend（fresh instance）
//     -> scoring（visible tests + H(G)）
//     -> logging
//     -> [次世代へ渡すrepository（ファイル群のみ、対話履歴は破棄）]

import * as fs from "fs";
import * as path from "path";
import { RunConfig, GenerationLog } from "./types";
import { AgentBackend } from "./agent-backend/types";
import { MockNoopBackend } from "./agent-backend/mock-noop";
import { MockOracleBackend } from "./agent-backend/mock-oracle";
import { AnthropicBackend } from "./agent-backend/anthropic";
import { assembleContext, estimateTokenCount } from "./context/assembler";
import { runScoring } from "./scoring";
import { writeGenerationLog, generateDiff } from "./logging";

export interface OrchestratorResult {
  completedGenerations: number;
  logDirs: string[];
  crashed: boolean;
  crashError?: string;
}

/**
 * heldout_tasks.json から visibleInstruction を取得するためのミニマルな型。
 * worker agentには visibleInstruction のみを渡す（groundTruthDelta は非公開）。
 */
interface HeldOutTask {
  taskId: string;
  visibleInstruction: string;
}

/**
 * 世代継承ループを実行する。
 *
 * @param config 実行設定
 * @returns 完了した世代数とログパスのリスト
 */
export async function runGenerationLoop(config: RunConfig): Promise<OrchestratorResult> {
  console.log(`[orchestrator] Starting experiment "${config.experimentId}" / lineage "${config.lineageId}"`);
  console.log(`[orchestrator] Backend: ${config.backend}, Condition: ${config.condition}, Generations: ${config.generations}`);

  // heldout_tasks.json を読み込む（visibleInstruction のみ使用）
  const tasksPath = path.join(config.syntheticWorldDir, "heldout_tasks.json");
  const allTasks: HeldOutTask[] = JSON.parse(fs.readFileSync(tasksPath, "utf8"));
  const taskMap = new Map(allTasks.map((t) => [t.taskId, t]));

  // タスクリストを設定から取得（存在確認）
  for (const taskId of config.tasks) {
    if (!taskMap.has(taskId)) {
      throw new Error(`Task "${taskId}" not found in heldout_tasks.json`);
    }
  }

  // 初期リポジトリを読み込む（synthetic-world/repository/ 配下の全ファイル）
  const repositoryDir = path.join(config.syntheticWorldDir, "repository");
  let currentFiles = loadRepositoryFiles(repositoryDir);

  console.log(`[orchestrator] Loaded ${Object.keys(currentFiles).length} repository files.`);

  const logDirs: string[] = [];
  let completedGenerations = 0;

  for (let gen = 0; gen < config.generations; gen++) {
    const taskId = config.tasks[gen % config.tasks.length];
    const task = taskMap.get(taskId)!;

    console.log(`\n[orchestrator] Generation ${gen} | Task: ${taskId}`);

    try {
      const { logDir, repositoryAfter } = await runOneGeneration(
        config,
        gen,
        taskId,
        task.visibleInstruction,
        currentFiles
      );

      // 次世代へ渡すリポジトリを更新（前世代の対話履歴・agent内部状態は一切継承しない）
      // 継承されるのはリポジトリのファイル群のみ（計画書2.3節）
      currentFiles = repositoryAfter;

      logDirs.push(logDir);
      completedGenerations++;
      console.log(`[orchestrator] Generation ${gen} completed. Log: ${logDir}`);
    } catch (e) {
      console.error(`[orchestrator] Generation ${gen} CRASHED:`, e);
      return {
        completedGenerations,
        logDirs,
        crashed: true,
        crashError: e instanceof Error ? e.message : String(e),
      };
    }
  }

  console.log(`\n[orchestrator] Experiment complete. ${completedGenerations}/${config.generations} generations completed.`);
  return { completedGenerations, logDirs, crashed: false };
}

/**
 * 1世代分の実行+ログ書き出し。
 * agentは1回だけ呼び、その結果をログと次世代入力の両方に使う。
 */
async function runOneGeneration(
  config: RunConfig,
  generation: number,
  taskId: string,
  visibleInstruction: string,
  currentFiles: Record<string, string>
): Promise<{ logDir: string; repositoryAfter: Record<string, string> }> {
  const repositoryBefore = { ...currentFiles };

  // 1. コンテキスト組み立て
  const contextFiles = assembleContext(currentFiles, config.condition);
  const actualContextTokens = estimateTokenCount(contextFiles);

  // 2. ログ記録用プロンプトサマリー（anthropic.ts の実際のプロンプトとは別）
  const agentPromptSummary = buildAgentPromptSummary(contextFiles, visibleInstruction);

  // 3. エージェント実行（各世代で new インスタンスを生成 = fresh session）
  //    前世代のメッセージ履歴・chain-of-thoughtは一切継承しない（変数スコープで保証）
  const backend = createBackend(config, taskId);
  const agentResult = await backend.run({
    contextFiles,
    visibleInstruction,
    contextBudget: config.contextBudget,
  });

  // 4. 修正後ファイル群を確定（modifiedFiles を currentFiles にマージ）
  //    継承されるのはファイル内容のみ
  const repositoryAfter: Record<string, string> = {
    ...currentFiles,
    ...agentResult.modifiedFiles,
  };

  // 5. スコアリング
  console.log(`  [scoring] Running tests...`);
  const scoring = await runScoring(repositoryAfter, config.syntheticWorldDir);
  console.log(
    `  [scoring] Visible: ${scoring.visibleTests.numPassed}/${scoring.visibleTests.numPassed + scoring.visibleTests.numFailed} passed`
  );
  console.log(
    `  [scoring] Hidden:  ${scoring.hiddenTests.numPassed}/${scoring.hiddenTests.numPassed + scoring.hiddenTests.numFailed} passed`
  );
  if (scoring.protocolContractViolated) {
    console.warn(`  [scoring] WARNING: protocol_adapter.ts contract violation detected!`);
  }

  // 6. ログ書き出し
  const log: GenerationLog = {
    experiment_id: config.experimentId,
    lineage_id: config.lineageId,
    generation,
    condition: config.condition,
    model: config.model ?? null,

    task_id: taskId,

    repository_before: repositoryBefore,
    repository_after: repositoryAfter,
    git_diff: generateDiff(repositoryBefore, repositoryAfter),

    context_budget: config.contextBudget,
    actual_context_tokens: actualContextTokens,
    context_contents: contextFiles,

    agent_prompt: agentPromptSummary,
    agent_response: agentResult.rawResponse,
    tool_calls: [],

    visible_test_results: scoring.visibleTests,
    hidden_test_results: scoring.hiddenTests,
    functional_task_result:
      scoring.visibleTests.passed && scoring.hiddenTests.passed,

    semantic_probe_results: null,
    semantic_element_trace: null,

    latency_ms: agentResult.latencyMs,
    token_usage: agentResult.tokenUsage ?? null,
    cost: null,

    protocol_contract_violated: scoring.protocolContractViolated,
  };

  const logDir = writeGenerationLog(log, config.runsDir);
  return { logDir, repositoryAfter };
}

/**
 * BackendTypeに応じたAgentBackendインスタンスを生成する。
 * 各世代で新しいインスタンスを生成することで fresh session を保証する。
 */
function createBackend(config: RunConfig, taskId: string): AgentBackend {
  switch (config.backend) {
    case "mock-noop":
      return new MockNoopBackend();
    case "mock-oracle": {
      // harness/fixtures/ ディレクトリへのパス
      // __dirname = harness/src/ なので1つ上がってharness/
      const harnessDir = path.dirname(__dirname);
      const fixturesDir = path.join(harnessDir, "fixtures");
      return new MockOracleBackend(taskId, fixturesDir);
    }
    case "anthropic": {
      const model = config.model ?? "claude-haiku-4-5-20251001";
      return new AnthropicBackend(model);
    }
  }
}

/**
 * ディレクトリ配下の全ファイルを読み込み、相対パス -> 内容 のマップを返す。
 */
function loadRepositoryFiles(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  loadDirRecursive(dir, dir, result);
  return result;
}

function loadDirRecursive(
  baseDir: string,
  currentDir: string,
  result: Record<string, string>
): void {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      loadDirRecursive(baseDir, fullPath, result);
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
      result[relPath] = fs.readFileSync(fullPath, "utf8");
    }
  }
}

/**
 * ログ記録用のagent promptサマリーを構築する。
 */
function buildAgentPromptSummary(
  contextFiles: Record<string, string>,
  visibleInstruction: string
): string {
  const fileList = Object.keys(contextFiles).sort().join(", ");
  return `[Context files: ${fileList}]\n\nTask:\n${visibleInstruction}`;
}
