import { AgentBackend, AgentInput, AgentResult } from "./types";

export class MockNoopBackend implements AgentBackend {
  async run(input: AgentInput): Promise<AgentResult> {
    const start = Date.now();
    const rawResponse = "[mock-noop] No changes made. Returned contextFiles as-is.";
    return {
      modifiedFiles: { ...input.contextFiles },
      rawResponse,
      observableAssistantMessages: [rawResponse],
      explicitWorkingNote: null,
      toolEvents: [],
      tokenUsage: { input: 0, output: 0, total: 0 },
      latencyMs: Date.now() - start,
      executionStatus: "ok",
      modelProvenance: {
        provider: "mock",
        requestedModel: null,
        actualModel: "mock-noop",
        responseId: null,
        responseStatus: "completed",
        endpoint: "mock",
        reasoningEffort: null,
        maxOutputTokens: null,
        structuredOutput: true,
        storeResponses: null,
        requestedServiceTier: null,
        actualServiceTier: null,
        promptCacheMode: null,
        promptVersion: null,
        promptHash: null,
        schemaVersion: null,
        schemaHash: null,
        pricingMode: null,
        continuationState: null,
        incompleteReason: null,
        refusal: null,
        providerErrorCode: null,
        sdkVersion: null,
        retryPolicy: { maxRetries: null, timeoutMs: null },
      },
      estimatedCostUsd: 0,
      error: null,
    };
  }
}
