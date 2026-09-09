// harness/src/orchestrator.ts
// 世代継承ループ本体。Stage 0互換を維持しつつ、Stage 1 validity semanticsを追加する。

import * as fs from "fs";
import * as path from "path";
import {
  RunConfig,
  GenerationLog,
  AgentExecutionStatus,
  getContextCondition,
} from "./types";
import { AgentBackend } from "./agent-backend/types";
import { MockNoopBackend } from "./agent-backend/mock-noop";
import { MockOracleBackend } from "./agent-backend/mock-oracle";
import { AnthropicBackend } from "./agent-backend/anthropic";
import { OpenAIBackend } from "./agent-backend/openai";
import { assembleContext, estimateTokenCount } from "./context/assembler";
import {
  ObservableInteractionRecord,
  buildObservableInteractionRecord,
  evaluateOperationalFullFeasibility,
} from "./context/observable-interaction";
import { runScoring } from "./scoring";
import { writeGenerationLog, generateDiff } from "./logging";
import { validateModifiedFiles } from "./repository/path-guard";

export interface OrchestratorResult {
  completedGenerations: number;
  logDirs: string[];
  crashed: boolean;
  crashError?: string;
}

interface HeldOutTask { taskId: string; visibleInstruction: string; taskSpecificTestCode?: string; }

export type AgentBackendFactory = (
  config: RunConfig,
  taskId: string,
  generation: number
) => AgentBackend;

const GPT_5_6_LUNA_CONTEXT_CAPACITY_TOKENS = 1_050_000;

export async function runGenerationLoop(
  config: RunConfig,
  backendFactory: AgentBackendFactory = createBackend
): Promise<OrchestratorResult> {
  console.log(`[orchestrator] Starting experiment "${config.experimentId}" / lineage "${config.lineageId}"`);
  console.log(`[orchestrator] Backend: ${config.backend}, Condition: ${config.condition}, Generations: ${config.generations}`);
  const tasksPath = path.join(config.syntheticWorldDir, "heldout_tasks.json");
  const allTasks: HeldOutTask[] = JSON.parse(fs.readFileSync(tasksPath, "utf8"));
  const taskMap = new Map(allTasks.map((t) => [t.taskId, t]));
  for (const taskId of config.tasks) if (!taskMap.has(taskId)) throw new Error(`Task "${taskId}" not found in heldout_tasks.json`);

  const repositoryDir = path.join(config.syntheticWorldDir, "repository");
  let currentFiles = loadRepositoryFiles(repositoryDir);
  const logDirs: string[] = [];
  let completedGenerations = 0;
  // Disk may contain the full lineage for analysis, but successor input only receives this
  // single immediate-predecessor record. It is overwritten after every valid generation.
  let previousInteractionRecord: ObservableInteractionRecord | null = null;

  for (let gen = 0; gen < config.generations; gen++) {
    const taskId = config.tasks[gen % config.tasks.length];
    const task = taskMap.get(taskId)!;
    try {
      const { logDir, repositoryAfter, interactionRecord } = await runOneGeneration(
        config,
        gen,
        taskId,
        task.visibleInstruction,
        task.taskSpecificTestCode,
        currentFiles,
        previousInteractionRecord,
        backendFactory
      );
      currentFiles = repositoryAfter;
      previousInteractionRecord = interactionRecord;
      logDirs.push(logDir);
      completedGenerations++;
    } catch (e) {
      return { completedGenerations, logDirs, crashed: true, crashError: e instanceof Error ? e.message : String(e) };
    }
  }
  return { completedGenerations, logDirs, crashed: false };
}

