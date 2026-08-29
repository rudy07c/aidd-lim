// harness/src/agent-backend/anthropic.ts
//
// 実Anthropic APIを呼ぶagent。Stage 0後半でのみ使用。
// APIキーは環境変数 ANTHROPIC_API_KEY から読む。
//
// 出力フォーマット：修正後ファイルをJSONで <modified_files>...</modified_files> タグ内に返す。
// フルファイル内容を返す設計（diff形式ではない）。（docs/harness_stage0_plan.md 5節）
//
// 世代の独立性保証（2.4節）：毎回新しいAPIコールを開始し、
// messages配列は必ず1メッセージから開始する。前世代の履歴は一切含めない。

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
    // APIキーは環境変数から自動的に読み込まれる
    this.client = new Anthropic();
    this.model = model;
  }

  async run(input: AgentInput): Promise<AgentResult> {
    const start = Date.now();

    // コンテキストファイルをフォーマット
    const contextSection = formatContextFiles(input.contextFiles, input.contextBudget);

    const userMessage = `${contextSection}

TASK:
${input.visibleInstruction}

Implement this change. Remember to output only the modified files in the <modified_files> JSON format described in the system prompt.`;

    // 毎回新しいmessages配列で開始（前世代の履歴は含めない）
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userMessage },
      ],
    });

    const latencyMs = Date.now() - start;
    const rawResponse = extractTextContent(response);
    const modifiedFiles = parseModifiedFiles(rawResponse);

    return {
      modifiedFiles,
      rawResponse,
      tokenUsage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      latencyMs,
    };
  }
}

function formatContextFiles(
  files: Record<string, string>,
  budget: number | "full"
): string {
  const lines: string[] = ["REPOSITORY FILES:"];
  let totalChars = 0;
  const budgetChars = budget === "full" ? Infinity : budget * 4; // rough: 1 token ≈ 4 chars

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

function parseModifiedFiles(rawResponse: string): Record<string, string> {
  const match = rawResponse.match(/<modified_files>([\s\S]*?)<\/modified_files>/);
  if (!match) {
    console.warn("[anthropic] Warning: <modified_files> tag not found in response. Returning empty modifications.");
    return {};
  }

  try {
    const parsed = JSON.parse(match[1].trim());
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Expected a JSON object");
    }
    // 値がすべてstring であることを確認
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== "string") {
        throw new Error(`Value for key "${k}" is not a string`);
      }
    }
    return parsed as Record<string, string>;
  } catch (e) {
    console.error("[anthropic] Failed to parse modified_files JSON:", e);
    console.error("[anthropic] Raw content was:", match[1]);
    return {};
  }
}
