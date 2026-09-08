from pathlib import Path


def write(path: str, content: str) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")

# SDK exposes APIError as a runtime class; keep helper structural to avoid namespace type mismatch.
openai = Path("harness/src/agent-backend/openai.ts")
text = openai.read_text(encoding="utf-8")
text = text.replace("function inferRetryable(error: OpenAI.APIError): boolean {", "function inferRetryable(error: { status?: number }): boolean {")
openai.write_text(text, encoding="utf-8")

write("harness/src/agent-backend/mock-noop.ts", r'''import { AgentBackend, AgentInput, AgentResult } from "./types";

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
''')

write("harness/src/agent-backend/mock-oracle.ts", r'''// harness/src/agent-backend/mock-oracle.ts

import * as path from "path";
import { AgentBackend, AgentInput, AgentResult } from "./types";

export class MockOracleBackend implements AgentBackend {
  private readonly taskId: string;
  private readonly fixturesDir: string;

  constructor(taskId: string, fixturesDir: string) {
    this.taskId = taskId;
    this.fixturesDir = fixturesDir;
  }

  async run(input: AgentInput): Promise<AgentResult> {
    const start = Date.now();
    const patchPath = path.join(this.fixturesDir, "oracle-patches", `${this.taskId}.ts`);
    let patchModule: { applyOracle: (files: Record<string, string>) => Record<string, string> };
    try {
      patchModule = require(patchPath);
    } catch (e) {
      throw new Error(`[mock-oracle] Oracle patch not found for task "${this.taskId}" at ${patchPath}: ${e}`);
    }
    if (typeof patchModule.applyOracle !== "function") {
      throw new Error(`[mock-oracle] Patch module for "${this.taskId}" does not export applyOracle function.`);
    }
    const modifiedFiles = patchModule.applyOracle({ ...input.contextFiles });
    const rawResponse = `[mock-oracle] Applied oracle patch for task "${this.taskId}".`;
    return {
      modifiedFiles,
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
        actualModel: "mock-oracle",
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
''')

write("harness/src/agent-backend/anthropic.ts", r'''// harness/src/agent-backend/anthropic.ts
// Historical Anthropic backend retained for Stage 0 / robustness comparison.

import Anthropic from "@anthropic-ai/sdk";
import { AgentBackend, AgentInput, AgentResult } from "./types";

const SYSTEM_PROMPT = `You are an AI software engineer working on a TypeScript repository.
Your task is to implement the requested change to the repository.

IMPORTANT CONSTRAINTS:
1. The file "src/protocol_adapter.ts" exports protocol: WorldProtocol and its reset, applyOperation, getEntityState, toAbstractSnapshot signatures must remain compatible.
2. Internal structure may be refactored freely if the public protocol remains compatible.
3. Return ONLY the files you actually changed.

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
        observableAssistantMessages: rawResponse.length > 0 ? [rawResponse] : [],
        explicitWorkingNote: null,
        toolEvents: [],
        tokenUsage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
        latencyMs: Date.now() - start,
        executionStatus: parsed.ok ? "ok" : "output-parse-failure",
        modelProvenance: historicalProvenance(this.model, response.model, response.id, "completed"),
        estimatedCostUsd: null,
        error: parsed.ok ? null : { category: "output-parse", message: "Failed to parse <modified_files> JSON", retryable: false },
      };
    } catch (error) {
      return this.failure(start, error instanceof Error ? error.message : String(error));
    }
  }

  private failure(start: number, message: string): AgentResult {
    return {
      modifiedFiles: {},
      rawResponse: "",
      observableAssistantMessages: [],
      explicitWorkingNote: null,
      toolEvents: [],
      latencyMs: Date.now() - start,
      executionStatus: "provider-error",
      modelProvenance: historicalProvenance(this.model, null, null, "failed"),
      estimatedCostUsd: null,
      error: { category: "provider", message, retryable: null },
    };
  }
}

function historicalProvenance(requestedModel: string, actualModel: string | null, responseId: string | null, responseStatus: string) {
  return {
    provider: "anthropic" as const,
    requestedModel,
    actualModel,
    responseId,
    responseStatus,
    endpoint: "messages" as const,
    reasoningEffort: null,
    maxOutputTokens: 8192,
    structuredOutput: false,
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
    sdkVersion: getPackageVersion("@anthropic-ai/sdk"),
    retryPolicy: { maxRetries: null, timeoutMs: null },
  };
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

function parseModifiedFiles(rawResponse: string): { ok: true; modifiedFiles: Record<string, string> } | { ok: false; modifiedFiles: {} } {
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

print("Follow-up sync hardening fixes applied")