async function runOneGeneration(
  config: RunConfig,
  generation: number,
  taskId: string,
  visibleInstruction: string,
  taskSpecificTestCode: string | undefined,
  currentFiles: Record<string, string>,
  previousInteractionRecord: ObservableInteractionRecord | null,
  backendFactory: AgentBackendFactory
): Promise<{
  logDir: string;
  repositoryAfter: Record<string, string>;
  interactionRecord: ObservableInteractionRecord;
}> {
  const repositoryBefore = { ...currentFiles };
  const contextFiles = assembleContext(currentFiles, config.condition);
  const actualContextTokens = estimateTokenCount(contextFiles);
  const inheritedInteractionRecord = selectInheritedInteractionRecord(
    config.condition,
    previousInteractionRecord
  );

  const feasibility = evaluateOperationalFullFeasibility({
    applicable: config.condition === "AF" || config.condition === "MOI",
    contextFiles,
    visibleInstruction,
    previousInteractionRecord: inheritedInteractionRecord,
    reservedOutputTokens: config.maxOutputTokens ?? 8192,
    contextCapacityTokens: contextCapacityTokensFor(config),
  });
  if (feasibility.checked && feasibility.feasible === false) {
    throw new Error(
      `Operational-Full feasibility invariant failed for ${config.condition}: ` +
      `input_upper_bound=${feasibility.conservativeInputUpperBoundTokens}, ` +
      `reserved_output=${feasibility.reservedOutputTokens}, capacity=${feasibility.contextCapacityTokens}`
    );
  }

  const agentPromptSummary = buildAgentPromptSummary(
    contextFiles,
    visibleInstruction,
    inheritedInteractionRecord
  );

  // Factory is invoked inside every generation: no provider/backend instance is inherited.
  const backend = backendFactory(config, taskId, generation);
  const agentResult = await backend.run({
    contextFiles,
    visibleInstruction,
    previousInteractionRecord: inheritedInteractionRecord,
    contextBudget: config.contextBudget,
  });

  // Provider/network failures are infrastructure failures, not software-evolution outcomes.
  // Do not score or advance the lineage after the SDK's frozen retry policy is exhausted.
  if (shouldCensorGeneration(agentResult.executionStatus)) {
    throw new Error(`Provider/response failure; generation invalid/censored (${agentResult.executionStatus}): ${agentResult.error?.message ?? "no detail"}`);
  }

  let executionStatus: AgentExecutionStatus = agentResult.executionStatus;
  let validatedModifiedFiles: Record<string, string> = {};
  if (executionStatus === "ok") {
    try {
      validatedModifiedFiles = validateModifiedFiles(agentResult.modifiedFiles);
    } catch (e) {
      executionStatus = "mutation-validation-failure";
    }
  }

  const repositoryAfter: Record<string, string> = { ...currentFiles, ...validatedModifiedFiles };
  const gitDiff = generateDiff(repositoryBefore, repositoryAfter);

  // Build the record before scoring. Hidden/visible evaluator outputs therefore cannot be
  // accidentally copied into MOI history. visibleFeedback remains empty until a future repair
  // loop actually presents feedback to the worker.
  const interactionRecord = buildObservableInteractionRecord({
    generation,
    taskId,
    visibleInstruction,
    observableAssistantMessages: agentResult.observableAssistantMessages,
    toolEvents: agentResult.toolEvents,
    explicitWorkingNote: agentResult.explicitWorkingNote,
    repositoryBefore,
    repositoryAfter,
    appliedDiff: gitDiff,
    visibleFeedback: [],
  });

  const scoring = await runScoring(repositoryAfter, config.syntheticWorldDir, taskSpecificTestCode);
  const taskSpecificPassed = scoring.taskSpecificTests === null || scoring.taskSpecificTests.passed;
  const functionalTaskResult = executionStatus === "ok" && scoring.visibleTests.passed && scoring.hiddenTests.passed && taskSpecificPassed;

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
    git_diff: gitDiff,
    context_budget: config.contextBudget,
    actual_context_tokens: actualContextTokens,
    context_contents: contextFiles,
    agent_prompt: agentPromptSummary,
    agent_response: agentResult.rawResponse,
    observable_assistant_messages: agentResult.observableAssistantMessages,
    explicit_working_note: agentResult.explicitWorkingNote,
    tool_calls: agentResult.toolEvents,
    observable_interaction_record: interactionRecord,
    inherited_observable_interaction_hash: inheritedInteractionRecord?.contentHash ?? null,
    operational_full_feasibility: feasibility,
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
  return { logDir, repositoryAfter, interactionRecord };
}

/** Exactly one previous record is eligible, and only MOI receives it. */
export function selectInheritedInteractionRecord(
  conditionName: RunConfig["condition"],
  previousInteractionRecord: ObservableInteractionRecord | null
): ObservableInteractionRecord | null {
  const condition = getContextCondition(conditionName);
  return condition.inheritsObservableHistory ? previousInteractionRecord : null;
}

function contextCapacityTokensFor(config: RunConfig): number | null {
  if (config.backend !== "openai") return null;
  const model = config.model ?? "gpt-5.6-luna";
  return model === "gpt-5.6-luna" ? GPT_5_6_LUNA_CONTEXT_CAPACITY_TOKENS : null;
}

function createBackend(config: RunConfig, taskId: string, _generation: number): AgentBackend {
  switch (config.backend) {
    case "mock-noop": return new MockNoopBackend();
    case "mock-oracle": {
      const harnessDir = path.dirname(__dirname);
      return new MockOracleBackend(taskId, path.join(harnessDir, "fixtures"));
    }
    case "anthropic": return new AnthropicBackend(config.model ?? "claude-haiku-4-5-20251001");
    case "openai": return new OpenAIBackend({
      model: config.model ?? "gpt-5.6-luna",
      reasoningEffort: config.reasoningEffort ?? "medium",
      maxOutputTokens: config.maxOutputTokens ?? 8192,
      requestTimeoutMs: config.requestTimeoutMs ?? 120_000,
      maxRetries: config.maxRetries ?? 2,
      storeResponses: config.storeResponses ?? false,
      maxToolRounds: config.maxToolRounds ?? 4,
      serviceTier: config.serviceTier ?? "default",
      promptCacheMode: config.promptCacheMode ?? "implicit",
    });
  }
}

function loadRepositoryFiles(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  loadDirRecursive(dir, dir, result);
  return result;
}
function loadDirRecursive(baseDir: string, currentDir: string, result: Record<string, string>): void {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) loadDirRecursive(baseDir, fullPath, result);
    else if (entry.isFile()) result[path.relative(baseDir, fullPath).replace(/\\/g, "/")] = fs.readFileSync(fullPath, "utf8");
  }
}
function buildAgentPromptSummary(
  contextFiles: Record<string, string>,
  visibleInstruction: string,
  inheritedInteractionRecord: ObservableInteractionRecord | null
): string {
  const history = inheritedInteractionRecord
    ? `[Previous observable interaction: ${inheritedInteractionRecord.contentHash}]\n`
    : "[Previous observable interaction: none]\n";
  return `${history}[Context files: ${Object.keys(contextFiles).sort().join(", ")}]\n\nTask:\n${visibleInstruction}`;
}

const CENSORED_AGENT_STATUSES = new Set<AgentExecutionStatus>([
  "provider-error",
  "response-failed",
  "response-incomplete",
  "response-not-completed",
  "response-refusal",
]);

/**
 * Provider/Responses transport・completion由来で、software evolutionの結果として
 * lineageへ取り込んではならないstatusだけをcensorする。
 * output-parse-failure / tool-error / mutation-validation-failureはagentがtaskを
 * 実際に試みた結果としてcensorしない。
 */
export function shouldCensorGeneration(status: AgentExecutionStatus): boolean {
  return CENSORED_AGENT_STATUSES.has(status);
}
