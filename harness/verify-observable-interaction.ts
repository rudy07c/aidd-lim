import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AgentBackend, AgentInput, AgentResult } from "./src/agent-backend/types";
import { buildOpenAIUserMessage, parseStructuredMutation } from "./src/agent-backend/openai";
import {
  buildObservableInteractionRecord,
  evaluateOperationalFullFeasibility,
  serializeObservableInteractionForSuccessor,
  validateObservableInteractionRecord,
} from "./src/context/observable-interaction";
import { runGenerationLoop } from "./src/orchestrator";
import { RunConfig } from "./src/types";

function mockProvenance() {
  return {
    provider: "mock" as const,
    requestedModel: "p2-recording-backend",
    actualModel: "p2-recording-backend",
    responseId: null,
    responseStatus: "completed",
    endpoint: "mock" as const,
    reasoningEffort: null,
    maxOutputTokens: null,
    structuredOutput: true,
    storeResponses: false,
    requestedServiceTier: null,
    actualServiceTier: null,
    promptCacheMode: null,
    promptVersion: "p2-test",
    promptHash: null,
    schemaVersion: "p2-test",
    schemaHash: null,
    pricingMode: null,
    continuationState: "none" as const,
    incompleteReason: null,
    refusal: null,
    providerErrorCode: null,
    sdkVersion: null,
    retryPolicy: { maxRetries: 0, timeoutMs: null },
  };
}

function makeResult(generation: number): AgentResult {
  const workingNote = `observable-note-generation-${generation}`;
  const rawResponse = JSON.stringify({ modifiedFiles: [], workingNote });
  return {
    modifiedFiles: {},
    rawResponse,
    observableAssistantMessages: [rawResponse],
    explicitWorkingNote: workingNote,
    toolEvents: [],
    tokenUsage: { input: 10, output: 5, total: 15 },
    latencyMs: 1,
    executionStatus: "ok",
    modelProvenance: mockProvenance(),
    estimatedCostUsd: 0,
    error: null,
  };
}

function recordingFactory(capture: {
  instances: AgentBackend[];
  inputs: AgentInput[];
}) {
  return (_config: RunConfig, _taskId: string, generation: number): AgentBackend => {
    const backend: AgentBackend = {
      async run(input: AgentInput): Promise<AgentResult> {
        capture.inputs.push(input);
        return makeResult(generation);
      },
    };
    capture.instances.push(backend);
    return backend;
  };
}

