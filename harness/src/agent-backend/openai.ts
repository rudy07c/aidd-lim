// harness/src/agent-backend/openai.ts
// Stage 1 primary Sync OpenAI backend.
// One-shot requests are research-stateless. Function-tool continuation below is API-stateless
// and may carry encrypted reasoning; PR/AR WorkingSet runtime MUST NOT use that continuation mode.

import OpenAI from "openai";
import { AgentBackend, AgentInput, AgentResult, AgentTool, AgentToolEvent } from "./types";
import { OpenAIServiceTier, PromptCacheMode, ReasoningEffort, TokenUsage } from "../types";
import {
  OPENAI_MUTATION_SCHEMA_VERSION,
  OPENAI_PROMPT_HASH,
  OPENAI_PROMPT_VERSION,
  OPENAI_SCHEMA_HASH,
  accumulateCost,
  addUsage,
  buildOpenAIResponseRequestBody,
  buildOpenAIUserMessage,
  estimateOpenAICostUsd,
  extractObservableAssistantMessages,
  extractRefusal,
  getPackageVersion,
  parseStructuredMutation,
  responseFailureDetails,
} from "./openai/shared";

export { buildOpenAIUserMessage, estimateOpenAICostUsd, parseStructuredMutation } from "./openai/shared";

export interface OpenAIBackendOptions {
  model: string;
  reasoningEffort: ReasoningEffort;
  maxOutputTokens: number;
  requestTimeoutMs: number;
  maxRetries: number;
  storeResponses: boolean;
  maxToolRounds: number;
  serviceTier: OpenAIServiceTier;
  promptCacheMode: PromptCacheMode;
}

export class OpenAIBackend implements AgentBackend {
  private readonly client: OpenAI;

  constructor(private readonly options: OpenAIBackendOptions) {
    this.client = new OpenAI({ timeout: options.requestTimeoutMs, maxRetries: options.maxRetries });
  }

