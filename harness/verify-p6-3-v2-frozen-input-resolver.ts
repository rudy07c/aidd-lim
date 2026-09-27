import * as assert from "assert";
import * as path from "path";
import type { AgentBackend, AgentResult } from "./src/agent-backend/types";
import { buildP63CalibrationPlan } from "./src/p6/p6-3-live-calibration-runner";
import { createP63V2ProviderExecutor } from "./src/p6/p6-3-v2-end-to-end";
import { loadP63V2FrozenRuntimeInputs } from "./src/p6/p6-3-v2-frozen-input-resolver";

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, "..");
  const frozen = loadP63V2FrozenRuntimeInputs({ repoRoot });
  assert.equal(frozen.structural.tEl, 4046);
  assert.equal(frozen.structural.staticExposureMaxTokensPerUnit, 256);
  assert.deepEqual(frozen.structural.budgets, {
    B0: 0,
    B1: 505,
    B2: 1011,
    B3: 2023,
    B4: 3034,
    AF: 4046,
  });
  assert.equal(frozen.structural.primaryMTaskIds.length, 11);
  assert.equal(frozen.probes.length, 12);

  const plan = buildP63CalibrationPlan(
    frozen.structural.budgets,
    [...frozen.structural.primaryMTaskIds]
  );
  assert.equal(plan.length, 864);

  const unique = new Map<string, (typeof plan)[number]>();
  for (const cell of plan) {
    const key = `${cell.measurement}:${cell.taskId ?? "bank-12"}:${cell.arm.label}`;
    if (!unique.has(key)) unique.set(key, cell);
  }
  assert.equal(unique.size, 72, "11 M tasks x 6 arms plus one Rsem bank x 6 arms");

  let afChecks = 0;
  let elChecks = 0;
  for (const cell of unique.values()) {
    const input = cell.measurement === "M"
      ? await frozen.resolver.resolveM(cell)
      : await frozen.resolver.resolveRSem(cell);
    const exposure = input.exposure;
    if (cell.arm.kind === "AF") {
      afChecks += 1;
      assert.equal(exposure.mode, "AF-full");
      assert.equal(exposure.budgetTokens, "full");
      assert.equal(exposure.actualExposedTokens, 4046);
      assert.equal(exposure.fullRepositoryTokens, 4046);
      assert.equal(exposure.staticPayloadHash, frozen.structural.repositoryPayloadSha256);
      assert.equal(Object.keys(input.contextFiles).length, Object.keys(frozen.repository).length);
    } else {
      elChecks += 1;
      assert.equal(exposure.mode, "EL-static");
      assert.equal(exposure.budgetTokens, cell.budgetTokens);
      assert.ok(exposure.actualExposedTokens <= Number(cell.budgetTokens));
      assert.equal(exposure.fullRepositoryTokens, 4046);
      if (cell.arm.label === "B0") {
        assert.equal(exposure.actualExposedTokens, 0);
        assert.equal(Object.keys(input.contextFiles).length, 0);
      }
    }
  }
  assert.equal(afChecks, 12);
  assert.equal(elChecks, 60);

  const mCell = plan.find((cell) => cell.measurement === "M" && cell.arm.label === "B1")!;
  const rsemCell = plan.find((cell) => cell.measurement === "Rsem" && cell.arm.label === "B1")!;
  let mutationFactoryCalls = 0;
  let rsemCalls = 0;
  const executor = createP63V2ProviderExecutor({
    resolver: frozen.resolver,
    mutationBackendFactory: () => {
      mutationFactoryCalls += 1;
      return fakeBackend(maxOutputAgent());
    },
    rsemRunner: async (_repository, probes, repeat) => {
      rsemCalls += 1;
      assert.equal(probes.length, 12);
      return {
        repeat,
        designVersion: "stage1-neutral-relation-v2",
        executionStatus: "ok",
        validity: "valid",
        failureDomain: "none",
        rawFailureDomain: "none",
        adjudication: null,
        protocolValid: true,
        failureReason: null,
        rawResponse: "{}",
        modelProvenance: {
          provider: "openai",
          requestedModel: "gpt-5.6-luna",
          actualModel: "gpt-5.6-luna",
          responseId: "resp-frozen-rsem-offline",
          responseStatus: "completed",
          reasoningEffort: "high",
          providerErrorCode: null,
        },
        booleanCorrect: 12,
        booleanTotal: 12,
        booleanAccuracy: 1,
        probeDetails: [],
        actualModel: "gpt-5.6-luna",
        usage: { input: 10, output: 20, reasoningOutput: 5, total: 30 },
        estimatedCostUsd: 0,
      } as any;
    },
  });

  const m = await executor.execute(mCell, 1);
  assert.equal(mutationFactoryCalls, 1);
  assert.equal(m.failureDomain, "infrastructure");
  assert.equal(m.exposure.mode, "EL-static");
  assert.equal(m.exposure.budgetTokens, 505);
  assert.equal(m.reliabilityTelemetry.configuredMaxOutputTokens, 14000);

  const rsem = await executor.execute(rsemCell, 1);
  assert.equal(rsemCalls, 1);
  assert.equal(rsem.failureDomain, "none");
  assert.equal(rsem.exposure.mode, "EL-static");
  assert.equal(rsem.exposure.budgetTokens, 505);
  assert.equal(rsem.reliabilityTelemetry.configuredMaxOutputTokens, 8000);

  console.log(JSON.stringify({
    ok: true,
    logicalCells: plan.length,
    uniqueFrozenExposureCases: unique.size,
    afChecks,
    elChecks,
    actualFrozenResolverToV2AdaptersVerified: true,
  }));
}

function fakeBackend(result: AgentResult): AgentBackend {
  return { run: async () => result };
}

function maxOutputAgent(): AgentResult {
  return {
    modifiedFiles: {},
    rawResponse: "",
    observableAssistantMessages: [],
    explicitWorkingNote: null,
    toolEvents: [],
    tokenUsage: { input: 10, output: 14000, reasoningOutput: 13900, total: 14010 },
    latencyMs: 1,
    executionStatus: "response-incomplete",
    modelProvenance: {
      provider: "openai",
      requestedModel: "gpt-5.6-luna",
      actualModel: "gpt-5.6-luna",
      responseId: "resp-frozen-m-offline",
      responseStatus: "incomplete",
      endpoint: "responses",
      reasoningEffort: "high",
      maxOutputTokens: 14000,
      structuredOutput: true,
      storeResponses: false,
      requestedServiceTier: "default",
      actualServiceTier: "default",
      promptCacheMode: "implicit",
      promptVersion: "offline",
      promptHash: "offline",
      schemaVersion: "offline",
      schemaHash: "offline",
      pricingMode: "sync",
      continuationState: "none",
      incompleteReason: "max_output_tokens",
      refusal: null,
      providerErrorCode: null,
      sdkVersion: "offline",
      retryPolicy: { maxRetries: 2, timeoutMs: 180000 },
    },
    estimatedCostUsd: 0,
    error: {
      category: "response",
      message: "max_output_tokens",
      retryable: false,
    },
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