async function verifyOrchestratorInheritance(): Promise<void> {
  const syntheticWorldDir = path.resolve(__dirname, "../synthetic-world");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-ilm-p2-"));
  try {
    for (const condition of ["MOI", "AF"] as const) {
      const capture: { instances: AgentBackend[]; inputs: AgentInput[] } = {
        instances: [],
        inputs: [],
      };
      const config: RunConfig = {
        experimentId: `p2-${condition.toLowerCase()}`,
        lineageId: "lineage-0",
        runClass: "smoke",
        backend: "mock-noop",
        condition,
        contextBudget: "full",
        generations: 2,
        tasks: ["T-local-1", "T-crosscut-1"],
        maxOutputTokens: 1024,
        syntheticWorldDir,
        runsDir: tempRoot,
      };
      const result = await runGenerationLoop(config, recordingFactory(capture));
      assert.strictEqual(result.crashed, false, `${condition} integration run must complete`);
      assert.strictEqual(capture.instances.length, 2, `${condition} must create one backend per generation`);
      assert.notStrictEqual(capture.instances[0], capture.instances[1], `${condition} must use fresh backend instances`);
      assert.strictEqual(capture.inputs.length, 2);
      assert.strictEqual(capture.inputs[0].previousInteractionRecord ?? null, null, `${condition} generation 0 has no predecessor`);

      const gen0RecordPath = path.join(result.logDirs[0], "observable_interaction_record.json");
      const gen1RecordPath = path.join(result.logDirs[1], "observable_interaction_record.json");
      assert.ok(fs.existsSync(gen0RecordPath) && fs.existsSync(gen1RecordPath), "record must be persisted every generation");
      const gen0Record = JSON.parse(fs.readFileSync(gen0RecordPath, "utf8"));
      validateObservableInteractionRecord(gen0Record);

      const gen1Meta = JSON.parse(fs.readFileSync(path.join(result.logDirs[1], "meta.json"), "utf8"));
      if (condition === "MOI") {
        assert.ok(capture.inputs[1].previousInteractionRecord, "MOI generation 1 must receive predecessor record");
        assert.strictEqual(capture.inputs[1].previousInteractionRecord?.contentHash, gen0Record.contentHash);
        assert.strictEqual(gen1Meta.observable_interaction.inherited_previous_hash, gen0Record.contentHash);
      } else {
        assert.strictEqual(capture.inputs[1].previousInteractionRecord ?? null, null, "AF must not receive history");
        assert.strictEqual(gen1Meta.observable_interaction.inherited_previous_hash, null);
      }
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const record = buildObservableInteractionRecord({
    generation: 3,
    taskId: "T-example",
    visibleInstruction: "Change the example without breaking the contract.",
    observableAssistantMessages: [JSON.stringify({ modifiedFiles: [{ path: "src/a.ts", content: "export const a = 2;" }] })],
    toolEvents: [{
      callId: "call-1",
      toolName: "read_repository_chunk",
      arguments: { path: "src/a.ts" },
      result: "export const a = 1;",
      ok: true,
    }],
    explicitWorkingNote: "Invariant X remains required; src/a.ts now uses value 2.",
    repositoryBefore: { "src/a.ts": "export const a = 1;" },
    repositoryAfter: { "src/a.ts": "export const a = 2;" },
    appliedDiff: "--- a/src/a.ts\n+++ b/src/a.ts\n-export const a = 1;\n+export const a = 2;",
    visibleFeedback: [],
  });

  validateObservableInteractionRecord(record);
  assert.strictEqual(record.schemaVersion, "observable-interaction-v1");
  assert.strictEqual(record.visibleInstruction.source, "task-feedback");
  assert.strictEqual(record.observableAssistantMessages[0].source, "artifact-redundant");
  assert.strictEqual(record.toolEvents[0].source, "artifact-redundant");
  assert.strictEqual(record.explicitWorkingNote?.source, "ephemeral-rationale");
  assert.strictEqual(record.appliedChanges[0].source, "mutation-metadata");
  assert.ok(record.tokenCount > 0);
  assert.strictEqual(
    Object.values(record.sourceBreakdown).reduce((sum, value) => sum + value, 0),
    record.tokenCount,
    "source breakdown must sum to total"
  );
  assert.match(record.contentHash, /^[a-f0-9]{64}$/);

  // Fail closed if evaluator-only/post-hoc fields are appended to the record.
  assert.throws(
    () => validateObservableInteractionRecord({ ...record, groundTruthDelta: { secret: true } }),
    /forbidden\/unrecognized field: groundTruthDelta/
  );
  assert.throws(
    () => validateObservableInteractionRecord({ ...record, hidden_test_results: { passed: true } }),
    /forbidden\/unrecognized field: hidden_test_results/
  );

  const successorPayload = serializeObservableInteractionForSuccessor(record);
  assert.ok(successorPayload.includes("Invariant X remains required"));
  assert.ok(!successorPayload.includes("sourceBreakdown"), "analysis metadata must not be shown to successor");
  assert.ok(!successorPayload.includes(record.contentHash), "record hash must not become successor evidence");

  const afPrompt = buildOpenAIUserMessage({
    contextFiles: { "src/a.ts": "export const a = 2;" },
    visibleInstruction: "next task",
    previousInteractionRecord: null,
    contextBudget: "full",
  });
  const moiPrompt = buildOpenAIUserMessage({
    contextFiles: { "src/a.ts": "export const a = 2;" },
    visibleInstruction: "next task",
    previousInteractionRecord: record,
    contextBudget: "full",
  });
  assert.ok(!afPrompt.includes("PREVIOUS OBSERVABLE INTERACTION RECORD"));
  assert.ok(moiPrompt.includes("PREVIOUS OBSERVABLE INTERACTION RECORD"));
  assert.ok(moiPrompt.indexOf("CURRENT TASK") < moiPrompt.indexOf("PREVIOUS OBSERVABLE INTERACTION RECORD"));
  assert.ok(moiPrompt.indexOf("PREVIOUS OBSERVABLE INTERACTION RECORD") < moiPrompt.indexOf("CURRENT REPOSITORY"));

  const oversizedNote = parseStructuredMutation(JSON.stringify({
    modifiedFiles: [],
    workingNote: "x".repeat(601),
  }));
  assert.strictEqual(oversizedNote.ok, false, "working note bound must be mechanically enforced");

  const feasible = evaluateOperationalFullFeasibility({
    applicable: true,
    contextFiles: { "src/a.ts": "x".repeat(100) },
    visibleInstruction: "task",
    previousInteractionRecord: record,
    reservedOutputTokens: 100,
    contextCapacityTokens: 100_000,
  });
  assert.strictEqual(feasible.checked, true);
  assert.strictEqual(feasible.feasible, true);
  const impossible = evaluateOperationalFullFeasibility({
    applicable: true,
    contextFiles: { "src/a.ts": "x".repeat(100) },
    visibleInstruction: "task",
    previousInteractionRecord: record,
    reservedOutputTokens: 100,
    contextCapacityTokens: 100,
  });
  assert.strictEqual(impossible.feasible, false);

  await verifyOrchestratorInheritance();

  console.log(JSON.stringify({
    status: "ok",
    schemaVersion: record.schemaVersion,
    contentHash: record.contentHash,
    tokenCount: record.tokenCount,
    sourceBreakdown: record.sourceBreakdown,
    verified: [
      "record-build-and-hash",
      "forbidden-field-guard",
      "source-tagging",
      "successor-serialization",
      "AF-vs-MOI-prompt-difference",
      "working-note-bound",
      "operational-full-feasibility",
      "fresh-backend-per-generation",
      "MOI-immediate-predecessor-only",
      "AF-history-absence",
      "per-generation-record-persistence",
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
