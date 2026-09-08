from pathlib import Path


def write(path: str, content: str) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")


write("harness/src/types.ts", r'''// harness/src/types.ts
// 共有型定義。Stage 0互換を維持しつつ、Stage 1 model/API provenanceを追加する。

export type ContextCondition = "full" | "simple-limited";
export type BackendType = "mock-noop" | "mock-oracle" | "anthropic" | "openai";
export type ModelProvider = "mock" | "anthropic" | "openai";
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";
export type OpenAIServiceTier = "auto" | "default" | "flex" | "fast" | "priority" | "ultrafast";
export type PromptCacheMode = "implicit" | "explicit";
export type PricingMode = "sync" | "batch";

export type AgentExecutionStatus =
  | "ok"
  | "output-parse-failure"
  | "mutation-validation-failure"
  | "provider-error"
  | "tool-error"
  | "response-incomplete"
  | "response-failed"
  | "response-refusal"
  | "response-not-completed";

export interface TokenUsage {
  input: number;
  output: number;
  cachedInput?: number;
  cacheWriteInput?: number;
  reasoningOutput?: number;
  total?: number;
}

export interface ModelProvenance {
  provider: ModelProvider;
  requestedModel: string | null;
  actualModel: string | null;
  responseId: string | null;
  responseStatus: string | null;
  endpoint: "mock" | "messages" | "responses";
  reasoningEffort: ReasoningEffort | null;
  maxOutputTokens: number | null;
  structuredOutput: boolean;
  storeResponses: boolean | null;
  requestedServiceTier: OpenAIServiceTier | null;
  actualServiceTier: string | null;
  promptCacheMode: PromptCacheMode | null;
  promptVersion: string | null;
  promptHash: string | null;
  schemaVersion: string | null;
  schemaHash: string | null;
  pricingMode: PricingMode | null;
  continuationState: "none" | "encrypted-reasoning" | null;
  incompleteReason: string | null;
  refusal: string | null;
  providerErrorCode: string | null;
  sdkVersion: string | null;
  retryPolicy: {
    maxRetries: number | null;
    timeoutMs: number | null;
  };
}

export interface NormalizedAgentError {
  category: "provider" | "tool" | "output-parse" | "response";
  message: string;
  retryable: boolean | null;
}

// ---- 設定 ----

export interface RunConfig {
  experimentId: string;
  lineageId: string;
  backend: BackendType;
  condition: ContextCondition;
  /** 1世代あたりのtoken budget（"full"は全ファイルを渡す） */
  contextBudget: number | "full";
  generations: number;
  /** 使用するtask IDのリスト。Stage 1/2 scientific runでは循環再利用しない */
  tasks: string[];
  /** requested model identifier */
  model?: string;
  /** OpenAI reasoning effort。Stage 1 OpenAI runでは明示freezeする */
  reasoningEffort?: ReasoningEffort;
  /** responseあたりのmax output（reasoning tokensを含む） */
  maxOutputTokens?: number;
  /** provider SDK timeout */
  requestTimeoutMs?: number;
  /** provider SDK retry回数 */
  maxRetries?: number;
  /** OpenAI Responsesをserver-side storeするか。Stage 1ではfalse固定 */
  storeResponses?: boolean;
  /** 1 episode内のfunction-tool continuation上限 */
  maxToolRounds?: number;
  /** requested service tier。primary Sync runではdefaultを明示する */
  serviceTier?: OpenAIServiceTier;
  /** GPT-5.6 prompt caching mode。Stage 1では明示freezeする */
  promptCacheMode?: PromptCacheMode;
  /** Stageディレクトリ名（例: "stage0"）。runs/<stage>/ 配下に出力する */
  stage?: string;
  /** synthetic-world ディレクトリへの絶対パス */
  syntheticWorldDir: string;
  /** runs/ ディレクトリへの絶対パス */
  runsDir: string;
}

// ---- テスト結果 ----

export interface TestCaseResult {
  testName: string;
  passed: boolean;
  error?: string;
}

export interface TestSuiteResult {
  passed: boolean;
  numPassed: number;
  numFailed: number;
  testCases: TestCaseResult[];
  /** jest が出力した生のJSON */
  rawJestOutput: unknown;
  /** テスト実行そのものに失敗した場合のエラー（jest起動失敗等） */
  executionError?: string;
}

// ---- エージェント結果 ----

export interface AgentOutput {
  modifiedFiles: Record<string, string>;
  rawResponse: string;
  observableAssistantMessages: string[];
  tokenUsage?: TokenUsage;
  latencyMs: number;
  executionStatus: Exclude<AgentExecutionStatus, "mutation-validation-failure">;
  explicitWorkingNote: string | null;
  modelProvenance: ModelProvenance;
  estimatedCostUsd: number | null;
  error: NormalizedAgentError | null;
}

// ---- Stage 0.5 測定結果型 ----

export interface SemanticProbeResult {
  probeId: string;
  correct: boolean;
  agentAnswer: string;
  correctAnswer: string;
}

export interface SemanticElementTrace {
  syntactic: Record<string, boolean>;
  behavioral: Record<string, boolean>;
}

// ---- 1世代分のログ ----

export interface GenerationLog {
  experiment_id: string;
  lineage_id: string;
  generation: number;
  condition: ContextCondition;
  model: string | null;
  model_provenance: ModelProvenance;
  task_id: string;
  repository_before: Record<string, string>;
  repository_after: Record<string, string>;
  git_diff: string;
  context_budget: number | "full";
  actual_context_tokens: number;
  context_contents: Record<string, string>;
  agent_prompt: string;
  agent_response: string;
  observable_assistant_messages: string[];
  explicit_working_note: string | null;
  tool_calls: unknown[];
  agent_execution_status: AgentExecutionStatus;
  agent_error: NormalizedAgentError | null;
  visible_test_results: TestSuiteResult;
  hidden_test_results: TestSuiteResult;
  task_specific_test_result: TestSuiteResult | null;
  functional_task_result: boolean;
  semantic_probe_results: SemanticProbeResult[] | null;
  semantic_element_trace: SemanticElementTrace | null;
  latency_ms: number;
  token_usage: TokenUsage | null;
  cost: number | null;
  protocol_contract_violated: boolean;
}
''')

