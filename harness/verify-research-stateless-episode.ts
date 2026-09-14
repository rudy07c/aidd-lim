import assert from "assert";
import {
  ResearchStatelessEpisodeRunner,
  ResearchStatelessExecutorFactoryArgs,
  ResearchStatelessTransportAttestation,
  RESEARCH_STATELESS_EPISODE_SCHEMA_VERSION,
} from "./src/context/research-stateless-episode";
import { ExplorationBudget, ExplorationLimits } from "./src/context/exploration-budget";
import { WorkingSetManager } from "./src/context/working-set-manager";
import {
  createArtifactUnit,
  serializeArtifactUnitForWorkingSet,
} from "./src/measurement/artifact-unit";
import { countCanonicalTokens } from "./src/measurement/token-counter";

const PROTOCOL_ID = "stage1-pr-ar-research-stateless-v1";

function generousLimits(overrides: Partial<ExplorationLimits> = {}): ExplorationLimits {
  return {
    maxRetrievalOperations: 10,
    maxCumulativeRetrievedTokens: 10_000,
    maxModelCalls: 10,
    maxDecisionRounds: 10,
    ...overrides,
  };
}

function validTransport(
  overrides: Partial<ResearchStatelessTransportAttestation> = {}
): ResearchStatelessTransportAttestation {
  return {
    protocolId: PROTOCOL_ID,
    previousResponseIdUsed: false,
    providerConversationReused: false,
    priorAssistantHistoryReplayed: false,
    encryptedReasoningReplayed: false,
    compactionStateReplayed: false,
    otherOpaqueStateReplayed: false,
    responseStored: false,
    ...overrides,
  };
}

function repeatedTextForTokens(target: number, char = "x"): string {
  let low = 1;
  let high = Math.max(32, target * 16);
  while (countCanonicalTokens(char.repeat(high)) < target) high *= 2;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (countCanonicalTokens(char.repeat(mid)) >= target) high = mid;
    else low = mid + 1;
  }
  return char.repeat(low);
}

function artifact(id: string, path: string, tokenTarget: number, char: string) {
  const content = repeatedTextForTokens(tokenTarget, char);
  return createArtifactUnit({
    id,
    path,
    startLine: 1,
    endLine: 1,
    content,
    kind: "chunk",
  });
}

