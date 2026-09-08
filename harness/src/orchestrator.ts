// harness/src/orchestrator.ts
// 世代継承ループ本体。Stage 0互換を維持しつつ、Stage 1 preflight用の
// mutation validation / execution status logging を追加する。

import * as fs from "fs";
import * as path from "path";
import { RunConfig, GenerationLog, AgentExecutionStatus } from "./types";
import { AgentBackend } from "./agent-backend/types";
import { MockNoopBackend } from "./agent-backend/mock-noop";
import { MockOracleBackend } from "./agent-backend/mock-oracle";
import { AnthropicBackend } from "./agent-backend/anthropic";
import { OpenAIBackend } from "./agent-backend/openai";
import { assembleContext, estimateTokenCount } from "./context/assembler";
import { runScoring } from "./scoring";
import { writeGenerationLog, generateDiff } from "./logging";
import { validateModifiedFiles } from "./repository/path-guard";

export interface OrchestratorResult {
  completedGenerations: number;
  logDirs: string[];
  crashed: boolean;
  crashError?: string;
}

interface HeldOutTask {
  taskId: string;
  visibleInstruction: string;
  taskSpecificTestCode?: string;
}

export async function runGenerationLoop(config: RunConfig): Promise<OrchestratorResult> {
  console.log(`[orchestrator] Starting experiment "${config.experimentId}" / lineage "${config.lineageId}"`);
  console.log(`[orchestrator] Backend: ${config.backend}, Condition: ${config.condition}, Generations: ${config.generations}`);

  const tasksPath = path.join(config.syntheticWorldDir, "heldout_tasks.json");
  const allTasks: HeldOutTask[] = JSON.parse(fs.readFileSync(tasksPath, "utf8"));
  const taskMap = new Map(allTasks.map((t) => [t.taskId, t]));

  for (const taskId of config.tasks) {
    if (!taskMap.has(taskId)) {
      throw new Error(`Task "${taskId}" not found in heldout_tasks.json`);
    }
  }

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
        task.taskSpecificTestCode,
        currentFiles
      );

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

async function runOneGeneration(
  config: RunConfig,
  generation: number,
  taskId: string,
  visibleInstruction: string,
  taskSpecificTestCode: string | undefined,
  currentFiles: Record<string, string>
): Promise<{ logDir: string; repositoryAfter: Record<string, string> }> {
  const repositoryBefore = { ...currentFiles };
  const contextFiles = assembleContext(currentFiles, config.condition);
  const actualContextTokens = estimateTokenCount(contextFiles);
  const agentPromptSummary = buildAgentPromptSummary(contextFiles, visibleInstruction);

  const backend = createBackend(config, taskId);
  const agentResult = await backend.run({
    contextFiles,
    visibleInstruction,
    contextBudget: config.contextBudget,
  });

  let executionStatus: AgentExecutionStatus = agentResult.executionStatus;
  let validatedModifiedFiles: Record<string, string> = {};

  if (executionStatus === "ok") {
    try {
      validatedModifiedFiles = validateModifiedFiles(agentResult.modifiedFiles);
    } catch (e) {
      executionStatus = "mutation-validation-failure";
      console.warn(
        `[orchestrator] Rejecting invalid agent mutation: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  // parse / mutation validation failureは通常task failureと区別し、repositoryを変更しない。
  const repositoryAfter: Record<string, string> = {
    ...currentFiles,
    ...validatedModifiedFiles,
  };

  console.log(`  [scoring] Running tests...`);
  const scoring = await runScoring(repositoryAfter, config.syntheticWorldDir, taskSpecificTestCode);

  const taskSpecificPassed =
    scoring.taskSpecificTests === null || scoring.taskSpecificTests.passed;

  const functionalTaskResult =
    executionStatus === "ok" &&
    scoring.visibleTests.passed &&
    scoring.hiddenTests.passed &&
    taskSpecificPassed;

  const log: GenerationLog = {
    experiment_id: config.experimentId,
    lineage_id: config.lineageId,
    generation,
    condition: config.condition,
    model: config.model ?? null,
    model_provenance: agentResult.modelProvenance,
    task_id: taskId,
    repository_before: repositoryBefore,
    repository_after: repositoryAfter,
    git_diff: generateDiff(repositoryBefore, repositoryAfter),
    context_budget: config.contextBudget,
    actual_context_tokens: actualContextTokens,
    context_contents: contextFiles,
    agent_prompt: agentPromptSummary,
    agent_response: agentResult.rawResponse,
    explicit_working_note: agentResult.explicitWorkingNote,
    tool_calls: agentResult.toolEvents,
    agent_execution_status: executionStatus,
    agent_error: agentResult.error,
    visible_test_results: scoring.visibleTests,
    hidden_test_results: scoring.hiddenTests,
    task_specific_test_result: scoring.taskSpecificTests,
    functional_task_result: functionalTaskResult,
    semantic_probe_results: null,
    semantic_element_trace: null,
    latency_ms: agentResult.latencyMs,
    token_usage: agentResult.tokenUsage ?? null,
    cost: agentResult.estimatedCostUsd,
    protocol_contract_violated: scoring.protocolContractViolated,
  };

  const logDir = writeGenerationLog(log, config.runsDir);
  return { logDir, repositoryAfter };
}

function createBackend(config: RunConfig, taskId: string): AgentBackend {
  switch (config.backend) {
    case "mock-noop":
      return new MockNoopBackend();
    case "mock-oracle": {
      const harnessDir = path.dirname(__dirname);
      const fixturesDir = path.join(harnessDir, "fixtures");
      return new MockOracleBackend(taskId, fixturesDir);
    }
    case "anthropic": {
      const model = config.model ?? "claude-haiku-4-5-20251001";
      return new AnthropicBackend(model);
    }
    case "openai": {
      const model = config.model ?? "gpt-5.6-luna";
      return new OpenAIBackend({
        model,
        reasoningEffort: config.reasoningEffort ?? "medium",
        maxOutputTokens: config.maxOutputTokens ?? 8192,
        requestTimeoutMs: config.requestTimeoutMs ?? 120_000,
        maxRetries: config.maxRetries ?? 2,
        storeResponses: config.storeResponses ?? false,
        maxToolRounds: config.maxToolRounds ?? 4,
      });
    }
  }
}

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

function buildAgentPromptSummary(
  contextFiles: Record<string, string>,
  visibleInstruction: string
): string {
  const fileList = Object.keys(contextFiles).sort().join(", ");
  return `[Context files: ${fileList}]\n\nTask:\n${visibleInstruction}`;
}