write("harness/src/agent-backend/types.ts", r'''// harness/src/agent-backend/types.ts
// provider-neutral AgentBackend interface。

import {
  AgentExecutionStatus,
  ModelProvenance,
  NormalizedAgentError,
  TokenUsage,
} from "../types";

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(argumentsValue: unknown): Promise<unknown>;
}

export interface AgentToolEvent {
  callId: string;
  toolName: string;
  arguments: unknown;
  result: unknown;
  ok: boolean;
  error?: string;
}

export interface AgentInput {
  /** condition runnerが最終的にmodelへ提示すると決めたartifact evidence。backendは再truncateしない。 */
  contextFiles: Record<string, string>;
  visibleInstruction: string;
  /** historical backends向け。OpenAI Stage 1 backendはbudget authorityとして使用しない。 */
  contextBudget: number | "full";
  tools?: AgentTool[];
}

export interface AgentResult {
  modifiedFiles: Record<string, string>;
  rawResponse: string;
  /** workerが実際に生成したobservable assistant messages。MOI record生成で使用する。 */
  observableAssistantMessages: string[];
  explicitWorkingNote: string | null;
  toolEvents: AgentToolEvent[];
  tokenUsage?: TokenUsage;
  latencyMs: number;
  executionStatus: Exclude<AgentExecutionStatus, "mutation-validation-failure">;
  modelProvenance: ModelProvenance;
  estimatedCostUsd: number | null;
  error: NormalizedAgentError | null;
}

export interface AgentBackend {
  run(input: AgentInput): Promise<AgentResult>;
}
''')

