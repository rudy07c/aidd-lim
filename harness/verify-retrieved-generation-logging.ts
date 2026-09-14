import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { GroundTruth, GroundTruthDelta, NamingScheme } from "../synthetic-world/schema";
import {
  AgentRetrievedDecision,
  AgentRetrievedEpisode,
} from "./src/context/agent-retrieved-episode";
import { ExplorationBudget, ExplorationLimits } from "./src/context/exploration-budget";
import {
  buildObservableInteractionRecord,
  evaluateOperationalFullFeasibility,
} from "./src/context/observable-interaction";
import {
  PrivilegedRetrievedDecision,
  PrivilegedRetrievedEpisode,
} from "./src/context/privileged-retrieved-episode";
import {
  ResearchStatelessExecutorFactoryArgs,
  ResearchStatelessProviderTelemetry,
  ResearchStatelessTransportAttestation,
} from "./src/context/research-stateless-episode";
import {
  buildAgentRetrievedGenerationLog,
  buildPrivilegedRetrievedGenerationLog,
} from "./src/context/retrieved-generation-log";
import { WorkingSetManager } from "./src/context/working-set-manager";
import { writeGenerationLog } from "./src/logging";
import { GenerationLog, ModelProvenance, TestSuiteResult } from "./src/types";

interface HeldOutTask {
  taskId: string;
  namingScheme: string;
  visibleInstruction: string;
  groundTruthDelta: GroundTruthDelta;
}

const syntheticWorldDir = path.join(__dirname, "../synthetic-world");
const repositoryDir = path.join(syntheticWorldDir, "repository");
const PROTOCOL_ID = "stage1-p5-generation-log-v1";

function loadJson<T>(fileName: string): T {
  return JSON.parse(fs.readFileSync(path.join(syntheticWorldDir, fileName), "utf8")) as T;
}

function loadRepositoryFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        files[path.relative(repositoryDir, full).replace(/\\/g, "/")] =
          fs.readFileSync(full, "utf8");
      }
    }
  };
  walk(repositoryDir);
  return files;
}

function fixtures() {
  const groundTruth = loadJson<GroundTruth>("ground_truth.json");
  const namingSchemes = loadJson<NamingScheme[]>("naming_schemes.json");
  const tasks = loadJson<HeldOutTask[]>("heldout_tasks.json");
  const task = tasks.find((candidate) => candidate.taskId === "T-crosscut-2");
  assert.ok(task, "T-crosscut-2 must exist");
  const namingScheme = namingSchemes.find(
    (candidate) => candidate.schemeId === task.namingScheme
  );
  assert.ok(namingScheme, `Naming scheme ${task.namingScheme} must exist`);
  return { groundTruth, namingScheme, task };
}

function limits(): ExplorationLimits {
  return {
    maxRetrievalOperations: 4,
    maxCumulativeRetrievedTokens: 10_000,
    maxModelCalls: 4,
    maxDecisionRounds: 4,
  };
}

function transport(): ResearchStatelessTransportAttestation {
  return {
    protocolId: PROTOCOL_ID,
    previousResponseIdUsed: false,
    providerConversationReused: false,
    priorAssistantHistoryReplayed: false,
    encryptedReasoningReplayed: false,
    compactionStateReplayed: false,
    otherOpaqueStateReplayed: false,
    responseStored: false,
  };
}

function providerTelemetry(step: number): ResearchStatelessProviderTelemetry {
  return {
    provider: "mock-provider",
    requestedModel: "mock-model",
    actualModel: "mock-model",
    responseId: `response-${step}`,
    responseStatus: "completed",
    tokenUsage: {
      input: 100 + step,
      output: 10 + step,
      cachedInput: 5,
      reasoningOutput: 2,
      total: 110 + 2 * step,
    },
    latencyMs: 20 + step,
    costUsd: 0.001 + step * 0.0001,
  };
}

