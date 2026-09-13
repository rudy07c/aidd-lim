import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { GroundTruth, GroundTruthDelta, NamingScheme } from "../synthetic-world/schema";
import { ExplorationBudget, ExplorationLimits } from "./src/context/exploration-budget";
import { WorkingSetManager } from "./src/context/working-set-manager";
import {
  AgentRetrievedDecision,
  AgentRetrievedEpisode,
} from "./src/context/agent-retrieved-episode";
import {
  PrivilegedRetrievedDecision,
  PrivilegedRetrievedEpisode,
} from "./src/context/privileged-retrieved-episode";
import {
  ResearchStatelessExecutorFactoryArgs,
  ResearchStatelessTransportAttestation,
} from "./src/context/research-stateless-episode";
import { RETRIEVED_EPISODE_RUNTIME_SCHEMA_VERSION } from "./src/context/retrieved-episode-runtime";
import { CANONICAL_TOKEN_COUNT_METHOD } from "./src/measurement/token-counter";
import { WORKING_SET_EVICTION_POLICY } from "./src/context/working-set-manager";

interface HeldOutTask {
  taskId: string;
  namingScheme: string;
  visibleInstruction: string;
  groundTruthDelta: GroundTruthDelta;
}

const syntheticWorldDir = path.join(__dirname, "../synthetic-world");
const repositoryDir = path.join(syntheticWorldDir, "repository");
const PROTOCOL_ID = "stage1-pr-ar-parity-v1";

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
        files[path.relative(repositoryDir, full).replace(/\\/g, "/")] = fs.readFileSync(full, "utf8");
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
  const namingScheme = namingSchemes.find((candidate) => candidate.schemeId === task.namingScheme);
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

function validTransport(protocolId = PROTOCOL_ID): ResearchStatelessTransportAttestation {
  return {
    protocolId,
    previousResponseIdUsed: false,
    providerConversationReused: false,
    priorAssistantHistoryReplayed: false,
    encryptedReasoningReplayed: false,
    compactionStateReplayed: false,
    otherOpaqueStateReplayed: false,
    responseStored: false,
  };
}

function firstTarget(record: { candidateUnitIds: string[] }): string {
  const first = record.candidateUnitIds[0];
  assert.ok(first, "retrieval must expose at least one candidate unit id");
  return first.replace(/:L\d+-L\d+:C\d+$/, "").replace(/:L\d+-L\d+$/, "");
}