write("harness/src/agent-backend/openai/shared.ts", r'''// Shared OpenAI Responses request/response utilities used by Sync and future Batch paths.

import * as crypto from "crypto";
import OpenAI from "openai";
import {
  OpenAIServiceTier,
  PricingMode,
  PromptCacheMode,
  ReasoningEffort,
  TokenUsage,
} from "../../types";
import { AgentInput, AgentTool } from "../types";

export const OPENAI_PROMPT_VERSION = "stage1-worker-v2";
export const OPENAI_MUTATION_SCHEMA_VERSION = "repository-mutation-v2";

export const OPENAI_SYSTEM_PROMPT = `You are an AI software engineer working on a TypeScript repository.
Implement the requested change while preserving the public protocol contract.

CONSTRAINTS:
1. src/protocol_adapter.ts exports protocol: WorldProtocol. The names/signatures reset, applyOperation, getEntityState, and toAbstractSnapshot must remain compatible.
2. Internal structure may be refactored freely if the public protocol remains compatible.
3. Return only files actually changed.
4. The explicit working note is an observable episode note, not hidden chain-of-thought. Keep it concise (<= 600 characters) and state only implementation facts, invariants, dependencies, or current risks.
5. When tools are available, use them only when useful for the task. Tool results are observable and may be logged.`;

export const OPENAI_MUTATION_SCHEMA = {
  type: "object",
  properties: {
    modifiedFiles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
    workingNote: { type: "string" },
  },
  required: ["modifiedFiles", "workingNote"],
  additionalProperties: false,
} as const;

export const OPENAI_PROMPT_HASH = sha256(OPENAI_SYSTEM_PROMPT);
export const OPENAI_SCHEMA_HASH = sha256(JSON.stringify(OPENAI_MUTATION_SCHEMA));

export interface OpenAIRequestOptions {
  model: string;
  reasoningEffort: ReasoningEffort;
  maxOutputTokens: number;
  storeResponses: boolean;
  serviceTier: OpenAIServiceTier;
  promptCacheMode: PromptCacheMode;
}

export interface StructuredMutation {
  modifiedFiles: Array<{ path: string; content: string }>;
  workingNote: string;
}

export function buildOpenAIUserMessage(input: AgentInput): string {
  const lines: string[] = ["REPOSITORY FILES:"];
  // contextFiles are already the condition runner's final evidence set.
  // Do not apply a second token/character budget here.
  for (const filePath of Object.keys(input.contextFiles).sort()) {
    lines.push(`\n--- ${filePath} ---\n${input.contextFiles[filePath]}\n`);
  }
  lines.push(`\nTASK:\n${input.visibleInstruction}`);
  lines.push("\nImplement the change and return the structured repository mutation.");
  return lines.join("");
}

export function buildOpenAIResponseRequestBody(args: {
  options: OpenAIRequestOptions;
  responseInput: any[];
  tools: AgentTool[];
  includeEncryptedReasoning: boolean;
}): Record<string, unknown> {
  const { options, responseInput, tools, includeEncryptedReasoning } = args;
  return {
    model: options.model,
    instructions: OPENAI_SYSTEM_PROMPT,
    input: responseInput,
    reasoning: { effort: options.reasoningEffort },
    max_output_tokens: options.maxOutputTokens,
    store: options.storeResponses,
    truncation: "disabled",
    include: includeEncryptedReasoning ? ["reasoning.encrypted_content"] : undefined,
    service_tier: options.serviceTier,
    prompt_cache_options: { mode: options.promptCacheMode, ttl: "30m" },
    tools: tools.length > 0 ? tools.map(toOpenAITool) : undefined,
    tool_choice: tools.length > 0 ? "auto" : undefined,
    parallel_tool_calls: false,
    text: {
      format: {
        type: "json_schema",
        name: "repository_mutation_v2",
        strict: true,
        schema: OPENAI_MUTATION_SCHEMA,
      },
    },
  };
}

function toOpenAITool(tool: AgentTool): Record<string, unknown> {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: true,
  };
}

export function parseStructuredMutation(
  rawResponse: string
): { ok: true; value: { modifiedFiles: Record<string, string>; workingNote: string } } | { ok: false; error: string } {
  let parsed: StructuredMutation;
  try {
    parsed = JSON.parse(rawResponse) as StructuredMutation;
  } catch (error) {
    return { ok: false, error: `Invalid structured JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!parsed || !Array.isArray(parsed.modifiedFiles) || typeof parsed.workingNote !== "string") {
    return { ok: false, error: "Structured output does not match repository_mutation_v2" };
  }
  const files: Record<string, string> = {};
  for (const item of parsed.modifiedFiles) {
    if (!item || typeof item.path !== "string" || typeof item.content !== "string") {
      return { ok: false, error: "modifiedFiles item must contain string path/content" };
    }
    if (Object.prototype.hasOwnProperty.call(files, item.path)) {
      return { ok: false, error: `Duplicate modified file path: ${item.path}` };
    }
    files[item.path] = item.content;
  }
  return { ok: true, value: { modifiedFiles: files, workingNote: parsed.workingNote } };
}

export function addUsage(target: TokenUsage, usage: OpenAI.Responses.ResponseUsage | undefined): void {
  if (!usage) return;
  target.input += usage.input_tokens;
  target.output += usage.output_tokens;
  target.cachedInput = (target.cachedInput ?? 0) + (usage.input_tokens_details?.cached_tokens ?? 0);
  target.cacheWriteInput = (target.cacheWriteInput ?? 0) + (usage.input_tokens_details?.cache_write_tokens ?? 0);
  target.reasoningOutput = (target.reasoningOutput ?? 0) + (usage.output_tokens_details?.reasoning_tokens ?? 0);
  target.total = (target.total ?? 0) + usage.total_tokens;
}

export function estimateOpenAICostUsd(
  requestedModel: string,
  usage: OpenAI.Responses.ResponseUsage | undefined,
  pricingMode: PricingMode = "sync"
): number | null {
  if (!usage || requestedModel !== "gpt-5.6-luna") return null;
  const discount = pricingMode === "batch" ? 0.5 : 1;
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const cacheWrite = usage.input_tokens_details?.cache_write_tokens ?? 0;
  const ordinaryUncached = Math.max(0, usage.input_tokens - cached - cacheWrite);
  const longContext = usage.input_tokens > 272_000;
  const inputMultiplier = longContext ? 2 : 1;
  const outputMultiplier = longContext ? 1.5 : 1;

  const ordinaryInputCost = ordinaryUncached * 0.20;
  const cacheWriteCost = cacheWrite * 0.20 * 1.25;
  const cachedInputCost = cached * 0.02;
  const inputCost = ((ordinaryInputCost + cacheWriteCost + cachedInputCost) / 1_000_000) * inputMultiplier;
  const outputCost = ((usage.output_tokens * 1.20) / 1_000_000) * outputMultiplier;
  return (inputCost + outputCost) * discount;
}

export function accumulateCost(current: number | null, next: number | null): number | null {
  if (current === null || next === null) return null;
  return current + next;
}

export function extractObservableAssistantMessages(response: OpenAI.Responses.Response): string[] {
  const messages: string[] = [];
  for (const item of response.output as any[]) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === "output_text" && typeof content.text === "string" && content.text.length > 0) {
        messages.push(content.text);
      } else if (content?.type === "refusal" && typeof content.refusal === "string" && content.refusal.length > 0) {
        messages.push(content.refusal);
      }
    }
  }
  return messages;
}

export function extractRefusal(response: OpenAI.Responses.Response): string | null {
  for (const item of response.output as any[]) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === "refusal" && typeof content.refusal === "string") return content.refusal;
    }
  }
  return null;
}

export function responseFailureDetails(response: OpenAI.Responses.Response): {
  incompleteReason: string | null;
  providerErrorCode: string | null;
  providerErrorMessage: string | null;
} {
  const r = response as any;
  return {
    incompleteReason: r.incomplete_details?.reason ?? null,
    providerErrorCode: r.error?.code ?? null,
    providerErrorMessage: r.error?.message ?? null,
  };
}

export function getPackageVersion(packageName: string): string | null {
  try {
    const pkg = require(`${packageName}/package.json`) as { version?: string };
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
''')

