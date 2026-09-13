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

function exposeRetrieval(
  budget: ExplorationBudget,
  tokens: number,
  label: string
): void {
  budget.beginRetrieval(label);
  budget.completeRetrieval(tokens, label);
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
  exposeRetrieval(budget, 100, "read-a");
  exposeRetrieval(budget, 0, "failed-search");
  exposeRetrieval(budget, 200, "read-b");

  const beforeRejectedRetrieval = budget.snapshot();
  assert.throws(
    () => budget.beginRetrieval("free-retry-must-fail"),
    /E_max exceeded by retrieval-operation: retrievalOperations=4\/3/
  );
  assert.deepStrictEqual(
    budget.snapshot(),
    beforeRejectedRetrieval,
    "rejected new repository access must not partially mutate E_max state"
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
  assert.strictEqual(exhausted.pendingRetrieval, null);
  assert.ok(exhausted.exhausted.includes("retrievalOperations"));
  assert.ok(exhausted.exhausted.includes("modelCalls"));
  assert.ok(exhausted.exhausted.includes("decisionRounds"));

  const failedOperation = exhausted.events.find(
    (event) => event.kind === "retrieval-operation" && event.label === "failed-search"
  );
  const failedEvidence = exhausted.events.find(
    (event) => event.kind === "retrieved-evidence" && event.label === "failed-search"
  );
  assert.strictEqual(failedOperation?.delta.retrievalOperations, 1);
  assert.strictEqual(failedEvidence?.delta.cumulativeRetrievedTokens, 0);

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
    rejectedNewOperationsAtomic: true,
  };
}

function verifyTokenOverflowDoesNotRefundOperation(): Record<string, unknown> {
  const budget = new ExplorationBudget({
    maxRetrievalOperations: 3,
    maxCumulativeRetrievedTokens: 250,
    maxModelCalls: 10,
    maxDecisionRounds: 10,
  });

  exposeRetrieval(budget, 200, "first");
  budget.beginRetrieval("oversized-candidate");
  const afterOperationSpent = budget.snapshot();
  assert.deepStrictEqual(afterOperationSpent.used, {
    retrievalOperations: 2,
    cumulativeRetrievedTokens: 200,
    modelCalls: 0,
    decisionRounds: 0,
  });
  assert.ok(afterOperationSpent.pendingRetrieval);

  assert.throws(
    () => budget.completeRetrieval(51, "oversized-candidate"),
    /cumulativeRetrievedTokens=251\/250/
  );
  const afterRejectedEvidence = budget.snapshot();
  assert.deepStrictEqual(
    afterRejectedEvidence.used,
    afterOperationSpent.used,
    "token-overflow must not add evidence tokens or refund the already-spent operation"
  );
  assert.deepStrictEqual(
    afterRejectedEvidence.pendingRetrieval,
    afterOperationSpent.pendingRetrieval,
    "same retrieval must remain pending so the trusted controller may trim/discard its candidate result"
  );
  assert.throws(
    () => budget.beginRetrieval("must-not-start-new-access"),
    /another retrieval is pending/
  );

  // Trim the already-fetched candidate to the remaining exposable budget.
  budget.completeRetrieval(50, "oversized-candidate-trimmed");
  const final = budget.snapshot();
  assert.strictEqual(final.pendingRetrieval, null);
  assert.strictEqual(final.used.retrievalOperations, 2);
  assert.strictEqual(final.used.cumulativeRetrievedTokens, 250);
  assert.ok(final.exhausted.includes("cumulativeRetrievedTokens"));

  return {
    usedAfterRejectedEvidence: afterRejectedEvidence.used,
    pendingAfterRejectedEvidence: afterRejectedEvidence.pendingRetrieval !== null,
    finalUsed: final.used,
    exhausted: final.exhausted,
    operationRefundedOnTokenOverflow: false,
    sameCandidateTrimmedWithoutNewOperation: true,
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
    exposeRetrieval(budget, artifact.tokenCount, label);
    manager.addUnit(artifact);
  };
  exposeFirst(a, "a-first");
  exposeFirst(b, "b-first");
  exposeFirst(c, "c-first");

  assert.ok(!manager.hasUnit(a.id), "FIFO must evict a before reread scenario");
  exposeRetrieval(budget, a.tokenCount, "a-reread");
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
  assert.strictEqual(first.exploration.pendingRetrieval, null);
  assert.strictEqual(
    first.exploration.used.cumulativeRetrievedTokens,
    first.workingSet.cumulativeUnitAdmissionTokens,
    "when every exposed retrieval is admitted/reread, E_max exposure tokens and working-set admission accounting must agree"
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
    exposeRetrieval(budget, 123, "common-retrieval");
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
  assert.throws(
    () => budget.completeRetrieval(0),
    /without a pending retrieval operation/
  );
  budget.beginRetrieval("validation");
  const afterBegin = budget.snapshot();
  assert.throws(
    () => budget.completeRetrieval(-1),
    /retrievedTokens must be a non-negative integer/
  );
  assert.deepStrictEqual(budget.snapshot(), afterBegin);
  budget.completeRetrieval(0);
  assert.deepStrictEqual(budget.snapshot().used, {
    retrievalOperations: 1,
    cumulativeRetrievedTokens: 0,
    modelCalls: 0,
    decisionRounds: 0,
  });
}

function main(): void {
  const deterministicCounters = verifyDeterministicResourceCounters();
  const tokenOverflowNoRefund = verifyTokenOverflowDoesNotRefundOperation();
  const bWorkSeparation = verifyEmaxAndBworkAreDistinct();
  const prArParity = verifyPrArShareSameResourceContract();
  verifyValidation();

  console.log(JSON.stringify({
    status: "ok",
    p4Slice: "step-6-e-max-two-phase-retrieval",
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
      retrievalAccounting: "two-phase: operation before repository access; evidence tokens before worker exposure",
      failedOrEmptyRetrieval: "operation remains consumed; completion with zero evidence tokens",
      tokenOverflow: "does not refund retrieval operation; pending candidate may be trimmed or discarded",
      rejection: "each counter mutation is fail-closed; already-spent retrieval operations are deliberately not rolled back",
      prAr: "same ExplorationLimits; retrieval policy remains the intended C2 difference",
    },
    deterministicCounters,
    tokenOverflowNoRefund,
    bWorkSeparation,
    prArParity,
    verified: [
      "E_max-is-independent-from-B_work",
      "cumulative-observation-can-exceed-B_work",
      "retrieval-operation-consumed-before-repository-access",
      "retrieved-evidence-tokens-consumed-before-worker-exposure",
      "retrieval-operation-limit",
      "cumulative-retrieved-token-limit",
      "model-call-limit",
      "decision-round-limit",
      "failed-empty-retrieval-is-not-free",
      "token-overflow-does-not-refund-retrieval-operation",
      "pending-retrieval-prevents-new-free-access",
      "same-candidate-can-be-trimmed-without-new-repository-operation",
      "PR-AR-share-identical-resource-contract",
      "same-sequence-deterministic-replay",
      "wall-clock-not-a-binding-scientific-resource",
      "scientific-numeric-limits-deferred-to-P6-calibration",
    ],
  }, null, 2));
}

main();
