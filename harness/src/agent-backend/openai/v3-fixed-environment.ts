import * as crypto from "crypto";
import OpenAI from "openai";
import type { AgentBackend, AgentInput, AgentResult, AgentToolEvent } from "../types";
import type { OpenAIBackendOptions } from "../openai";
import {
  OPENAI_MUTATION_OUTPUT_SPEC,
  OPENAI_MUTATION_SCHEMA_VERSION,
  OPENAI_SCHEMA_HASH,
  OPENAI_SYSTEM_PROMPT,
  addUsage,
  buildOpenAIStructuredResponseRequestBody,
  estimateOpenAICostUsd,
  extractObservableAssistantMessages,
  extractRefusal,
  getPackageVersion,
  parseStructuredMutation,
  responseFailureDetails,
} from "./shared";
import { serializeObservableInteractionForSuccessor } from "../../context/observable-interaction";
import { serializeFixedEnvironmentForModel } from "../../context/fixed-environment-runtime";
import type { TokenUsage } from "../../types";

export const OPENAI_V3_FIXED_ENVIRONMENT_PROMPT_VERSION =
  "stage1-worker-v3-fixed-environment-v1" as const;

const V3_FIXED_ENVIRONMENT_PROMPT_FRAMING = [
  "CURRENT TASK",
  "FIXED ENVIRONMENT SPECIFICATION",
  "PREVIOUS OBSERVABLE INTERACTION RECORD (MOI only)",
  "CURRENT REPOSITORY",
].join("\n");

export const OPENAI_V3_FIXED_ENVIRONMENT_PROMPT_HASH = crypto
  .createHash("sha256")
  .update(`${OPENAI_SYSTEM_PROMPT}\n${V3_FIXED_ENVIRONMENT_PROMPT_FRAMING}`, "utf8")
  .digest("hex");

/**
 * V3-only model input framing. Historical OpenAI prompt builders remain untouched.
 * E_fixed is a separate section and is never serialized as repository/artifact evidence.
 */
export function buildOpenAIV3FixedEnvironmentUserMessage(input: AgentInput): string {
  if (!input.fixedEnvironment) {
    throw new Error("V3 fixed-environment backend requires fixedEnvironment");
  }
  const lines: string[] = [
    `CURRENT TASK:\n${input.visibleInstruction}`,
    `\n${serializeFixedEnvironmentForModel(input.fixedEnvironment)}`,
  ];
  if (input.previousInteractionRecord) {
    lines.push(
      `\nPREVIOUS OBSERVABLE INTERACTION RECORD:\n${serializeObservableInteractionForSuccessor(input.previousInteractionRecord)}`
    );
  }
  lines.push("\nCURRENT REPOSITORY:");
  for (const filePath of Object.keys(input.contextFiles).sort()) {
    lines.push(`\n--- ${filePath} ---\n${input.contextFiles[filePath]}\n`);
  }
  lines.push("\nImplement the change and return the structured repository mutation.");
  return lines.join("");
}

/**
 * V3 mutation backend for AF/MOI/EL. PR/AR retain their dedicated research-stateless
 * executors. This backend is deliberately one-shot: v3 fixed-environment mutation
 * conditions do not use provider tool continuation.
 */
export class OpenAIV3FixedEnvironmentBackend implements AgentBackend {
  private readonly client: OpenAI;

  constructor(private readonly options: OpenAIBackendOptions) {
    this.client = new OpenAI({
      timeout: options.requestTimeoutMs,
      maxRetries: options.maxRetries,
    });
  }