write("harness/src/agent-backend/openai.ts", r'''// harness/src/agent-backend/openai.ts
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

function inferRetryable(error: OpenAI.APIError): boolean {
  if (error.status === 408 || error.status === 409 || error.status === 429) return true;
  if (typeof error.status === "number" && error.status >= 500) return true;
  return false;
}
''')

write("harness/src/config/validate.ts", r'''import {
  BackendType,
  ContextCondition,
  OpenAIServiceTier,
  PromptCacheMode,
  RunConfig,
} from "../types";

const BACKENDS: BackendType[] = ["mock-noop", "mock-oracle", "anthropic", "openai"];
const CONDITIONS: ContextCondition[] = ["full", "simple-limited"];
const SERVICE_TIERS: OpenAIServiceTier[] = ["auto", "default", "flex", "fast", "priority", "ultrafast"];
const CACHE_MODES: PromptCacheMode[] = ["implicit", "explicit"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOptionalString(obj: Record<string, unknown>, key: string): void {
  const value = obj[key];
  if (value !== undefined && typeof value !== "string") throw new Error(`Config field "${key}" must be a string`);
}

function requireOwn(obj: Record<string, unknown>, key: string): void {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    throw new Error(`Stage 1/2 OpenAI run must explicitly specify raw config field "${key}"`);
  }
}

/** JSON parse直後のshape検査。Stage 1/2のfreeze必須fieldはdefault適用前に存在確認する。 */
export function validateRawRunConfig(value: unknown): asserts value is Partial<RunConfig> {
  if (!isRecord(value)) throw new Error("Config root must be a JSON object");

  for (const key of [
    "experimentId", "lineageId", "backend", "condition", "model", "reasoningEffort", "stage",
    "syntheticWorldDir", "runsDir", "serviceTier", "promptCacheMode",
  ]) assertOptionalString(value, key);

  for (const key of ["maxOutputTokens", "requestTimeoutMs", "maxRetries", "maxToolRounds"] as const) {
    const v = value[key];
    if (v !== undefined && (typeof v !== "number" || !Number.isInteger(v))) {
      throw new Error(`Config field "${key}" must be an integer`);
    }
  }
  if (value.storeResponses !== undefined && typeof value.storeResponses !== "boolean") {
    throw new Error('Config field "storeResponses" must be a boolean');
  }
  if (value.contextBudget !== undefined && value.contextBudget !== "full" &&
      (typeof value.contextBudget !== "number" || !Number.isFinite(value.contextBudget))) {
    throw new Error('Config field "contextBudget" must be a finite number or "full"');
  }
  if (value.generations !== undefined && (typeof value.generations !== "number" || !Number.isInteger(value.generations))) {
    throw new Error('Config field "generations" must be an integer');
  }
  if (value.tasks !== undefined && (!Array.isArray(value.tasks) || value.tasks.some((t) => typeof t !== "string"))) {
    throw new Error('Config field "tasks" must be an array of strings');
  }

  const scientificOpenAI =
    typeof value.stage === "string" && (value.stage.startsWith("stage1") || value.stage.startsWith("stage2")) &&
    value.backend === "openai";
  if (scientificOpenAI) {
    for (const key of [
      "model", "reasoningEffort", "maxOutputTokens", "requestTimeoutMs", "maxRetries",
      "storeResponses", "maxToolRounds", "serviceTier", "promptCacheMode",
    ]) requireOwn(value, key);
    if (value.storeResponses !== false) throw new Error("Stage 1/2 OpenAI raw config must set storeResponses=false");
    if (value.serviceTier !== "default") {
      throw new Error('Stage 1/2 primary Sync OpenAI run must explicitly set serviceTier="default"');
    }
  }
}

/** default適用・path解決後のsemantic validation。 */
export function validateResolvedRunConfig(config: RunConfig): void {
  if (!BACKENDS.includes(config.backend)) throw new Error(`Unsupported backend: ${config.backend}`);
  if (!CONDITIONS.includes(config.condition)) throw new Error(`Unsupported context condition: ${config.condition}`);
  if (config.contextBudget !== "full" && (!Number.isFinite(config.contextBudget) || config.contextBudget < 0)) {
    throw new Error('contextBudget must be non-negative or "full"');
  }
  if (!Number.isInteger(config.generations) || config.generations <= 0) throw new Error("generations must be a positive integer");
  if (config.tasks.length === 0) throw new Error("tasks must contain at least one task id");
  if (config.tasks.some((taskId) => taskId.length === 0)) throw new Error("task ids must be non-empty strings");

  const reasoningEfforts = new Set(["none", "low", "medium", "high", "xhigh", "max"]);
  if (config.reasoningEffort !== undefined && !reasoningEfforts.has(config.reasoningEffort)) {
    throw new Error(`Unsupported reasoningEffort: ${config.reasoningEffort}`);
  }
  if (config.serviceTier !== undefined && !SERVICE_TIERS.includes(config.serviceTier)) {
    throw new Error(`Unsupported serviceTier: ${config.serviceTier}`);
  }
  if (config.promptCacheMode !== undefined && !CACHE_MODES.includes(config.promptCacheMode)) {
    throw new Error(`Unsupported promptCacheMode: ${config.promptCacheMode}`);
  }
  for (const [key, value, min] of [
    ["maxOutputTokens", config.maxOutputTokens, 1],
    ["requestTimeoutMs", config.requestTimeoutMs, 1],
    ["maxRetries", config.maxRetries, 0],
    ["maxToolRounds", config.maxToolRounds, 0],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < min)) throw new Error(`${key} must be an integer >= ${min}`);
  }

  const scientificLongitudinal = config.stage?.startsWith("stage1") || config.stage?.startsWith("stage2");
  if (scientificLongitudinal) {
    if (config.backend === "openai") {
      if (!config.model) throw new Error("Stage 1/2 OpenAI run must explicitly freeze model");
      if (!config.reasoningEffort) throw new Error("Stage 1/2 OpenAI run must explicitly freeze reasoningEffort");
      if (config.maxOutputTokens === undefined) throw new Error("Stage 1/2 OpenAI run must explicitly freeze maxOutputTokens");
      if (config.requestTimeoutMs === undefined) throw new Error("Stage 1/2 OpenAI run must explicitly freeze requestTimeoutMs");
      if (config.maxRetries === undefined) throw new Error("Stage 1/2 OpenAI run must explicitly freeze maxRetries");
      if (config.maxToolRounds === undefined) throw new Error("Stage 1/2 OpenAI run must explicitly freeze maxToolRounds");
      if (config.storeResponses !== false) throw new Error("Stage 1/2 OpenAI run must set storeResponses=false");
      if (config.serviceTier !== "default") throw new Error('Stage 1/2 primary Sync run must set serviceTier="default"');
      if (!config.promptCacheMode) throw new Error("Stage 1/2 OpenAI run must explicitly freeze promptCacheMode");
    }
    const unique = new Set(config.tasks);
    if (unique.size !== config.tasks.length) {
      throw new Error("Stage 1/2 scientific runs must not contain duplicate task ids; GroundTruthDelta reuse is forbidden");
    }
    if (config.generations > config.tasks.length) {
      throw new Error(`Stage 1/2 scientific runs require one unique task per generation: generations=${config.generations}, tasks=${config.tasks.length}`);
    }
  }
}
''')