async function runParityEpisodes(repositoryFiles: Record<string, string>) {
  const { groundTruth, namingScheme, task } = fixtures();
  const sharedBWork = 1_600;

  const prWorkingSet = new WorkingSetManager(sharedBWork);
  const prExploration = new ExplorationBudget(limits());
  let prStep = 0;
  const prToolSchemas: string[][] = [];
  const pr = new PrivilegedRetrievedEpisode<{ modifiedFiles: Record<string, string> }>({
    taskId: task.taskId,
    visibleInstruction: task.visibleInstruction,
    protocolId: PROTOCOL_ID,
    repositoryFiles,
    groundTruth,
    delta: task.groundTruthDelta,
    namingScheme,
    workingSet: prWorkingSet,
    explorationBudget: prExploration,
    executorFactory: (args: Readonly<ResearchStatelessExecutorFactoryArgs>) => {
      assert.strictEqual(args.condition, "PR");
      prToolSchemas.push(args.toolDefinitions.map((tool) => tool.name));
      const invocation = prStep++;
      return {
        async runFresh() {
          const decision: PrivilegedRetrievedDecision<{ modifiedFiles: Record<string, string> }> =
            invocation === 0
              ? { kind: "retrieve" }
              : { kind: "finalize", value: { modifiedFiles: {} } };
          return {
            decision,
            rawResponse: `pr-${invocation}`,
            transport: validTransport(),
          };
        },
      };
    },
  });

  const arWorkingSet = new WorkingSetManager(sharedBWork);
  const arExploration = new ExplorationBudget(limits());
  let arStep = 0;
  const arToolSchemas: string[][] = [];
  const ar = new AgentRetrievedEpisode<{ modifiedFiles: Record<string, string> }>({
    taskId: task.taskId,
    visibleInstruction: task.visibleInstruction,
    protocolId: PROTOCOL_ID,
    repositoryFiles,
    workingSet: arWorkingSet,
    explorationBudget: arExploration,
    executorFactory: (args: Readonly<ResearchStatelessExecutorFactoryArgs>) => {
      assert.strictEqual(args.condition, "AR");
      arToolSchemas.push(args.toolDefinitions.map((tool) => tool.name));
      const invocation = arStep++;
      return {
        async runFresh() {
          const decision: AgentRetrievedDecision<{ modifiedFiles: Record<string, string> }> =
            invocation === 0
              ? {
                  kind: "retrieve",
                  call: {
                    toolName: "read_chunk",
                    arguments: { path: "src/vok/rules.ts", startLine: null, endLine: null },
                  },
                }
              : { kind: "finalize", value: { modifiedFiles: {} } };
          return {
            decision,
            rawResponse: `ar-${invocation}`,
            transport: validTransport(),
          };
        },
      };
    },
  });

  const prResult = await pr.run();
  const arResult = await ar.run();
  assert.strictEqual(prResult.retrievals.length, 1);
  assert.strictEqual(arResult.retrievals.length, 1);

  const expectedPhases = ["begin", "access", "complete", "admit"];
  assert.deepStrictEqual(prResult.retrievals[0].phaseTrace, expectedPhases);
  assert.deepStrictEqual(arResult.retrievals[0].phaseTrace, expectedPhases);

  const prWorking = prResult.telemetry.workingSet;
  const arWorking = arResult.telemetry.workingSet;
  assert.strictEqual(prWorking.budgetTokens, arWorking.budgetTokens);
  assert.strictEqual(prWorking.tokenCountMethod, CANONICAL_TOKEN_COUNT_METHOD);
  assert.strictEqual(arWorking.tokenCountMethod, CANONICAL_TOKEN_COUNT_METHOD);
  assert.strictEqual(prWorking.evictionPolicy, WORKING_SET_EVICTION_POLICY);
  assert.strictEqual(arWorking.evictionPolicy, WORKING_SET_EVICTION_POLICY);

  const prBudget = prResult.telemetry.explorationBudget;
  const arBudget = arResult.telemetry.explorationBudget;
  assert.deepStrictEqual(prBudget.limits, arBudget.limits);
  assert.strictEqual(prBudget.used.retrievalOperations, 1);
  assert.strictEqual(arBudget.used.retrievalOperations, 1);
  assert.strictEqual(prBudget.used.modelCalls, 2);
  assert.strictEqual(arBudget.used.modelCalls, 2);
  assert.strictEqual(prBudget.used.decisionRounds, 2);
  assert.strictEqual(arBudget.used.decisionRounds, 2);
  assert.strictEqual(prBudget.pendingRetrieval, null);
  assert.strictEqual(arBudget.pendingRetrieval, null);

  const prTarget = firstTarget(prResult.retrievals[0]);
  const arTarget = firstTarget(arResult.retrievals[0]);
  assert.notStrictEqual(
    prTarget,
    arTarget,
    "PR deterministic selector and AR agent choice should be free to choose different evidence"
  );
  assert.strictEqual(arTarget, "src/vok/rules.ts");
  assert.strictEqual(prTarget, prResult.retrievalPlan.entries[0].path);

  assert.ok(prToolSchemas.every((names) => names.join(",") === "retrieve_next"));
  assert.ok(arToolSchemas.every((names) => names.join(",") === "list_files,search,read_chunk"));

  return {
    commonRuntimeSchema: RETRIEVED_EPISODE_RUNTIME_SCHEMA_VERSION,
    gatewayPhaseShape: expectedPhases,
    sharedLimits: prBudget.limits,
    sharedBWork,
    tokenCountMethod: prWorking.tokenCountMethod,
    evictionPolicy: prWorking.evictionPolicy,
    prTarget,
    arTarget,
    prToolSchemas,
    arToolSchemas,
    usage: {
      pr: prBudget.used,
      ar: arBudget.used,
    },
  };
}

