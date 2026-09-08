import { estimateOpenAICostUsd, parseStructuredMutation } from "./src/agent-backend/openai";

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
  modifiedFiles: [
    { path: "src/a.ts", content: "a" },
    { path: "src/a.ts", content: "b" },
  ],
  workingNote: "duplicate",
}));
assert(!duplicate.ok, "duplicate paths must be rejected");

const cost = estimateOpenAICostUsd("gpt-5.6-luna", {
  input_tokens: 1000,
  input_tokens_details: { cached_tokens: 200, cache_write_tokens: 0 },
  output_tokens: 500,
  output_tokens_details: { reasoning_tokens: 100 },
  total_tokens: 1500,
});
assert(cost !== null && cost > 0, "Luna cost should be estimated");
assert(estimateOpenAICostUsd("other-model", undefined) === null, "unknown model cost must be null");

console.log("OpenAI backend offline verification passed.");