write("harness/run.ts", r'''// harness/run.ts
// CLIエントリポイント。

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { RunConfig } from "./src/types";
import { runGenerationLoop } from "./src/orchestrator";
import { validateRawRunConfig, validateResolvedRunConfig } from "./src/config/validate";

const HARNESS_DIR = __dirname;
const REPO_ROOT = path.dirname(HARNESS_DIR);
const DEFAULT_SYNTHETIC_WORLD_DIR = path.join(REPO_ROOT, "synthetic-world");
const DEFAULT_RUNS_DIR = path.join(REPO_ROOT, "runs");

function parseArgs(): { configPath: string; smoke: boolean } {
  const args = process.argv.slice(2);
  const configIdx = args.indexOf("--config");
  if (configIdx === -1 || !args[configIdx + 1]) {
    console.error("Usage: ts-node run.ts --config <path-to-config.json> [--smoke]");
    process.exit(1);
  }
  return { configPath: args[configIdx + 1], smoke: args.includes("--smoke") };
}

async function main(): Promise<void> {
  const { configPath, smoke } = parseArgs();
  const absConfigPath = path.resolve(HARNESS_DIR, configPath);
  if (!fs.existsSync(absConfigPath)) {
    console.error(`Config file not found: ${absConfigPath}`);
    process.exit(1);
  }

  const parsed: unknown = JSON.parse(fs.readFileSync(absConfigPath, "utf8"));
  // Raw validation happens BEFORE defaults so scientific freeze cannot be satisfied by harness defaults.
  validateRawRunConfig(parsed);
  const rawConfig = parsed;

  const baseRunsDir = rawConfig.runsDir ?? DEFAULT_RUNS_DIR;
  const resolvedRunsDir = smoke ? path.join(baseRunsDir, "_smoke") : rawConfig.stage ? path.join(baseRunsDir, rawConfig.stage) : baseRunsDir;

  const config: RunConfig = {
    ...rawConfig,
    experimentId: rawConfig.experimentId ?? "experiment-unknown",
    lineageId: rawConfig.lineageId ?? "lineage-0",
    backend: rawConfig.backend ?? "mock-noop",
    condition: rawConfig.condition ?? "full",
    contextBudget: rawConfig.contextBudget ?? "full",
    generations: rawConfig.generations ?? 5,
    tasks: rawConfig.tasks ?? ["T-local-1", "T-crosscut-1", "T-delayed-1", "T-invariant-stress-1"],
    maxOutputTokens: rawConfig.maxOutputTokens ?? 8192,
    requestTimeoutMs: rawConfig.requestTimeoutMs ?? 120_000,
    maxRetries: rawConfig.maxRetries ?? 2,
    storeResponses: rawConfig.storeResponses ?? false,
    maxToolRounds: rawConfig.maxToolRounds ?? 4,
    serviceTier: rawConfig.serviceTier ?? "default",
    promptCacheMode: rawConfig.promptCacheMode ?? "implicit",
    syntheticWorldDir: rawConfig.syntheticWorldDir ?? DEFAULT_SYNTHETIC_WORLD_DIR,
    runsDir: resolvedRunsDir,
  };
  validateResolvedRunConfig(config);

  const existingDir = path.join(config.runsDir, config.experimentId);
  if (fs.existsSync(existingDir)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
    const newExperimentId = `${config.experimentId}__${timestamp}`;
    console.warn(`[run] WARNING: ${config.runsDir}/${config.experimentId}/ already exists.`);
    console.warn(`[run] Auto-renaming to avoid overwrite: ${newExperimentId}`);
    config.experimentId = newExperimentId;
  }

  if (smoke) console.log(`[run] Mode: SMOKE (output → runs/_smoke/)`);
  console.log(`[run] Config: ${absConfigPath}`);
  console.log(`[run] Experiment: ${config.experimentId}`);
  console.log(`[run] Synthetic World: ${config.syntheticWorldDir}`);
  console.log(`[run] Runs Dir: ${config.runsDir}`);

  const result = await runGenerationLoop(config);
  if (result.crashed) {
    console.error(`\n[run] FAILED: invalid/censored after ${result.completedGenerations} valid generations`);
    console.error(`[run] Error: ${result.crashError}`);
    process.exit(1);
  }
  console.log(`\n[run] SUCCESS: ${result.completedGenerations} generations completed.`);
  for (const dir of result.logDirs) console.log(`  ${dir}`);
}

main().catch((e) => {
  console.error("[run] Fatal harness error:", e);
  process.exit(1);
});
''')

