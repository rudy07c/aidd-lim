// harness/src/agent-backend/mock-oracle.ts
//
// 各held-out taskの正解パッチを直接適用するagent。
//
// 用途：「正しく成功する経路が成功として記録されるか」の確認。
// 全テストが必ず通るはず。（docs/harness_stage0_plan.md 2.1節）
//
// 各taskのパッチは harness/fixtures/oracle-patches/<taskId>.ts に手書きで用意する。
// パッチは「applyOracle(currentFiles) => modifiedFiles」という関数をexportする。

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
      // ts-node 実行時は直接 require できる
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      patchModule = require(patchPath);
    } catch (e) {
      throw new Error(
        `[mock-oracle] Oracle patch not found for task "${this.taskId}" at ${patchPath}: ${e}`
      );
    }

    if (typeof patchModule.applyOracle !== "function") {
      throw new Error(
        `[mock-oracle] Patch module for "${this.taskId}" does not export applyOracle function.`
      );
    }

    const modifiedFiles = patchModule.applyOracle({ ...input.contextFiles });

    return {
      modifiedFiles,
      rawResponse: `[mock-oracle] Applied oracle patch for task "${this.taskId}".`,
      tokenUsage: { input: 0, output: 0 },
      latencyMs: Date.now() - start,
    };
  }
}