async function verifyOnlyBoundedExplicitStateCarriesForward(): Promise<Record<string, unknown>> {
  const manager = new WorkingSetManager(535);
  const exploration = new ExplorationBudget(generousLimits());
  const a = artifact("rs-a", "src/a.ts", 120, "a");
  const b = artifact("rs-b", "src/b.ts", 120, "b");
  manager.addUnit(a);
  manager.addUnit(b);

  const replacementMemory = repeatedTextForTokens(200, "m");
  const firstRawResponseCanary = "RAW_RESPONSE_MUST_NOT_BE_CARRIED";
  const seenInputs: Array<{
    visibleInstruction: string;
    artifactEvidence: readonly string[];
    explicitMemory: string | null;
  }> = [];
  let factoryCalls = 0;

  const runner = new ResearchStatelessEpisodeRunner({
    condition: "AR",
    taskId: "T-stateless",
    visibleInstruction: "Use only the current bounded working set.",
    protocolId: PROTOCOL_ID,
    workingSet: manager,
    explorationBudget: exploration,
    executorFactory: (args: Readonly<ResearchStatelessExecutorFactoryArgs>) => {
      factoryCalls += 1;
      assert.strictEqual(args.condition, "AR");
      assert.strictEqual(args.protocolId, PROTOCOL_ID);
      const callIndex = factoryCalls;
      return {
        async runFresh(input) {
          seenInputs.push({
            visibleInstruction: input.visibleInstruction,
            artifactEvidence: [...input.artifactEvidence],
            explicitMemory: input.explicitMemory,
          });
          return {
            decision: callIndex === 1 ? "continue" : "finish",
            rawResponse:
              callIndex === 1 ? firstRawResponseCanary : "second observable response",
            explicitMemoryUpdate: callIndex === 1 ? replacementMemory : undefined,
            transport: validTransport(),
          };
        },
      };
    },
  });

  await runner.runStep();
  assert.strictEqual(factoryCalls, 1);
  assert.deepStrictEqual(seenInputs[0].artifactEvidence, [
    serializeArtifactUnitForWorkingSet(a),
    serializeArtifactUnitForWorkingSet(b),
  ]);
  assert.strictEqual(seenInputs[0].explicitMemory, null);

  // Growing the only legal persisted model-generated state consumes B_work and
  // deterministically evicts the oldest artifact evidence. The evicted unit must
  // therefore disappear from the next step unless P5 explicitly rereads it.
  assert.ok(!manager.hasUnit(a.id), "explicit-memory growth should FIFO-evict rs-a");
  assert.ok(manager.hasUnit(b.id), "rs-b should remain active");
  assert.strictEqual(manager.snapshot().memoryTokens, 200);
  assert.ok(manager.snapshot().currentTokenUsage <= manager.snapshot().budgetTokens);

  await runner.runStep();
  assert.strictEqual(factoryCalls, 2, "each step must construct a fresh executor");
  assert.deepStrictEqual(seenInputs[1].artifactEvidence, [
    serializeArtifactUnitForWorkingSet(b),
  ]);
  assert.strictEqual(seenInputs[1].explicitMemory, replacementMemory);
  assert.ok(
    !JSON.stringify(seenInputs[1]).includes(firstRawResponseCanary),
    "prior raw assistant response must not be replayed into the next step"
  );
  assert.ok(
    !JSON.stringify(seenInputs[1]).includes(serializeArtifactUnitForWorkingSet(a)),
    "evicted artifact evidence must not survive through provider-side history"
  );

  const telemetry = runner.telemetry();
  assert.strictEqual(telemetry.schemaVersion, RESEARCH_STATELESS_EPISODE_SCHEMA_VERSION);
  assert.strictEqual(telemetry.steps.length, 2);
  assert.deepStrictEqual(telemetry.explorationBudget.used, {
    retrievalOperations: 0,
    cumulativeRetrievedTokens: 0,
    modelCalls: 2,
    decisionRounds: 2,
  });
  assert.ok(
    !JSON.stringify(telemetry).includes(firstRawResponseCanary),
    "episode telemetry must not retain raw assistant responses"
  );
  // Step 7 logging intentionally records the exact bounded explicit memory because
  // it is legal model-visible carryover and is required to reconstruct W_t. This
  // does not relax research-statelessness: later inference is still rebuilt from
  // the current WorkingSetManager snapshot rather than replaying telemetry/history.
  assert.strictEqual(telemetry.steps[0].explicitMemoryBefore, null);
  assert.strictEqual(telemetry.steps[0].explicitMemoryAfter, replacementMemory);
  assert.strictEqual(telemetry.steps[1].explicitMemoryBefore, replacementMemory);
  assert.strictEqual(telemetry.steps[1].explicitMemoryAfter, replacementMemory);
  assert.notStrictEqual(
    telemetry.steps[0].modelInputHash,
    telemetry.steps[1].modelInputHash,
    "input hash should change when W_t/explicit memory changes"
  );

  return {
    factoryCalls,
    firstStepActiveUnits: telemetry.steps[0].activeUnitIdsBefore,
    secondStepActiveUnits: telemetry.steps[1].activeUnitIdsBefore,
    memoryTokensAfterFirstStep: telemetry.steps[0].memoryTokensAfter,
    finalWorkingSetTokens: telemetry.workingSet.currentTokenUsage,
    eMaxUsed: telemetry.explorationBudget.used,
    rawResponseRetainedInTelemetry: false,
    boundedExplicitMemoryRetainedInTelemetry: true,
  };
}

