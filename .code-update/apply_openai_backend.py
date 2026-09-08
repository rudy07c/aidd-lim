from pathlib import Path
import json


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

export type AgentExecutionStatus =
  | "ok"
  | "output-parse-failure"
  | "mutation-validation-failure"
  | "provider-error"
  | "tool-error";

export interface TokenUsage {
  input: number;
  output: number;
  cachedInput?: number;
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
  serviceTier: string | null;
  sdkVersion: string | null;
  retryPolicy: {
    maxRetries: number | null;
    timeoutMs: number | null;
  };
}

export interface NormalizedAgentError {
  category: "provider" | "tool" | "output-parse";
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
  /** path -> 新しいファイル全体の内容。変更したファイルのみ含む */
  modifiedFiles: Record<string, string>;
  rawResponse: string;
  tokenUsage?: TokenUsage;
  latencyMs: number;
  executionStatus: Exclude<AgentExecutionStatus, "mutation-validation-failure">;
  explicitWorkingNote: string | null;
  modelProvenance: ModelProvenance;
  estimatedCostUsd: number | null;
  error: NormalizedAgentError | null;
}

// ---- Stage 0.5 測定結果型 ----

/** 1つのsemantic probeに対するagentの回答結果 */
export interface SemanticProbeResult {
  probeId: string;
  correct: boolean;
  agentAnswer: string;
  /** 正解を文字列に正規化したもの（boolean は "true"/"false"、set は ソート済みJSON） */
  correctAnswer: string;
}

/**
 * semantic elementの存在トレース（Present^syn / Present^beh の両軸）。
 * elementId は invariant/dependency/operation の ID（例: "I1", "D2", "O3"）。
 */
export interface SemanticElementTrace {
  /** syntactic presence: コード上にsemantic elementのsyntactic markerが存在するか */
  syntactic: Record<string, boolean>;
  /** behavioral presence: H(G)のmicro-testがそのelementのbehaviorを確認済みか */
  behavioral: Record<string, boolean>;
}

// ---- 1世代分のログ ----

export interface GenerationLog {
  experiment_id: string;
  lineage_id: string;
  generation: number;
  condition: ContextCondition;
  /** historical compatibility: requested model id */
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
  /** JSON Schema object for function arguments. */
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
  /** workerに渡すファイル群。path（repository/ 相対）-> content */
  contextFiles: Record<string, string>;
  /** 実験計画書 heldout_tasks.json の visibleInstruction */
  visibleInstruction: string;
  /** token budget。"full" = 制限なし */
  contextBudget: number | "full";
  /** Stage 1 PR/ARでRepositoryAccessorを載せるためのprovider-neutral function tools。 */
  tools?: AgentTool[];
}