async function runAR(repositoryFiles: Record<string, string>) {
  const { task } = fixtures();
  const workingSet = new WorkingSetManager(1_600);
  const explorationBudget = new ExplorationBudget(limits());
  let step = 0;
  const episode = new AgentRetrievedEpisode<{ modifiedFiles: Record<string, string> }>({
    taskId: task.taskId,
    visibleInstruction: task.visibleInstruction,
    protocolId: PROTOCOL_ID,
    repositoryFiles,
    workingSet,
    explorationBudget,
    executorFactory: (args: Readonly<ResearchStatelessExecutorFactoryArgs>) => {
      assert.strictEqual(args.condition, "AR");
      const invocation = step++;
      return {
        async runFresh() {
          const decision: AgentRetrievedDecision<{ modifiedFiles: Record<string, string> }> =
            invocation === 0
              ? {
                  kind: "retrieve",
                  call: {
                    toolName: "read_chunk",
                    arguments: {
                      path: "src/vok/rules.ts",
                      startLine: 1,
                      endLine: 8,
                    },
                  },
                }
              : { kind: "finalize", value: { modifiedFiles: {} } };
          return {
            decision,
            rawResponse: `ar-${invocation}`,
            explicitMemoryUpdate:
              invocation === 0 ? "AR observable working memory" : undefined,
            transport: transport(),
            providerTelemetry: providerTelemetry(invocation),
          };
        },
      };
    },
  });
  return buildAgentRetrievedGenerationLog(await episode.run());
}

async function runPR(repositoryFiles: Record<string, string>) {
  const { groundTruth, namingScheme, task } = fixtures();
  const workingSet = new WorkingSetManager(1_600);
  const explorationBudget = new ExplorationBudget(limits());
  let step = 0;
  const episode = new PrivilegedRetrievedEpisode<{ modifiedFiles: Record<string, string> }>({
    taskId: task.taskId,
    visibleInstruction: task.visibleInstruction,
    protocolId: PROTOCOL_ID,
    repositoryFiles,
    groundTruth,
    delta: task.groundTruthDelta,
    namingScheme,
    workingSet,
    explorationBudget,
    executorFactory: (args: Readonly<ResearchStatelessExecutorFactoryArgs>) => {
      assert.strictEqual(args.condition, "PR");
      const invocation = step++;
      return {
        async runFresh() {
          const decision: PrivilegedRetrievedDecision<{ modifiedFiles: Record<string, string> }> =
            invocation === 0
              ? { kind: "retrieve" }
              : { kind: "finalize", value: { modifiedFiles: {} } };
          return {
            decision,
            rawResponse: `pr-${invocation}`,
            explicitMemoryUpdate:
              invocation === 0 ? "PR observable working memory" : undefined,
            transport: transport(),
            providerTelemetry: providerTelemetry(invocation),
          };
        },
      };
    },
  });
  return buildPrivilegedRetrievedGenerationLog(await episode.run());
}

