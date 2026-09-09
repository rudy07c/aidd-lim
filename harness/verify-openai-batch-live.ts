import "dotenv/config";
import OpenAI from "openai";
import { OpenAIBatchRunner, OpenAIBatchSubmission } from "./src/agent-backend/openai/batch";

const TERMINAL_FAILURES = new Set(["failed", "expired", "cancelled"]);

function createRunner(): OpenAIBatchRunner {
  return new OpenAIBatchRunner({
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
}

async function submitSmoke(runner: OpenAIBatchRunner): Promise<void> {
  const customId = `batch-live-${Date.now()}`;
  const request = runner.buildMutationRequest(customId, {
    contextFiles: { "src/a.ts": "export const value = 1;\n" },
    visibleInstruction: "Add the comment // batch-live-smoke directly above the export without changing the exported value.",
    contextBudget: "full",
  });

  const submitted = await runner.submit([request], {
    purpose: "stage1-p1-live-smoke",
  });

  console.log(JSON.stringify({
    action: "submitted",
    batchId: submitted.batchId,
    status: submitted.status,
    requestCounts: submitted.requestCounts,
    resumeCommand: `npm run verify:openai-batch-live -- resume ${submitted.batchId}`,
  }, null, 2));
}

async function resumeSmoke(runner: OpenAIBatchRunner, batchId: string): Promise<void> {
  const current = await runner.retrieve(batchId);

  if (TERMINAL_FAILURES.has(current.status)) {
    throw new Error(
      `Batch live smoke terminated with status=${current.status}; ` +
      `batch_id=${current.batchId}`
    );
  }

  if (current.status !== "completed") {
    console.log(JSON.stringify({
      action: "resume-check",
      batchId: current.batchId,
      status: current.status,
      requestCounts: current.requestCounts,
      completed: false,
      note: "Batch is still processing. Run the same resume command again later; no new Batch was submitted.",
    }, null, 2));
    return;
  }

  const customIds = await readSubmittedCustomIds(current);
  const download = await runner.download(current.batchId, customIds);
  const results = runner.normalizeMutationResults(download);

  if (results.length !== 1) {
    throw new Error(`Expected one Batch live-smoke result, got ${results.length}`);
  }
  const result = results[0];
  if (!customIds.includes(result.customId)) {
    throw new Error(`Unexpected Batch custom_id: ${result.customId}`);
  }
  if (result.executionStatus !== "ok") {
    throw new Error(`Batch live smoke failed: ${JSON.stringify(result.error)}`);
  }
  if (result.modelProvenance.actualModel === null) {
    throw new Error("Batch actual model provenance missing");
  }
  if (result.modelProvenance.actualModel !== "gpt-5.6-luna") {
    throw new Error(`Unexpected actual model: ${result.modelProvenance.actualModel}`);
  }
  if (result.modelProvenance.pricingMode !== "batch") {
    throw new Error("Batch pricing provenance missing");
  }
  const file = result.modifiedFiles["src/a.ts"];
  if (!file?.includes("batch-live-smoke") || !file.includes("value = 1")) {
    throw new Error(
      `Batch structured mutation did not preserve the requested change: ${file ?? "<missing>"}`
    );
  }

  console.log(JSON.stringify({
    action: "completed",
    status: result.executionStatus,
    batchId: result.batchProvenance.batchId,
    customId: result.customId,
    requestedModel: result.modelProvenance.requestedModel,
    actualModel: result.modelProvenance.actualModel,
    usage: result.tokenUsage,
    estimatedCostUsd: result.estimatedCostUsd,
  }, null, 2));
}

async function readSubmittedCustomIds(batch: OpenAIBatchSubmission): Promise<string[]> {
  const client = new OpenAI({ timeout: 120_000, maxRetries: 2 });
  const response = await client.files.content(batch.inputFileId);
  const text = await response.text();
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(
        `Invalid submitted Batch input JSONL at line ${index + 1}: ` +
        `${error instanceof Error ? error.message : String(error)}`
      );
    }
    if (!isRecord(parsed) || typeof parsed.custom_id !== "string" || parsed.custom_id.length === 0) {
      throw new Error(`Submitted Batch input line ${index + 1} is missing custom_id`);
    }
    if (seen.has(parsed.custom_id)) {
      throw new Error(`Duplicate submitted Batch custom_id: ${parsed.custom_id}`);
    }
    seen.add(parsed.custom_id);
    ids.push(parsed.custom_id);
  }

  if (ids.length === 0) {
    throw new Error(`Batch ${batch.batchId} input file contains no custom_id values`);
  }
  if (batch.requestCounts && batch.requestCounts.total !== ids.length) {
    throw new Error(
      `Batch input manifest mismatch: api_total=${batch.requestCounts.total}, input_custom_ids=${ids.length}`
    );
  }
  return ids;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");

  const [mode = "submit", batchId, ...extra] = process.argv.slice(2);
  if (extra.length > 0) {
    throw new Error("Usage: npm run verify:openai-batch-live -- [submit | resume <batch_id>]");
  }

  const runner = createRunner();
  if (mode === "submit") {
    if (batchId !== undefined) {
      throw new Error("Usage: npm run verify:openai-batch-live -- submit");
    }
    await submitSmoke(runner);
    return;
  }

  if (mode === "resume") {
    if (!batchId || !batchId.startsWith("batch_")) {
      throw new Error("Usage: npm run verify:openai-batch-live -- resume <batch_id>");
    }
    await resumeSmoke(runner, batchId);
    return;
  }

  throw new Error("Usage: npm run verify:openai-batch-live -- [submit | resume <batch_id>]");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