async function verifyPendingRetrievalBlocksInference(): Promise<Record<string, unknown>> {
  const manager = new WorkingSetManager(200);
  const exploration = new ExplorationBudget(generousLimits());
  exploration.beginRetrieval("candidate-read");
  let factoryCalls = 0;

  const runner = new ResearchStatelessEpisodeRunner({
    condition: "PR",
    taskId: "T-pending-boundary",
    visibleInstruction: "Do not infer until retrieval accounting closes.",
    protocolId: PROTOCOL_ID,
    workingSet: manager,
    explorationBudget: exploration,
    executorFactory: () => {
      factoryCalls += 1;
      return {
        async runFresh() {
          throw new Error("executor must not run while retrieval is pending");
        },
      };
    },
  });

  await assert.rejects(() => runner.runStep(), /retrieval is pending/);
  const snapshot = exploration.snapshot();
  assert.strictEqual(factoryCalls, 0);
  assert.strictEqual(snapshot.used.retrievalOperations, 1);
  assert.strictEqual(snapshot.used.modelCalls, 0);
  assert.strictEqual(snapshot.used.decisionRounds, 0);
  assert.ok(snapshot.pendingRetrieval);
  exploration.completeRetrieval(0, "candidate-read");

  return {
    retrievalOperationsConsumed: snapshot.used.retrievalOperations,
    modelCallsConsumed: snapshot.used.modelCalls,
    decisionRoundsConsumed: snapshot.used.decisionRounds,
    factoryCalls,
  };
}

async function verifyInferencePreflightIsAtomic(): Promise<Record<string, unknown>> {
  const manager = new WorkingSetManager(200);
  const exploration = new ExplorationBudget(
    generousLimits({ maxModelCalls: 1, maxDecisionRounds: 1 })
  );
  let factoryCalls = 0;
  const runner = new ResearchStatelessEpisodeRunner({
    condition: "PR",
    taskId: "T-preflight",
    visibleInstruction: "One inference only.",
    protocolId: PROTOCOL_ID,
    workingSet: manager,
    explorationBudget: exploration,
    executorFactory: () => {
      factoryCalls += 1;
      return {
        async runFresh() {
          return {
            decision: "done",
            rawResponse: "done",
            transport: validTransport(),
          };
        },
      };
    },
  });

  await runner.runStep();
  const before = exploration.snapshot();
  await assert.rejects(() => runner.runStep(), /cannot reserve research-stateless inference/i);
  const after = exploration.snapshot();
  assert.deepStrictEqual(after.used, before.used);
  assert.strictEqual(factoryCalls, 1);
  return {
    used: after.used,
    rejectedSecondStepWasAtomic: true,
    factoryCalls,
  };
}

