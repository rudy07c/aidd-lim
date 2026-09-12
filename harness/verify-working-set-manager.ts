import assert from "assert";
import {
  createArtifactUnit,
  ArtifactUnit,
  serializeArtifactUnitForWorkingSet,
} from "./src/measurement/artifact-unit";
import {
  CANONICAL_TOKEN_COUNT_METHOD,
  countCanonicalTokens,
} from "./src/measurement/token-counter";
import {
  OBSERVABLE_WORKING_NOTE_MAX_CHARS,
  buildObservableInteractionRecord,
} from "./src/context/observable-interaction";
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
  const content = exactTokenText(contentTokens);
  assert.strictEqual(countCanonicalTokens(content), contentTokens);
  return createArtifactUnit({
    id,
    path: `src/${id}.ts`,
    startLine: 1,
    endLine: 1,
    content,
    kind: "chunk",
  });
}

function splitSerializedArtifact(serialized: string): { metadata: unknown; rawContent: string } {
  const delimiter = serialized.indexOf("\n");
  assert.ok(delimiter >= 0, "artifact serialization must separate metadata and raw content with newline");
  return {
    metadata: JSON.parse(serialized.slice(0, delimiter)),
    rawContent: serialized.slice(delimiter + 1),
  };
}

function verifyRawSerializationImprovement(): Record<string, unknown> {
  const content = [
    'import path from "node:path";',
    'const windowsPath = "C:\\\\temp\\\\artifact";',
    'const quoted = "say \\"hello\\" and keep \\\\slashes\\\\";',
    'export function render(input: string): string {',
    '  return `${input}\\n${windowsPath}\\n${quoted}`;',
    '}',
    '',
  ].join("\n");
  const artifact = createArtifactUnit({
    id: "serialization-comparison",
    path: "src/example.ts",
    startLine: 10,
    endLine: 16,
    content,
    kind: "chunk",
  });

  const legacyWholeJson = JSON.stringify({
    path: artifact.path,
    lines: [artifact.startLine, artifact.endLine],
    content: artifact.content,
  });
  const current = serializeArtifactUnitForWorkingSet(artifact);
  const { metadata, rawContent } = splitSerializedArtifact(current);

  assert.ok(
    current.startsWith('{"path":"src/example.ts","lines":[10,16]}\n'),
    "working-set serialization format must remain compact JSON metadata + newline + raw content"
  );
  assert.deepStrictEqual(metadata, { path: artifact.path, lines: [artifact.startLine, artifact.endLine] });
  assert.strictEqual(rawContent, content, "working-set content must be preserved byte-for-byte after metadata newline");
  assert.strictEqual(artifact.tokenCount, countCanonicalTokens(current));

  const contentOnlyTokens = countCanonicalTokens(content);
  const legacyWholeJsonTokens = countCanonicalTokens(legacyWholeJson);
  const rawContentSerializationTokens = countCanonicalTokens(current);
  assert.ok(
    legacyWholeJsonTokens > rawContentSerializationTokens,
    "raw-content serialization must reduce JSON-escape overhead on representative code"
  );
  assert.ok(rawContentSerializationTokens > contentOnlyTokens, "path/line framing must remain budgeted");

  return {
    contentOnlyTokens,
    legacyWholeJsonTokens,
    rawContentSerializationTokens,
    legacyEscapeOverheadVsContent: legacyWholeJsonTokens - contentOnlyTokens,
    rawFramingOverheadVsContent: rawContentSerializationTokens - contentOnlyTokens,
    tokensSavedVsLegacyWholeJson: legacyWholeJsonTokens - rawContentSerializationTokens,
    percentSavedVsLegacyWholeJson: Number(
      (((legacyWholeJsonTokens - rawContentSerializationTokens) / legacyWholeJsonTokens) * 100).toFixed(2)
    ),
  };
}

