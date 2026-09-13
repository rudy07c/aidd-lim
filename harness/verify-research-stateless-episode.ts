import assert from "assert";
import { ExplorationBudget, ExplorationLimits } from "./src/context/exploration-budget";
import {
  ResearchStatelessModelInput,
  ResearchStatelessStepExecutor,
  ResearchStatelessTransportAttestation,
  ResearchStatelessEpisodeRunner,
  RESEARCH_STATELESS_EPISODE_SCHEMA_VERSION,
  assertResearchStatelessTransport,
} from "./src/context/research-stateless-episode";
import { WorkingSetManager } from "./src/context/working-set-manager";
import {
  ArtifactUnit,
  createArtifactUnit,
  serializeArtifactUnitForWorkingSet,
} from "./src/measurement/artifact-unit";
import { countCanonicalTokens } from "./src/measurement/token-counter";

const PROTOCOL_ID = "stage1-pr-ar-research-stateless-v1";

function exactTokenText(tokens: number): string {
  for (const atom of [" a", " x", " z", " 0"]) {
    const value = atom.repeat(tokens);
    if (countCanonicalTokens(value) === tokens) return value;
  }
  throw new Error(`Unable to construct deterministic ${tokens}-token fixture`);
}

function unit(id: string, contentTokens: number): ArtifactUnit {
  return createArtifactUnit({
    id,
    path: `src/${id}.ts`,
    startLine: 1,
    endLine: 1,
    content: exactTokenText(contentTokens),
    kind: "chunk",
  });
}