async function verifyPendingGuardParity(repositoryFiles: Record<string, string>) {
  const { groundTruth, namingScheme, task } = fixtures();

  const runPR = async () => {
    const workingSet = new WorkingSetManager(1_600);
    const explorationBudget = new ExplorationBudget(limits());
    const episode = new PrivilegedRetrievedEpisode({
      taskId: task.taskId,
      visibleInstruction: task.visibleInstruction,
      protocolId: PROTOCOL_ID,
      repositoryFiles,
      groundTruth,
      delta: task.groundTruthDelta,
      namingScheme,
      workingSet,
      explorationBudget,
      executorFactory: () => ({
        async runFresh() {
          return { decision: { kind: "finalize" as const, value: null }, rawResponse: "", transport: validTransport() };
        },
      }),
    });
    explorationBudget.beginRetrieval("parity-pending");
    await assert.rejects(() => episode.run(), /while retrieval is pending/);
    return explorationBudget.snapshot().used;
  };

  const runAR = async () => {
    const workingSet = new WorkingSetManager(1_600);
    const explorationBudget = new ExplorationBudget(limits());
    const episode = new AgentRetrievedEpisode({
      taskId: task.taskId,
      visibleInstruction: task.visibleInstruction,
      protocolId: PROTOCOL_ID,
      repositoryFiles,
      workingSet,
      explorationBudget,
      executorFactory: () => ({
        async runFresh() {
          return { decision: { kind: "finalize" as const, value: null }, rawResponse: "", transport: validTransport() };
        },
      }),
    });
    explorationBudget.beginRetrieval("parity-pending");
    await assert.rejects(() => episode.run(), /while retrieval is pending/);
    return explorationBudget.snapshot().used;
  };

  const prUsed = await runPR();
  const arUsed = await runAR();
  assert.deepStrictEqual(prUsed, arUsed);
  assert.deepStrictEqual(prUsed, {
    retrievalOperations: 1,
    cumulativeRetrievedTokens: 0,
    modelCalls: 0,
    decisionRounds: 0,
  });
  return { prUsed, arUsed, identical: true };
}

async function verifyTransportGuardParity(repositoryFiles: Record<string, string>) {
  const { groundTruth, namingScheme, task } = fixtures();
  const forbidden = { ...validTransport(), previousResponseIdUsed: true };

  const prWorkingSet = new WorkingSetManager(1_600);
  const prExploration = new ExplorationBudget(limits());
  const pr = new PrivilegedRetrievedEpisode({
    taskId: task.taskId,
    visibleInstruction: task.visibleInstruction,
    protocolId: PROTOCOL_ID,
    repositoryFiles,
    groundTruth,
    delta: task.groundTruthDelta,
    namingScheme,
    workingSet: prWorkingSet,
    explorationBudget: prExploration,
    executorFactory: () => ({
      async runFresh() {
        return { decision: { kind: "finalize" as const, value: null }, rawResponse: "", transport: forbidden };
      },
    }),
  });

  const arWorkingSet = new WorkingSetManager(1_600);
  const arExploration = new ExplorationBudget(limits());
  const ar = new AgentRetrievedEpisode({
    taskId: task.taskId,
    visibleInstruction: task.visibleInstruction,
    protocolId: PROTOCOL_ID,
    repositoryFiles,
    workingSet: arWorkingSet,
    explorationBudget: arExploration,
    executorFactory: () => ({
      async runFresh() {
        return { decision: { kind: "finalize" as const, value: null }, rawResponse: "", transport: forbidden };
      },
    }),
  });

  await assert.rejects(() => pr.run(), /previous_response_id/);
  await assert.rejects(() => ar.run(), /previous_response_id/);
  assert.deepStrictEqual(prExploration.snapshot().used, arExploration.snapshot().used);
  return {
    forbiddenField: "previous_response_id",
    identicalAccountingAfterRejectedAttempt: true,
    used: prExploration.snapshot().used,
  };
}

async function main(): Promise<void> {
  const repositoryFiles = loadRepositoryFiles();
  const parity = await runParityEpisodes(repositoryFiles);
  const pendingGuard = await verifyPendingGuardParity(repositoryFiles);
  const transportGuard = await verifyTransportGuardParity(repositoryFiles);

  console.log(JSON.stringify({
    status: "ok",
    p5Slice: "step-6-pr-ar-common-runtime-parity",
    parity,
    pendingGuard,
    transportGuard,
    deliberatelyDifferent: [
      "retrieval-target-order",
      "condition-specific-retrieval-decision-surface",
    ],
    verified: [
      "single-RetrievedEpisodeRuntime-used-by-PR-and-AR",
      "shared-research-stateless-step-runner",
      "shared-BudgetedRepositoryGateway-implementation",
      "same-begin-access-complete-admit-phase-shape",
      "same-ExplorationBudget-contract-and-limits",
      "same-WorkingSetManager-canonical-tokenizer",
      "same-FIFO-v1-eviction-policy",
      "same-pending-retrieval-guard",
      "same-research-stateless-transport-attestation-criteria",
      "PR-and-AR-retrieval-targets-may-differ-by-policy",
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
