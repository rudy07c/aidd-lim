import assert from "assert";
import {
  ArtifactUnit,
  createArtifactUnit,
} from "./src/measurement/artifact-unit";
import { countCanonicalTokens } from "./src/measurement/token-counter";
import {
  WORKING_SET_EVICTION_POLICY,
  WorkingSetManager,
} from "./src/context/working-set-manager";

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

function runRereadScenario() {
  const a = unit("reread-a", 120);
  const b = unit("reread-b", 120);
  const c = unit("reread-c", 120);
  const budget = Math.max(
    a.tokenCount + b.tokenCount,
    b.tokenCount + c.tokenCount,
    c.tokenCount + a.tokenCount
  );
  const manager = new WorkingSetManager(budget);

  manager.addUnit(a);
  manager.addUnit(b);
  manager.addUnit(c);

  const beforeReread = manager.snapshot();
  assert.deepStrictEqual(beforeReread.activeUnits.map((item) => item.id), [b.id, c.id]);
  assert.deepStrictEqual(beforeReread.evictionHistory.map((entry) => entry.unitId), [a.id]);
  assert.strictEqual(beforeReread.evictionHistory[0]?.trigger, "artifact-admission");
  assert.strictEqual(beforeReread.rereadCount, 0);
  assert.strictEqual(beforeReread.uniqueAdmittedUnitCount, 3);
  assert.strictEqual(beforeReread.totalAdmissionCount, 3);

  manager.rereadUnit(a);
  const afterReread = manager.snapshot();

  assert.deepStrictEqual(afterReread.activeUnits.map((item) => item.id), [c.id, a.id]);
  assert.deepStrictEqual(afterReread.activeUnitAdmissionOrder, [
    { unitId: c.id, admissionSequence: 2 },
    { unitId: a.id, admissionSequence: 3 },
  ]);
  assert.deepStrictEqual(afterReread.evictionHistory.map((entry) => ({
    unitId: entry.unitId,
    trigger: entry.trigger,
    triggerUnitId: entry.triggerUnitId,
    policy: entry.policy,
  })), [
    {
      unitId: a.id,
      trigger: "artifact-admission",
      triggerUnitId: c.id,
      policy: WORKING_SET_EVICTION_POLICY,
    },
    {
      unitId: b.id,
      trigger: "artifact-reread",
      triggerUnitId: a.id,
      policy: WORKING_SET_EVICTION_POLICY,
    },
  ]);

  assert.strictEqual(afterReread.uniqueAdmittedUnitCount, 3, "reread must not create a new unique unit");
  assert.strictEqual(afterReread.totalAdmissionCount, 4, "successful reread must create a new admission event");
  assert.strictEqual(afterReread.rereadCount, 1);
  assert.strictEqual(afterReread.cumulativeRereadTokens, a.tokenCount);
  assert.strictEqual(
    afterReread.cumulativeUnitAdmissionTokens,
    a.tokenCount + b.tokenCount + c.tokenCount + a.tokenCount,
    "reread evidence must count again toward cumulative exposure/admission tokens"
  );
  assert.ok(afterReread.currentTokenUsage <= afterReread.budgetTokens);

  return { manager, a, b, c, beforeReread, afterReread };
}

function verifyRereadIsDeterministicAndRenewsFifoAge(): Record<string, unknown> {
  const first = runRereadScenario();
  const second = runRereadScenario();
  assert.deepStrictEqual(
    second.afterReread,
    first.afterReread,
    "identical first-read/eviction/reread sequence must replay deterministically"
  );

  return {
    budget: first.afterReread.budgetTokens,
    activeAfterReread: first.afterReread.activeUnits.map((item) => item.id),
    admissionOrderAfterReread: first.afterReread.activeUnitAdmissionOrder,
    evictionTriggers: first.afterReread.evictionHistory.map((entry) => entry.trigger),
    uniqueAdmittedUnitCount: first.afterReread.uniqueAdmittedUnitCount,
    totalAdmissionCount: first.afterReread.totalAdmissionCount,
    rereadCount: first.afterReread.rereadCount,
    cumulativeRereadTokens: first.afterReread.cumulativeRereadTokens,
    cumulativeAdmissionTokens: first.afterReread.cumulativeUnitAdmissionTokens,
    deterministicReplayEqual: true,
  };
}

function verifyActiveRereadDoesNotRefreshAge(): void {
  const { manager, a } = runRereadScenario();
  const before = manager.snapshot();
  assert.ok(manager.hasUnit(a.id));
  assert.throws(
    () => manager.rereadUnit(a),
    /Cannot reread active ArtifactUnit/,
    "already-active evidence must not be allowed to refresh FIFO age"
  );
  assert.deepStrictEqual(manager.snapshot(), before);
}