export interface AgentResult {
  /** 変更後のファイル内容（全体、差分ではない）。path -> content */
  modifiedFiles: Record<string, string>;
  /** providerから得た最終visible response text */
  rawResponse: string;
  /** private CoTではなく、modelが明示的に出力した短いhandoff note */
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

write("harness/src/agent-backend/openai.ts", r'''// harness/src/agent-backend/openai.ts
// Stage 1 primary OpenAI backend. Responses API / Structured Outputs / function toolsを使用する。
// previous_response_id / conversationは使わず、tool continuationも必要なitemsを明示的に再送する。

import OpenAI from "openai";
import { AgentBackend, AgentInput, AgentResult, AgentTool, AgentToolEvent } from "./types";
import { ReasoningEffort, TokenUsage } from "../types";

const SYSTEM_PROMPT = `You are an AI software engineer working on a TypeScript repository.
Implement the requested change while preserving the public protocol contract.

CONSTRAINTS:
1. src/protocol_adapter.ts exports protocol: WorldProtocol. The names/signatures reset, applyOperation, getEntityState, and toAbstractSnapshot must remain compatible.
2. Internal structure may be refactored freely if the public protocol remains compatible.
3. Return only files actually changed.
4. The explicit working note is observable handoff information, not hidden chain-of-thought. Keep it concise (<= 600 characters) and state only implementation facts, invariants, dependencies, or follow-up risks useful to a successor.
5. When tools are available, use them only when useful for the task. Tool results are observable and may be logged.`;

const MUTATION_SCHEMA = {
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

export interface OpenAIBackendOptions {
  model: string;
  reasoningEffort: ReasoningEffort;
  maxOutputTokens: number;
  requestTimeoutMs: number;
  maxRetries: number;
  storeResponses: boolean;
  maxToolRounds: number;
}

interface StructuredMutation {
  modifiedFiles: Array<{ path: string; content: string }>;
  workingNote: string;
}

export class OpenAIBackend implements AgentBackend {
  private readonly client: OpenAI;

  constructor(private readonly options: OpenAIBackendOptions) {
    this.client = new OpenAI({
      timeout: options.requestTimeoutMs,
      maxRetries: options.maxRetries,
    });
  }

  async run(input: AgentInput): Promise<AgentResult> {
    const start = Date.now();
    const toolEvents: AgentToolEvent[] = [];
    const aggregateUsage: TokenUsage = { input: 0, output: 0, cachedInput: 0, reasoningOutput: 0, total: 0 };
    let estimatedCostUsd = 0;
    let lastResponse: OpenAI.Responses.Response | null = null;

    const userMessage = buildUserMessage(input);
    let responseInput: any[] = [{ role: "user", content: userMessage }];
    const tools = input.tools ?? [];

    try {
      for (let round = 0; round <= this.options.maxToolRounds; round++) {
        const response = await this.client.responses.create({
          model: this.options.model,
          instructions: SYSTEM_PROMPT,
          input: responseInput,
          reasoning: { effort: this.options.reasoningEffort },
          max_output_tokens: this.options.maxOutputTokens,
          store: this.options.storeResponses,
          truncation: "disabled",
          include: this.options.storeResponses ? undefined : ["reasoning.encrypted_content"],
          tools: tools.length > 0 ? tools.map(toOpenAITool) : undefined,
          tool_choice: tools.length > 0 ? "auto" : undefined,
          parallel_tool_calls: false,
          text: {
            format: {
              type: "json_schema",
              name: "repository_mutation_v1",
              strict: true,
              schema: MUTATION_SCHEMA,
            },
          },
        });

        lastResponse = response;
        addUsage(aggregateUsage, response.usage);
        estimatedCostUsd += estimateOpenAICostUsd(this.options.model, response.usage) ?? 0;

        const functionCalls = response.output.filter(
          (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call"
        );

        if (functionCalls.length === 0) {
          const rawResponse = response.output_text ?? "";
          const parsed = parseStructuredMutation(rawResponse);
          if (!parsed.ok) {
            return this.makeResult({
              start,
              lastResponse,
              rawResponse,
              toolEvents,
              usage: aggregateUsage,
              estimatedCostUsd,
              status: "output-parse-failure",
              error: { category: "output-parse", message: parsed.error, retryable: false },
            });
          }
          return this.makeResult({
            start,
            lastResponse,
            rawResponse,
            toolEvents,
            usage: aggregateUsage,
            estimatedCostUsd,
            status: "ok",
            modifiedFiles: parsed.value.modifiedFiles,
            workingNote: parsed.value.workingNote,
            error: null,
          });
        }

        if (round >= this.options.maxToolRounds) {
          return this.makeResult({
            start,
            lastResponse,
            rawResponse: response.output_text ?? "",
            toolEvents,
            usage: aggregateUsage,
            estimatedCostUsd,
            status: "tool-error",
            error: {
              category: "tool",
              message: `Exceeded maxToolRounds=${this.options.maxToolRounds}`,
              retryable: false,
            },
          });
        }

        // Stateless continuation: carry returned output items forward explicitly instead of
        // using previous_response_id/conversation. Encrypted reasoning content is requested above.
        responseInput.push(...(response.output as any[]));
        for (const call of functionCalls) {
          const event = await executeToolCall(call, tools);
          toolEvents.push(event);
          if (!event.ok) {
            return this.makeResult({
              start,
              lastResponse,
              rawResponse: response.output_text ?? "",
              toolEvents,
              usage: aggregateUsage,
              estimatedCostUsd,
              status: "tool-error",
              error: { category: "tool", message: event.error ?? "Tool execution failed", retryable: false },
            });
          }
          responseInput.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify(event.result),
          });
        }
      }

      throw new Error("Unreachable OpenAI tool loop termination");
    } catch (error) {
      return this.makeResult({
        start,
        lastResponse,
        rawResponse: lastResponse?.output_text ?? "",
        toolEvents,
        usage: aggregateUsage,
        estimatedCostUsd: aggregateUsage.total && aggregateUsage.total > 0 ? estimatedCostUsd : null,
        status: "provider-error",
        error: {
          category: "provider",
          message: error instanceof Error ? error.message : String(error),
          retryable: inferRetryable(error),
        },
      });
    }
  }

  private makeResult(args: {
    start: number;
    lastResponse: OpenAI.Responses.Response | null;
    rawResponse: string;
    toolEvents: AgentToolEvent[];
    usage: TokenUsage;
    estimatedCostUsd: number | null;
    status: AgentResult["executionStatus"];
    modifiedFiles?: Record<string, string>;
    workingNote?: string;
    error: AgentResult["error"];
  }): AgentResult {
    return {
      modifiedFiles: args.modifiedFiles ?? {},
      rawResponse: args.rawResponse,
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
        responseStatus: args.lastResponse?.status ?? null,
        endpoint: "responses",
        reasoningEffort: this.options.reasoningEffort,
        maxOutputTokens: this.options.maxOutputTokens,
        structuredOutput: true,
        storeResponses: this.options.storeResponses,
        serviceTier: args.lastResponse?.service_tier ?? null,
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

function buildUserMessage(input: AgentInput): string {
  const lines: string[] = ["REPOSITORY FILES:"];
  let totalChars = 0;
  const budgetChars = input.contextBudget === "full" ? Infinity : input.contextBudget * 4;

  for (const filePath of Object.keys(input.contextFiles).sort()) {
    const content = input.contextFiles[filePath];
    const entry = `\n--- ${filePath} ---\n${content}\n`;
    if (totalChars + entry.length > budgetChars) {
      lines.push(`\n[... remaining files truncated due to context budget (${input.contextBudget} tokens) ...]`);
      break;
    }
    lines.push(entry);
    totalChars += entry.length;
  }

  lines.push(`\nTASK:\n${input.visibleInstruction}`);
  lines.push("\nImplement the change and return the structured repository mutation.");
  return lines.join("");
}

function toOpenAITool(tool: AgentTool): OpenAI.Responses.FunctionTool {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: true,
  };
}

async function executeToolCall(
  call: OpenAI.Responses.ResponseFunctionToolCall,
  tools: AgentTool[]
): Promise<AgentToolEvent> {
  const tool = tools.find((candidate) => candidate.name === call.name);
  if (!tool) {
    return {
      callId: call.call_id,
      toolName: call.name,
      arguments: call.arguments,
      result: null,
      ok: false,
      error: `Unknown tool: ${call.name}`,
    };
  }

  let parsedArguments: unknown;
  try {
    parsedArguments = JSON.parse(call.arguments);
  } catch (error) {
    return {
      callId: call.call_id,
      toolName: call.name,
      arguments: call.arguments,
      result: null,
      ok: false,
      error: `Invalid tool arguments JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  try {
    const result = await tool.execute(parsedArguments);
    return { callId: call.call_id, toolName: call.name, arguments: parsedArguments, result, ok: true };
  } catch (error) {
    return {
      callId: call.call_id,
      toolName: call.name,
      arguments: parsedArguments,
      result: null,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
    return { ok: false, error: "Structured output does not match repository_mutation_v1" };
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

function addUsage(target: TokenUsage, usage: OpenAI.Responses.ResponseUsage | undefined): void {
  if (!usage) return;
  target.input += usage.input_tokens;
  target.output += usage.output_tokens;
  target.cachedInput = (target.cachedInput ?? 0) + (usage.input_tokens_details?.cached_tokens ?? 0);
  target.reasoningOutput =
    (target.reasoningOutput ?? 0) + (usage.output_tokens_details?.reasoning_tokens ?? 0);
  target.total = (target.total ?? 0) + usage.total_tokens;
}

/**
 * Sync Responses API向けの参考cost estimate。Batch料金はここでは扱わない。
 * Lunaの公式token価格（2026-09-08確認）だけを実装し、他modelではnullを返す。
 */
export function estimateOpenAICostUsd(
  requestedModel: string,
  usage: OpenAI.Responses.ResponseUsage | undefined
): number | null {
  if (!usage || requestedModel !== "gpt-5.6-luna") return null;
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const uncached = Math.max(0, usage.input_tokens - cached);
  const longContext = usage.input_tokens > 272_000;
  const inputMultiplier = longContext ? 2 : 1;
  const outputMultiplier = longContext ? 1.5 : 1;

  const inputCost = ((uncached * 0.20 + cached * 0.02) / 1_000_000) * inputMultiplier;
  const outputCost = ((usage.output_tokens * 1.20) / 1_000_000) * outputMultiplier;
  return inputCost + outputCost;
}

function inferRetryable(error: unknown): boolean | null {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 408 || error.status === 409 || error.status === 429) return true;
    if (typeof error.status === "number" && error.status >= 500) return true;
    return false;
  }
  return null;
}

function getPackageVersion(packageName: string): string | null {
  try {
    // CommonJS build under ts-node permits package.json lookup; provenance only.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require(`${packageName}/package.json`) as { version?: string };
    return pkg.version ?? null;
  } catch {
    return null;
  }
}
''')

write("harness/src/agent-backend/anthropic.ts", r'''// harness/src/agent-backend/anthropic.ts
// 実Anthropic APIを呼ぶagent。Stage 0 historical backend。
// 毎回新しいmessages配列で開始し、前世代の履歴は含めない。

import Anthropic from "@anthropic-ai/sdk";
import { AgentBackend, AgentInput, AgentResult } from "./types";

const SYSTEM_PROMPT = `You are an AI software engineer working on a TypeScript repository.
Your task is to implement the requested change to the repository.

IMPORTANT CONSTRAINTS:
1. The file "src/protocol_adapter.ts" exports the following names that MUST NOT be renamed or have their signatures changed:
   - export const protocol (of type WorldProtocol)
   - Within protocol: reset, applyOperation, getEntityState, toAbstractSnapshot
   Breaking these exports is a contract violation and will cause test failures.

2. You may freely refactor internal structure (file layout, function names within files, etc.)
   as long as the above contract is maintained.

3. Return ONLY the files you actually changed. Do not return unchanged files.

OUTPUT FORMAT:
After implementing the change, output a JSON object inside <modified_files> tags mapping paths to complete file contents.`;

export class AnthropicBackend implements AgentBackend {
  private readonly client: Anthropic;

  constructor(private readonly model: string) {
    this.client = new Anthropic();
  }

  async run(input: AgentInput): Promise<AgentResult> {
    const start = Date.now();
    if ((input.tools?.length ?? 0) > 0) {
      return this.failure(start, "Historical AnthropicBackend does not implement provider-neutral tools");
    }

    try {
      const contextSection = formatContextFiles(input.contextFiles, input.contextBudget);
      const userMessage = `${contextSection}\n\nTASK:\n${input.visibleInstruction}\n\nImplement this change. Output only modified files in <modified_files> JSON tags.`;
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const rawResponse = extractTextContent(response);
      const parsed = parseModifiedFiles(rawResponse);
      return {
        modifiedFiles: parsed.modifiedFiles,
        rawResponse,
        explicitWorkingNote: null,
        toolEvents: [],
        tokenUsage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
        latencyMs: Date.now() - start,
        executionStatus: parsed.ok ? "ok" : "output-parse-failure",
        modelProvenance: {
          provider: "anthropic",
          requestedModel: this.model,
          actualModel: response.model,
          responseId: response.id,
          responseStatus: "completed",
          endpoint: "messages",
          reasoningEffort: null,
          maxOutputTokens: 8192,
          structuredOutput: false,
          storeResponses: null,
          serviceTier: null,
          sdkVersion: getPackageVersion("@anthropic-ai/sdk"),
          retryPolicy: { maxRetries: null, timeoutMs: null },
        },
        estimatedCostUsd: null,
        error: parsed.ok
          ? null
          : { category: "output-parse", message: "Failed to parse <modified_files> JSON", retryable: false },
      };
    } catch (error) {
      return this.failure(start, error instanceof Error ? error.message : String(error));
    }
  }

  private failure(start: number, message: string): AgentResult {
    return {
      modifiedFiles: {},
      rawResponse: "",
      explicitWorkingNote: null,
      toolEvents: [],
      latencyMs: Date.now() - start,
      executionStatus: "provider-error",
      modelProvenance: {
        provider: "anthropic",
        requestedModel: this.model,
        actualModel: null,
        responseId: null,
        responseStatus: "failed",
        endpoint: "messages",
        reasoningEffort: null,
        maxOutputTokens: 8192,
        structuredOutput: false,
        storeResponses: null,
        serviceTier: null,
        sdkVersion: getPackageVersion("@anthropic-ai/sdk"),
        retryPolicy: { maxRetries: null, timeoutMs: null },
      },
      estimatedCostUsd: null,
      error: { category: "provider", message, retryable: null },
    };
  }
}

function formatContextFiles(files: Record<string, string>, budget: number | "full"): string {
  const lines: string[] = ["REPOSITORY FILES:"];
  let totalChars = 0;
  const budgetChars = budget === "full" ? Infinity : budget * 4;
  for (const filePath of Object.keys(files).sort()) {
    const entry = `\n--- ${filePath} ---\n${files[filePath]}\n`;
    if (totalChars + entry.length > budgetChars) break;
    lines.push(entry);
    totalChars += entry.length;
  }
  return lines.join("");
}

function extractTextContent(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function parseModifiedFiles(
  rawResponse: string
): { ok: true; modifiedFiles: Record<string, string> } | { ok: false; modifiedFiles: {} } {
  const match = rawResponse.match(/<modified_files>([\s\S]*?)<\/modified_files>/);
  if (!match) return { ok: false, modifiedFiles: {} };
  try {
    const parsed = JSON.parse(match[1].trim());
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { ok: false, modifiedFiles: {} };
    for (const value of Object.values(parsed)) if (typeof value !== "string") return { ok: false, modifiedFiles: {} };
    return { ok: true, modifiedFiles: parsed as Record<string, string> };
  } catch {
    return { ok: false, modifiedFiles: {} };
  }
}

function getPackageVersion(packageName: string): string | null {
  try {
    const pkg = require(`${packageName}/package.json`) as { version?: string };
    return pkg.version ?? null;
  } catch {
    return null;
  }
}
''')

# Update mock backends to emit common provenance.
write("harness/src/agent-backend/mock-noop.ts", r'''import { AgentBackend, AgentInput, AgentResult } from "./types";

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
''')

# Patch mock-oracle minimally from its known simple structure.
mock_oracle = Path("harness/src/agent-backend/mock-oracle.ts").read_text(encoding="utf-8")
old_return = '''    return {\n      modifiedFiles,\n      rawResponse: `[mock-oracle] Applied oracle patch for task "${this.taskId}".`,\n      tokenUsage: { input: 0, output: 0 },\n      latencyMs: Date.now() - start,\n    };'''
new_return = '''    return {\n      modifiedFiles,\n      rawResponse: `[mock-oracle] Applied oracle patch for task "${this.taskId}".`,\n      explicitWorkingNote: null,\n      toolEvents: [],\n      tokenUsage: { input: 0, output: 0, total: 0 },\n      latencyMs: Date.now() - start,\n      executionStatus: "ok",\n      modelProvenance: {\n        provider: "mock", requestedModel: null, actualModel: "mock-oracle", responseId: null,\n        responseStatus: "completed", endpoint: "mock", reasoningEffort: null, maxOutputTokens: null,\n        structuredOutput: true, storeResponses: null, serviceTier: null, sdkVersion: null,\n        retryPolicy: { maxRetries: null, timeoutMs: null },\n      },\n      estimatedCostUsd: 0,\n      error: null,\n    };'''
if old_return not in mock_oracle:
    raise RuntimeError("mock-oracle return anchor not found")
write("harness/src/agent-backend/mock-oracle.ts", mock_oracle.replace(old_return, new_return, 1))

# Config validation: add OpenAI backend and reproducibility settings.
validate = Path("harness/src/config/validate.ts").read_text(encoding="utf-8")
validate = validate.replace('const BACKENDS: BackendType[] = ["mock-noop", "mock-oracle", "anthropic"];',
                            'const BACKENDS: BackendType[] = ["mock-noop", "mock-oracle", "anthropic", "openai"];')
validate = validate.replace('  assertOptionalString(value, "model");\n',
'''  assertOptionalString(value, "model");\n  assertOptionalString(value, "reasoningEffort");\n''')
insert_before = '''  if (\n    value.contextBudget !== undefined &&'''
extra_raw = '''  for (const key of ["maxOutputTokens", "requestTimeoutMs", "maxRetries", "maxToolRounds"] as const) {\n    const v = value[key];\n    if (v !== undefined && (typeof v !== "number" || !Number.isInteger(v))) {\n      throw new Error(`Config field "${key}" must be an integer`);\n    }\n  }\n  if (value.storeResponses !== undefined && typeof value.storeResponses !== "boolean") {\n    throw new Error('Config field "storeResponses" must be a boolean');\n  }\n\n'''
if insert_before not in validate:
    raise RuntimeError("validate raw anchor not found")
validate = validate.replace(insert_before, extra_raw + insert_before, 1)
semantic_anchor = '''  // Stage 0はhistorical behaviorとしてtask cyclingを許す。'''
extra_semantic = '''  const reasoningEfforts = new Set(["none", "low", "medium", "high", "xhigh", "max"]);\n  if (config.reasoningEffort !== undefined && !reasoningEfforts.has(config.reasoningEffort)) {\n    throw new Error(`Unsupported reasoningEffort: ${config.reasoningEffort}`);\n  }\n  for (const [key, value, min] of [\n    ["maxOutputTokens", config.maxOutputTokens, 1],\n    ["requestTimeoutMs", config.requestTimeoutMs, 1],\n    ["maxRetries", config.maxRetries, 0],\n    ["maxToolRounds", config.maxToolRounds, 0],\n  ] as const) {\n    if (value !== undefined && (!Number.isInteger(value) || value < min)) {\n      throw new Error(`${key} must be an integer >= ${min}`);\n    }\n  }\n\n'''
if semantic_anchor not in validate:
    raise RuntimeError("validate semantic anchor not found")
validate = validate.replace(semantic_anchor, extra_semantic + semantic_anchor, 1)
scientific_anchor = '''  if (scientificLongitudinal) {\n    const unique = new Set(config.tasks);'''
replacement = '''  if (scientificLongitudinal) {\n    if (config.backend === "openai") {\n      if (!config.model) throw new Error("Stage 1/2 OpenAI run must explicitly freeze model");\n      if (!config.reasoningEffort) throw new Error("Stage 1/2 OpenAI run must explicitly freeze reasoningEffort");\n      if (config.maxOutputTokens === undefined) throw new Error("Stage 1/2 OpenAI run must explicitly freeze maxOutputTokens");\n      if (config.requestTimeoutMs === undefined) throw new Error("Stage 1/2 OpenAI run must explicitly freeze requestTimeoutMs");\n      if (config.maxRetries === undefined) throw new Error("Stage 1/2 OpenAI run must explicitly freeze maxRetries");\n      if (config.storeResponses !== false) throw new Error("Stage 1/2 OpenAI run must set storeResponses=false for explicit statelessness");\n    }\n    const unique = new Set(config.tasks);'''
if scientific_anchor not in validate:
    raise RuntimeError("validate scientific anchor not found")
validate = validate.replace(scientific_anchor, replacement, 1)
write("harness/src/config/validate.ts", validate)

# run.ts default runtime knobs (scientific OpenAI configs still must explicitly set them due validator).
run = Path("harness/run.ts").read_text(encoding="utf-8")
anchor = '''    tasks: rawConfig.tasks ?? ["T-local-1", "T-crosscut-1", "T-delayed-1", "T-invariant-stress-1"],\n    syntheticWorldDir:'''
replacement = '''    tasks: rawConfig.tasks ?? ["T-local-1", "T-crosscut-1", "T-delayed-1", "T-invariant-stress-1"],\n    maxOutputTokens: rawConfig.maxOutputTokens ?? 8192,\n    requestTimeoutMs: rawConfig.requestTimeoutMs ?? 120_000,\n    maxRetries: rawConfig.maxRetries ?? 2,\n    storeResponses: rawConfig.storeResponses ?? false,\n    maxToolRounds: rawConfig.maxToolRounds ?? 4,\n    syntheticWorldDir:'''
if anchor not in run:
    raise RuntimeError("run config anchor not found")
write("harness/run.ts", run.replace(anchor, replacement, 1))

# orchestrator: add OpenAI backend and provenance/cost/tool logging.
orc = Path("harness/src/orchestrator.ts").read_text(encoding="utf-8")
orc = orc.replace('import { AnthropicBackend } from "./agent-backend/anthropic";\n',
                  'import { AnthropicBackend } from "./agent-backend/anthropic";\nimport { OpenAIBackend } from "./agent-backend/openai";\n')
orc = orc.replace('    model: config.model ?? null,\n    task_id: taskId,',
                  '    model: config.model ?? null,\n    model_provenance: agentResult.modelProvenance,\n    task_id: taskId,')
orc = orc.replace('    agent_response: agentResult.rawResponse,\n    tool_calls: [],\n    agent_execution_status: executionStatus,',
                  '    agent_response: agentResult.rawResponse,\n    explicit_working_note: agentResult.explicitWorkingNote,\n    tool_calls: agentResult.toolEvents,\n    agent_execution_status: executionStatus,\n    agent_error: agentResult.error,')
orc = orc.replace('    cost: null,\n', '    cost: agentResult.estimatedCostUsd,\n')
case_anchor = '''    case "anthropic": {\n      const model = config.model ?? "claude-haiku-4-5-20251001";\n      return new AnthropicBackend(model);\n    }\n  }'''
case_replacement = '''    case "anthropic": {\n      const model = config.model ?? "claude-haiku-4-5-20251001";\n      return new AnthropicBackend(model);\n    }\n    case "openai": {\n      const model = config.model ?? "gpt-5.6-luna";\n      return new OpenAIBackend({\n        model,\n        reasoningEffort: config.reasoningEffort ?? "medium",\n        maxOutputTokens: config.maxOutputTokens ?? 8192,\n        requestTimeoutMs: config.requestTimeoutMs ?? 120_000,\n        maxRetries: config.maxRetries ?? 2,\n        storeResponses: config.storeResponses ?? false,\n        maxToolRounds: config.maxToolRounds ?? 4,\n      });\n    }\n  }'''
if case_anchor not in orc:
    raise RuntimeError("orchestrator backend anchor not found")
write("harness/src/orchestrator.ts", orc.replace(case_anchor, case_replacement, 1))

# Logging provenance and normalized status.
logging = Path("harness/src/logging.ts").read_text(encoding="utf-8")
logging = logging.replace('    model: log.model,\n    task_id: log.task_id,',
                          '    model: log.model,\n    model_provenance: log.model_provenance,\n    task_id: log.task_id,')
logging = logging.replace('    functional_task_result: log.functional_task_result,\n',
                          '    functional_task_result: log.functional_task_result,\n    agent_execution_status: log.agent_execution_status,\n    agent_error: log.agent_error,\n    explicit_working_note: log.explicit_working_note,\n')
logging = logging.replace('    response: log.agent_response,\n    tool_calls: log.tool_calls,',
                          '    response: log.agent_response,\n    explicit_working_note: log.explicit_working_note,\n    tool_calls: log.tool_calls,\n    error: log.agent_error,')
write("harness/src/logging.ts", logging)

# Environment example.
env = Path("harness/.env.example").read_text(encoding="utf-8")
if "OPENAI_API_KEY=" not in env:
    env += "\n# Stage 1 primary provider\nOPENAI_API_KEY=sk-your-openai-key-here\n"
write("harness/.env.example", env)

# Stage 1 OpenAI smoke config. A live call is intentionally not run in CI because no API secret is assumed.
write("harness/config/stage1-openai-smoke.json", r'''{
  "experimentId": "stage1-openai-luna-smoke",
  "lineageId": "lineage-0",
  "stage": "stage1-smoke",
  "backend": "openai",
  "condition": "full",
  "contextBudget": "full",
  "generations": 1,
  "tasks": ["T-local-1"],
  "model": "gpt-5.6-luna",
  "reasoningEffort": "medium",
  "maxOutputTokens": 8192,
  "requestTimeoutMs": 120000,
  "maxRetries": 2,
  "storeResponses": false,
  "maxToolRounds": 4
}
''')

# Offline verification for parser and cost accounting.
write("harness/verify-openai-backend.ts", r'''import { estimateOpenAICostUsd, parseStructuredMutation } from "./src/agent-backend/openai";

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
  modifiedFiles: [
    { path: "src/a.ts", content: "a" },
    { path: "src/a.ts", content: "b" },
  ],
  workingNote: "duplicate",
}));
assert(!duplicate.ok, "duplicate paths must be rejected");

const cost = estimateOpenAICostUsd("gpt-5.6-luna", {
  input_tokens: 1000,
  input_tokens_details: { cached_tokens: 200, cache_write_tokens: 0 },
  output_tokens: 500,
  output_tokens_details: { reasoning_tokens: 100 },
  total_tokens: 1500,
});
assert(cost !== null && cost > 0, "Luna cost should be estimated");
assert(estimateOpenAICostUsd("other-model", undefined) === null, "unknown model cost must be null");

console.log("OpenAI backend offline verification passed.");
''')

# Optional live smoke verifies both Structured Outputs and function calling when OPENAI_API_KEY is available.
write("harness/verify-openai-live.ts", r'''import "dotenv/config";
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
''')

# Add scripts; npm install in workflow will add/pin the OpenAI SDK dependency + lockfile.
pkg_path = Path("harness/package.json")
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
pkg["description"] = "AIDD-ILM experimental harness (Stage 0 historical + Stage 1 runtime)."
pkg.setdefault("scripts", {})["typecheck"] = "tsc --noEmit"
pkg["scripts"]["verify:openai"] = "ts-node verify-openai-backend.ts"
pkg["scripts"]["verify:openai-live"] = "ts-node verify-openai-live.ts"
pkg_path.write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

print("Applied provider-neutral/OpenAI backend source changes")
