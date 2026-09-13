import assert from "assert";
import {
  EXPLORATION_BUDGET_SCHEMA_VERSION,
  ExplorationBudget,
  ExplorationLimits,
} from "./src/context/exploration-budget";
import { WorkingSetManager } from "./src/context/working-set-manager";
import { ArtifactUnit, createArtifactUnit } from "./src/measurement/artifact-unit";
import { countCanonicalTokens } from "./src/measurement/token-counter";

function exactTokenText(tokens: number): string {
  for (const atom of [" a", " x", " z", " 0"]) {
    const value = atom.repeat(tokens);
    if (countCanonicalTokens(value) === tokens) return value;
  }
  throw new Error(`Unable to construct deterministic ${tokens}-token verification fixture`);
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

function verifyDeterministicResourceCounters(): Record<string, unknown> {
  const limits: ExplorationLimits = {
    maxRetrievalOperations: 3,
    maxCumulativeRetrievedTokens: 500,
    maxModelCalls: 2,
    maxDecisionRounds: 2,
  };
  const budget = new ExplorationBudget(limits);

  budget.recordDecisionRound("round-1");
  budget.recordModelCall("model-1");
  budget.recordRetrievalAttempt(100, "read-a");
  budget.recordRetrievalAttempt(0, "failed-search");
  budget.recordRetrievalAttempt(200, "read-b");

  const beforeRejectedRetrieval = budget.snapshot();
  assert.throws(
    () => budget.recordRetrievalAttempt(1, "free-retry-must-fail"),
    /E_max exceeded by retrieval-attempt: retrievalOperations=4\/3/
  );
  assert.deepStrictEqual(
    budget.snapshot(),
    beforeRejectedRetrieval,
    "rejected retrieval must not partially mutate E_max state"
  );

  budget.recordDecisionRound("round-2");
  budget.recordModelCall("model-2");

  const exhausted = budget.snapshot();
  assert.deepStrictEqual(exhausted.used, {
    retrievalOperations: 3,
    cumulativeRetrievedTokens: 300,
    modelCalls: 2,
    decisionRounds: 2,
  });
  assert.ok(exhausted.exhausted.includes("retrievalOperations"));
  assert.ok(exhausted.exhausted.includes("modelCalls"));
  assert.ok(exhausted.exhausted.includes("decisionRounds"));
  assert.strictEqual(
    exhausted.events.find((event) => event.label === "failed-search")?.delta.retrievalOperations,
    1,
    "empty/failed retrieval attempts must still consume an operation"
  );
  assert.strictEqual(
    exhausted.events.find((event) => event.label === "failed-search")?.delta.cumulativeRetrievedTokens,
    0
  );

  const beforeRejectedModel = budget.snapshot();
  assert.throws(() => budget.recordModelCall("model-3"), /modelCalls=3\/2/);
  assert.deepStrictEqual(budget.snapshot(), beforeRejectedModel);

  const beforeRejectedRound = budget.snapshot();
  assert.throws(() => budget.recordDecisionRound("round-3"), /decisionRounds=3\/2/);
  assert.deepStrictEqual(budget.snapshot(), beforeRejectedRound);

  return {
    limits,
    used: exhausted.used,
    remaining: exhausted.remaining,
    exhausted: exhausted.exhausted,
    emptyRetrievalConsumedOperation: true,
    rejectedUpdatesAtomic: true,
  };
}

function verifyCumulativeTokenCapIsIndependent(): Record<string, unknown> {
  const budget = new ExplorationBudget({
    maxRetrievalOperations: 10,
    maxCumulativeRetrievedTokens: 250,
    maxModelCalls: 10,
    maxDecisionRounds: 10,
  });
  budget.recordRetrievalAttempt(200, "first");
  const before = budget.snapshot();
  assert.throws(
    () => budget.recordRetrievalAttempt(51, "would-overflow-cumulative-tokens"),
    /cumulativeRetrievedTokens=251\/250/
  );
  assert.deepStrictEqual(
    budget.snapshot(),
    before,
    "token-overflow rejection must not consume even the retrieval-operation dimension"
  );
  budget.recordRetrievalAttempt(50, "fills-token-budget");
  const final = budget.snapshot();
  assert.strictEqual(final.used.retrievalOperations, 2);
  assert.strictEqual(final.used.cumulativeRetrievedTokens, 250);
  assert.ok(final.exhausted.includes("cumulativeRetrievedTokens"));
  return {
    used: final.used,
    exhausted: final.exhausted,
    multiDimensionUpdateAtomic: true,
  };
}

function runPagingScenario(limits: ExplorationLimits): {
  exploration: ReturnType<ExplorationBudget["snapshot"]>;
  workingSet: ReturnType<WorkingSetManager["snapshot"]>;
  evidenceTokens: Record<string, number>;
} {
  const manager = new WorkingSetManager(300);
  const budget = new ExplorationBudget(limits);
  const a = unit("emax-a", 120);
  const b = unit("emax-b", 120);
  const c = unit("emax-c", 120);

  const exposeFirst = (artifact: ArtifactUnit, label: string) => {
    budget.recordRetrievalAttempt(artifact.tokenCount, label);
    manager.addUnit(artifact);
  };
  exposeFirst(a, "a-first");
  exposeFirst(b, "b-first");
  exposeFirst(c, "c-first");

  assert.ok(!manager.hasUnit(a.id), "FIFO must evict a before reread scenario");
  budget.recordRetrievalAttempt(a.tokenCount, "a-reread");
  manager.rereadUnit(a);

  return {
    exploration: budget.snapshot(),
    workingSet: manager.snapshot(),
    evidenceTokens: {
      a: a.tokenCount,
      b: b.tokenCount,
      c: c.tokenCount,
    },
  };
}

function verifyEmaxAndBworkAreDistinct(): Record<string, unknown> {
  const a = unit("emax-a", 120);
  const b = unit("emax-b", 120);
  const c = unit("emax-c", 120);
  const cumulative = a.tokenCount + b.tokenCount + c.tokenCount + a.tokenCount;
  assert.ok(cumulative > 300, "paging fixture must observe cumulatively more than B_work");

  const limits: ExplorationLimits = {
    maxRetrievalOperations: 4,
    maxCumulativeRetrievedTokens: cumulative,
    maxModelCalls: 3,
    maxDecisionRounds: 3,
  };
  const first = runPagingScenario(limits);
  const second = runPagingScenario(limits);

  assert.deepStrictEqual(second, first, "same E_max + retrieval sequence must replay deterministically");
  assert.ok(first.workingSet.currentTokenUsage <= first.workingSet.budgetTokens);
  assert.strictEqual(first.workingSet.budgetTokens, 300);
  assert.strictEqual(first.exploration.used.retrievalOperations, 4);
  assert.strictEqual(first.exploration.used.cumulativeRetrievedTokens, cumulative);
  assert.strictEqual(
    first.exploration.used.cumulativeRetrievedTokens,
    first.workingSet.cumulativeUnitAdmissionTokens,
    "when every admitted/reread unit comes from one retrieval operation, E_max exposure tokens and working-set admission accounting must agree"
  );
  assert.strictEqual(first.workingSet.uniqueAdmittedUnitCount, 3);
  assert.strictEqual(first.workingSet.rereadCount, 1);
  assert.ok(
    first.exploration.used.cumulativeRetrievedTokens > first.workingSet.budgetTokens,
    "E_max must allow cumulative observation beyond simultaneous B_work"
  );

  return {
    bWork: first.workingSet.budgetTokens,
    finalActiveTokens: first.workingSet.currentTokenUsage,
    cumulativeRetrievedTokens: first.exploration.used.cumulativeRetrievedTokens,
    retrievalOperations: first.exploration.used.retrievalOperations,
    uniqueUnits: first.workingSet.uniqueAdmittedUnitCount,
    rereads: first.workingSet.rereadCount,
    cumulativeGreaterThanBWork: true,
    deterministicReplayEqual: true,
    evidenceTokens: first.evidenceTokens,
  };
}

function verifyPrArShareSameResourceContract(): Record<string, unknown> {
  const limits: ExplorationLimits = {
    maxRetrievalOperations: 8,
    maxCumulativeRetrievedTokens: 2000,
    maxModelCalls: 4,
    maxDecisionRounds: 4,
  };
  const pr = new ExplorationBudget(limits);
  const ar = new ExplorationBudget(limits);

  for (const budget of [pr, ar]) {
    budget.recordDecisionRound("common-round");
    budget.recordRetrievalAttempt(123, "common-retrieval");
    budget.recordModelCall("common-model-call");
  }
  assert.deepStrictEqual(pr.snapshot(), ar.snapshot());
  return {
    sameLimits: true,
    sameSequenceProducesSameUsage: true,
    limits,
  };
}

function verifyValidation(): void {
  assert.throws(
    () => new ExplorationBudget({
      maxRetrievalOperations: 0,
      maxCumulativeRetrievedTokens: 1,
      maxModelCalls: 1,
      maxDecisionRounds: 1,
    }),
    /maxRetrievalOperations must be a positive integer/
  );
  const budget = new ExplorationBudget({
    maxRetrievalOperations: 1,
    maxCumulativeRetrievedTokens: 1,
    maxModelCalls: 1,
    maxDecisionRounds: 1,
  });
  assert.throws(() => budget.recordRetrievalAttempt(-1), /retrievedTokens must be a non-negative integer/);
  assert.deepStrictEqual(budget.snapshot().used, {
    retrievalOperations: 0,
    cumulativeRetrievedTokens: 0,
    modelCalls: 0,
    decisionRounds: 0,
  });
}

function main(): void {
  const deterministicCounters = verifyDeterministicResourceCounters();
  const cumulativeTokenCap = verifyCumulativeTokenCapIsIndependent();
  const bWorkSeparation = verifyEmaxAndBworkAreDistinct();
  const prArParity = verifyPrArShareSameResourceContract();
  verifyValidation();

  console.log(JSON.stringify({
    status: "ok",
    p4Slice: "step-6-e-max",
    schemaVersion: EXPLORATION_BUDGET_SCHEMA_VERSION,
    bindingDimensions: [
      "retrievalOperations",
      "cumulativeRetrievedTokens",
      "modelCalls",
      "decisionRounds",
    ],
    wallClockBinding: false,
    scientificValuesFrozen: false,
    scientificValueFreezeStage: "P6 recalibration",
    semantics: {
      bWork: "simultaneous model-visible retained evidence",
      eMax: "episode-level exploration / compute opportunity",
      failedOrEmptyRetrieval: "consumes one retrieval operation with zero retrieved tokens",
      rejection: "fail-closed and atomic across all E_max dimensions",
      prAr: "same ExplorationLimits; retrieval policy remains the intended C2 difference",
    },
    deterministicCounters,
    cumulativeTokenCap,
    bWorkSeparation,
    prArParity,
    verified: [
      "E_max-is-independent-from-B_work",
      "cumulative-observation-can-exceed-B_work",
      "retrieval-operation-limit",
      "cumulative-retrieved-token-limit",
      "model-call-limit",
      "decision-round-limit",
      "failed-empty-retrieval-is-not-free",
      "multi-dimension-rejection-is-atomic",
      "PR-AR-share-identical-resource-contract",
      "same-sequence-deterministic-replay",
      "wall-clock-not-a-binding-scientific-resource",
      "scientific-numeric-limits-deferred-to-P6-calibration",
    ],
  }, null, 2));
}

main();