function verifyRereadCannotCreateFirstExposure(): void {
  const manager = new WorkingSetManager(500);
  const unseen = unit("never-seen", 100);
  const before = manager.snapshot();
  assert.throws(
    () => manager.rereadUnit(unseen),
    /Cannot reread ArtifactUnit before first admission/,
    "reread path must not be usable as a first-read alias"
  );
  assert.deepStrictEqual(manager.snapshot(), before);
}

function verifyRereadIdentityIsStableAndAtomic(): void {
  const { manager, b } = runRereadScenario();
  assert.ok(!manager.hasUnit(b.id), "fixture requires b to be inactive after rereading a");

  const drifted = createArtifactUnit({
    id: b.id,
    path: b.path,
    startLine: b.startLine,
    endLine: b.endLine,
    content: `${b.content} changed`,
    kind: b.kind,
  });
  const before = manager.snapshot();
  assert.throws(
    () => manager.rereadUnit(drifted),
    /reread identity mismatch/,
    "same unit id must not alias changed repository evidence within an episode"
  );
  assert.deepStrictEqual(manager.snapshot(), before);
}

function verifyOversizedRereadRejectsBeforeEviction(): Record<string, unknown> {
  const budget = 500;
  const manager = new WorkingSetManager(budget);
  const large = unit("large-reread", 300);
  const small = unit("small-kept", 50);
  assert.ok(large.tokenCount < budget);

  manager.addUnit(large);
  manager.evictUnit(large.id, "verification-fixture");
  manager.addUnit(small);

  const memoryTokens = budget - large.tokenCount + 1;
  assert.ok(memoryTokens > 0);
  const note = exactTokenText(memoryTokens);
  assert.ok(note.length <= 600, "verification memory must remain within explicit-memory char bound");
  manager.setExplicitMemory(note);
  assert.ok(manager.currentTokenUsage <= budget);
  assert.ok(manager.memoryTokens + large.tokenCount > budget);

  const before = manager.snapshot();
  assert.throws(
    () => manager.rereadUnit(large),
    /B_work cannot fit ArtifactUnit/,
    "irreducibly oversized reread must reject before evicting active evidence"
  );
  assert.deepStrictEqual(manager.snapshot(), before);

  return {
    budget,
    largeEvidenceTokens: large.tokenCount,
    pinnedMemoryTokens: manager.memoryTokens,
    retainedUnit: small.id,
    stateUnchangedAfterRejectedReread: true,
  };
}

function verifyAddUnitRemainsFirstExposureOnly(): void {
  const { manager, b } = runRereadScenario();
  assert.ok(!manager.hasUnit(b.id));
  const before = manager.snapshot();
  assert.throws(
    () => manager.addUnit(b),
    /use rereadUnit\(\)/,
    "previously observed evidence must use the explicit reread path"
  );
  assert.deepStrictEqual(manager.snapshot(), before);
}

function main(): void {
  const rereadScenario = verifyRereadIsDeterministicAndRenewsFifoAge();
  verifyActiveRereadDoesNotRefreshAge();
  verifyRereadCannotCreateFirstExposure();
  verifyRereadIdentityIsStableAndAtomic();
  const oversizedReread = verifyOversizedRereadRejectsBeforeEviction();
  verifyAddUnitRemainsFirstExposureOnly();

  console.log(JSON.stringify({
    status: "ok",
    p4Slice: "step-5-reread",
    rereadSemantics: {
      firstExposureMethod: "addUnit",
      rereadMethod: "rereadUnit",
      prerequisite: "previously admitted and currently inactive exact same ArtifactUnit",
      fifoEffect: "successful reread receives a fresh admission sequence and becomes newest",
      activeReread: "rejected; FIFO age unchanged",
      cumulativeAccounting: "reread tokens count again; unique unit count does not increase",
      capacityRule: "same FIFO-v1 and pinned-memory B_work invariant as first admission",
      repositoryDrift: "same id with changed evidence rejected",
      eMax: "not implemented in Step 5",
    },
    rereadScenario,
    oversizedReread,
    verified: [
      "evicted-evidence-can-be-reread",
      "reread-requires-prior-first-exposure",
      "active-reread-does-not-refresh-fifo-age",
      "reread-renews-admission-sequence-after-eviction",
      "reread-capacity-pressure-uses-same-FIFO-v1",
      "reread-counts-again-toward-cumulative-exposure",
      "reread-does-not-increase-unique-unit-count",
      "same-id-evidence-drift-rejected-atomically",
      "oversized-reread-rejected-before-eviction",
      "B_work-invariant-preserved",
      "deterministic-reread-replay",
    ],
  }, null, 2));
}

main();
