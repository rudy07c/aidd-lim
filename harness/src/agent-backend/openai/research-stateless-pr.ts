import OpenAI from "openai";
import {
  PrivilegedRetrievedDecision,
} from "../../context/privileged-retrieved-episode";
import {
  ResearchStatelessExecutorFactoryArgs,
  ResearchStatelessModelInput,
  ResearchStatelessProviderTelemetry,
  ResearchStatelessStepExecutor,
  ResearchStatelessStepResult,
  ResearchStatelessToolDefinition,
} from "../../context/research-stateless-episode";
import type { TokenUsage } from "../../types";
import {
  ResearchStatelessProviderFailure,
  inferProviderRetryable,
  responseStatusToCensoredExecutionStatus,
} from "../research-stateless-provider-failure";
import {
  OPENAI_MUTATION_OUTPUT_SPEC,
  OpenAIRequestOptions,
  addUsage,
  buildOpenAIStructuredResponseRequestBody,
  estimateOpenAICostUsd,
  extractRefusal,
  parseStructuredMutation,
  responseFailureDetails,
} from "./shared";
import type { AgentTool } from "../types";

export interface OpenAIResearchStatelessPROptions extends OpenAIRequestOptions {
  requestTimeoutMs: number;
  maxRetries: number;
}

/**
 * One fresh OpenAI Responses call for one PR reasoning step.
 * The model can only request `retrieve_next`; the evaluator-side privileged
 * controller chooses the actual repository path through the shared gateway.
 */