  async run(input: AgentInput): Promise<AgentResult> {
    const start = Date.now();
    const toolEvents: AgentToolEvent[] = [];
    const observableAssistantMessages: string[] = [];
    const aggregateUsage: TokenUsage = {
      input: 0,
      output: 0,
      cachedInput: 0,
      cacheWriteInput: 0,
      reasoningOutput: 0,
      total: 0,
    };
    let estimatedCostUsd: number | null = 0;
    let lastResponse: OpenAI.Responses.Response | null = null;
    const tools = input.tools ?? [];
    let responseInput: any[] = [{ role: "user", content: buildOpenAIUserMessage(input) }];

    try {
      for (let round = 0; round <= this.options.maxToolRounds; round++) {
        const requestBody = buildOpenAIResponseRequestBody({
          options: this.options,
          responseInput,
          tools,
          // Needed only for API-stateless function-tool continuation. One-shot calls do not request it.
          includeEncryptedReasoning: tools.length > 0,
        });
        const response = await this.client.responses.create(requestBody as any);
        lastResponse = response;
        observableAssistantMessages.push(...extractObservableAssistantMessages(response));
        addUsage(aggregateUsage, response.usage);
        estimatedCostUsd = accumulateCost(
          estimatedCostUsd,
          estimateOpenAICostUsd(this.options.model, response.usage, "sync")
        );

        const refusal = extractRefusal(response);
        const failure = responseFailureDetails(response);
        if (refusal !== null) {
          return this.makeResult({
            start, lastResponse: response, rawResponse: response.output_text ?? "", toolEvents,
            observableAssistantMessages, usage: aggregateUsage, estimatedCostUsd,
            status: "response-refusal",
            error: { category: "response", message: `Model refusal: ${refusal}`, retryable: false },
            refusal,
          });
        }
        if (response.status !== "completed") {
          const status =
            response.status === "incomplete" ? "response-incomplete" :
            response.status === "failed" ? "response-failed" : "response-not-completed";
          return this.makeResult({
            start, lastResponse: response, rawResponse: response.output_text ?? "", toolEvents,
            observableAssistantMessages, usage: aggregateUsage, estimatedCostUsd,
            status,
            error: {
              category: "response",
              message: failure.providerErrorMessage ?? `Response status=${response.status}${failure.incompleteReason ? ` reason=${failure.incompleteReason}` : ""}`,
              retryable: false,
            },
            incompleteReason: failure.incompleteReason,
            providerErrorCode: failure.providerErrorCode,
          });
        }

        const functionCalls = response.output.filter(
          (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call"
        );
        if (functionCalls.length === 0) {
          const rawResponse = response.output_text ?? "";
          const parsed = parseStructuredMutation(rawResponse);
          if (!parsed.ok) {
            return this.makeResult({
              start, lastResponse: response, rawResponse, toolEvents, observableAssistantMessages,
              usage: aggregateUsage, estimatedCostUsd, status: "output-parse-failure",
              error: { category: "output-parse", message: parsed.error, retryable: false },
            });
          }
          return this.makeResult({
            start, lastResponse: response, rawResponse, toolEvents, observableAssistantMessages,
            usage: aggregateUsage, estimatedCostUsd, status: "ok",
            modifiedFiles: parsed.value.modifiedFiles,
            workingNote: parsed.value.workingNote,
            error: null,
          });
        }

        if (round >= this.options.maxToolRounds) {
          return this.makeResult({
            start, lastResponse: response, rawResponse: response.output_text ?? "", toolEvents,
            observableAssistantMessages, usage: aggregateUsage, estimatedCostUsd, status: "tool-error",
            error: { category: "tool", message: `Exceeded maxToolRounds=${this.options.maxToolRounds}`, retryable: false },
          });
        }

        // API-stateless continuation only. This intentionally carries encrypted reasoning when present.
        // PR/AR research-stateless paging must use separate fresh inference steps and must not call this loop.
        responseInput.push(...(response.output as any[]));
        for (const call of functionCalls) {
          const event = await executeToolCall(call, tools);
          toolEvents.push(event);
          if (!event.ok) {
            return this.makeResult({
              start, lastResponse: response, rawResponse: response.output_text ?? "", toolEvents,
              observableAssistantMessages, usage: aggregateUsage, estimatedCostUsd, status: "tool-error",
              error: { category: "tool", message: event.error ?? "Tool execution failed", retryable: false },
            });
          }
          responseInput.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(event.result) });
        }
      }
      throw new Error("Unreachable OpenAI tool loop termination");
    } catch (error) {
      // Only provider/transport errors are normalized. Programming/harness errors remain fatal.
      if (!(error instanceof OpenAI.APIError)) throw error;
      return this.makeResult({
        start,
        lastResponse,
        rawResponse: lastResponse?.output_text ?? "",
        toolEvents,
        observableAssistantMessages,
        usage: aggregateUsage,
        estimatedCostUsd: aggregateUsage.total && aggregateUsage.total > 0 ? estimatedCostUsd : null,
        status: "provider-error",
        error: { category: "provider", message: error.message, retryable: inferRetryable(error) },
        providerErrorCode: (error as any).code ?? null,
      });
    }
  }

  private makeResult(args: {
    start: number;
    lastResponse: OpenAI.Responses.Response | null;
    rawResponse: string;
    toolEvents: AgentToolEvent[];
    observableAssistantMessages: string[];
    usage: TokenUsage;
    estimatedCostUsd: number | null;
    status: AgentResult["executionStatus"];
    modifiedFiles?: Record<string, string>;
    workingNote?: string;
    error: AgentResult["error"];
    incompleteReason?: string | null;
    refusal?: string | null;
    providerErrorCode?: string | null;
  }): AgentResult {
    return {
      modifiedFiles: args.modifiedFiles ?? {},
      rawResponse: args.rawResponse,
      observableAssistantMessages: args.observableAssistantMessages,
      explicitWorkingNote: args.workingNote ?? null,
      toolEvents: args.toolEvents,
      tokenUsage: args.usage,
      latencyMs: Date.now() - args.start,
      executionStatus: args.status,
      modelProvenance: {
        provider: "openai",
        requestedModel: this.options.model,
        actualModel: args.lastResponse?.model ?? null,
        responseId: args.lastResponse?.id ?? null,
        responseStatus: args.lastResponse?.status ?? (args.status === "provider-error" ? "provider-error" : null),
        endpoint: "responses",
        reasoningEffort: this.options.reasoningEffort,
        maxOutputTokens: this.options.maxOutputTokens,
        structuredOutput: true,
        storeResponses: this.options.storeResponses,
        requestedServiceTier: this.options.serviceTier,
        actualServiceTier: args.lastResponse?.service_tier ?? null,
        promptCacheMode: this.options.promptCacheMode,
        promptVersion: OPENAI_PROMPT_VERSION,
        promptHash: OPENAI_PROMPT_HASH,
        schemaVersion: OPENAI_MUTATION_SCHEMA_VERSION,
        schemaHash: OPENAI_SCHEMA_HASH,
        pricingMode: "sync",
        continuationState: args.toolEvents.length > 0 ? "encrypted-reasoning" : "none",
        incompleteReason: args.incompleteReason ?? null,
        refusal: args.refusal ?? null,
        providerErrorCode: args.providerErrorCode ?? null,
        sdkVersion: getPackageVersion("openai"),
        retryPolicy: { maxRetries: this.options.maxRetries, timeoutMs: this.options.requestTimeoutMs },
      },
      estimatedCostUsd: args.estimatedCostUsd,
      error: args.error,
    };
  }
}

async function executeToolCall(
  call: OpenAI.Responses.ResponseFunctionToolCall,
  tools: AgentTool[]
): Promise<AgentToolEvent> {
  const tool = tools.find((candidate) => candidate.name === call.name);
  if (!tool) {
    return { callId: call.call_id, toolName: call.name, arguments: call.arguments, result: null, ok: false, error: `Unknown tool: ${call.name}` };
  }
  let parsedArguments: unknown;
  try {
    parsedArguments = JSON.parse(call.arguments);
  } catch (error) {
    return { callId: call.call_id, toolName: call.name, arguments: call.arguments, result: null, ok: false, error: `Invalid tool arguments JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  try {
    const result = await tool.execute(parsedArguments);
    return { callId: call.call_id, toolName: call.name, arguments: parsedArguments, result, ok: true };
  } catch (error) {
    return { callId: call.call_id, toolName: call.name, arguments: parsedArguments, result: null, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function inferRetryable(error: { status?: number }): boolean {
  if (error.status === 408 || error.status === 409 || error.status === 429) return true;
  if (typeof error.status === "number" && error.status >= 500) return true;
  return false;
}