write("harness/src/orchestrator.ts", r'''// harness/src/orchestrator.ts
// 世代継承ループ本体。Stage 0互換を維持しつつ、Stage 1 validity semanticsを追加する。

import * as fs from "fs";
import * as path from "path";
import { RunConfig, GenerationLog, AgentExecutionStatus } from "./types";
import { AgentBackend } from "./agent-backend/types";
import { MockNoopBackend } from "./agent-backend/mock-noop";
import { MockOracleBackend } from "./agent-backend/mock-oracle";
import { AnthropicBackend } from "./agent-backend/anthropic";
import { OpenAIBackend } from "./agent-backend/openai";
import { assembleContext, estimateTokenCount } from "./context/assembler";
import { runScoring } from "./scoring";
import { writeGenerationLog, generateDiff } from "./logging";
import { validateModifiedFiles } from "./repository/path-guard";

export interface OrchestratorResult {
  completedGenerations: number;
  logDirs: string[];
  crashed: boolean;
  crashError?: string;
}

interface HeldOutTask { taskId: string; visibleInstruction: string; taskSpecificTestCode?: string; }

export async function runGenerationLoop(config: RunConfig): Promise<OrchestratorResult> {
  console.log(`[orchestrator] Starting experiment "${config.experimentId}" / lineage "${config.lineageId}"`);
  console.log(`[orchestrator] Backend: ${config.backend}, Condition: ${config.condition}, Generations: ${config.generations}`);
  const tasksPath = path.join(config.syntheticWorldDir, "heldout_tasks.json");
  const allTasks: HeldOutTask[] = JSON.parse(fs.readFileSync(tasksPath, "utf8"));
  const taskMap = new Map(allTasks.map((t) => [t.taskId, t]));
  for (const taskId of config.tasks) if (!taskMap.has(taskId)) throw new Error(`Task "${taskId}" not found in heldout_tasks.json`);

  const repositoryDir = path.join(config.syntheticWorldDir, "repository");
  let currentFiles = loadRepositoryFiles(repositoryDir);
  const logDirs: string[] = [];
  let completedGenerations = 0;

  for (let gen = 0; gen < config.generations; gen++) {
    const taskId = config.tasks[gen % config.tasks.length];
    const task = taskMap.get(taskId)!;
    try {
      const { logDir, repositoryAfter } = await runOneGeneration(config, gen, taskId, task.visibleInstruction, task.taskSpecificTestCode, currentFiles);
      currentFiles = repositoryAfter;
      logDirs.push(logDir);
      completedGenerations++;
    } catch (e) {
      return { completedGenerations, logDirs, crashed: true, crashError: e instanceof Error ? e.message : String(e) };
    }
  }
  return { completedGenerations, logDirs, crashed: false };
}

async function runOneGeneration(
  config: RunConfig,
  generation: number,
  taskId: string,
  visibleInstruction: string,
  taskSpecificTestCode: string | undefined,
  currentFiles: Record<string, string>
): Promise<{ logDir: string; repositoryAfter: Record<string, string> }> {
  const repositoryBefore = { ...currentFiles };
  const contextFiles = assembleContext(currentFiles, config.condition);
  const actualContextTokens = estimateTokenCount(contextFiles);
  const agentPromptSummary = buildAgentPromptSummary(contextFiles, visibleInstruction);

  const backend = createBackend(config, taskId);
  const agentResult = await backend.run({ contextFiles, visibleInstruction, contextBudget: config.contextBudget });

  // Provider/network failures are infrastructure failures, not software-evolution outcomes.
  // Do not score or advance the lineage after the SDK's frozen retry policy is exhausted.
  if (agentResult.executionStatus === "provider-error") {
    throw new Error(`Provider infrastructure failure; generation invalid/censored: ${agentResult.error?.message ?? "unknown provider error"}`);
  }

  let executionStatus: AgentExecutionStatus = agentResult.executionStatus;
  let validatedModifiedFiles: Record<string, string> = {};
  if (executionStatus === "ok") {
    try {
      validatedModifiedFiles = validateModifiedFiles(agentResult.modifiedFiles);
    } catch (e) {
      executionStatus = "mutation-validation-failure";
    }
  }

  const repositoryAfter: Record<string, string> = { ...currentFiles, ...validatedModifiedFiles };
  const scoring = await runScoring(repositoryAfter, config.syntheticWorldDir, taskSpecificTestCode);
  const taskSpecificPassed = scoring.taskSpecificTests === null || scoring.taskSpecificTests.passed;
  const functionalTaskResult = executionStatus === "ok" && scoring.visibleTests.passed && scoring.hiddenTests.passed && taskSpecificPassed;

  const log: GenerationLog = {
    experiment_id: config.experimentId,
    lineage_id: config.lineageId,
    generation,
    condition: config.condition,
    model: config.model ?? null,
    model_provenance: agentResult.modelProvenance,
    task_id: taskId,
    repository_before: repositoryBefore,
    repository_after: repositoryAfter,
    git_diff: generateDiff(repositoryBefore, repositoryAfter),
    context_budget: config.contextBudget,
    actual_context_tokens: actualContextTokens,
    context_contents: contextFiles,
    agent_prompt: agentPromptSummary,
    agent_response: agentResult.rawResponse,
    observable_assistant_messages: agentResult.observableAssistantMessages,
    explicit_working_note: agentResult.explicitWorkingNote,
    tool_calls: agentResult.toolEvents,
    agent_execution_status: executionStatus,
    agent_error: agentResult.error,
    visible_test_results: scoring.visibleTests,
    hidden_test_results: scoring.hiddenTests,
    task_specific_test_result: scoring.taskSpecificTests,
    functional_task_result: functionalTaskResult,
    semantic_probe_results: null,
    semantic_element_trace: null,
    latency_ms: agentResult.latencyMs,
    token_usage: agentResult.tokenUsage ?? null,
    cost: agentResult.estimatedCostUsd,
    protocol_contract_violated: scoring.protocolContractViolated,
  };

  const logDir = writeGenerationLog(log, config.runsDir);
  return { logDir, repositoryAfter };
}

function createBackend(config: RunConfig, taskId: string): AgentBackend {
  switch (config.backend) {
    case "mock-noop": return new MockNoopBackend();
    case "mock-oracle": {
      const harnessDir = path.dirname(__dirname);
      return new MockOracleBackend(taskId, path.join(harnessDir, "fixtures"));
    }
    case "anthropic": return new AnthropicBackend(config.model ?? "claude-haiku-4-5-20251001");
    case "openai": return new OpenAIBackend({
      model: config.model ?? "gpt-5.6-luna",
      reasoningEffort: config.reasoningEffort ?? "medium",
      maxOutputTokens: config.maxOutputTokens ?? 8192,
      requestTimeoutMs: config.requestTimeoutMs ?? 120_000,
      maxRetries: config.maxRetries ?? 2,
      storeResponses: config.storeResponses ?? false,
      maxToolRounds: config.maxToolRounds ?? 4,
      serviceTier: config.serviceTier ?? "default",
      promptCacheMode: config.promptCacheMode ?? "implicit",
    });
  }
}

function loadRepositoryFiles(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  loadDirRecursive(dir, dir, result);
  return result;
}
function loadDirRecursive(baseDir: string, currentDir: string, result: Record<string, string>): void {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) loadDirRecursive(baseDir, fullPath, result);
    else if (entry.isFile()) result[path.relative(baseDir, fullPath).replace(/\\/g, "/")] = fs.readFileSync(fullPath, "utf8");
  }
}
function buildAgentPromptSummary(contextFiles: Record<string, string>, visibleInstruction: string): string {
  return `[Context files: ${Object.keys(contextFiles).sort().join(", ")}]\n\nTask:\n${visibleInstruction}`;
}
''')