function statelessTransport(
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

function copyInput(input: Readonly<ResearchStatelessModelInput>): ResearchStatelessModelInput {
  return {
    visibleInstruction: input.visibleInstruction,
    artifactEvidence: [...input.artifactEvidence],
    explicitMemory: input.explicitMemory,
  };
}

function generousLimits(overrides: Partial<ExplorationLimits> = {}): ExplorationLimits {
  return {
    maxRetrievalOperations: 10,
    maxCumulativeRetrievedTokens: 10_000,
    maxModelCalls: 10,
    maxDecisionRounds: 10,
    ...overrides,
  };
}

async function verifyOnlyBoundedExplicitStateCarriesForward(): Promise<Record<string, unknown>> {
  const manager = new WorkingSetManager(400);
  const a = unit("rs-a", 120);
  const b = unit("rs-b", 120);
  const initialMemory = exactTokenText(20);
  const replacementMemory = exactTokenText(200);
  const firstRawResponseCanary = "PRIVATE-FIRST-RESPONSE-CANARY-MUST-NOT-REAPPEAR";

  manager.addUnit(a);
  manager.addUnit(b);
  manager.setExplicitMemory(initialMemory);
  assert.ok(manager.hasUnit(a.id));
  assert.ok(manager.hasUnit(b.id));

  const exploration = new ExplorationBudget(generousLimits());
  const seenInputs: ResearchStatelessModelInput[] = [];
  let factoryCalls = 0;

  const runner = new ResearchStatelessEpisodeRunner<{ kind: "continue" | "finalize" }>({
    condition: "AR",
    taskId: "T-research-stateless",
    visibleInstruction: "Perform the current task using only the evidence presently supplied.",
    protocolId: PROTOCOL_ID,
    workingSet: manager,
    explorationBudget: exploration,
    executorFactory: () => {
      const invocation = ++factoryCalls;
      return {
        async runFresh(input) {
          assert.ok(Object.isFrozen(input), "step input object must be immutable");
          assert.ok(
            Object.isFrozen(input.artifactEvidence),
            "artifact evidence list must be immutable"
          );
          assert.deepStrictEqual(
            Object.keys(input).sort(),
            ["artifactEvidence", "explicitMemory", "visibleInstruction"],
            "research-stateless model input must contain only current task/W_t/explicit memory"
          );
          seenInputs.push(copyInput(input));
          if (invocation === 1) {
            return {
              decision: { kind: "continue" as const },
              rawResponse: firstRawResponseCanary,
              explicitMemoryUpdate: replacementMemory,
              transport: statelessTransport(),
            };
          }
          return {
            decision: { kind: "finalize" as const },
            rawResponse: "second-step-response",
            transport: statelessTransport(),
          };
        },
      };
    },
  });

  const first = await runner.runStep();
  assert.strictEqual(first.rawResponse, firstRawResponseCanary);
  assert.strictEqual(factoryCalls, 1);
  assert.deepStrictEqual(seenInputs[0].artifactEvidence, [
    serializeArtifactUnitForWorkingSet(a),
    serializeArtifactUnitForWorkingSet(b),
  ]);
  assert.strictEqual(seenInputs[0].explicitMemory, initialMemory);

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
  assert.ok(
    !JSON.stringify(telemetry).includes(replacementMemory),
    "episode telemetry must record memory accounting, not memory contents"
  );
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

  const before = exploration.snapshot();
  await assert.rejects(
    () => runner.runStep(),
    /Cannot run research-stateless inference while retrieval is pending/
  );
  const after = exploration.snapshot();
  assert.deepStrictEqual(after, before, "blocked inference must not consume model/round budget");
  assert.strictEqual(factoryCalls, 0, "factory must not run before pending-retrieval preflight passes");
  exploration.completeRetrieval(0);

  return {
    retrievalOperationsConsumed: after.used.retrievalOperations,
    modelCallsConsumed: after.used.modelCalls,
    decisionRoundsConsumed: after.used.decisionRounds,
    factoryCalls,
  };
}

async function verifyInferenceOpportunityPreflightIsAtomic(): Promise<Record<string, unknown>> {
  const manager = new WorkingSetManager(200);
  const exploration = new ExplorationBudget(
    generousLimits({ maxModelCalls: 1, maxDecisionRounds: 2 })
  );
  let factoryCalls = 0;
  const runner = new ResearchStatelessEpisodeRunner({
    condition: "AR",
    taskId: "T-emax-preflight",
    visibleInstruction: "Use one fresh inference opportunity.",
    protocolId: PROTOCOL_ID,
    workingSet: manager,
    explorationBudget: exploration,
    executorFactory: () => {
      factoryCalls += 1;
      return {
        async runFresh() {
          return {
            decision: "continue",
            rawResponse: "ok",
            transport: statelessTransport(),
          };
        },
      };
    },
  });

  await runner.runStep();
  const beforeRejected = exploration.snapshot();
  await assert.rejects(
    () => runner.runStep(),
    /E_max cannot reserve research-stateless inference: modelCalls=1\/1/
  );
  assert.deepStrictEqual(
    exploration.snapshot(),
    beforeRejected,
    "decisionRound must not be partially consumed when modelCall capacity is exhausted"
  );
  assert.strictEqual(factoryCalls, 1, "factory must not run when E_max preflight fails");

  return {
    used: beforeRejected.used,
    rejectedSecondStepWasAtomic: true,
    factoryCalls,
  };
}

async function verifyFreshExecutorAndTransportGuards(): Promise<Record<string, unknown>> {
  const sharedExecutor: ResearchStatelessStepExecutor<string> = {
    async runFresh() {
      return {
        decision: "continue",
        rawResponse: "shared",
        transport: statelessTransport(),
      };
    },
  };
  const sharedBudget = new ExplorationBudget(generousLimits());
  const sharedRunner = new ResearchStatelessEpisodeRunner({
    condition: "PR",
    taskId: "T-fresh-executor",
    visibleInstruction: "Executor identity must not persist.",
    protocolId: PROTOCOL_ID,
    workingSet: new WorkingSetManager(200),
    explorationBudget: sharedBudget,
    executorFactory: () => sharedExecutor,
  });
  await sharedRunner.runStep();
  const beforeReuse = sharedBudget.snapshot();
  await assert.rejects(
    () => sharedRunner.runStep(),
    /executorFactory reused the previous executor instance/
  );
  assert.deepStrictEqual(
    sharedBudget.snapshot(),
    beforeReuse,
    "local executor reuse must fail before consuming a new inference opportunity"
  );

  const badBudget = new ExplorationBudget(generousLimits());
  const badRunner = new ResearchStatelessEpisodeRunner({
    condition: "AR",
    taskId: "T-forbidden-continuation",
    visibleInstruction: "Opaque continuation is forbidden.",
    protocolId: PROTOCOL_ID,
    workingSet: new WorkingSetManager(200),
    explorationBudget: badBudget,
    executorFactory: () => ({
      async runFresh() {
        return {
          decision: "should-reject",
          rawResponse: "provider-returned",
          explicitMemoryUpdate: "must-not-be-applied",
          transport: statelessTransport({ previousResponseIdUsed: true }),
        };
      },
    }),
  });
  await assert.rejects(() => badRunner.runStep(), /previous_response_id/);
  assert.strictEqual(
    badRunner.telemetry().workingSet.memoryTokens,
    0,
    "forbidden transport result must be rejected before explicit memory is applied"
  );
  assert.deepStrictEqual(badBudget.snapshot().used, {
    retrievalOperations: 0,
    cumulativeRetrievedTokens: 0,
    modelCalls: 1,
    decisionRounds: 1,
  });

  assert.throws(
    () =>
      assertResearchStatelessTransport(
        statelessTransport({
          protocolId: "drifted-protocol",
        }),
        PROTOCOL_ID
      ),
    /protocolId drifted/
  );
  assert.throws(
    () =>
      assertResearchStatelessTransport(
        statelessTransport({
          providerConversationReused: true,
          priorAssistantHistoryReplayed: true,
          encryptedReasoningReplayed: true,
          compactionStateReplayed: true,
          otherOpaqueStateReplayed: true,
          responseStored: true,
        }),
        PROTOCOL_ID
      ),
    /provider conversation\/thread.*prior assistant history.*reasoning\.encrypted_content.*Responses compaction state.*other opaque persisted state.*stored provider response/
  );

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
  const inferencePreflight = await verifyInferenceOpportunityPreflightIsAtomic();
  const statelessGuards = await verifyFreshExecutorAndTransportGuards();

  console.log(
    JSON.stringify(
      {
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
          "raw-assistant-response-not-carried-or-retained-in-telemetry",
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
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
