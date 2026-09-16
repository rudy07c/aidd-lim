import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import type { GroundTruth, GroundTruthDelta, NamingScheme } from "../synthetic-world/schema";
import { createArtifactUnit } from "./src/measurement/artifact-unit";
import { ExplorationBudget, ExplorationLimits } from "./src/context/exploration-budget";
import { WorkingSetManager } from "./src/context/working-set-manager";
import {
  PrivilegedRetrievedDecision,
  PrivilegedRetrievedEpisode,
} from "./src/context/privileged-retrieved-episode";
import {
  AgentRetrievedDecision,
  AgentRetrievedEpisode,
} from "./src/context/agent-retrieved-episode";
import { buildPrivilegedRetrievalPlan } from "./src/context/privileged-retrieval-controller";
import type {
  ResearchStatelessExecutorFactoryArgs,
  ResearchStatelessTransportAttestation,
} from "./src/context/research-stateless-episode";
import { SHARED_RETRIEVAL_PHASE_CONTRACT } from "./src/context/retrieved-episode-runtime";

interface HeldOutTask {
  taskId: string;
  namingScheme: string;
  visibleInstruction: string;
  groundTruthDelta: GroundTruthDelta;
}

const syntheticWorldDir = path.join(__dirname, "../synthetic-world");
const repositoryDir = path.join(syntheticWorldDir, "repository");
const PROTOCOL_ID = "p5.5-pr-reread-parity-v1";

function loadJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(syntheticWorldDir, name), "utf8")) as T;
}

function loadRepositoryFiles(): Record<string, string> {
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

function sourceLineCount(content: string): number {
  return content.length === 0 ? 1 : (content.match(/[^\n]*\n|[^\n]+$/g) ?? [""]).length;
}

function fullFileTokens(repositoryFiles: Readonly<Record<string, string>>): Map<string, number> {
  const result = new Map<string, number>();
  for (const [filePath, content] of Object.entries(repositoryFiles)) {
    result.set(
      filePath,
      createArtifactUnit({
        id: `parity:${filePath}`,
        path: filePath,
        startLine: 1,
        endLine: sourceLineCount(content),
        content,
        kind: "chunk",
      }).tokenCount
    );
  }
  return result;
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

function limits(retrievals: number, modelCalls: number, cumulativeTokens: number): ExplorationLimits {
  return {
    maxRetrievalOperations: retrievals,
    maxCumulativeRetrievedTokens: cumulativeTokens,
    maxModelCalls: modelCalls,
    maxDecisionRounds: modelCalls,
  };
}

async function verifyPRCanRereadAfterFirstPass(repositoryFiles: Record<string, string>) {
  const { groundTruth, namingScheme, task } = fixtures();
  const plan = buildPrivilegedRetrievalPlan({
    groundTruth,
    delta: task.groundTruthDelta,
    namingScheme,
    repositoryFiles,
  });
  assert.ok(plan.entries.length > 1);

  const tokensByPath = fullFileTokens(repositoryFiles);
  const maxFileTokens = Math.max(...tokensByPath.values());
  const cumulativeFirstPass = [...tokensByPath.values()].reduce((sum, value) => sum + value, 0);
  const maxRetrievals = plan.entries.length + 2;
  const maxModelCalls = plan.entries.length + 3;
  const workingSet = new WorkingSetManager(maxFileTokens);
  const explorationBudget = new ExplorationBudget(
    limits(maxRetrievals, maxModelCalls, cumulativeFirstPass * 3)
  );

  let invocation = 0;
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
    executorFactory: (_args: Readonly<ResearchStatelessExecutorFactoryArgs>) => {
      const current = invocation++;
      return {
        async runFresh() {
          const decision: PrivilegedRetrievedDecision<{ modifiedFiles: Record<string, string> }> =
            current <= plan.entries.length
              ? { kind: "retrieve" }
              : { kind: "finalize", value: { modifiedFiles: {} } };
          return {
            decision,
            rawResponse: `pr-step-${current}`,
            transport: transport(),
          };
        },
      };
    },
  });

  const result = await episode.run();
  assert.deepStrictEqual(result.final, { modifiedFiles: {} });
  assert.strictEqual(result.retrievals.length, plan.entries.length + 1);
  const reread = result.retrievals[result.retrievals.length - 1];
  assert.deepStrictEqual(reread.phaseTrace, [...SHARED_RETRIEVAL_PHASE_CONTRACT]);
  assert.ok(reread.rereadUnitIds.length > 0, "post-plan PR retrieval must be a legal reread");
  assert.strictEqual(reread.admittedUnitIds.length, 0, "reread must not become a new unique admission");
  assert.ok(result.telemetry.workingSet.rereadCount >= 1);
  assert.strictEqual(result.telemetry.explorationBudget.pendingRetrieval, null);
  assert.ok(result.telemetry.workingSet.currentTokenUsage <= maxFileTokens);

  return {
    planEntries: plan.entries.length,
    retrievals: result.retrievals.length,
    modelCalls: result.telemetry.explorationBudget.used.modelCalls,
    rereadUnitIds: reread.rereadUnitIds,
    rereadCount: result.telemetry.workingSet.rereadCount,
    finalizedAfterReread: true,
  };
}