function verifyWorkingSetIsNotCumulativeCapWithFifo(): Record<string, unknown> {
  const manager = new WorkingSetManager(1000);
  const u600 = unit("u600", 600);
  const u200 = unit("u200", 200);
  const u700 = unit("u700", 700);

  const initialEvidenceTokens = u600.tokenCount + u200.tokenCount;
  const finalEvidenceTokens = u200.tokenCount + u700.tokenCount;
  const cumulativeEvidenceTokens = u600.tokenCount + u200.tokenCount + u700.tokenCount;

  assert.ok(u600.tokenCount > 600, "path/line framing must be counted in B_work");
  assert.ok(u200.tokenCount > 200, "path/line framing must be counted in B_work");
  assert.ok(u700.tokenCount > 700, "path/line framing must be counted in B_work");
  assert.ok(initialEvidenceTokens <= 1000, "initial evidence fixture must fit B_work");
  assert.ok(initialEvidenceTokens + u700.tokenCount > 1000, "third unit must overflow before FIFO eviction");
  assert.ok(finalEvidenceTokens <= 1000, "third unit must fit after FIFO eviction");

  manager.addUnit(u600);
  manager.addUnit(u200);
  assert.strictEqual(manager.currentTokenUsage, initialEvidenceTokens);

  // Step 4: admission itself deterministically evicts the oldest active unit.
  manager.addUnit(u700);

  const snapshot = manager.snapshot();
  assert.strictEqual(snapshot.evictionPolicy, WORKING_SET_EVICTION_POLICY);
  assert.strictEqual(snapshot.currentTokenUsage, finalEvidenceTokens);
  assert.strictEqual(snapshot.remainingBudget, 1000 - finalEvidenceTokens);
  assert.strictEqual(snapshot.cumulativeUnitAdmissionTokens, cumulativeEvidenceTokens);
  assert.ok(snapshot.cumulativeUnitAdmissionTokens > snapshot.budgetTokens);
  assert.ok(snapshot.currentTokenUsage <= snapshot.budgetTokens);
  assert.deepStrictEqual(snapshot.activeUnits.map((item) => item.id), ["u200", "u700"]);
  assert.deepStrictEqual(snapshot.activeUnitAdmissionOrder, [
    { unitId: "u200", admissionSequence: 1 },
    { unitId: "u700", admissionSequence: 2 },
  ]);
  assert.deepStrictEqual(snapshot.evictionHistory, [{
    sequence: 0,
    unitId: "u600",
    tokenCount: u600.tokenCount,
    admissionSequence: 0,
    policy: WORKING_SET_EVICTION_POLICY,
    trigger: "artifact-admission",
    triggerUnitId: "u700",
    reason: "fifo-capacity:artifact-admission",
    usageBefore: initialEvidenceTokens,
    usageAfter: u200.tokenCount,
  }]);

  assert.throws(
    () => manager.addUnit(u600),
    /reread semantics are not enabled before P4 step 5/,
    "step 4 must not silently define reread semantics"
  );

  for (const item of [u600, u200, u700]) {
    const serialized = serializeArtifactUnitForWorkingSet(item);
    const { metadata, rawContent } = splitSerializedArtifact(serialized);
    assert.strictEqual(item.tokenCount, countCanonicalTokens(serialized));
    assert.deepStrictEqual(metadata, { path: item.path, lines: [item.startLine, item.endLine] });
    assert.strictEqual(rawContent, item.content);
  }

  return {
    budget: snapshot.budgetTokens,
    policy: snapshot.evictionPolicy,
    accounting: "canonical tokens of exact model-visible metadata-line + raw-content serialization",
    contentTokenTargets: {
      first: 600,
      retained: 200,
      final: 700,
    },
    modelVisibleEvidenceTokens: {
      first: u600.tokenCount,
      retained: u200.tokenCount,
      final: u700.tokenCount,
      initialActive: initialEvidenceTokens,
      automaticallyEvicted: u600.tokenCount,
      finalActive: snapshot.currentTokenUsage,
      cumulativeAdmissions: snapshot.cumulativeUnitAdmissionTokens,
    },
    framingOverheadTokens: {
      first: u600.tokenCount - 600,
      retained: u200.tokenCount - 200,
      final: u700.tokenCount - 700,
    },
    remainingBudget: snapshot.remainingBudget,
    evictionOrder: snapshot.evictionHistory.map((entry) => entry.unitId),
  };
}

