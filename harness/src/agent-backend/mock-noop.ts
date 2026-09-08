import { AgentBackend, AgentInput, AgentResult } from "./types";

export class MockNoopBackend implements AgentBackend {
  async run(input: AgentInput): Promise<AgentResult> {
    const start = Date.now();
    return {
      modifiedFiles: { ...input.contextFiles },
      rawResponse: "[mock-noop] No changes made. Returned contextFiles as-is.",
      explicitWorkingNote: null,
      toolEvents: [],
      tokenUsage: { input: 0, output: 0, total: 0 },
      latencyMs: Date.now() - start,
      executionStatus: "ok",
      modelProvenance: {
        provider: "mock", requestedModel: null, actualModel: "mock-noop", responseId: null,
        responseStatus: "completed", endpoint: "mock", reasoningEffort: null, maxOutputTokens: null,
        structuredOutput: true, storeResponses: null, serviceTier: null, sdkVersion: null,
        retryPolicy: { maxRetries: null, timeoutMs: null },
      },
      estimatedCostUsd: 0,
      error: null,
    };
  }
}