async function verifyStatelessTransportGuards(): Promise<Record<string, unknown>> {
  const baseOptions = () => ({
    condition: "AR" as const,
    taskId: "T-transport-guard",
    visibleInstruction: "Reject opaque continuation state.",
    protocolId: PROTOCOL_ID,
    workingSet: new WorkingSetManager(200),
    explorationBudget: new ExplorationBudget(generousLimits()),
  });

  let sharedExecutorCalls = 0;
  const sharedExecutor = {
    async runFresh() {
      sharedExecutorCalls += 1;
      return {
        decision: "continue",
        rawResponse: "ok",
        transport: validTransport(),
      };
    },
  };
  const reused = baseOptions();
  const reusedRunner = new ResearchStatelessEpisodeRunner({
    ...reused,
    executorFactory: () => sharedExecutor,
  });
  await reusedRunner.runStep();
  const beforeReuseReject = reused.explorationBudget.snapshot();
  await assert.rejects(() => reusedRunner.runStep(), /reused the previous executor/);
  assert.deepStrictEqual(
    reused.explorationBudget.snapshot().used,
    beforeReuseReject.used,
    "executor reuse rejection must happen before E_max accounting"
  );

  const previousId = baseOptions();
  const previousIdRunner = new ResearchStatelessEpisodeRunner({
    ...previousId,
    executorFactory: () => ({
      async runFresh() {
        return {
          decision: "bad",
          rawResponse: "bad",
          transport: validTransport({ previousResponseIdUsed: true }),
        };
      },
    }),
  });
  await assert.rejects(() => previousIdRunner.runStep(), /previous_response_id/);

  const protocolDrift = baseOptions();
  const protocolRunner = new ResearchStatelessEpisodeRunner({
    ...protocolDrift,
    executorFactory: () => ({
      async runFresh() {
        return {
          decision: "bad",
          rawResponse: "bad",
          transport: validTransport({ protocolId: "wrong-protocol" }),
        };
      },
    }),
  });
  await assert.rejects(() => protocolRunner.runStep(), /protocolId drifted/);

  for (const [field, transportOverride] of [
    ["providerConversationReused", { providerConversationReused: true }],
    ["priorAssistantHistoryReplayed", { priorAssistantHistoryReplayed: true }],
    ["encryptedReasoningReplayed", { encryptedReasoningReplayed: true }],
    ["compactionStateReplayed", { compactionStateReplayed: true }],
    ["otherOpaqueStateReplayed", { otherOpaqueStateReplayed: true }],
    ["responseStored", { responseStored: true }],
  ] as const) {
    const options = baseOptions();
    const runner = new ResearchStatelessEpisodeRunner({
      ...options,
      executorFactory: () => ({
        async runFresh() {
          return {
            decision: "bad",
            rawResponse: "bad",
            transport: validTransport(transportOverride),
          };
        },
      }),
    });
    await assert.rejects(
      () => runner.runStep(),
      /Research-stateless violation/,
      `${field} should be rejected`
    );
  }

  return {
    reusedExecutorRejectedBeforeBudgetConsumption: true,
    previousResponseIdRejectedAfterAttempt: true,
    protocolDriftRejected: true,
    allOpaqueContinuationFlagsRejected: true,
  };
}

async function main(): Promise<void> {
  const boundedCarryover = await verifyOnlyBoundedExplicitStateCarriesForward();
  const pendingRetrievalBoundary = await verifyPendingRetrievalBlocksInference();
  const inferencePreflight = await verifyInferencePreflightIsAtomic();
  const statelessGuards = await verifyStatelessTransportGuards();

  console.log(JSON.stringify({
    status: "ok",
    p4Slice: "step-7-research-stateless-episodic-runner",
    schemaVersion: RESEARCH_STATELESS_EPISODE_SCHEMA_VERSION,
    modelInputContract: [
      "current-visible-instruction",
      "current-W_t-exact-artifact-evidence",
      "bounded-explicit-memory",
    ],
    deliberatelyAbsentFromSuccessorInput: [
      "previous_response_id",
      "provider-conversation-thread",
      "prior-assistant-message-history",
      "reasoning.encrypted_content",
      "Responses-compaction-state",
      "other-opaque-persisted-reasoning-state",
      "prior-raw-response",
      "prior-decision-object",
    ],
    fixedProtocol: PROTOCOL_ID,
    boundedCarryover,
    pendingRetrievalBoundary,
    inferencePreflight,
    statelessGuards,
    verified: [
      "fresh-executor-instance-per-reasoning-step",
      "next-step-rebuilt-only-from-current-W_t-memory-task",
      "exact-ArtifactUnit-working-set-serialization-reused",
      "evicted-evidence-absent-from-next-step",
      "raw-assistant-response-not-carried-or-retained-in-episode-telemetry",
      "bounded-explicit-memory-recorded-for-W_t-reconstruction-without-history-replay",
      "only-explicit-memory-can-carry-model-generated-state",
      "explicit-memory-update-counted-by-B_work-and-can-trigger-FIFO",
      "pending-retrieval-blocks-inference-before-factory-or-E_max-consumption",
      "model-call-and-decision-round-preflight-prevents-partial-E_max-consumption",
      "previous-response-id-rejected",
      "provider-thread-reuse-rejected",
      "prior-assistant-history-replay-rejected",
      "encrypted-reasoning-replay-rejected",
      "compaction-state-replay-rejected",
      "other-opaque-state-replay-rejected",
      "response-storage-rejected",
      "fixed-protocol-id-drift-rejected",
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
