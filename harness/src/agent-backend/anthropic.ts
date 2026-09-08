// harness/src/agent-backend/anthropic.ts
//
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
After implementing the change, output a JSON object inside <modified_files> tags like this:

<modified_files>
{
  "src/vok/rules.ts": "complete new content of the file",
  "src/protocol_adapter.ts": "complete new content of the file"
}
</modified_files>

The JSON keys are file paths relative to the repository root.
The JSON values are the complete new file contents (not diffs).`;

export class AnthropicBackend implements AgentBackend {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(model: string) {
    this.client = new Anthropic();
    this.model = model;
  }

  async run(input: AgentInput): Promise<AgentResult> {
    const start = Date.now();
    const contextSection = formatContextFiles(input.contextFiles, input.contextBudget);
    const userMessage = `${contextSection}\n\nTASK:\n${input.visibleInstruction}\n\nImplement this change. Remember to output only the modified files in the <modified_files> JSON format described in the system prompt.`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const latencyMs = Date.now() - start;
    const rawResponse = extractTextContent(response);
    const parsed = parseModifiedFiles(rawResponse);

    return {
      modifiedFiles: parsed.modifiedFiles,
      rawResponse,
      tokenUsage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      latencyMs,
      executionStatus: parsed.ok ? "ok" : "output-parse-failure",
    };
  }
}

function formatContextFiles(files: Record<string, string>, budget: number | "full"): string {
  const lines: string[] = ["REPOSITORY FILES:"];
  let totalChars = 0;
  const budgetChars = budget === "full" ? Infinity : budget * 4;

  for (const [filePath, content] of Object.entries(files)) {
    const entry = `\n--- ${filePath} ---\n${content}\n`;
    if (totalChars + entry.length > budgetChars) {
      lines.push(`\n[... remaining files truncated due to context budget (${budget} tokens) ...]`);
      break;
    }
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
  if (!match) {
    console.warn("[anthropic] <modified_files> tag not found; recording output-parse-failure.");
    return { ok: false, modifiedFiles: {} };
  }

  try {
    const parsed = JSON.parse(match[1].trim());
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Expected a JSON object");
    }
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== "string") {
        throw new Error(`Value for key "${k}" is not a string`);
      }
    }
    return { ok: true, modifiedFiles: parsed as Record<string, string> };
  } catch (e) {
    console.error("[anthropic] Failed to parse modified_files JSON:", e);
    return { ok: false, modifiedFiles: {} };
  }
}
