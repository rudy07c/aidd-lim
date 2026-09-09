import {
  OPENAI_BATCH_COMPLETION_WINDOW,
  OPENAI_BATCH_ENDPOINT,
  OpenAIBatchRunner,
  OpenAIBatchSubmission,
  assertBatchResultCompleteness,
  mergeBatchJsonlTexts,
} from "./src/agent-backend/openai/batch";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const options = {
  runClass: "scientific-calibration" as const,
  model: "gpt-5.6-luna",
  reasoningEffort: "medium" as const,
  maxOutputTokens: 8192,
  storeResponses: false,
  serviceTier: "default" as const,
  promptCacheMode: "implicit" as const,
  requestTimeoutMs: 120000,
  maxRetries: 2,
};

async function main(): Promise<void> {
  const runner = new OpenAIBatchRunner(options, {
    files: {
      async create() { return { id: "file-input" }; },
      async content() { return { async text() { return ""; } }; },
    },
    batches: {
      async create() { throw new Error("not used in offline verification"); },
      async retrieve() { throw new Error("not used in this runner"); },
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
  assert(serializedLines[0].body.reasoning.effort === "medium", "reasoning effort must be frozen");
  assert(serializedLines[0].body.max_output_tokens === 8192, "max output must be frozen");
  assert(serializedLines[0].body.store === false, "Batch request must reuse store=false");
  assert(serializedLines[0].body.service_tier === "default", "service tier must be frozen");
  assert(serializedLines[0].body.prompt_cache_options.mode === "implicit", "cache mode must be frozen");
  assert(serializedLines[0].body.prompt_cache_options.ttl === "30m", "cache ttl must be frozen");
  assert(serializedLines[0].body.truncation === "disabled", "truncation must be disabled");
  assert(serializedLines[0].body.text.format.name === "repository_mutation_v2", "Batch request must reuse mutation schema");
  assert(!serializedLines[0].body.tools, "Batch calibration request must be tool-free");

  let duplicateRejected = false;
  try { runner.serializeRequests([requestA, requestA]); } catch { duplicateRejected = true; }
  assert(duplicateRejected, "Duplicate custom_id must be rejected");

  const frozenMutations: Array<[string, Record<string, unknown>]> = [
    ["model", { ...requestA.body, model: "other-model" }],
    ["reasoning", { ...requestA.body, reasoning: { effort: "high" } }],
    ["max-output", { ...requestA.body, max_output_tokens: 4096 }],
    ["store", { ...requestA.body, store: true }],
    ["service-tier", { ...requestA.body, service_tier: "flex" }],
    ["cache-mode", { ...requestA.body, prompt_cache_options: { mode: "explicit", ttl: "30m" } }],
    ["cache-ttl", { ...requestA.body, prompt_cache_options: { mode: "implicit", ttl: "24h" } }],
    ["truncation", { ...requestA.body, truncation: "auto" }],
    ["previous-response", { ...requestA.body, previous_response_id: "resp_previous" }],
    ["conversation", { ...requestA.body, conversation: "conv_123" }],
    ["encrypted-reasoning", { ...requestA.body, include: ["reasoning.encrypted_content"] }],
    ["tool", { ...requestA.body, tools: [{ type: "function" }] }],
    ["stream", { ...requestA.body, stream: true }],
  ];
  for (const [name, body] of frozenMutations) {
    let rejected = false;
    try { runner.createRequest(`bad-${name}`, body); } catch { rejected = true; }
    assert(rejected, `Generic Batch request must reject frozen-field/state drift: ${name}`);
  }


  const isolationMutations: Array<[string, Record<string, unknown>]> = [
    ["unknown-top-level", { ...requestA.body, temperature: 0.7 }],
    ["reasoning-extra", { ...requestA.body, reasoning: { effort: "medium", summary: "auto" } }],
    ["cache-extra", {
      ...requestA.body,
      prompt_cache_options: { mode: "implicit", ttl: "30m", comparison_response_id: "resp_other" },
    }],
    ["text-extra", {
      ...requestA.body,
      text: { ...(requestA.body.text as Record<string, unknown>), verbosity: "high" },
    }],
    ["assistant-input", {
      ...requestA.body,
      input: [{ role: "assistant", content: "prior answer" }],
    }],
    ["reasoning-input", {
      ...requestA.body,
      input: [{ type: "reasoning", id: "rs_prior", encrypted_content: "opaque" }],
    }],
    ["multi-message-input", {
      ...requestA.body,
      input: [
        { role: "user", content: "first" },
        { role: "user", content: "second" },
      ],
    }],
    ["typed-user-input", {
      ...requestA.body,
      input: [{ type: "message", role: "user", content: "hidden state shape" }],
    }],
  ];
  for (const [name, body] of isolationMutations) {
    let rejected = false;
    try { runner.createRequest(`isolated-${name}`, body); } catch { rejected = true; }
    assert(rejected, `Generic Batch request must reject non-allowlisted/stateful request shape: ${name}`);
  }

  let mainRejected = false;
  try {
    new OpenAIBatchRunner({ ...options, runClass: "scientific-main" });
  } catch { mainRejected = true; }
  assert(mainRejected, "scientific-main must not use Batch infrastructure");

  let calibrationTierRejected = false;
  try {
    new OpenAIBatchRunner({ ...options, serviceTier: "auto" });
  } catch { calibrationTierRejected = true; }
  assert(calibrationTierRejected, "scientific-calibration must freeze serviceTier=default");

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
  assertBatchResultCompleteness(lines, ["request-a", "request-b"]);

  let missingRejected = false;
  try { assertBatchResultCompleteness([lines[0]], ["request-a", "request-b"]); } catch { missingRejected = true; }
  assert(missingRejected, "Missing Batch result custom_id must be rejected");

  let unexpectedRejected = false;
  try { assertBatchResultCompleteness(lines, ["request-b"]); } catch { unexpectedRejected = true; }
  assert(unexpectedRejected, "Unexpected Batch result custom_id must be rejected");

  let duplicateResultRejected = false;
  try { mergeBatchJsonlTexts([outputText, outputText]); } catch { duplicateResultRejected = true; }
  assert(duplicateResultRejected, "Duplicate result custom_id must be rejected");

  const completedBatchObject = {
    id: "batch_123",
    input_file_id: "file-input",
    output_file_id: "file-output",
    error_file_id: "file-error",
    endpoint: OPENAI_BATCH_ENDPOINT,
    completion_window: OPENAI_BATCH_COMPLETION_WINDOW,
    status: "completed",
    request_counts: { total: 2, completed: 1, failed: 1 },
  };
  const downloadRunner = new OpenAIBatchRunner(options, {
    files: {
      async create() { return { id: "file-input" }; },
      async content(fileId: string) {
        return { async text() { return fileId === "file-output" ? outputText : errorText; } };
      },
    },
    batches: {
      async create() { return completedBatchObject; },
      async retrieve() { return completedBatchObject; },
    },
  });
  const downloaded = await downloadRunner.download("batch_123", ["request-a", "request-b"]);
  assert(downloaded.lines.length === 2, "Completed Batch download must contain every expected result");

  const normalized = downloadRunner.normalizeMutationResults(downloaded);
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

  const nonTerminalRunner = new OpenAIBatchRunner(options, {
    files: {
      async create() { return { id: "file-input" }; },
      async content() { throw new Error("must not download before completion"); },
    },
    batches: {
      async create() { throw new Error("not used"); },
      async retrieve() {
        return { ...completedBatchObject, status: "in_progress", output_file_id: null, error_file_id: null };
      },
    },
  });
  let nonTerminalRejected = false;
  try { await nonTerminalRunner.download("batch_in_progress", ["request-a", "request-b"]); } catch { nonTerminalRejected = true; }
  assert(nonTerminalRejected, "download must reject non-terminal/in-progress Batch state");

  const silentLossRunner = new OpenAIBatchRunner(options, {
    files: {
      async create() { return { id: "file-input" }; },
      async content() { return { async text() { return outputText; } }; },
    },
    batches: {
      async create() { throw new Error("not used"); },
      async retrieve() {
        return { ...completedBatchObject, error_file_id: null, request_counts: { total: 2, completed: 2, failed: 0 } };
      },
    },
  });
  let silentLossRejected = false;
  try { await silentLossRunner.download("batch_missing", ["request-a", "request-b"]); } catch { silentLossRejected = true; }
  assert(silentLossRejected, "download must reject silent sample loss even when API status=completed");

  const batch: OpenAIBatchSubmission = downloaded.batch;
  assert(batch.status === "completed", "downloaded batch must be completed");

  console.log("OpenAI Batch offline verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