export class OpenAIResearchStatelessPRExecutor
  implements ResearchStatelessStepExecutor<PrivilegedRetrievedDecision<{ modifiedFiles: Record<string, string> }>>
{
  private readonly client: OpenAI;

  constructor(
    private readonly options: OpenAIResearchStatelessPROptions,
    private readonly protocolId: string,
    private readonly toolDefinitions: readonly ResearchStatelessToolDefinition[]
  ) {
    if (options.storeResponses) {
      throw new Error("Research-stateless PR requires storeResponses=false");
    }
    this.client = new OpenAI({
      timeout: options.requestTimeoutMs,
      maxRetries: options.maxRetries,
    });
  }

  async runFresh(
    input: Readonly<ResearchStatelessModelInput>
  ): Promise<ResearchStatelessStepResult<PrivilegedRetrievedDecision<{ modifiedFiles: Record<string, string> }>>> {
    const startedAt = Date.now();
    const body = buildOpenAIStructuredResponseRequestBody({
      options: this.options,
      responseInput: [{ role: "user", content: buildPRUserMessage(input) }],
      tools: this.toolDefinitions.map(schemaOnlyAgentTool),
      includeEncryptedReasoning: false,
      outputSpec: OPENAI_MUTATION_OUTPUT_SPEC,
    });

    let response: OpenAI.Responses.Response;
    try {
      response = await this.client.responses.create(body as any);
    } catch (error) {
      if (!(error instanceof OpenAI.APIError)) throw error;
      throw new ResearchStatelessProviderFailure({
        executionStatus: "provider-error",
        normalizedError: {
          category: "provider",
          message: error.message,
          retryable: inferProviderRetryable(error),
        },
      });
    }

    const providerTelemetry = buildProviderTelemetry(
      this.options,
      response,
      Date.now() - startedAt
    );
    const refusal = extractRefusal(response);
    if (refusal !== null) {
      throw new ResearchStatelessProviderFailure({
        executionStatus: "response-refusal",
        normalizedError: {
          category: "response",
          message: `PR model refusal: ${refusal}`,
          retryable: false,
        },
        providerTelemetry,
        rawResponse: response.output_text ?? "",
      });
    }
    if (response.status !== "completed") {
      const details = responseFailureDetails(response);
      throw new ResearchStatelessProviderFailure({
        executionStatus: responseStatusToCensoredExecutionStatus(response.status),
        normalizedError: {
          category: "response",
          message:
            details.providerErrorMessage ??
            `PR response status=${response.status}${details.incompleteReason ? ` reason=${details.incompleteReason}` : ""}`,
          retryable: false,
        },
        providerTelemetry,
        rawResponse: response.output_text ?? "",
      });
    }

    const calls = response.output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call"
    );
    if (calls.length > 1) {
      throw new Error(`PR research-stateless step emitted ${calls.length} function calls; expected at most one`);
    }

    if (calls.length === 1) {
      const call = calls[0];
      if (call.name !== "retrieve_next" || !this.toolDefinitions.some((tool) => tool.name === call.name)) {
        throw new Error(`PR model called unknown tool: ${call.name}`);
      }
      let argumentsValue: unknown;
      try {
        argumentsValue = JSON.parse(call.arguments);
      } catch (error) {
        throw new Error(
          `PR tool arguments are not valid JSON: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return {
        decision: { kind: "retrieve" },
        rawResponse: response.output_text ?? "",
        explicitMemoryUpdate: workingNoteFromRetrieveNext(argumentsValue),
        transport: statelessTransport(this.protocolId),
        providerTelemetry,
      };
    }

    const rawResponse = response.output_text ?? "";
    const parsed = parseStructuredMutation(rawResponse);
    if (!parsed.ok) throw new Error(`PR final mutation parse failed: ${parsed.error}`);
    return {
      decision: {
        kind: "finalize",
        value: { modifiedFiles: parsed.value.modifiedFiles },
      },
      rawResponse,
      explicitMemoryUpdate: parsed.value.workingNote,
      transport: statelessTransport(this.protocolId),
      providerTelemetry,
    };
  }
}

export function createOpenAIResearchStatelessPRExecutorFactory(
  options: OpenAIResearchStatelessPROptions
) {
  return (args: Readonly<ResearchStatelessExecutorFactoryArgs>) => {
    if (args.condition !== "PR") {
      throw new Error(`OpenAI PR executor received non-PR condition: ${args.condition}`);
    }
    return new OpenAIResearchStatelessPRExecutor(
      options,
      args.protocolId,
      args.toolDefinitions
    );
  };
}

export function buildPRUserMessage(input: Readonly<ResearchStatelessModelInput>): string {
  const lines = [
    `CURRENT TASK:\n${input.visibleInstruction}`,
    "\nCURRENT WORKING SET:",
  ];
  if (input.artifactEvidence.length === 0) {
    lines.push("\n<empty>");
  } else {
    for (const evidence of input.artifactEvidence) lines.push(`\n${evidence}`);
  }
  lines.push(`\nEXPLICIT MEMORY:\n${input.explicitMemory ?? "<none>"}`);
  if (input.runtimeObservation) {
    lines.push(
      `\nLAST RETRIEVAL RESULT:\n[${input.runtimeObservation.kind}] ${input.runtimeObservation.message}`
    );
  }
  lines.push(
    "\nIf more repository evidence is needed, call retrieve_next and include a concise workingNote (or null). The privileged controller chooses what is read. A no-more-evidence result means the controller has no additional observable repository evidence to provide at that moment; use the current working set and memory to decide whether to finalize or spend another decision round requesting retrieval. Otherwise return the final structured repository mutation."
  );
  return lines.join("");
}

function workingNoteFromRetrieveNext(value: unknown): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("PR retrieve_next arguments must be an object");
  }
  const note = (value as Record<string, unknown>).workingNote;
  if (note === null) return null;
  if (typeof note !== "string") {
    throw new Error("PR retrieve_next workingNote must be null or a string");
  }
  return note;
}

function schemaOnlyAgentTool(definition: ResearchStatelessToolDefinition): AgentTool {
  return {
    name: definition.name,
    description: definition.description,
    parameters: { ...definition.parameters },
    async execute() {
      throw new Error("Research-stateless PR provider adapter must never execute tools in-call");
    },
  };
}

function buildProviderTelemetry(
  options: OpenAIResearchStatelessPROptions,
  response: OpenAI.Responses.Response,
  latencyMs: number
): ResearchStatelessProviderTelemetry {
  const usage: TokenUsage = {
    input: 0,
    output: 0,
    cachedInput: 0,
    cacheWriteInput: 0,
    reasoningOutput: 0,
    total: 0,
  };
  addUsage(usage, response.usage);
  return {
    provider: "openai",
    requestedModel: options.model,
    actualModel: response.model ?? null,
    responseId: response.id ?? null,
    responseStatus: response.status ?? null,
    tokenUsage: response.usage ? usage : null,
    latencyMs,
    costUsd: estimateOpenAICostUsd(options.model, response.usage, "sync"),
  };
}

function statelessTransport(protocolId: string) {
  return {
    protocolId,
    previousResponseIdUsed: false,
    providerConversationReused: false,
    priorAssistantHistoryReplayed: false,
    encryptedReasoningReplayed: false,
    compactionStateReplayed: false,
    otherOpaqueStateReplayed: false,
    responseStored: false,
  } as const;
}
