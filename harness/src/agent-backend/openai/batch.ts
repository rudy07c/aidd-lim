// OpenAI Batch API runner for independent, tool-free Stage 1 calibration workloads.
// Batch is execution infrastructure, not a scientific condition. scientific-main is rejected.

import { File } from "node:buffer";
import OpenAI from "openai";
import {
  AgentExecutionStatus,
  ModelProvenance,
  NormalizedAgentError,
  RunClass,
  TokenUsage,
} from "../../types";
import { AgentInput } from "../types";
import {
  OPENAI_MUTATION_SCHEMA_VERSION,
  OPENAI_PROMPT_HASH,
  OPENAI_PROMPT_VERSION,
  OPENAI_SCHEMA_HASH,
  OpenAIRequestOptions,
  addUsage,
  buildOpenAIResponseRequestBody,
  buildOpenAIUserMessage,
  estimateOpenAICostUsd,
  extractObservableAssistantMessages,
  extractOutputText,
  extractRefusal,
  getPackageVersion,
  parseStructuredMutation,
  responseFailureDetails,
} from "./shared";

export const OPENAI_BATCH_ENDPOINT = "/v1/responses" as const;
export const OPENAI_BATCH_COMPLETION_WINDOW = "24h" as const;

export interface OpenAIBatchRunnerOptions extends OpenAIRequestOptions {
  runClass: RunClass;
  requestTimeoutMs: number;
  maxRetries: number;
}

export interface OpenAIBatchRequest {
  customId: string;
  body: Record<string, unknown>;
}

export interface OpenAIBatchJsonlLine {
  custom_id: string;
  method: "POST";
  url: typeof OPENAI_BATCH_ENDPOINT;
  body: Record<string, unknown>;
}

export interface OpenAIBatchSubmission {
  batchId: string;
  inputFileId: string;
  outputFileId: string | null;
  errorFileId: string | null;
  endpoint: string;
  completionWindow: string;
  status: string;
  requestCounts: { total: number; completed: number; failed: number } | null;
}

export interface OpenAIBatchRawResultLine {
  id?: string;
  custom_id: string;
  response: {
    status_code: number;
    request_id?: string;
    body: any;
  } | null;
  error: {
    code?: string;
    message?: string;
  } | null;
}

export interface OpenAIBatchDownload {
  batch: OpenAIBatchSubmission;
  lines: OpenAIBatchRawResultLine[];
}

export type OpenAIBatchMutationStatus = AgentExecutionStatus | "batch-request-error";

export interface OpenAIBatchMutationResult {
  customId: string;
  batchRequestId: string | null;
  httpStatus: number | null;
  executionStatus: OpenAIBatchMutationStatus;
  modifiedFiles: Record<string, string>;
  explicitWorkingNote: string | null;
  rawResponse: string;
  observableAssistantMessages: string[];
  tokenUsage: TokenUsage | null;
  estimatedCostUsd: number | null;
  modelProvenance: ModelProvenance;
  batchProvenance: OpenAIBatchSubmission & { customId: string };
  error: NormalizedAgentError | null;
}

interface BatchApiLike {
  files: {
    create(params: any): Promise<{ id: string }>;
    content(fileId: string): Promise<{ text(): Promise<string> }>;
  };
  batches: {
    create(params: any): Promise<any>;
    retrieve(batchId: string): Promise<any>;
  };
}

export class OpenAIBatchRunner {
  private readonly client: BatchApiLike;

  constructor(
    private readonly options: OpenAIBatchRunnerOptions,
    client?: BatchApiLike
  ) {
    if (options.runClass !== "smoke" && options.runClass !== "scientific-calibration") {
      throw new Error(
        `OpenAI Batch is restricted to smoke/scientific-calibration; received runClass=${options.runClass}`
      );
    }
    if (options.storeResponses !== false) {
      throw new Error("OpenAI Batch Stage 1 requests must set storeResponses=false");
    }
    this.client = client ?? (new OpenAI({
      timeout: options.requestTimeoutMs,
      maxRetries: options.maxRetries,
    }) as unknown as BatchApiLike);
  }

  /** Build a tool-free repository mutation request using exactly the same Responses envelope as Sync. */
  buildMutationRequest(customId: string, input: AgentInput): OpenAIBatchRequest {
    const body = buildOpenAIResponseRequestBody({
      options: this.options,
      responseInput: [{ role: "user", content: buildOpenAIUserMessage(input) }],
      tools: [],
      includeEncryptedReasoning: false,
    });
    return this.createRequest(customId, body);
  }

