import "dotenv/config";
import { OpenAIBackend } from "./src/agent-backend/openai";
import { AgentTool } from "./src/agent-backend/types";

function createBackend(): OpenAIBackend {
  return new OpenAIBackend({
    model: "gpt-5.6-luna",
    reasoningEffort: "low",
    maxOutputTokens: 2048,
    requestTimeoutMs: 120_000,
    maxRetries: 2,
    storeResponses: false,
    maxToolRounds: 3,
    serviceTier: "default",
    promptCacheMode: "implicit",
  });
}

async function runOneShot() {
  const backend = createBackend();
  return backend.run({
    contextFiles: { "src/a.ts": "export const value = 1;\n" },
    visibleInstruction: "Add the comment // sync-one-shot-smoke directly above the export without changing the exported value.",
    contextBudget: "full",
  });
}

async function runFunctionCall() {
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

  const backend = createBackend();
  return backend.run({
    contextFiles: { "src/a.ts": "export const value = 1;\n" },
    visibleInstruction: "You MUST call lookup_fact with key=contract first. Then add the comment // sync-tool-smoke without changing the exported value.",
    contextBudget: "full",
    tools: [lookup],
  });
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");

  const oneShot = await runOneShot();
  if (oneShot.executionStatus !== "ok") {
    throw new Error(`OpenAI one-shot smoke failed: ${JSON.stringify(oneShot.error)}`);
  }
  if (oneShot.toolEvents.length !== 0) throw new Error("One-shot smoke unexpectedly used tools");
  if (oneShot.modelProvenance.actualModel === null) throw new Error("One-shot actual model provenance missing");
  const oneShotFile = oneShot.modifiedFiles["src/a.ts"];
  if (!oneShotFile?.includes("sync-one-shot-smoke") || !oneShotFile.includes("value = 1")) {
    throw new Error(`One-shot structured mutation did not preserve the requested change: ${oneShotFile ?? "<missing>"}`);
  }

  const toolCall = await runFunctionCall();
  if (toolCall.executionStatus !== "ok") {
    throw new Error(`OpenAI function-call smoke failed: ${JSON.stringify(toolCall.error)}`);
  }
  if (toolCall.toolEvents.length === 0) throw new Error("Function calling was not exercised");
  if (toolCall.modelProvenance.actualModel === null) throw new Error("Function-call actual model provenance missing");
  const toolFile = toolCall.modifiedFiles["src/a.ts"];
  if (!toolFile?.includes("sync-tool-smoke") || !toolFile.includes("value = 1")) {
    throw new Error(`Function-call structured mutation did not preserve the requested change: ${toolFile ?? "<missing>"}`);
  }

  console.log(JSON.stringify({
    oneShot: {
      status: oneShot.executionStatus,
      requestedModel: oneShot.modelProvenance.requestedModel,
      actualModel: oneShot.modelProvenance.actualModel,
      usage: oneShot.tokenUsage,
      estimatedCostUsd: oneShot.estimatedCostUsd,
    },
    functionCall: {
      status: toolCall.executionStatus,
      requestedModel: toolCall.modelProvenance.requestedModel,
      actualModel: toolCall.modelProvenance.actualModel,
      usage: toolCall.tokenUsage,
      estimatedCostUsd: toolCall.estimatedCostUsd,
      toolEvents: toolCall.toolEvents.length,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
