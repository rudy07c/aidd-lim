// harness/src/agent-backend/mock-noop.ts
//
// 何も変更しないagent。contextFilesをそのまま返す。
//
// 用途：「正しく失敗する経路が失敗として記録されるか」の確認。
// task-specific test は必ず失敗し、既存の visible tests / H(G) は
// 必ず通るはず。この「必ず失敗するはずの経路が正しく失敗と記録されるか」
// を検証するためのモック。（docs/harness_stage0_plan.md 2.1節）

import { AgentBackend, AgentInput, AgentResult } from "./types";

export class MockNoopBackend implements AgentBackend {
  async run(input: AgentInput): Promise<AgentResult> {
    const start = Date.now();
    // 何も変更しない: contextFiles をそのまま modifiedFiles として返す
    return {
      modifiedFiles: { ...input.contextFiles },
      rawResponse: "[mock-noop] No changes made. Returned contextFiles as-is.",
      tokenUsage: { input: 0, output: 0 },
      latencyMs: Date.now() - start,
    };
  }
}
