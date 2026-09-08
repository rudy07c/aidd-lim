import "dotenv/config";
import { OpenAIBackend } from "./src/agent-backend/openai";
import { AgentTool } from "./src/agent-backend/types";

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");

  const lookup: AgentTool = {
    name: "lookup_fact",
    description: "Return a required implementation fact. Call this before editing when the task asks for it.",
    parameters: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
      additionalProperties: false,
    },
    async execute(args: unknown) {
      return { requested: args, fact: "The exported value must remain 1." };
    },
  };

  const backend = new OpenAIBackend({
    model: "gpt-5.6-luna",
    reasoningEffort: "low",
    maxOutputTokens: 2048,
    requestTimeoutMs: 120_000,
    maxRetries: 2,
    storeResponses: false,
    maxToolRounds: 3,
  });

  const result = await backend.run({
    contextFiles: { "src/a.ts": "export const value = 1;\n" },
    visibleInstruction: "You MUST call lookup_fact with key=contract first. Then add a short comment without changing the exported value.",
    contextBudget: "full",
    tools: [lookup],
  });

  if (result.executionStatus !== "ok") throw new Error(`OpenAI smoke failed: ${JSON.stringify(result.error)}`);
  if (result.toolEvents.length === 0) throw new Error("Function calling was not exercised");
  if (result.modelProvenance.actualModel === null) throw new Error("Actual model provenance missing");
  console.log(JSON.stringify({
    status: result.executionStatus,
    requestedModel: result.modelProvenance.requestedModel,
    actualModel: result.modelProvenance.actualModel,
    usage: result.tokenUsage,
    estimatedCostUsd: result.estimatedCostUsd,
    toolEvents: result.toolEvents.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