function verifyDeterministicMultiVictimFifo(): Record<string, unknown> {
  const run = () => {
    const manager = new WorkingSetManager(500);
    const a = unit("a", 150);
    const b = unit("b", 150);
    const c = unit("c", 150);
    const d = unit("d", 300);

    assert.ok(a.tokenCount + b.tokenCount + c.tokenCount <= 500, "three FIFO seed units must fit");
    assert.ok(
      b.tokenCount + c.tokenCount + d.tokenCount > 500,
      "evicting only the first unit must remain insufficient"
    );
    assert.ok(c.tokenCount + d.tokenCount <= 500, "evicting two oldest units must be sufficient");

    manager.addUnit(a);
    manager.addUnit(b);
    manager.addUnit(c);
    manager.addUnit(d);
    return manager.snapshot();
  };

  const first = run();
  const second = run();
  assert.deepStrictEqual(second, first, "identical admission sequence must produce identical FIFO state/history");
  assert.deepStrictEqual(first.evictionHistory.map((entry) => entry.unitId), ["a", "b"]);
  assert.ok(first.evictionHistory.every((entry) => entry.policy === WORKING_SET_EVICTION_POLICY));
  assert.deepStrictEqual(first.activeUnits.map((item) => item.id), ["c", "d"]);

  return {
    budget: first.budgetTokens,
    evictionOrder: first.evictionHistory.map((entry) => entry.unitId),
    survivors: first.activeUnits.map((item) => item.id),
    finalUsage: first.currentTokenUsage,
    deterministicReplayEqual: true,
  };
}

function verifyExplicitMemory(): Record<string, unknown> {
  const manager = new WorkingSetManager(1000);
  const artifact = unit("artifact-800", 800);
  manager.addUnit(artifact);

  const note = "a".repeat(600);
  assert.strictEqual(note.length, OBSERVABLE_WORKING_NOTE_MAX_CHARS);
  const noteTokens = countCanonicalTokens(note);
  manager.setExplicitMemory(note);
  const snapshot = manager.snapshot();
  assert.strictEqual(snapshot.memoryTokens, noteTokens);
  assert.strictEqual(snapshot.currentTokenUsage, artifact.tokenCount + noteTokens);
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

  return {
    maxChars: OBSERVABLE_WORKING_NOTE_MAX_CHARS,
    noteChars: note.length,
    noteTokens,
    artifactContentTokenTarget: 800,
    artifactModelVisibleEvidenceTokens: artifact.tokenCount,
    tokenCountMethod: snapshot.tokenCountMethod,
    combinedUsage: snapshot.currentTokenUsage,
  };
}

function verifyMemoryGrowthUsesSameFifoPolicy(): Record<string, unknown> {
  const manager = new WorkingSetManager(1000);
  const u600 = unit("memory-u600", 600);
  const u200 = unit("memory-u200", 200);
  const note = exactTokenText(200);
  assert.ok(note.length <= OBSERVABLE_WORKING_NOTE_MAX_CHARS);
  assert.strictEqual(countCanonicalTokens(note), 200);

  manager.addUnit(u600);
  manager.addUnit(u200);
  const artifactUsageBeforeMemory = manager.currentTokenUsage;
  assert.ok(artifactUsageBeforeMemory + 200 > 1000, "memory growth must create capacity pressure");

  manager.setExplicitMemory(note);
  const snapshot = manager.snapshot();
  assert.deepStrictEqual(snapshot.activeUnits.map((item) => item.id), ["memory-u200"]);
  assert.strictEqual(snapshot.memoryTokens, 200);
  assert.strictEqual(snapshot.currentTokenUsage, u200.tokenCount + 200);
  assert.deepStrictEqual(snapshot.evictionHistory.map((entry) => ({
    unitId: entry.unitId,
    policy: entry.policy,
    trigger: entry.trigger,
  })), [{
    unitId: "memory-u600",
    policy: WORKING_SET_EVICTION_POLICY,
    trigger: "explicit-memory-update",
  }]);

  return {
    artifactUsageBeforeMemory,
    memoryTokens: snapshot.memoryTokens,
    evicted: snapshot.evictionHistory[0]?.unitId,
    finalUsage: snapshot.currentTokenUsage,
    remainingBudget: snapshot.remainingBudget,
  };
}

