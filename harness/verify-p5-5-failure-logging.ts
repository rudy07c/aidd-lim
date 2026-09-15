import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AgentRetrievedEpisode, AgentRetrievedDecision } from "./src/context/agent-retrieved-episode";
import { ExplorationBudget } from "./src/context/exploration-budget";
import { buildObservableInteractionRecord } from "./src/context/observable-interaction";
import { buildFailedAgentRetrievedGenerationLog } from "./src/context/retrieved-generation-log";
import { RetrievedEpisodeRuntimeFailure } from "./src/context/retrieved-episode-runtime";
import { WorkingSetManager } from "./src/context/working-set-manager";
import { writeGenerationLog } from "./src/logging";
import type { GenerationLog, ModelProvenance, TestSuiteResult } from "./src/types";

const syntheticWorldDir = path.join(__dirname, "../synthetic-world");
const repositoryDir = path.join(syntheticWorldDir, "repository");
const PROTOCOL = "p5.5-failure-log-v1";

function loadRepository(): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        result[path.relative(repositoryDir, full).replace(/\\/g, "/")] = fs.readFileSync(full, "utf8");
      }
    }
  };
  walk(repositoryDir);
  return result;
}

function transport() {
  return {
    protocolId: PROTOCOL,
    previousResponseIdUsed: false,
    providerConversationReused: false,
    priorAssistantHistoryReplayed: false,
    encryptedReasoningReplayed: false,
    compactionStateReplayed: false,
    otherOpaqueStateReplayed: false,
    responseStored: false,
  } as const;
}

function suite(): TestSuiteResult {
  return { passed: false, numPassed: 0, numFailed: 1, testCases: [], rawJestOutput: {} };
}

function provenance(): ModelProvenance {
  return {
    provider: "mock",
    requestedModel: null,
    actualModel: "mock-noop",
    responseId: null,
    responseStatus: "completed",
    endpoint: "mock",
    reasoningEffort: null,
    maxOutputTokens: null,
    structuredOutput: true,
    storeResponses: null,
    requestedServiceTier: null,
    actualServiceTier: null,
    promptCacheMode: null,
    promptVersion: PROTOCOL,
    promptHash: null,
    schemaVersion: null,
    schemaHash: null,
    pricingMode: null,
    continuationState: "none",
    incompleteReason: null,
    refusal: null,
    providerErrorCode: null,
    sdkVersion: null,
    retryPolicy: { maxRetries: 0, timeoutMs: null },
  };
}

async function main(): Promise<void> {
  const repository = loadRepository();
  const workingSet = new WorkingSetManager(1600);
  const budget = new ExplorationBudget({
    maxRetrievalOperations: 4,
    maxCumulativeRetrievedTokens: 10000,
    maxModelCalls: 4,
    maxDecisionRounds: 4,
  });
  const episode = new AgentRetrievedEpisode<{ modifiedFiles: Record<string, string> }>({
    taskId: "T-failure-log",
    visibleInstruction: "Trigger one invalid repository retrieval.",
    protocolId: PROTOCOL,
    repositoryFiles: repository,
    workingSet,
    explorationBudget: budget,
    executorFactory: () => ({
      async runFresh() {
        const decision: AgentRetrievedDecision<{ modifiedFiles: Record<string, string> }> = {
          kind: "retrieve",
          call: {
            toolName: "read_chunk",
            arguments: {
              path: "../ground_truth.json",
              startLine: null,
              endLine: null,
              workingNote: null,
            },
          },
        };
        return {
          decision,
          rawResponse: "invalid retrieval",
          explicitMemoryUpdate: null,
          transport: transport(),
        };
      },
    }),
  });

  let failure: RetrievedEpisodeRuntimeFailure<unknown> | null = null;
  try {
    await episode.run();
  } catch (error) {
    if (error instanceof RetrievedEpisodeRuntimeFailure) failure = error;
    else throw error;
  }
  assert.ok(failure, "invalid retrieval must produce a persistable runtime failure");
  const retrieved = buildFailedAgentRetrievedGenerationLog(failure);
  assert.strictEqual(retrieved.completion.status, "failed");
  assert.strictEqual(retrieved.retrievals.length, 1);
  assert.ok(retrieved.retrievals[0].error);
  assert.strictEqual(retrieved.retrievals[0].exposedTokens, 0);
  assert.strictEqual(retrieved.summary.failedRetrievalCount, 1);
  assert.strictEqual(retrieved.episode.explorationBudget.used.retrievalOperations, 1);
  assert.strictEqual(retrieved.episode.explorationBudget.pendingRetrieval, null);

  const observable = buildObservableInteractionRecord({
    generation: 0,
    taskId: "T-failure-log",
    visibleInstruction: "Trigger one invalid repository retrieval.",
    observableAssistantMessages: ["invalid retrieval"],
    toolEvents: [{
      callId: retrieved.retrievals[0].label,
      toolName: retrieved.retrievals[0].operation,
      arguments: retrieved.retrievals[0].request,
      result: null,
      ok: false,
      error: retrieved.retrievals[0].error ?? undefined,
    }],
    explicitWorkingNote: null,
    repositoryBefore: repository,
    repositoryAfter: repository,
    appliedDiff: "",
    visibleFeedback: [],
  });

  const generationLog: GenerationLog = {
    experiment_id: "p5-5-failed-retrieval",
    lineage_id: "lineage-0",
    generation: 0,
    condition: "AR",
    model: null,
    model_provenance: provenance(),
    task_id: "T-failure-log",
    repository_before: repository,
    repository_after: repository,
    git_diff: "",
    context_budget: 1600,
    actual_context_tokens: retrieved.summary.peakWorkingSetTokens,
    context_contents: {},
    agent_prompt: "failure logging verification",
    agent_response: "invalid retrieval",
    observable_assistant_messages: ["invalid retrieval"],
    explicit_working_note: null,
    tool_calls: [],
    observable_interaction_record: observable,
    inherited_observable_interaction_hash: null,
    operational_full_feasibility: {
      checked: false,
      feasible: null,
      method: "not-applicable",
      contextCapacityTokens: null,
      conservativeInputUpperBoundTokens: null,
      reservedOutputTokens: null,
    },
    retrieved_episode_log: retrieved,
    agent_execution_status: "tool-error",
    agent_error: { category: "tool", message: failure.message, retryable: null },
    visible_test_results: suite(),
    hidden_test_results: suite(),
    task_specific_test_result: null,
    functional_task_result: false,
    semantic_probe_results: null,
    semantic_element_trace: null,
    latency_ms: 0,
    token_usage: null,
    cost: 0,
    protocol_contract_violated: false,
  };

  const runsDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-ilm-p5-5-failure-"));
  try {
    const generationDir = writeGenerationLog(generationLog, runsDir);
    const persisted = JSON.parse(
      fs.readFileSync(path.join(generationDir, "retrieved_episode.json"), "utf8")
    );
    assert.strictEqual(persisted.completion.status, "failed");
    assert.ok(persisted.retrievals[0].error);
    assert.strictEqual(persisted.summary.failedRetrievalCount, 1);
  } finally {
    fs.rmSync(runsDir, { recursive: true, force: true });
  }

  console.log(JSON.stringify({
    status: "ok",
    retrievalOperations: retrieved.episode.explorationBudget.used.retrievalOperations,
    failedRetrievalCount: retrieved.summary.failedRetrievalCount,
    phaseTrace: retrieved.retrievals[0].phaseTrace,
    persisted: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
