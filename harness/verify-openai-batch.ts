import {
  OPENAI_BATCH_COMPLETION_WINDOW,
  OPENAI_BATCH_ENDPOINT,
  OpenAIBatchRunner,
  OpenAIBatchSubmission,
  mergeBatchJsonlTexts,
} from "./src/agent-backend/openai/batch";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const runner = new OpenAIBatchRunner({
  runClass: "scientific-calibration",
  model: "gpt-5.6-luna",
  reasoningEffort: "medium",
  maxOutputTokens: 8192,
  storeResponses: false,
  serviceTier: "default",
  promptCacheMode: "implicit",
  requestTimeoutMs: 120000,
  maxRetries: 2,
}, {
  files: {
    async create() { return { id: "file-input" }; },
    async content() { return { async text() { return ""; } }; },
  },
  batches: {
    async create() { throw new Error("not used in offline verification"); },
    async retrieve() { throw new Error("not used in offline verification"); },
  },
});

const input = {
  contextFiles: { "src/a.ts": "export const a = 1;" },
  visibleInstruction: "Change a to 2.",
  contextBudget: "full" as const,
};
const requestA = runner.buildMutationRequest("request-a", input);
const requestB = runner.buildMutationRequest("request-b", input);
const jsonl = runner.serializeRequests([requestA, requestB]);
const serializedLines = jsonl.trim().split("\n").map((line) => JSON.parse(line));
assert(serializedLines.length === 2, "Batch JSONL should contain two lines");
assert(serializedLines[0].custom_id === "request-a", "custom_id must be preserved");
assert(serializedLines[0].method === "POST", "Batch method must be POST");
assert(serializedLines[0].url === OPENAI_BATCH_ENDPOINT, "Batch must target /v1/responses");
assert(serializedLines[0].body.model === "gpt-5.6-luna", "Batch request must use frozen model");
assert(serializedLines[0].body.store === false, "Batch request must reuse store=false");
assert(serializedLines[0].body.text.format.name === "repository_mutation_v2", "Batch request must reuse mutation schema");
assert(!serializedLines[0].body.tools, "Batch calibration request must be tool-free");

let duplicateRejected = false;
try { runner.serializeRequests([requestA, requestA]); } catch { duplicateRejected = true; }
assert(duplicateRejected, "Duplicate custom_id must be rejected");

let wrongModelRejected = false;
try { runner.createRequest("wrong-model", { ...requestA.body, model: "other-model" }); } catch { wrongModelRejected = true; }
assert(wrongModelRejected, "Mixed/floating model must be rejected");

let toolRequestRejected = false;
try { runner.createRequest("tool", { ...requestA.body, tools: [{ type: "function" }] }); } catch { toolRequestRejected = true; }
assert(toolRequestRejected, "Batch calibration path must reject tool requests");

let mainRejected = false;
try {
  new OpenAIBatchRunner({
    runClass: "scientific-main",
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    maxOutputTokens: 8192,
    storeResponses: false,
    serviceTier: "default",
    promptCacheMode: "implicit",
    requestTimeoutMs: 120000,
    maxRetries: 2,
  });
} catch { mainRejected = true; }
assert(mainRejected, "scientific-main must not use Batch infrastructure");

const mutationText = JSON.stringify({
  modifiedFiles: [{ path: "src/a.ts", content: "export const a = 2;" }],
  workingNote: "Changed a.",
});
const usage = {
  input_tokens: 1000,
  input_tokens_details: { cached_tokens: 100, cache_write_tokens: 0 },
  output_tokens: 200,
  output_tokens_details: { reasoning_tokens: 50 },
  total_tokens: 1200,
};
const responseBody = {
  id: "resp_batch_a",
  model: "gpt-5.6-luna",
  status: "completed",
  service_tier: "default",
  output: [{
    type: "message",
    content: [{ type: "output_text", text: mutationText }],
  }],
  usage,
};
const outputText = JSON.stringify({
  id: "batch_req_2",
  custom_id: "request-b",
  response: { status_code: 200, request_id: "req-b", body: responseBody },
  error: null,
});
const errorText = JSON.stringify({
  id: "batch_req_1",
  custom_id: "request-a",
  response: null,
  error: { code: "batch_expired", message: "expired" },
});

const lines = mergeBatchJsonlTexts([outputText, errorText]);
assert(lines.length === 2, "Output and error files must be merged");
assert(lines[0].custom_id === "request-b" && lines[1].custom_id === "request-a", "Decoder must not assume input order");

const batch: OpenAIBatchSubmission = {
  batchId: "batch_123",
  inputFileId: "file-input",
  outputFileId: "file-output",
  errorFileId: "file-error",
  endpoint: OPENAI_BATCH_ENDPOINT,
  completionWindow: OPENAI_BATCH_COMPLETION_WINDOW,
  status: "completed",
  requestCounts: { total: 2, completed: 1, failed: 1 },
};
const normalized = runner.normalizeMutationResults({ batch, lines });
const byId = new Map(normalized.map((result) => [result.customId, result]));
const success = byId.get("request-b")!;
const failure = byId.get("request-a")!;
assert(success.executionStatus === "ok", "Completed Batch mutation should normalize to ok");
assert(success.modifiedFiles["src/a.ts"].includes("a = 2"), "Structured mutation must decode from raw Batch response body");
assert(success.modelProvenance.actualModel === "gpt-5.6-luna", "Actual model must be preserved");
assert(success.modelProvenance.pricingMode === "batch", "Batch pricing mode must be recorded");
assert(success.estimatedCostUsd !== null && success.estimatedCostUsd > 0, "Batch cost must be estimated");
assert(success.batchProvenance.batchId === "batch_123", "Batch id must be recorded");
assert(success.batchProvenance.customId === "request-b", "custom_id must be recorded in provenance");
assert(failure.executionStatus === "batch-request-error", "Error-file item must normalize as Batch request error");
assert(failure.modelProvenance.providerErrorCode === "batch_expired", "Batch error code must be preserved");

let duplicateResultRejected = false;
try { mergeBatchJsonlTexts([outputText, outputText]); } catch { duplicateResultRejected = true; }
assert(duplicateResultRejected, "Duplicate result custom_id must be rejected");

console.log("OpenAI Batch offline verification passed.");
