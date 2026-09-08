import {
  buildOpenAIUserMessage,
  estimateOpenAICostUsd,
  parseStructuredMutation,
} from "./src/agent-backend/openai";
import { OPENAI_PROMPT_HASH, OPENAI_SCHEMA_HASH } from "./src/agent-backend/openai/shared";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parsed = parseStructuredMutation(JSON.stringify({
  modifiedFiles: [{ path: "src/a.ts", content: "export const a = 1;" }],
  workingNote: "Changed a only.",
}));
assert(parsed.ok, "valid structured mutation should parse");
assert(parsed.value.modifiedFiles["src/a.ts"].includes("a = 1"), "file map conversion failed");

const duplicate = parseStructuredMutation(JSON.stringify({
  modifiedFiles: [{ path: "src/a.ts", content: "a" }, { path: "src/a.ts", content: "b" }],
  workingNote: "duplicate",
}));
assert(!duplicate.ok, "duplicate paths must be rejected");

const prompt = buildOpenAIUserMessage({
  contextFiles: { "a.ts": "A".repeat(20), "z.ts": "TAIL" },
  visibleInstruction: "task",
  contextBudget: 1,
});
assert(prompt.includes("TAIL"), "OpenAI backend must not re-truncate condition-runner evidence");
assert(OPENAI_PROMPT_HASH.length === 64 && OPENAI_SCHEMA_HASH.length === 64, "prompt/schema hashes must be SHA-256");

const usage = {
  input_tokens: 1100,
  input_tokens_details: { cached_tokens: 200, cache_write_tokens: 100 },
  output_tokens: 500,
  output_tokens_details: { reasoning_tokens: 100 },
  total_tokens: 1600,
};
const syncCost = estimateOpenAICostUsd("gpt-5.6-luna", usage, "sync");
const batchCost = estimateOpenAICostUsd("gpt-5.6-luna", usage, "batch");
assert(syncCost !== null && syncCost > 0, "Luna sync cost should be estimated");
assert(batchCost !== null && Math.abs(batchCost * 2 - syncCost) < 1e-12, "Batch estimate must be 50% of Sync");
assert(estimateOpenAICostUsd("unknown-model", usage, "sync") === null, "unknown pricing must remain null, never zero");

console.log("OpenAI backend offline verification passed.");
