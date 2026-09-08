// harness/src/agent-backend/mock-noop.ts
//
// 何も変更しないagent。contextFilesをそのまま返す。
//
// 用途：「正しく失敗する経路が失敗として記録されるか」の確認。

import { AgentBackend, AgentInput, AgentResult } from "./types";

export class MockNoopBackend implements AgentBackend {
  async run(input: AgentInput): Promise<AgentResult> {
    const start = Date.now();
    return {
      modifiedFiles: { ...input.contextFiles },
      rawResponse: "[mock-noop] No changes made. Returned contextFiles as-is.",
      tokenUsage: { input: 0, output: 0 },
      latencyMs: Date.now() - start,
      executionStatus: "ok",
    };
  }
}
