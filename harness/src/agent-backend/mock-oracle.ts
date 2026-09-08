// harness/src/agent-backend/mock-oracle.ts

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

    return {
      modifiedFiles,
      rawResponse: `[mock-oracle] Applied oracle patch for task "${this.taskId}".`,
      explicitWorkingNote: null,
      toolEvents: [],
      tokenUsage: { input: 0, output: 0, total: 0 },
      latencyMs: Date.now() - start,
      executionStatus: "ok",
      modelProvenance: {
        provider: "mock", requestedModel: null, actualModel: "mock-oracle", responseId: null,
        responseStatus: "completed", endpoint: "mock", reasoningEffort: null, maxOutputTokens: null,
        structuredOutput: true, storeResponses: null, serviceTier: null, sdkVersion: null,
        retryPolicy: { maxRetries: null, timeoutMs: null },
      },
      estimatedCostUsd: 0,
      error: null,
    };
  }
}