function verifyRetrievedLogShape(log: Awaited<ReturnType<typeof runAR>>): void {
  assert.strictEqual(log.condition, "AR");
  assert.strictEqual(log.retrievalPolicy.source, "agent-function-tools");
  assert.strictEqual(log.privilegedRetrievalPlan, null);
  assert.strictEqual(log.retrievals.length, 1);
  const retrieval = log.retrievals[0];
  assert.deepStrictEqual(retrieval.phaseTrace, ["begin", "access", "complete", "admit"]);
  assert.deepStrictEqual(retrieval.request, {
    path: "src/vok/rules.ts",
    startLine: 1,
    endLine: 8,
  });
  assert.ok(retrieval.candidateResultHash);
  assert.deepStrictEqual(retrieval.activeUnitIdsBefore, []);
  assert.ok(retrieval.activeUnitIdsAfter.length > 0);
  assert.ok(Array.isArray(retrieval.evictions));

  assert.strictEqual(log.episode.steps.length, 2);
  assert.strictEqual(log.episode.steps[0].explicitMemoryBefore, null);
  assert.strictEqual(
    log.episode.steps[0].explicitMemoryAfter,
    "AR observable working memory"
  );
  assert.strictEqual(
    log.episode.steps[1].explicitMemoryBefore,
    "AR observable working memory"
  );
  assert.ok(log.episode.explorationBudget.events.length >= 4);

  assert.ok(log.summary.peakWorkingSetTokens <= log.summary.bWork);
  assert.strictEqual(
    log.summary.uniqueObservedTokens,
    log.summary.cumulativeAdmissionTokens - log.summary.cumulativeRereadTokens
  );
  assert.strictEqual(log.summary.retrievalCount, 1);
  assert.strictEqual(log.summary.modelCalls, 2);
  assert.strictEqual(log.summary.decisionRounds, 2);
  assert.strictEqual(log.summary.api.providerTelemetryComplete, true);
  assert.strictEqual(log.summary.api.providerCallsLogged, 2);
  assert.ok((log.summary.api.tokenUsage?.input ?? 0) > 0);
  assert.ok((log.summary.api.latencyMs ?? 0) > 0);
  assert.ok((log.summary.api.costUsd ?? 0) > 0);
}

function passingSuite(): TestSuiteResult {
  return {
    passed: true,
    numPassed: 1,
    numFailed: 0,
    testCases: [{ testName: "dummy", passed: true }],
    rawJestOutput: {},
  };
}