# Patch historical/mock backends so the richer provider-neutral result type remains satisfied.
for p in ["harness/src/agent-backend/mock-noop.ts", "harness/src/agent-backend/mock-oracle.ts", "harness/src/agent-backend/anthropic.ts"]:
    text = Path(p).read_text(encoding="utf-8")
    if "observableAssistantMessages:" not in text:
        text = text.replace("rawResponse:", "observableAssistantMessages: [],\n      rawResponse:")
    # Expand old provenance fields mechanically.
    text = text.replace("serviceTier: null,", "requestedServiceTier: null, actualServiceTier: null, promptCacheMode: null, promptVersion: null, promptHash: null, schemaVersion: null, schemaHash: null, pricingMode: null, continuationState: null, incompleteReason: null, refusal: null, providerErrorCode: null,")
    # Earlier implementation used serviceTier field; if absent, insert after storeResponses.
    text = text.replace("storeResponses: null,\n          serviceTier: null,", "storeResponses: null,\n          requestedServiceTier: null, actualServiceTier: null, promptCacheMode: null, promptVersion: null, promptHash: null, schemaVersion: null, schemaHash: null, pricingMode: null, continuationState: null, incompleteReason: null, refusal: null, providerErrorCode: null,")
    text = text.replace("storeResponses: null, serviceTier: null,", "storeResponses: null, requestedServiceTier: null, actualServiceTier: null, promptCacheMode: null, promptVersion: null, promptHash: null, schemaVersion: null, schemaHash: null, pricingMode: null, continuationState: null, incompleteReason: null, refusal: null, providerErrorCode: null,")
    # If the new required fields still do not exist, add after storeResponses occurrence.
    if "requestedServiceTier" not in text:
        text = text.replace("storeResponses: null,", "storeResponses: null, requestedServiceTier: null, actualServiceTier: null, promptCacheMode: null, promptVersion: null, promptHash: null, schemaVersion: null, schemaHash: null, pricingMode: null, continuationState: null, incompleteReason: null, refusal: null, providerErrorCode: null,")
    Path(p).write_text(text, encoding="utf-8")

