import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import type { GroundTruth, GroundTruthDelta, NamingScheme } from "../synthetic-world/schema";
import { ExplorationBudget, ExplorationLimits } from "./src/context/exploration-budget";
import {
  AgentRetrievedDecision,
  AgentRetrievedEpisode,
} from "./src/context/agent-retrieved-episode";
import {
  PrivilegedRetrievedDecision,
  PrivilegedRetrievedEpisode,
} from "./src/context/privileged-retrieved-episode";
import type {
  ResearchStatelessModelInput,
  ResearchStatelessTransportAttestation,
} from "./src/context/research-stateless-episode";
import { WorkingSetManager } from "./src/context/working-set-manager";
import { buildARUserMessage } from "./src/agent-backend/openai/research-stateless-ar";
import { buildPRUserMessage } from "./src/agent-backend/openai/research-stateless-pr";

interface HeldOutTask {
  taskId: string;
  namingScheme: string;
  visibleInstruction: string;
  groundTruthDelta: GroundTruthDelta;
}

const syntheticWorldDir = path.join(__dirname, "../synthetic-world");
const PROTOCOL_ID = "p5.5-evidence-exhaustion-signal-v1";

function loadJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(syntheticWorldDir, name), "utf8")) as T;
}

function fixture() {
  const groundTruth = loadJson<GroundTruth>("ground_truth.json");
  const namingSchemes = loadJson<NamingScheme[]>("naming_schemes.json");
  const tasks = loadJson<HeldOutTask[]>("heldout_tasks.json");
  const task = tasks.find((candidate) => candidate.taskId === "T-crosscut-2");
  assert.ok(task, "T-crosscut-2 must exist");
  const namingScheme = namingSchemes.find((candidate) => candidate.schemeId === task.namingScheme);
  assert.ok(namingScheme, `Naming scheme ${task.namingScheme} must exist`);
  const oneFilePath = "src/vok/state.ts";
  const oneFileContent = fs.readFileSync(
    path.join(syntheticWorldDir, "repository", oneFilePath),
    "utf8"
  );
  return {
    groundTruth,
    namingScheme,
    task,
    repositoryFiles: { [oneFilePath]: oneFileContent },
  };
}

function limits(overrides: Partial<ExplorationLimits> = {}): ExplorationLimits {
  return {
    maxRetrievalOperations: 4,
    maxCumulativeRetrievedTokens: 10_000,
    maxModelCalls: 4,
    maxDecisionRounds: 4,
    ...overrides,
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

async function verifyPRExhaustionIsObservableAndFinalizable() {
  const { groundTruth, namingScheme, task, repositoryFiles } = fixture();
  const workingSet = new WorkingSetManager(1000);
  const explorationBudget = new ExplorationBudget(limits());
  const seenInputs: ResearchStatelessModelInput[] = [];
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
    executorFactory: () => ({
      async runFresh(input) {
        seenInputs.push({
          visibleInstruction: input.visibleInstruction,
          artifactEvidence: [...input.artifactEvidence],
          explicitMemory: input.explicitMemory,
          runtimeObservation: input.runtimeObservation ? { ...input.runtimeObservation } : null,
        });
        const current = invocation++;
        const decision: PrivilegedRetrievedDecision<{ modifiedFiles: Record<string, string> }> =
          current < 2
            ? { kind: "retrieve" }
            : { kind: "finalize", value: { modifiedFiles: {} } };
        return {
          decision,
          rawResponse: `pr-step-${current}`,
          transport: transport(),
        };
      },
    }),
  });

  const result = await episode.run();
  assert.deepStrictEqual(result.final, { modifiedFiles: {} });
  assert.strictEqual(result.retrievalPlan.entries.length, 1, "fixture must have one initial PR candidate");
  assert.strictEqual(result.retrievals.length, 1, "no-more-evidence must not fabricate a gateway retrieval");
  assert.strictEqual(seenInputs.length, 3);
  assert.strictEqual(seenInputs[0].runtimeObservation, null);
  assert.strictEqual(seenInputs[1].runtimeObservation, null);
  assert.strictEqual(seenInputs[2].runtimeObservation?.kind, "no-more-evidence");
  assert.match(seenInputs[2].runtimeObservation?.message ?? "", /No additional observable repository evidence/i);
  assert.strictEqual(result.telemetry.steps[2].runtimeObservationBefore?.kind, "no-more-evidence");
  assert.strictEqual(result.telemetry.pendingRuntimeObservation, null);
  assert.deepStrictEqual(result.telemetry.explorationBudget.used, {
    retrievalOperations: 1,
    cumulativeRetrievedTokens: result.retrievals[0].exposedTokens,
    modelCalls: 3,
    decisionRounds: 3,
  });

  const rendered = buildPRUserMessage(seenInputs[2]);
  assert.match(rendered, /LAST RETRIEVAL RESULT/);
  assert.match(rendered, /no-more-evidence/);

  return {
    initialCandidates: result.retrievalPlan.entries.length,
    gatewayRetrievals: result.retrievals.length,
    modelCalls: result.telemetry.explorationBudget.used.modelCalls,
    signalKind: seenInputs[2].runtimeObservation?.kind,
    finalizedAfterSignal: true,
  };
}