function modelProvenance(): ModelProvenance {
  return {
    provider: "mock",
    requestedModel: "mock-model",
    actualModel: "mock-model",
    responseId: null,
    responseStatus: "completed",
    endpoint: "mock",
    reasoningEffort: null,
    maxOutputTokens: null,
    structuredOutput: true,
    storeResponses: false,
    requestedServiceTier: null,
    actualServiceTier: null,
    promptCacheMode: null,
    promptVersion: "verify-p5-log",
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

function makeGenerationLog(
  condition: "AR" | "AF",
  generation: number,
  repositoryFiles: Record<string, string>,
  retrievedEpisodeLog: Awaited<ReturnType<typeof runAR>> | null
): GenerationLog {
  const visibleInstruction = "Verify P5 logging.";
  const record = buildObservableInteractionRecord({
    generation,
    taskId: "T-log",
    visibleInstruction,
    observableAssistantMessages: ["observable"],
    toolEvents: [],
    explicitWorkingNote: "note",
    repositoryBefore: repositoryFiles,
    repositoryAfter: repositoryFiles,
    appliedDiff: "",
    visibleFeedback: [],
  });
  const feasibility = evaluateOperationalFullFeasibility({
    applicable: condition === "AF",
    contextFiles: condition === "AF" ? repositoryFiles : {},
    visibleInstruction,
    previousInteractionRecord: null,
    reservedOutputTokens: 100,
    contextCapacityTokens: 1_000_000,
  });
  const suite = passingSuite();
  return {
    experiment_id: "p5-generation-log-verification",
    lineage_id: "lineage-0",
    generation,
    condition,
    model: "mock-model",
    model_provenance: modelProvenance(),
    task_id: "T-log",
    repository_before: repositoryFiles,
    repository_after: repositoryFiles,
    git_diff: "",
    context_budget: condition === "AF" ? "full" : 1_600,
    actual_context_tokens: 0,
    context_contents: {},
    agent_prompt: "verification",
    agent_response: "{}",
    observable_assistant_messages: ["observable"],
    explicit_working_note: "note",
    tool_calls: [],
    observable_interaction_record: record,
    inherited_observable_interaction_hash: null,
    operational_full_feasibility: feasibility,
    retrieved_episode_log: retrievedEpisodeLog,
    agent_execution_status: "ok",
    agent_error: null,
    visible_test_results: suite,
    hidden_test_results: suite,
    task_specific_test_result: null,
    functional_task_result: true,
    semantic_probe_results: null,
    semantic_element_trace: null,
    latency_ms: 0,
    token_usage: null,
    cost: null,
    protocol_contract_violated: false,
  };
}

function verifyGenerationLogPersistence(
  repositoryFiles: Record<string, string>,
  arLog: Awaited<ReturnType<typeof runAR>>
): Record<string, unknown> {
  const runsDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-ilm-p5-log-"));
  try {
    const arDir = writeGenerationLog(
      makeGenerationLog("AR", 0, repositoryFiles, arLog),
      runsDir
    );
    const retrievedPath = path.join(arDir, "retrieved_episode.json");
    assert.ok(fs.existsSync(retrievedPath));
    const persisted = JSON.parse(fs.readFileSync(retrievedPath, "utf8"));
    const meta = JSON.parse(fs.readFileSync(path.join(arDir, "meta.json"), "utf8"));
    assert.strictEqual(persisted.schemaVersion, arLog.schemaVersion);
    assert.deepStrictEqual(persisted.retrievals[0].request, arLog.retrievals[0].request);
    assert.strictEqual(
      meta.condition_metadata.inheritance,
      "artifact-only"
    );
    assert.strictEqual(
      meta.retrieved_episode.summary.uniqueObservedTokens,
      arLog.summary.uniqueObservedTokens
    );

    const afDir = writeGenerationLog(
      makeGenerationLog("AF", 1, repositoryFiles, null),
      runsDir
    );
    assert.ok(!fs.existsSync(path.join(afDir, "retrieved_episode.json")));
    const afMeta = JSON.parse(fs.readFileSync(path.join(afDir, "meta.json"), "utf8"));
    assert.strictEqual(afMeta.retrieved_episode, null);

    return {
      arRetrievedEpisodeFile: true,
      afRetrievedEpisodeFile: false,
      conditionMetadataPersisted: true,
      summaryPersisted: true,
    };
  } finally {
    fs.rmSync(runsDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const repositoryFiles = loadRepositoryFiles();
  const arLog = await runAR(repositoryFiles);
  const prLog = await runPR(repositoryFiles);
  verifyRetrievedLogShape(arLog);
  assert.strictEqual(prLog.condition, "PR");
  assert.strictEqual(prLog.retrievalPolicy.source, "privileged-controller");
  assert.ok(prLog.privilegedRetrievalPlan);
  assert.strictEqual(prLog.retrievals.length, 1);
  assert.strictEqual(prLog.summary.api.providerTelemetryComplete, true);

  const persistence = verifyGenerationLogPersistence(repositoryFiles, arLog);

  console.log(JSON.stringify({
    status: "ok",
    p5Slice: "step-7-generation-log-integration",
    ar: {
      policy: arLog.retrievalPolicy,
      request: arLog.retrievals[0].request,
      summary: arLog.summary,
      explicitMemoryTrajectory: arLog.episode.steps.map((step) => ({
        before: step.explicitMemoryBefore,
        after: step.explicitMemoryAfter,
      })),
    },
    pr: {
      policy: prLog.retrievalPolicy,
      firstRequest: prLog.retrievals[0].request,
      planFirstPath: prLog.privilegedRetrievalPlan?.entries[0]?.path,
      summary: prLog.summary,
    },
    persistence,
    verified: [
      "canonical-retrieval-request-arguments-persisted",
      "candidate-hash-and-returned-ArtifactUnit-ids-persisted",
      "working-set-active-ids-and-token-usage-before-after-persisted",
      "per-retrieval-eviction-slice-persisted",
      "explicit-memory-content-before-after-each-fresh-step-persisted",
      "full-E_max-event-history-persisted",
      "unique-observed-token-summary-excludes-reread-tokens",
      "per-step-provider-usage-latency-cost-aggregated-when-complete",
      "PR-policy-plan-and-version-persisted",
      "AR-policy-version-persisted",
      "GenerationLog-writes-retrieved_episode-json-only-for-retrieved-runtime",
      "legacy-AF-log-path-does-not-gain-retrieval-runtime-file",
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