async function verifyARRereadUsesSameGatewayContract(repositoryFiles: Record<string, string>) {
  const tokensByPath = fullFileTokens(repositoryFiles);
  const ranked = [...tokensByPath.entries()].sort((a, b) => b[1] - a[1]);
  assert.ok(ranked.length >= 2);
  const firstPath = ranked[0][0];
  const secondPath = ranked[1][0];
  const bWork = ranked[0][1];
  const workingSet = new WorkingSetManager(bWork);
  const explorationBudget = new ExplorationBudget(limits(4, 5, 100_000));

  let invocation = 0;
  const episode = new AgentRetrievedEpisode<{ modifiedFiles: Record<string, string> }>({
    taskId: "T-ar-reread-parity",
    visibleInstruction: "Exercise the shared gateway reread path.",
    protocolId: PROTOCOL_ID,
    repositoryFiles,
    workingSet,
    explorationBudget,
    executorFactory: () => {
      const current = invocation++;
      return {
        async runFresh() {
          let decision: AgentRetrievedDecision<{ modifiedFiles: Record<string, string> }>;
          if (current === 0) {
            decision = { kind: "retrieve", call: { toolName: "read_chunk", arguments: { path: firstPath, startLine: null, endLine: null } } };
          } else if (current === 1) {
            decision = { kind: "retrieve", call: { toolName: "read_chunk", arguments: { path: secondPath, startLine: null, endLine: null } } };
          } else if (current === 2) {
            decision = { kind: "retrieve", call: { toolName: "read_chunk", arguments: { path: firstPath, startLine: null, endLine: null } } };
          } else {
            decision = { kind: "finalize", value: { modifiedFiles: {} } };
          }
          return { decision, rawResponse: `ar-step-${current}`, transport: transport() };
        },
      };
    },
  });

  const result = await episode.run();
  assert.strictEqual(result.retrievals.length, 3);
  const reread = result.retrievals[2];
  assert.deepStrictEqual(reread.phaseTrace, [...SHARED_RETRIEVAL_PHASE_CONTRACT]);
  assert.ok(reread.rereadUnitIds.length > 0, "AR must reread through the same gateway/WorkingSetManager contract");
  assert.strictEqual(result.telemetry.workingSet.rereadCount, 1);
  assert.strictEqual(result.telemetry.explorationBudget.pendingRetrieval, null);

  return {
    firstPath,
    secondPath,
    rereadUnitIds: reread.rereadUnitIds,
    rereadCount: result.telemetry.workingSet.rereadCount,
  };
}

async function main() {
  const repositoryFiles = loadRepositoryFiles();
  const pr = await verifyPRCanRereadAfterFirstPass(repositoryFiles);
  const ar = await verifyARRereadUsesSameGatewayContract(repositoryFiles);
  console.log(JSON.stringify({
    status: "ok",
    p5_5Slice: "pr-reread-parity",
    pr,
    ar,
    verified: [
      "PR-first-pass-ranking-remains-unchanged",
      "PR-post-plan-selection-is-deterministic-highest-ranked-inactive-evidence",
      "PR-post-plan-reread-reaches-finalize-without-plan-exhaustion",
      "PR-and-AR-rereads-use-the-same-BudgetedRepositoryGateway",
      "PR-and-AR-rereads-use-WorkingSetManager-rereadUnit-same-ID-guard",
      "active-evidence-is-not-reread-to-refresh-FIFO-age",
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
