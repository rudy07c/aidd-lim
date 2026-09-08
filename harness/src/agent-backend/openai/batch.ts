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
    if (options.runClass === "scientific-calibration" && options.serviceTier !== "default") {
      throw new Error('OpenAI Batch scientific-calibration must explicitly use serviceTier="default"');
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

  /** Generic tool-free request constructor for semantic-probe and other independent workloads. */
  createRequest(customId: string, body: Record<string, unknown>): OpenAIBatchRequest {
    if (!customId || customId.trim().length === 0) throw new Error("Batch custom_id must be non-empty");
    assertFrozenBatchRequestBody(body, this.options);
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

  /**
   * Download is intentionally strict: only a completed batch may become calibration data,
   * and every expected custom_id must appear exactly once across output/error files.
   */
  async download(batchId: string, expectedCustomIds: readonly string[]): Promise<OpenAIBatchDownload> {
    const expected = normalizeExpectedCustomIds(expectedCustomIds);
    const batch = await this.retrieve(batchId);
    if (batch.status !== "completed") {
      const terminal = new Set(["failed", "expired", "cancelled"]);
      if (terminal.has(batch.status)) {
        throw new Error(`Batch ${batch.batchId} terminated with status=${batch.status}; results are invalid for calibration`);
      }
      throw new Error(`Batch ${batch.batchId} is not completed yet (status=${batch.status})`);
    }
    if (batch.requestCounts && batch.requestCounts.total !== expected.size) {
      throw new Error(
        `Batch ${batch.batchId} request count mismatch: expected=${expected.size}, api_total=${batch.requestCounts.total}`
      );
    }
    if (batch.requestCounts && batch.requestCounts.completed + batch.requestCounts.failed !== batch.requestCounts.total) {
      throw new Error(
        `Batch ${batch.batchId} completed with inconsistent request counts: ` +
        `completed=${batch.requestCounts.completed}, failed=${batch.requestCounts.failed}, total=${batch.requestCounts.total}`
      );
    }

    const texts: string[] = [];
    if (batch.outputFileId) texts.push(await this.readFileText(batch.outputFileId));
    if (batch.errorFileId) texts.push(await this.readFileText(batch.errorFileId));
    const lines = mergeBatchJsonlTexts(texts);
    assertBatchResultCompleteness(lines, expected);
    return { batch, lines };
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

/** Enforce the scientific request envelope even for generic probe bodies. */
export function assertFrozenBatchRequestBody(
  body: Record<string, unknown>,
  options: OpenAIRequestOptions
): void {
  if (body.model !== options.model) {
    throw new Error(`Batch request model must equal frozen model ${options.model}`);
  }
  const reasoning = isRecord(body.reasoning) ? body.reasoning : null;
  if (reasoning?.effort !== options.reasoningEffort) {
    throw new Error(`Batch request reasoning.effort must equal frozen value ${options.reasoningEffort}`);
  }
  if (body.max_output_tokens !== options.maxOutputTokens) {
    throw new Error(`Batch request max_output_tokens must equal frozen value ${options.maxOutputTokens}`);
  }
  if (body.store !== options.storeResponses) {
    throw new Error(`Batch request store must equal frozen value ${String(options.storeResponses)}`);
  }
  if (body.service_tier !== options.serviceTier) {
    throw new Error(`Batch request service_tier must equal frozen value ${options.serviceTier}`);
  }
  const cache = isRecord(body.prompt_cache_options) ? body.prompt_cache_options : null;
  if (cache?.mode !== options.promptCacheMode || cache?.ttl !== "30m") {
    throw new Error(
      `Batch request prompt_cache_options must freeze mode=${options.promptCacheMode} and ttl=30m`
    );
  }
  if (body.truncation !== "disabled") {
    throw new Error('Batch request truncation must be "disabled"');
  }
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    throw new Error("Stage 1 Batch runner only accepts independent tool-free requests");
  }
  if (body.stream === true) throw new Error("Batch request must not set stream=true");
  if (body.previous_response_id !== undefined && body.previous_response_id !== null) {
    throw new Error("Batch calibration request must not carry previous_response_id");
  }
  if (body.conversation !== undefined && body.conversation !== null) {
    throw new Error("Batch calibration request must not carry conversation state");
  }
  if (Array.isArray(body.include) && body.include.includes("reasoning.encrypted_content")) {
    throw new Error("Batch calibration request must not carry encrypted reasoning state");
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

export function assertBatchResultCompleteness(
  lines: readonly OpenAIBatchRawResultLine[],
  expectedCustomIds: ReadonlySet<string> | readonly string[]
): void {
  const expected = expectedCustomIds instanceof Set
    ? expectedCustomIds
    : normalizeExpectedCustomIds(expectedCustomIds);
  const actual = new Set(lines.map((line) => line.custom_id));
  const missing = [...expected].filter((id) => !actual.has(id));
  const unexpected = [...actual].filter((id) => !expected.has(id));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Batch result custom_id mismatch: missing=[${missing.join(",")}], unexpected=[${unexpected.join(",")}]`
    );
  }
  if (actual.size !== lines.length) {
    throw new Error("Batch result contains duplicate custom_id values");
  }
}

function normalizeExpectedCustomIds(ids: readonly string[]): Set<string> {
  if (ids.length === 0) throw new Error("Expected Batch custom_id set must not be empty");
  const expected = new Set<string>();
  for (const id of ids) {
    if (!id || id.trim().length === 0) throw new Error("Expected Batch custom_id must be non-empty");
    if (expected.has(id)) throw new Error(`Duplicate expected Batch custom_id: ${id}`);
    expected.add(id);
  }
  return expected;
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

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
