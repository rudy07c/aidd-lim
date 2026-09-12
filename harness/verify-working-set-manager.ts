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
import { WorkingSetManager } from "./src/context/working-set-manager";

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
  const unit = createArtifactUnit({
    id: "serialization-comparison",
    path: "src/example.ts",
    startLine: 10,
    endLine: 16,
    content,
    kind: "chunk",
  });

  const legacyWholeJson = JSON.stringify({
    path: unit.path,
    lines: [unit.startLine, unit.endLine],
    content: unit.content,
  });
  const current = serializeArtifactUnitForWorkingSet(unit);
  const { metadata, rawContent } = splitSerializedArtifact(current);

  assert.deepStrictEqual(metadata, { path: unit.path, lines: [unit.startLine, unit.endLine] });
  assert.strictEqual(rawContent, content, "working-set content must be preserved byte-for-byte after metadata newline");
  assert.strictEqual(unit.tokenCount, countCanonicalTokens(current));

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

function verifyWorkingSetIsNotCumulativeCap(): Record<string, unknown> {
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
  assert.ok(initialEvidenceTokens + u700.tokenCount > 1000, "third unit must overflow before eviction");
  assert.ok(finalEvidenceTokens <= 1000, "third unit must fit after explicit eviction");

  manager.addUnit(u600);
  manager.addUnit(u200);
  assert.strictEqual(manager.currentTokenUsage, initialEvidenceTokens);
  assert.strictEqual(manager.remainingBudget, 1000 - initialEvidenceTokens);
  assert.throws(() => manager.addUnit(u700), /B_work exceeded/);

  manager.evictUnit("u600", "verification-explicit-eviction");
  assert.strictEqual(manager.currentTokenUsage, u200.tokenCount);
  manager.addUnit(u700);

  const snapshot = manager.snapshot();
  assert.strictEqual(snapshot.currentTokenUsage, finalEvidenceTokens);
  assert.strictEqual(snapshot.remainingBudget, 1000 - finalEvidenceTokens);
  assert.strictEqual(snapshot.cumulativeUnitAdmissionTokens, cumulativeEvidenceTokens);
  assert.ok(snapshot.cumulativeUnitAdmissionTokens > snapshot.budgetTokens);
  assert.ok(snapshot.currentTokenUsage <= snapshot.budgetTokens);
  assert.deepStrictEqual(snapshot.activeUnits.map((item) => item.id), ["u200", "u700"]);
  assert.deepStrictEqual(snapshot.evictionHistory, [{
    sequence: 0,
    unitId: "u600",
    tokenCount: u600.tokenCount,
    reason: "verification-explicit-eviction",
    usageBefore: initialEvidenceTokens,
    usageAfter: u200.tokenCount,
  }]);

  for (const item of [u600, u200, u700]) {
    const serialized = serializeArtifactUnitForWorkingSet(item);
    const { metadata, rawContent } = splitSerializedArtifact(serialized);
    assert.strictEqual(item.tokenCount, countCanonicalTokens(serialized));
    assert.deepStrictEqual(metadata, { path: item.path, lines: [item.startLine, item.endLine] });
    assert.strictEqual(rawContent, item.content);
  }

  return {
    budget: snapshot.budgetTokens,
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
      afterEviction: u200.tokenCount,
      finalActive: snapshot.currentTokenUsage,
      cumulativeAdmissions: snapshot.cumulativeUnitAdmissionTokens,
    },
    framingOverheadTokens: {
      first: u600.tokenCount - 600,
      retained: u200.tokenCount - 200,
      final: u700.tokenCount - 700,
    },
    remainingBudget: snapshot.remainingBudget,
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

  const tight = new WorkingSetManager(50);
  assert.throws(() => tight.setExplicitMemory(exactTokenText(51)), /B_work exceeded/);
  assert.strictEqual(tight.currentTokenUsage, 0, "failed memory update must be atomic");

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

function verifyFailClosedAccounting(): void {
  const manager = new WorkingSetManager(1000);
  const valid = unit("valid", 10);
  const forged = { ...valid, id: "forged", tokenCount: valid.tokenCount - 1 };
  assert.throws(() => manager.addUnit(forged), /tokenCount mismatch/);
  assert.strictEqual(manager.currentTokenUsage, 0);
  assert.throws(() => new WorkingSetManager(0), /positive integer/);
}

function main(): void {
  const serializationComparison = verifyRawSerializationImprovement();
  const workingSetScenario = verifyWorkingSetIsNotCumulativeCap();
  const explicitMemory = verifyExplicitMemory();
  verifyFailClosedAccounting();

  console.log(JSON.stringify({
    status: "ok",
    p4Slice: "steps-1-3-accounting-contract-frozen-raw-content",
    artifactEvidenceSerialization: {
      format: "compact JSON metadata line + newline + raw content",
      modelVisibleMetadataFields: ["path", "lines"],
      contentJsonEscaped: false,
      kindModelVisible: false,
      tokenCountMethod: CANONICAL_TOKEN_COUNT_METHOD,
      invariant: "counted serialization === model-visible serialization",
    },
    serializationComparison,
    workingSetScenario,
    explicitMemory,
    verified: [
      "ArtifactUnit-as-working-set-unit",
      "B_work-counts-model-visible-artifact-evidence-not-content-only",
      "path-and-line-range-included-in-canonical-accounting",
      "raw-content-preserved-without-JSON-escaping",
      "JSON-escape-overhead-reduced-on-representative-code",
      "kind-remains-harness-only-provenance",
      "canonical-o200k-B_work-enforcement",
      "budget-overflow-fail-closed",
      "600-plus-200-plus-700-content-token-scenario-with-model-visible-framing",
      "cumulative-admission-over-budget-active-within-budget",
      "explicit-memory-counted-in-B_work",
      "600-char-working-note-bound-shared-with-P2",
      "P2-and-P4-working-note-use-same-canonical-tokenizer",
      "eviction-history-recording-without-policy",
      "no-automatic-deterministic-eviction-yet",
    ],
  }, null, 2));
}

main();