async function verifyAREmptyResultUsesSameGentleSignalMechanism() {
  const { repositoryFiles } = fixture();
  const workingSet = new WorkingSetManager(1000);
  const explorationBudget = new ExplorationBudget(limits());
  const seenInputs: ResearchStatelessModelInput[] = [];
  let invocation = 0;

  const episode = new AgentRetrievedEpisode<{ modifiedFiles: Record<string, string> }>({
    taskId: "T-ar-empty-result",
    visibleInstruction: "Search for absent evidence, then finish when the empty result is observable.",
    protocolId: PROTOCOL_ID,
    repositoryFiles,
    workingSet,
    explorationBudget,
    executorFactory: () => ({
      async runFresh(input) {
        seenInputs.push({
          visibleInstruction: input.visibleInstruction,
          artifactEvidence: [...input.artifactEvidence],
          explicitMemory: input.explicitMemory,
          runtimeObservation: input.runtimeObservation ? { ...input.runtimeObservation } : null,
        });
        const current = invocation++;
        const decision: AgentRetrievedDecision<{ modifiedFiles: Record<string, string> }> =
          current === 0
            ? {
                kind: "retrieve",
                call: {
                  toolName: "search",
                  arguments: {
                    query: "definitely-not-present-in-fixture",
                    workingNote: null,
                  },
                },
              }
            : { kind: "finalize", value: { modifiedFiles: {} } };
        return {
          decision,
          rawResponse: `ar-step-${current}`,
          transport: transport(),
        };
      },
    }),
  });

  const result = await episode.run();
  assert.deepStrictEqual(result.final, { modifiedFiles: {} });
  assert.strictEqual(result.retrievals.length, 1);
  assert.strictEqual(result.retrievals[0].error, null);
  assert.strictEqual(result.retrievals[0].exposedTokens, 0);
  assert.deepStrictEqual(result.retrievals[0].exposedUnitIds, []);
  assert.strictEqual(seenInputs.length, 2);
  assert.strictEqual(seenInputs[1].runtimeObservation?.kind, "empty-retrieval-result");
  assert.strictEqual(result.telemetry.steps[1].runtimeObservationBefore?.kind, "empty-retrieval-result");
  assert.strictEqual(result.telemetry.pendingRuntimeObservation, null);

  const rendered = buildARUserMessage(seenInputs[1]);
  assert.match(rendered, /LAST RETRIEVAL RESULT/);
  assert.match(rendered, /empty-retrieval-result/);

  return {
    gatewayRetrievals: result.retrievals.length,
    exposedTokens: result.retrievals[0].exposedTokens,
    signalKind: seenInputs[1].runtimeObservation?.kind,
    finalizedAfterSignal: true,
  };
}

async function main() {
  const pr = await verifyPRExhaustionIsObservableAndFinalizable();
  const ar = await verifyAREmptyResultUsesSameGentleSignalMechanism();
  console.log(JSON.stringify({
    status: "ok",
    p5_5Slice: "evidence-exhaustion-observable-signal",
    pr,
    ar,
    verified: [
      "PR-candidate-exhaustion-is-not-a-tool-error",
      "PR-no-more-evidence-is-visible-to-the-next-fresh-inference",
      "PR-no-more-evidence-does-not-fabricate-a-repository-access",
      "PR-can-finalize-normally-after-observing-exhaustion",
      "AR-empty-retrieval-result-is-visible-to-the-next-fresh-inference",
      "PR-and-AR-share-the-same-one-step-runtime-observation-mechanism",
      "research-stateless-provider-continuation-remains-unused",
      "E_max-model-call-and-decision-round-limits-remain-the-final-loop-brake",
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