function verifyFailClosedAccountingAndAtomicRejection(): void {
  const manager = new WorkingSetManager(1000);
  const valid = unit("valid", 10);
  const forged = { ...valid, id: "forged", tokenCount: valid.tokenCount - 1 };
  assert.throws(() => manager.addUnit(forged), /tokenCount mismatch/);
  assert.strictEqual(manager.currentTokenUsage, 0);
  assert.throws(() => new WorkingSetManager(0), /positive integer/);

  const bounded = new WorkingSetManager(500);
  bounded.addUnit(unit("kept", 100));
  const beforeTooLarge = bounded.snapshot();
  assert.throws(
    () => bounded.addUnit(unit("too-large", 600)),
    /B_work cannot fit ArtifactUnit/
  );
  assert.deepStrictEqual(
    bounded.snapshot(),
    beforeTooLarge,
    "irreducibly oversized admission must not evict existing units"
  );

  const tight = new WorkingSetManager(50);
  tight.addUnit(unit("tiny", 10));
  const beforeMemoryFailure = tight.snapshot();
  assert.throws(
    () => tight.setExplicitMemory(exactTokenText(51)),
    /B_work cannot fit explicit memory/
  );
  assert.deepStrictEqual(
    tight.snapshot(),
    beforeMemoryFailure,
    "irreducibly oversized explicit memory must be rejected atomically"
  );
}

function main(): void {
  const serializationComparison = verifyRawSerializationImprovement();
  const workingSetScenario = verifyWorkingSetIsNotCumulativeCapWithFifo();
  const deterministicMultiVictimFifo = verifyDeterministicMultiVictimFifo();
  const explicitMemory = verifyExplicitMemory();
  const memoryGrowthFifo = verifyMemoryGrowthUsesSameFifoPolicy();
  verifyFailClosedAccountingAndAtomicRejection();

  console.log(JSON.stringify({
    status: "ok",
    p4Slice: "steps-1-4-deterministic-fifo",
    artifactEvidenceSerialization: {
      format: "compact JSON metadata line + newline + raw content",
      modelVisibleMetadataFields: ["path", "lines"],
      contentJsonEscaped: false,
      kindModelVisible: false,
      tokenCountMethod: CANONICAL_TOKEN_COUNT_METHOD,
      invariant: "counted serialization === model-visible serialization",
    },
    evictionPolicy: {
      name: WORKING_SET_EVICTION_POLICY,
      sharedBy: ["PR", "AR"],
      victims: "oldest-admitted active ArtifactUnit first",
      explicitMemoryEvictable: false,
      rereadEnabled: false,
    },
    serializationComparison,
    workingSetScenario,
    deterministicMultiVictimFifo,
    explicitMemory,
    memoryGrowthFifo,
    verified: [
      "ArtifactUnit-as-working-set-unit",
      "B_work-counts-model-visible-artifact-evidence-not-content-only",
      "path-and-line-range-included-in-canonical-accounting",
      "raw-content-preserved-without-JSON-escaping",
      "kind-remains-harness-only-provenance",
      "canonical-o200k-B_work-enforcement",
      "FIFO-v1-oldest-admission-first",
      "FIFO-v1-multiple-victim-order",
      "FIFO-v1-deterministic-replay",
      "explicit-memory-pinned-and-capacity-producing",
      "oversized-admission-atomic-rejection",
      "oversized-memory-atomic-rejection",
      "600-plus-200-plus-700-content-token-scenario-with-automatic-FIFO",
      "cumulative-admission-over-budget-active-within-budget",
      "explicit-memory-counted-in-B_work",
      "600-char-working-note-bound-shared-with-P2",
      "P2-and-P4-working-note-use-same-canonical-tokenizer",
      "reread-explicitly-deferred-to-step-5",
    ],
  }, null, 2));
}

main();
