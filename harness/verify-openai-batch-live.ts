import "dotenv/config";
import { OpenAIBatchRunner } from "./src/agent-backend/openai/batch";

const POLL_INTERVAL_MS = 5_000;
const DEFAULT_MAX_WAIT_MS = 10 * 60_000;
const TERMINAL_FAILURES = new Set(["failed", "expired", "cancelled"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");

  const runner = new OpenAIBatchRunner({
    runClass: "smoke",
    model: "gpt-5.6-luna",
    reasoningEffort: "low",
    maxOutputTokens: 2048,
    storeResponses: false,
    serviceTier: "default",
    promptCacheMode: "implicit",
    requestTimeoutMs: 120_000,
    maxRetries: 2,
  });

  const customId = `batch-live-${Date.now()}`;
  const request = runner.buildMutationRequest(customId, {
    contextFiles: { "src/a.ts": "export const value = 1;\n" },
    visibleInstruction: "Add the comment // batch-live-smoke directly above the export without changing the exported value.",
    contextBudget: "full",
  });

  const submitted = await runner.submit([request], {
    purpose: "stage1-p1-live-smoke",
  });
  console.log(`[batch-live] submitted ${submitted.batchId} status=${submitted.status}`);

  const configuredMaxWait = Number(process.env.OPENAI_BATCH_SMOKE_MAX_WAIT_MS ?? DEFAULT_MAX_WAIT_MS);
  const maxWaitMs = Number.isFinite(configuredMaxWait) && configuredMaxWait > 0
    ? configuredMaxWait
    : DEFAULT_MAX_WAIT_MS;
  const deadline = Date.now() + maxWaitMs;

  let current = submitted;
  while (current.status !== "completed") {
    if (TERMINAL_FAILURES.has(current.status)) {
      throw new Error(`Batch live smoke terminated with status=${current.status}`);
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Batch live smoke did not complete within ${maxWaitMs}ms; ` +
        `batch_id=${current.batchId}, last_status=${current.status}`
      );
    }
    await sleep(POLL_INTERVAL_MS);
    current = await runner.retrieve(current.batchId);
    console.log(`[batch-live] ${current.batchId} status=${current.status}`);
  }

  const download = await runner.download(current.batchId, [customId]);
  const results = runner.normalizeMutationResults(download);
  if (results.length !== 1) throw new Error(`Expected one Batch result, got ${results.length}`);
  const result = results[0];
  if (result.customId !== customId) throw new Error(`custom_id mismatch: ${result.customId}`);
  if (result.executionStatus !== "ok") {
    throw new Error(`Batch live smoke failed: ${JSON.stringify(result.error)}`);
  }
  if (result.modelProvenance.actualModel === null) throw new Error("Batch actual model provenance missing");
  if (result.modelProvenance.pricingMode !== "batch") throw new Error("Batch pricing provenance missing");
  const file = result.modifiedFiles["src/a.ts"];
  if (!file?.includes("batch-live-smoke") || !file.includes("value = 1")) {
    throw new Error(`Batch structured mutation did not preserve the requested change: ${file ?? "<missing>"}`);
  }

  console.log(JSON.stringify({
    status: result.executionStatus,
    batchId: result.batchProvenance.batchId,
    customId: result.customId,
    requestedModel: result.modelProvenance.requestedModel,
    actualModel: result.modelProvenance.actualModel,
    usage: result.tokenUsage,
    estimatedCostUsd: result.estimatedCostUsd,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
