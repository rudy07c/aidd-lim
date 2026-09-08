// harness/src/agent-backend/openai.ts
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