  /** Generic tool-free request constructor for future semantic-probe workloads. */
  createRequest(customId: string, body: Record<string, unknown>): OpenAIBatchRequest {
    if (!customId || customId.trim().length === 0) throw new Error("Batch custom_id must be non-empty");
    if (body.model !== this.options.model) {
      throw new Error(`Batch request model must equal frozen model ${this.options.model}`);
    }
    if (Array.isArray(body.tools) && body.tools.length > 0) {
      throw new Error("Stage 1 Batch runner only accepts independent tool-free requests");
    }
    if (body.stream === true) throw new Error("Batch request must not set stream=true");
    return { customId, body };
  }

  serializeRequests(requests: OpenAIBatchRequest[]): string {
    if (requests.length === 0) throw new Error("Batch must contain at least one request");
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const request of requests) {
      if (seen.has(request.customId)) throw new Error(`Duplicate Batch custom_id: ${request.customId}`);
      seen.add(request.customId);
      // Revalidate even if callers constructed the object manually.
      this.createRequest(request.customId, request.body);
      const line: OpenAIBatchJsonlLine = {
        custom_id: request.customId,
        method: "POST",
        url: OPENAI_BATCH_ENDPOINT,
        body: request.body,
      };
      lines.push(JSON.stringify(line));
    }
    return `${lines.join("\n")}\n`;
  }

  async submit(
    requests: OpenAIBatchRequest[],
    metadata?: Record<string, string>
  ): Promise<OpenAIBatchSubmission> {
    const jsonl = this.serializeRequests(requests);
    const upload = await this.client.files.create({
      file: new File([jsonl], `aidd-ilm-batch-${Date.now()}.jsonl`, { type: "application/jsonl" }) as any,
      purpose: "batch",
    });
    const batch = await this.client.batches.create({
      input_file_id: upload.id,
      endpoint: OPENAI_BATCH_ENDPOINT,
      completion_window: OPENAI_BATCH_COMPLETION_WINDOW,
      metadata,
    });
    return normalizeBatchObject(batch);
  }

  async retrieve(batchId: string): Promise<OpenAIBatchSubmission> {
    return normalizeBatchObject(await this.client.batches.retrieve(batchId));
  }

  async download(batchId: string): Promise<OpenAIBatchDownload> {
    const batch = await this.retrieve(batchId);
    const texts: string[] = [];
    if (batch.outputFileId) texts.push(await this.readFileText(batch.outputFileId));
    if (batch.errorFileId) texts.push(await this.readFileText(batch.errorFileId));
    return { batch, lines: mergeBatchJsonlTexts(texts) };
  }

  normalizeMutationResults(download: OpenAIBatchDownload): OpenAIBatchMutationResult[] {
    return download.lines.map((line) => this.normalizeMutationResult(line, download.batch));
  }

  private async readFileText(fileId: string): Promise<string> {
    const response = await this.client.files.content(fileId);
    return response.text();
  }

  private normalizeMutationResult(
    line: OpenAIBatchRawResultLine,
    batch: OpenAIBatchSubmission
  ): OpenAIBatchMutationResult {
    const batchProvenance = { ...batch, customId: line.custom_id };
    const emptyUsage: TokenUsage = { input: 0, output: 0, cachedInput: 0, cacheWriteInput: 0, reasoningOutput: 0, total: 0 };

    if (line.error || !line.response) {
      const message = line.error?.message ?? "Batch request produced no response";
      return this.makeMutationResult({
        line,
        batchProvenance,
        status: "batch-request-error",
        rawResponse: "",
        observableMessages: [],
        usage: null,
        cost: null,
        error: { category: "provider", message, retryable: null },
        providerErrorCode: line.error?.code ?? null,
      });
    }

    const response = line.response.body ?? {};
    const rawResponse = extractOutputText(response);
    const observableMessages = extractObservableAssistantMessages(response);
    const usage = response.usage ? emptyUsage : null;
    if (usage) addUsage(usage, response.usage as OpenAI.Responses.ResponseUsage);
    const cost = estimateOpenAICostUsd(this.options.model, response.usage, "batch");

    if (line.response.status_code < 200 || line.response.status_code >= 300) {
      return this.makeMutationResult({
        line, batchProvenance, status: "batch-request-error", rawResponse, observableMessages, usage, cost,
        error: { category: "provider", message: `Batch response HTTP ${line.response.status_code}`, retryable: null },
        providerErrorCode: response?.error?.code ?? null,
        response,
      });
    }

    const refusal = extractRefusal(response);
    const failure = responseFailureDetails(response);
    if (refusal !== null) {
      return this.makeMutationResult({
        line, batchProvenance, status: "response-refusal", rawResponse, observableMessages, usage, cost,
        error: { category: "response", message: `Model refusal: ${refusal}`, retryable: false },
        refusal, response,
      });
    }
    if (response.status !== "completed") {
      const status: AgentExecutionStatus =
        response.status === "incomplete" ? "response-incomplete" :
        response.status === "failed" ? "response-failed" : "response-not-completed";
      return this.makeMutationResult({
        line, batchProvenance, status, rawResponse, observableMessages, usage, cost,
        error: {
          category: "response",
          message: failure.providerErrorMessage ?? `Response status=${String(response.status)}`,
          retryable: false,
        },
        incompleteReason: failure.incompleteReason,
        providerErrorCode: failure.providerErrorCode,
        response,
      });
    }

    const parsed = parseStructuredMutation(rawResponse);
    if (!parsed.ok) {
      return this.makeMutationResult({
        line, batchProvenance, status: "output-parse-failure", rawResponse, observableMessages, usage, cost,
        error: { category: "output-parse", message: parsed.error, retryable: false },
        response,
      });
    }

    return this.makeMutationResult({
      line, batchProvenance, status: "ok", rawResponse, observableMessages, usage, cost,
      modifiedFiles: parsed.value.modifiedFiles,
      workingNote: parsed.value.workingNote,
      error: null,
      response,
    });
  }

  private makeMutationResult(args: {
    line: OpenAIBatchRawResultLine;
    batchProvenance: OpenAIBatchSubmission & { customId: string };
    status: OpenAIBatchMutationStatus;
    rawResponse: string;
    observableMessages: string[];
    usage: TokenUsage | null;
    cost: number | null;
    modifiedFiles?: Record<string, string>;
    workingNote?: string;
    error: NormalizedAgentError | null;
    response?: any;
    incompleteReason?: string | null;
    refusal?: string | null;
    providerErrorCode?: string | null;
  }): OpenAIBatchMutationResult {
    const response = args.response ?? args.line.response?.body ?? null;
    const modelProvenance: ModelProvenance = {
      provider: "openai",
      requestedModel: this.options.model,
      actualModel: response?.model ?? null,
      responseId: response?.id ?? null,
      responseStatus: response?.status ?? (args.status === "batch-request-error" ? "batch-request-error" : null),
      endpoint: "responses",
      reasoningEffort: this.options.reasoningEffort,
      maxOutputTokens: this.options.maxOutputTokens,
      structuredOutput: true,
      storeResponses: this.options.storeResponses,
      requestedServiceTier: this.options.serviceTier,
      actualServiceTier: response?.service_tier ?? null,
      promptCacheMode: this.options.promptCacheMode,
      promptVersion: OPENAI_PROMPT_VERSION,
      promptHash: OPENAI_PROMPT_HASH,
      schemaVersion: OPENAI_MUTATION_SCHEMA_VERSION,
      schemaHash: OPENAI_SCHEMA_HASH,
      pricingMode: "batch",
      continuationState: "none",
      incompleteReason: args.incompleteReason ?? null,
      refusal: args.refusal ?? null,
      providerErrorCode: args.providerErrorCode ?? null,
      sdkVersion: getPackageVersion("openai"),
      retryPolicy: { maxRetries: this.options.maxRetries, timeoutMs: this.options.requestTimeoutMs },
    };
    return {
      customId: args.line.custom_id,
      batchRequestId: args.line.id ?? null,
      httpStatus: args.line.response?.status_code ?? null,
      executionStatus: args.status,
      modifiedFiles: args.modifiedFiles ?? {},
      explicitWorkingNote: args.workingNote ?? null,
      rawResponse: args.rawResponse,
      observableAssistantMessages: args.observableMessages,
      tokenUsage: args.usage,
      estimatedCostUsd: args.cost,
      modelProvenance,
      batchProvenance: args.batchProvenance,
      error: args.error,
    };
  }
}