# Logging: preserve observable assistant messages explicitly.
logp = Path("harness/src/logging.ts")
log = logp.read_text(encoding="utf-8")
if "observable_assistant_messages" not in log:
    log = log.replace("response: log.agent_response,\n    explicit_working_note", "response: log.agent_response,\n    observable_assistant_messages: log.observable_assistant_messages,\n    explicit_working_note")
logp.write_text(log, encoding="utf-8")

# Stage 1 smoke config must explicitly freeze new fields.
smoke = Path("harness/config/stage1-openai-smoke.json")
obj = __import__("json").loads(smoke.read_text(encoding="utf-8"))
obj["serviceTier"] = "default"
obj["promptCacheMode"] = "implicit"
smoke.write_text(__import__("json").dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

write("harness/verify-openai-backend.ts", r'''import {
  buildOpenAIUserMessage,
  estimateOpenAICostUsd,
  parseStructuredMutation,
} from "./src/agent-backend/openai";
import { OPENAI_PROMPT_HASH, OPENAI_SCHEMA_HASH } from "./src/agent-backend/openai/shared";

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
  modifiedFiles: [{ path: "src/a.ts", content: "a" }, { path: "src/a.ts", content: "b" }],
  workingNote: "duplicate",
}));
assert(!duplicate.ok, "duplicate paths must be rejected");

const prompt = buildOpenAIUserMessage({
  contextFiles: { "a.ts": "A".repeat(20), "z.ts": "TAIL" },
  visibleInstruction: "task",
  contextBudget: 1,
});
assert(prompt.includes("TAIL"), "OpenAI backend must not re-truncate condition-runner evidence");
assert(OPENAI_PROMPT_HASH.length === 64 && OPENAI_SCHEMA_HASH.length === 64, "prompt/schema hashes must be SHA-256");

const usage = {
  input_tokens: 1100,
  input_tokens_details: { cached_tokens: 200, cache_write_tokens: 100 },
  output_tokens: 500,
  output_tokens_details: { reasoning_tokens: 100 },
  total_tokens: 1600,
};
const syncCost = estimateOpenAICostUsd("gpt-5.6-luna", usage, "sync");
const batchCost = estimateOpenAICostUsd("gpt-5.6-luna", usage, "batch");
assert(syncCost !== null && syncCost > 0, "Luna sync cost should be estimated");
assert(batchCost !== null && Math.abs(batchCost * 2 - syncCost) < 1e-12, "Batch estimate must be 50% of Sync");
assert(estimateOpenAICostUsd("unknown-model", usage, "sync") === null, "unknown pricing must remain null, never zero");

console.log("OpenAI backend offline verification passed.");
''')

# Live smoke new fields.
live = Path("harness/verify-openai-live.ts")
lt = live.read_text(encoding="utf-8")
lt = lt.replace("maxToolRounds: 3,", "maxToolRounds: 3,\n    serviceTier: \"default\",\n    promptCacheMode: \"implicit\",")
live.write_text(lt, encoding="utf-8")

# Permanent CI runs both typecheck and offline OpenAI verification.
ci = Path(".github/workflows/harness-ci.yml")
ct = ci.read_text(encoding="utf-8")
if "Verify OpenAI backend offline" not in ct:
    ct = ct.replace("      - name: Typecheck harness\n        working-directory: harness\n        run: npx tsc --noEmit\n", "      - name: Typecheck harness\n        working-directory: harness\n        run: npx tsc --noEmit\n      - name: Verify OpenAI backend offline\n        working-directory: harness\n        run: npm run verify:openai\n")
ci.write_text(ct, encoding="utf-8")

print("OpenAI Sync hardening applied")
