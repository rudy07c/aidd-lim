// Shared OpenAI Responses request/response utilities used by Sync and Batch paths.

import * as crypto from "crypto";
import OpenAI from "openai";
import {
  OpenAIServiceTier,
  PricingMode,
  PromptCacheMode,
  ReasoningEffort,
  TokenUsage,
} from "../../types";
import { serializeObservableInteractionForSuccessor } from "../../context/observable-interaction";
import { AgentInput, AgentTool } from "../types";

export const OPENAI_PROMPT_VERSION = "stage1-worker-v3-moi";
export const OPENAI_MUTATION_SCHEMA_VERSION = "repository-mutation-v3";
export const EXPLICIT_WORKING_NOTE_MAX_CHARS = 600;

export const OPENAI_SYSTEM_PROMPT = `You are an AI software engineer working on a TypeScript repository.
Implement the requested change while preserving the public protocol contract.

CONSTRAINTS:
1. src/protocol_adapter.ts exports protocol: WorldProtocol. The names/signatures reset, applyOperation, getEntityState, and toAbstractSnapshot must remain compatible.
2. Internal structure may be refactored freely if the public protocol remains compatible.
3. Return only files actually changed.
4. The explicit working note is an observable episode note, not hidden chain-of-thought. Keep it concise (<= ${EXPLICIT_WORKING_NOTE_MAX_CHARS} characters) and state only implementation facts, invariants, dependencies, or current risks.
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
    // Strict Structured Outputs supports only a subset of JSON Schema string keywords.
    // The 600-character bound is therefore enforced by parseStructuredMutation below,
    // not by an unsupported maxLength keyword in the API schema.
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

/**
 * Workload-specific Structured Output contract. Batch infrastructure consumes the same
 * Responses request envelope as Sync; mutation/probe workloads only supply this contract.
 */
export interface OpenAIStructuredOutputSpec {
  instructions: string;
  schemaName: string;
  schema: Record<string, unknown>;
}

export const OPENAI_MUTATION_OUTPUT_SPEC: OpenAIStructuredOutputSpec = {
  instructions: OPENAI_SYSTEM_PROMPT,
  schemaName: "repository_mutation_v3",
  schema: OPENAI_MUTATION_SCHEMA as unknown as Record<string, unknown>,
};

export interface StructuredMutation {
  modifiedFiles: Array<{ path: string; content: string }>;
  workingNote: string;
}

/**
 * Common AF/MOI user-prompt structure. The only intended difference is the presence of
 * PREVIOUS OBSERVABLE INTERACTION RECORD for MOI. Repository ordering is deterministic.
 */
export function buildOpenAIUserMessage(input: AgentInput): string {
  const lines: string[] = [
    `CURRENT TASK:\n${input.visibleInstruction}`,
  ];
  if (input.previousInteractionRecord) {
    lines.push(
      `\nPREVIOUS OBSERVABLE INTERACTION RECORD:\n${serializeObservableInteractionForSuccessor(input.previousInteractionRecord)}`
    );
  }
  lines.push("\nCURRENT REPOSITORY:");
  // contextFiles are already the condition runner's final evidence set.
  // Do not apply a second token/character budget here.
  for (const filePath of Object.keys(input.contextFiles).sort()) {
    lines.push(`\n--- ${filePath} ---\n${input.contextFiles[filePath]}\n`);
  }
  lines.push("\nImplement the change and return the structured repository mutation.");
  return lines.join("");
}

/** Generic Responses envelope shared by Sync and Batch workloads. */
export function buildOpenAIStructuredResponseRequestBody(args: {
  options: OpenAIRequestOptions;
  responseInput: any[];
  tools?: AgentTool[];
  includeEncryptedReasoning?: boolean;
  outputSpec: OpenAIStructuredOutputSpec;
}): Record<string, unknown> {
  const {
    options,
    responseInput,
    tools = [],
    includeEncryptedReasoning = false,
    outputSpec,
  } = args;
  return {
    model: options.model,
    instructions: outputSpec.instructions,
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
        name: outputSpec.schemaName,
        strict: true,
        schema: outputSpec.schema,
      },
    },
  };
}

/** Repository-mutation compatibility wrapper used by the existing Sync backend. */
export function buildOpenAIResponseRequestBody(args: {
  options: OpenAIRequestOptions;
  responseInput: any[];
  tools: AgentTool[];
  includeEncryptedReasoning: boolean;
}): Record<string, unknown> {
  return buildOpenAIStructuredResponseRequestBody({
    ...args,
    outputSpec: OPENAI_MUTATION_OUTPUT_SPEC,
  });
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
    return { ok: false, error: "Structured output does not match repository_mutation_v3" };
  }
  if (parsed.workingNote.length > EXPLICIT_WORKING_NOTE_MAX_CHARS) {
    return {
      ok: false,
      error: `workingNote exceeds ${EXPLICIT_WORKING_NOTE_MAX_CHARS} characters`,
    };
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

export function extractObservableAssistantMessages(response: { output?: unknown[] }): string[] {
  const messages: string[] = [];
  for (const item of (response.output ?? []) as any[]) {
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

/** Raw Batch response bodies do not rely on SDK-computed helpers, so derive output text if needed. */
export function extractOutputText(response: { output_text?: unknown; output?: unknown[] }): string {
  if (typeof response.output_text === "string") return response.output_text;
  return extractObservableAssistantMessages(response).join("");
}

export function extractRefusal(response: { output?: unknown[] }): string | null {
  for (const item of (response.output ?? []) as any[]) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === "refusal" && typeof content.refusal === "string") return content.refusal;
    }
  }
  return null;
}

export function responseFailureDetails(response: unknown): {
  incompleteReason: string | null;
  providerErrorCode: string | null;
  providerErrorMessage: string | null;
} {
  const r = response as any;
  return {
    incompleteReason: r?.incomplete_details?.reason ?? null,
    providerErrorCode: r?.error?.code ?? null,
    providerErrorMessage: r?.error?.message ?? null,
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
