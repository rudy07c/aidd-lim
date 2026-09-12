import assert from "assert";
import { createArtifactUnit, ArtifactUnit } from "./src/measurement/artifact-unit";
import {
  CANONICAL_TOKEN_COUNT_METHOD,
  countCanonicalTokens,
} from "./src/measurement/token-counter";
import {
  OBSERVABLE_WORKING_NOTE_MAX_CHARS,
  buildObservableInteractionRecord,
} from "./src/context/observable-interaction";
import { WorkingSetManager } from "./src/context/working-set-manager";

function exactTokenText(tokens: number): string {
  for (const atom of [" a", " x", " z", " 0"]) {
    const value = atom.repeat(tokens);
    if (countCanonicalTokens(value) === tokens) return value;
  }
  throw new Error(`Unable to construct deterministic ${tokens}-token verification fixture`);
}

function unit(id: string, tokens: number): ArtifactUnit {
  const content = exactTokenText(tokens);
  return createArtifactUnit({
    id,
    path: `src/${id}.ts`,
    startLine: 1,
    endLine: 1,
    content,
    kind: "chunk",
  });
}

function verifyWorkingSetIsNotCumulativeCap(): Record<string, unknown> {
  const manager = new WorkingSetManager(1000);
  const u600 = unit("u600", 600);
  const u200 = unit("u200", 200);
  const u700 = unit("u700", 700);

  manager.addUnit(u600);
  manager.addUnit(u200);
  assert.strictEqual(manager.currentTokenUsage, 800);
  assert.strictEqual(manager.remainingBudget, 200);
  assert.throws(() => manager.addUnit(u700), /B_work exceeded/);

  manager.evictUnit("u600", "verification-explicit-eviction");
  assert.strictEqual(manager.currentTokenUsage, 200);
  manager.addUnit(u700);

  const snapshot = manager.snapshot();
  assert.strictEqual(snapshot.currentTokenUsage, 900);
  assert.strictEqual(snapshot.remainingBudget, 100);
  assert.strictEqual(snapshot.cumulativeUnitAdmissionTokens, 1500);
  assert.ok(snapshot.cumulativeUnitAdmissionTokens > snapshot.budgetTokens);
  assert.ok(snapshot.currentTokenUsage <= snapshot.budgetTokens);
  assert.deepStrictEqual(snapshot.activeUnits.map((item) => item.id), ["u200", "u700"]);
  assert.deepStrictEqual(snapshot.evictionHistory, [{
    sequence: 0,
    unitId: "u600",
    tokenCount: 600,
    reason: "verification-explicit-eviction",
    usageBefore: 800,
    usageAfter: 200,
  }]);

  return {
    budget: snapshot.budgetTokens,
    initialActiveTokens: 800,
    explicitlyEvictedTokens: 600,
    finalAddedTokens: 700,
    cumulativeAdmissionTokens: snapshot.cumulativeUnitAdmissionTokens,
    finalActiveTokens: snapshot.currentTokenUsage,
    remainingBudget: snapshot.remainingBudget,
  };
}

function verifyExplicitMemory(): Record<string, unknown> {
  const manager = new WorkingSetManager(1000);
  manager.addUnit(unit("artifact-800", 800));

  const note = "a".repeat(600);
  assert.strictEqual(note.length, OBSERVABLE_WORKING_NOTE_MAX_CHARS);
  const noteTokens = countCanonicalTokens(note);
  manager.setExplicitMemory(note);
  const snapshot = manager.snapshot();
  assert.strictEqual(snapshot.memoryTokens, noteTokens);
  assert.strictEqual(snapshot.currentTokenUsage, 800 + noteTokens);
  assert.strictEqual(snapshot.explicitMemory?.tokenCountMethod, CANONICAL_TOKEN_COUNT_METHOD);
  assert.strictEqual(snapshot.explicitMemory?.maxChars, OBSERVABLE_WORKING_NOTE_MAX_CHARS);

  const record = buildObservableInteractionRecord({
    generation: 0,
    taskId: "P4-memory-tokenizer-check",
    visibleInstruction: "verification",
    observableAssistantMessages: [],
    toolEvents: [],
    explicitWorkingNote: note,
    repositoryBefore: {},
    repositoryAfter: {},
    appliedDiff: "",
    visibleFeedback: [],
  });
  assert.strictEqual(record.explicitWorkingNote?.tokenCount, noteTokens);

  assert.throws(
    () => manager.setExplicitMemory("x".repeat(OBSERVABLE_WORKING_NOTE_MAX_CHARS + 1)),
    /exceeds 600 characters/
  );
  assert.strictEqual(manager.snapshot().explicitMemory?.content, note);

  const tight = new WorkingSetManager(50);
  assert.throws(() => tight.setExplicitMemory(exactTokenText(51)), /B_work exceeded/);
  assert.strictEqual(tight.currentTokenUsage, 0, "failed memory update must be atomic");

  return {
    maxChars: OBSERVABLE_WORKING_NOTE_MAX_CHARS,
    noteChars: note.length,
    noteTokens,
    tokenCountMethod: snapshot.tokenCountMethod,
    combinedUsage: snapshot.currentTokenUsage,
  };
}

function verifyFailClosedAccounting(): void {
  const manager = new WorkingSetManager(1000);
  const valid = unit("valid", 10);
  const forged = { ...valid, id: "forged", tokenCount: valid.tokenCount - 1 };
  assert.throws(() => manager.addUnit(forged), /tokenCount mismatch/);
  assert.strictEqual(manager.currentTokenUsage, 0);
  assert.throws(() => new WorkingSetManager(0), /positive integer/);
}

function main(): void {
  const workingSetScenario = verifyWorkingSetIsNotCumulativeCap();
  const explicitMemory = verifyExplicitMemory();
  verifyFailClosedAccounting();

  console.log(JSON.stringify({
    status: "ok",
    p4Slice: "steps-1-3",
    workingSetScenario,
    explicitMemory,
    verified: [
      "ArtifactUnit-as-working-set-unit",
      "canonical-o200k-B_work-enforcement",
      "budget-overflow-fail-closed",
      "800-read-600-evict-700-read-cumulative-over-budget-active-within-budget",
      "explicit-memory-counted-in-B_work",
      "600-char-working-note-bound-shared-with-P2",
      "P2-and-P4-working-note-use-same-canonical-tokenizer",
      "eviction-history-recording-without-policy",
      "no-automatic-deterministic-eviction-yet",
    ],
  }, null, 2));
}

main();