  async run(input: AgentInput): Promise<AgentResult> {
    if (!input.fixedEnvironment) {
      throw new Error("OpenAIV3FixedEnvironmentBackend requires fixedEnvironment");
    }
    if ((input.tools ?? []).length > 0) {
      throw new Error(
        "OpenAIV3FixedEnvironmentBackend is one-shot; PR/AR must use research-stateless executors"
      );
    }

    const start = Date.now();
    const usage: TokenUsage = {
      input: 0,
      output: 0,
      cachedInput: 0,
      cacheWriteInput: 0,
      reasoningOutput: 0,
      total: 0,
    };
    let response: OpenAI.Responses.Response | null = null;

    try {
      const body = buildOpenAIStructuredResponseRequestBody({
        options: this.options,
        responseInput: [
          { role: "user", content: buildOpenAIV3FixedEnvironmentUserMessage(input) },
        ],
        tools: [],
        includeEncryptedReasoning: false,
        outputSpec: OPENAI_MUTATION_OUTPUT_SPEC,
      });
      response = await this.client.responses.create(body as any);
      addUsage(usage, response.usage);
      const estimatedCostUsd = estimateOpenAICostUsd(
        this.options.model,
        response.usage,
        "sync"
      );
      const observableAssistantMessages = extractObservableAssistantMessages(response);
      const refusal = extractRefusal(response);
      const failure = responseFailureDetails(response);

      if (refusal !== null) {
        return this.makeResult({
          start,
          response,
          rawResponse: response.output_text ?? "",
          observableAssistantMessages,
          usage,
          estimatedCostUsd,
          status: "response-refusal",
          error: {
            category: "response",
            message: `Model refusal: ${refusal}`,
            retryable: false,
          },
          refusal,
        });
      }
      if (response.status !== "completed") {
        const status =
          response.status === "incomplete"
            ? "response-incomplete"
            : response.status === "failed"
              ? "response-failed"
              : "response-not-completed";
        return this.makeResult({
          start,
          response,
          rawResponse: response.output_text ?? "",
          observableAssistantMessages,
          usage,
          estimatedCostUsd,
          status,
          error: {
            category: "response",
            message:
              failure.providerErrorMessage ??
              `Response status=${response.status}${
                failure.incompleteReason ? ` reason=${failure.incompleteReason}` : ""
              }`,
            retryable: false,
          },
          incompleteReason: failure.incompleteReason,
          providerErrorCode: failure.providerErrorCode,
        });
      }

      const rawResponse = response.output_text ?? "";
      const parsed = parseStructuredMutation(rawResponse);
      if (!parsed.ok) {
        return this.makeResult({
          start,
          response,
          rawResponse,
          observableAssistantMessages,
          usage,
          estimatedCostUsd,
          status: "output-parse-failure",
          error: { category: "output-parse", message: parsed.error, retryable: false },
        });
      }

      return this.makeResult({
        start,
        response,
        rawResponse,
        observableAssistantMessages,
        usage,
        estimatedCostUsd,
        status: "ok",
        modifiedFiles: parsed.value.modifiedFiles,
        workingNote: parsed.value.workingNote,
        error: null,
      });
    } catch (error) {
      if (!(error instanceof OpenAI.APIError)) throw error;
      return this.makeResult({
        start,
        response,
        rawResponse: response?.output_text ?? "",
        observableAssistantMessages: response
          ? extractObservableAssistantMessages(response)
          : [],
        usage,
        estimatedCostUsd: usage.total && usage.total > 0 ? 0 : null,
        status: "provider-error",
        error: {
          category: "provider",
          message: error.message,
          retryable: inferRetryable(error),
        },
        providerErrorCode: (error as any).code ?? null,
      });
    }
  }

  private makeResult(args: {
    start: number;
    response: OpenAI.Responses.Response | null;
    rawResponse: string;
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
    const toolEvents: AgentToolEvent[] = [];
    return {
      modifiedFiles: args.modifiedFiles ?? {},
      rawResponse: args.rawResponse,
      observableAssistantMessages: args.observableAssistantMessages,
      explicitWorkingNote: args.workingNote ?? null,
      toolEvents,
      tokenUsage: args.usage,
      latencyMs: Date.now() - args.start,
      executionStatus: args.status,
      modelProvenance: {
        provider: "openai",
        requestedModel: this.options.model,
        actualModel: args.response?.model ?? null,
        responseId: args.response?.id ?? null,
        responseStatus:
          args.response?.status ?? (args.status === "provider-error" ? "provider-error" : null),
        endpoint: "responses",
        reasoningEffort: this.options.reasoningEffort,
        maxOutputTokens: this.options.maxOutputTokens,
        structuredOutput: true,
        storeResponses: this.options.storeResponses,
        requestedServiceTier: this.options.serviceTier,
        actualServiceTier: args.response?.service_tier ?? null,
        promptCacheMode: this.options.promptCacheMode,
        promptVersion: OPENAI_V3_FIXED_ENVIRONMENT_PROMPT_VERSION,
        promptHash: OPENAI_V3_FIXED_ENVIRONMENT_PROMPT_HASH,
        schemaVersion: OPENAI_MUTATION_SCHEMA_VERSION,
        schemaHash: OPENAI_SCHEMA_HASH,
        pricingMode: "sync",
        continuationState: "none",
        incompleteReason: args.incompleteReason ?? null,
        refusal: args.refusal ?? null,
        providerErrorCode: args.providerErrorCode ?? null,
        sdkVersion: getPackageVersion("openai"),
        retryPolicy: {
          maxRetries: this.options.maxRetries,
          timeoutMs: this.options.requestTimeoutMs,
        },
      },
      estimatedCostUsd: args.estimatedCostUsd,
      error: args.error,
    };
  }
}

function inferRetryable(error: { status?: number }): boolean {
  if (error.status === 408 || error.status === 409 || error.status === 429) return true;
  if (typeof error.status === "number" && error.status >= 500) return true;
  return false;
}