export function parseBatchJsonl(text: string): OpenAIBatchRawResultLine[] {
  if (text.trim().length === 0) return [];
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        const parsed = JSON.parse(line) as OpenAIBatchRawResultLine;
        if (!parsed || typeof parsed.custom_id !== "string" || parsed.custom_id.length === 0) {
          throw new Error("missing custom_id");
        }
        return parsed;
      } catch (error) {
        throw new Error(`Invalid Batch JSONL result at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
}

export function mergeBatchJsonlTexts(texts: string[]): OpenAIBatchRawResultLine[] {
  const lines = texts.flatMap(parseBatchJsonl);
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.custom_id)) throw new Error(`Duplicate Batch result custom_id: ${line.custom_id}`);
    seen.add(line.custom_id);
  }
  return lines;
}

function normalizeBatchObject(batch: any): OpenAIBatchSubmission {
  return {
    batchId: String(batch.id),
    inputFileId: String(batch.input_file_id),
    outputFileId: batch.output_file_id ?? null,
    errorFileId: batch.error_file_id ?? null,
    endpoint: String(batch.endpoint),
    completionWindow: String(batch.completion_window),
    status: String(batch.status),
    requestCounts: batch.request_counts ? {
      total: Number(batch.request_counts.total ?? 0),
      completed: Number(batch.request_counts.completed ?? 0),
      failed: Number(batch.request_counts.failed ?? 0),
    } : null,
  };
}
