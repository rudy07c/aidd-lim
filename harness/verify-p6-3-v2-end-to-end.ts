import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { AgentBackend, AgentResult } from "./src/agent-backend/types";
import {
  buildP63CalibrationPlan,
  type P63CalibrationCell,
  type P63ExposureEvidence,
} from "./src/p6/p6-3-live-calibration-runner";
import {
  applyP63V2ManualAdjudication,
  type P63V2ExecutionPolicy,
} from "./src/p6/p6-3-v2-live-calibration-runner";
import {
  P6_3_V2_SECONDARY_RELIABILITY_ARTIFACT_SCHEMA,
  type P63V2ReliabilityCellOutcome,
} from "./src/p6/p6-3-v2-secondary-reliability";
import {
  createP63V2FilePersistence,
  createP63V2ProviderExecutor,
  loadOrCreateP63V2State,
  runP63V2EndToEnd,
} from "./src/p6/p6-3-v2-end-to-end";

const budgets = {
  B0: 0,
  B1: 505,
  B2: 1011,
  B3: 2023,
  B4: 3034,
  AF: 4046,
};
const fullPlan = buildP63CalibrationPlan(budgets);
const identity = {
  checkoutGitSha: "offline-e2e-sha",
  frozenManifestHashes: {
    structuralFreeze: "offline-structural",
    executionParameters: "offline-execution",
  },
};
const executionPolicy: P63V2ExecutionPolicy = {
  maxScientificAttemptsPerLogicalCell: 3,
};

async function main(): Promise<void> {
  await verifyProviderExecutorRoutesThroughV2Adapters();
  await verifyClean864CellCollectionAndIdempotentResume();
  await verifyCensorRetryExhaustionPropagation();
  await verifyInterruptedResumeNeverBlindlyRepeats();
  await verifyUnknownInfrastructureStillFailsClosed();
  console.log(JSON.stringify({
    ok: true,
    fullPlanCells: fullPlan.length,
    filePersistenceUsesReliabilityArtifactAtRoot: true,
    clean864CollectionVerified: true,
    retryAndExhaustionPropagationVerified: true,
    interruptedResumeNoBlindRetryVerified: true,
    unknownInfrastructureFailsClosed: true,
    providerAdapterRoutingVerified: true,
  }));
}

async function verifyProviderExecutorRoutesThroughV2Adapters(): Promise<void> {
  const mCell = fullPlan.find((cell) => cell.measurement === "M");
  const rsemCell = fullPlan.find((cell) => cell.measurement === "Rsem");
  assert.ok(mCell && rsemCell);

  let mutationFactoryCalls = 0;
  let rsemCalls = 0;
  const providerExecutor = createP63V2ProviderExecutor({
    resolver: {
      resolveM: (cell) => ({
        contextFiles: {},
        evaluationRepository: {},
        syntheticWorldDir: "/offline-unused",
        task: {
          taskId: cell.taskId!,
          visibleInstruction: "offline provider routing test",
        },
        exposure: exposure(cell),
      }),
      resolveRSem: (cell) => ({
        contextFiles: {},
        probes: [],
        exposure: exposure(cell),
      }),
    },
    mutationBackendFactory: () => {
      mutationFactoryCalls += 1;
      return fakeBackend(maxOutputAgent());
    },
    rsemRunner: async (_repository, _probes, repeat) => {
      rsemCalls += 1;
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
          responseId: "resp-offline-rsem",
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

  const mOutcome = await providerExecutor.execute(mCell, 1);
  assert.equal(mutationFactoryCalls, 1);
  assert.equal(mOutcome.failureDomain, "infrastructure");
  assert.equal(mOutcome.reliabilityTelemetry.configuredMaxOutputTokens, 14000);
  assert.equal(mOutcome.autoInfrastructureEvidence?.outputTokens, 14000);

  const rsemOutcome = await providerExecutor.execute(rsemCell, 1);
  assert.equal(rsemCalls, 1);
  assert.equal(rsemOutcome.failureDomain, "none");
  assert.equal(rsemOutcome.reliabilityTelemetry.configuredMaxOutputTokens, 8000);
}

async function verifyClean864CellCollectionAndIdempotentResume(): Promise<void> {
  const root = tempRun("clean-864");
  const statePath = path.join(root, "result.json");
  const persistence = createP63V2FilePersistence({ statePath });
  const loaded = loadOrCreateP63V2State({
    statePath,
    ...identity,
    plan: fullPlan,
    executionPolicy,
  });
  assert.equal(loaded.resumed, false);
  await persistence.persistState(loaded.state);

  let calls = 0;
  const first = await runP63V2EndToEnd({
    state: loaded.state,
    identity: { ...identity, executionPolicy },
    plan: fullPlan,
    rawExecutor: {
      execute: async (cell, attempt) => {
        calls += 1;
        return successOutcome(cell, attempt);
      },
    },
    persistence,
  });

  assert.equal(calls, 864);
  assert.equal(first.state.status, "completed");
  assert.equal(first.execution.logicalCellsCompleted, 864);
  assert.equal(first.execution.bExposeSelectionEligible, true);
  assert.equal(first.finalReport?.reliability.committedAttemptCount, 864);
  assert.equal(first.finalReport?.reliability.exhaustedCellLocations.length, 0);
  assert.equal(first.finalReportPath, "final-report.json");
  assert.ok(fs.existsSync(path.join(root, "final-report.json")));

  const firstAttemptPath = first.state.attempts[0]?.artifactPath;
  assert.ok(firstAttemptPath);
  const firstArtifact = JSON.parse(
    fs.readFileSync(path.join(root, firstAttemptPath!), "utf8")
  );
  assert.equal(
    firstArtifact.schemaVersion,
    P6_3_V2_SECONDARY_RELIABILITY_ARTIFACT_SCHEMA,
    "attempt artifact must be the reliability wrapper at file root"
  );
  assert.equal(firstArtifact.identity.sequence, 0);
  assert.equal(firstArtifact.identity.attempt, 1);
  assert.equal("payload" in firstArtifact, false, "v1-style {cell,attempt,payload} wrapper must not be reintroduced");

  const resumed = loadOrCreateP63V2State({
    statePath,
    ...identity,
    plan: fullPlan,
    executionPolicy,
  });
  assert.equal(resumed.resumed, true);
  let resumeCalls = 0;
  const second = await runP63V2EndToEnd({
    state: resumed.state,
    identity: { ...identity, executionPolicy },
    plan: fullPlan,
    rawExecutor: {
      execute: async () => {
        resumeCalls += 1;
        throw new Error("terminal resume must not execute another provider call");
      },
    },
    persistence,
  });
  assert.equal(resumeCalls, 0);
  assert.equal(second.state.status, "completed");
  assert.equal(second.finalReportPath, "final-report.json");
}

async function verifyCensorRetryExhaustionPropagation(): Promise<void> {
  const plan = fullPlan.slice(0, 3);
  const root = tempRun("exhaustion");
  const statePath = path.join(root, "result.json");
  const persistence = createP63V2FilePersistence({ statePath });
  const { state } = loadOrCreateP63V2State({
    statePath,
    ...identity,
    plan,
    executionPolicy,
  });
  await persistence.persistState(state);

  const result = await runP63V2EndToEnd({
    state,
    identity: { ...identity, executionPolicy },
    plan,
    rawExecutor: {
      execute: async (cell, attempt) => {
        if (cell.sequence === 0 && attempt === 1) return censoredOutcome(cell, attempt);
        if (cell.sequence === 1) return censoredOutcome(cell, attempt);
        return successOutcome(cell, attempt);
      },
    },
    persistence,
  });

  assert.equal(result.state.status, "needs-design-audit");
  assert.equal(result.state.attempts.length, 6);
  assert.equal(result.state.exhaustedCells.length, 1);
  assert.equal(result.state.exhaustedCells[0]?.sequence, 1);
  assert.equal(result.execution.bExposeSelectionEligible, false);
  assert.equal(result.finalReport?.reliability.maxOutputCensoredAttemptCount, 4);
  assert.equal(result.finalReport?.reliability.exhaustedCellLocations.length, 1);
  assert.equal(result.finalReport?.reliability.logicalCells[0]?.attemptsToValidScientificObservation, 2);
  assert.equal(result.finalReport?.reliability.logicalCells[1]?.censoredExhausted, true);
}

async function verifyInterruptedResumeNeverBlindlyRepeats(): Promise<void> {
  const plan = fullPlan.slice(0, 1);
  const root = tempRun("interrupted");
  const statePath = path.join(root, "result.json");
  const persistence = createP63V2FilePersistence({ statePath });
  const created = loadOrCreateP63V2State({
    statePath,
    ...identity,
    plan,
    executionPolicy,
  });
  created.state.inFlight = {
    sequence: 0,
    attempt: 1,
    startedAt: "2026-09-27T00:00:00.000Z",
  };
  await persistence.persistState(created.state);

  const resumed = loadOrCreateP63V2State({
    statePath,
    ...identity,
    plan,
    executionPolicy,
  });
  assert.equal(resumed.resumed, true);
  let calls = 0;
  const paused = await runP63V2EndToEnd({
    state: resumed.state,
    identity: { ...identity, executionPolicy },
    plan,
    rawExecutor: {
      execute: async (cell, attempt) => {
        calls += 1;
        return successOutcome(cell, attempt);
      },
    },
    persistence,
  });
  assert.equal(calls, 0, "uncertain in-flight attempt must never be blindly repeated");
  assert.equal(paused.state.status, "needs-audit");
  assert.equal(paused.state.interruptedAttempts.length, 1);
  assert.equal(paused.finalReport, null);
  assert.equal(fs.existsSync(path.join(root, "final-report.json")), false);

  applyP63V2ManualAdjudication(paused.state, plan, {
    sequence: 0,
    attempt: 1,
    reviewer: "offline-reviewer",
    reason: "offline interruption fixture explicitly invalidated",
    finalDisposition: "infrastructure-invalid",
  });
  await persistence.persistState(paused.state);

  const completed = await runP63V2EndToEnd({
    state: paused.state,
    identity: { ...identity, executionPolicy },
    plan,
    rawExecutor: {
      execute: async (cell, attempt) => {
        calls += 1;
        assert.equal(attempt, 2);
        return successOutcome(cell, attempt);
      },
    },
    persistence,
  });
  assert.equal(calls, 1);
  assert.equal(completed.state.status, "completed");
  assert.equal(completed.finalReport?.reliability.interruptedAttemptCount, 1);
  assert.equal(completed.finalReport?.reliability.committedAttemptCount, 1);
  assert.equal(completed.finalReport?.reliability.providerVisibleAttemptCount, 2);
  assert.equal(completed.finalReport?.reliability.logicalCells[0]?.attemptsToValidScientificObservation, 2);
}

async function verifyUnknownInfrastructureStillFailsClosed(): Promise<void> {
  const plan = fullPlan.slice(0, 1);
  const root = tempRun("unknown-infra");
  const statePath = path.join(root, "result.json");
  const persistence = createP63V2FilePersistence({ statePath });
  const { state } = loadOrCreateP63V2State({
    statePath,
    ...identity,
    plan,
    executionPolicy,
  });
  await persistence.persistState(state);

  const result = await runP63V2EndToEnd({
    state,
    identity: { ...identity, executionPolicy },
    plan,
    rawExecutor: {
      execute: async (cell, attempt) => ambiguousInfrastructureOutcome(cell, attempt),
    },
    persistence,
  });

  assert.equal(result.state.status, "needs-audit");
  assert.equal(result.state.cursorCellIndex, 0);
  assert.equal(result.state.auditFlag?.kind, "unrecognized-infrastructure-state");
  assert.equal(result.finalReport, null);
  assert.equal(fs.existsSync(path.join(root, "final-report.json")), false);
}

function successOutcome(
  cell: P63CalibrationCell,
  attempt: number
): P63V2ReliabilityCellOutcome {
  const cap = cell.measurement === "M" ? 14000 : 8000;
  return {
    failureDomain: "none",
    executionStatus: "ok",
    passed: cell.measurement === "M" ? true : null,
    semanticScore: 1,
    protocolValid: true,
    estimatedCostUsd: 0,
    failureReason: null,
    exposure: exposure(cell),
    diagnosticSummary: {},
    artifactPayload: { scientific: "success", sequence: cell.sequence, attempt },
    autoInfrastructureEvidence: null,
    reliabilityTelemetry: {
      tokenUsage: { input: 10, output: 20, reasoningOutput: 5, total: 30 },
      configuredMaxOutputTokens: cap,
      incompleteReason: null,
    },
  };
}

function censoredOutcome(
  cell: P63CalibrationCell,
  attempt: number
): P63V2ReliabilityCellOutcome {
  const cap = cell.measurement === "M" ? 14000 : 8000;
  return {
    failureDomain: "infrastructure",
    executionStatus: "response-incomplete",
    passed: false,
    semanticScore: 0,
    protocolValid: null,
    estimatedCostUsd: 0,
    failureReason: "max_output_tokens",
    exposure: exposure(cell),
    diagnosticSummary: {},
    artifactPayload: { scientific: "censored", sequence: cell.sequence, attempt },
    autoInfrastructureEvidence: {
      executionStatus: "response-incomplete",
      incompleteReason: "max_output_tokens",
      outputTokens: cap,
      configuredMaxOutputTokens: cap,
      responseStatus: "incomplete",
      providerErrorCode: null,
      errorCategory: "response",
    },
    reliabilityTelemetry: {
      tokenUsage: { input: 10, output: cap, reasoningOutput: cap - 100, total: cap + 10 },
      configuredMaxOutputTokens: cap,
      incompleteReason: "max_output_tokens",
    },
  };
}

function ambiguousInfrastructureOutcome(
  cell: P63CalibrationCell,
  attempt: number
): P63V2ReliabilityCellOutcome {
  const cap = cell.measurement === "M" ? 14000 : 8000;
  return {
    failureDomain: "infrastructure",
    executionStatus: "response-incomplete",
    passed: false,
    semanticScore: 0,
    protocolValid: null,
    estimatedCostUsd: 0,
    failureReason: "opaque incomplete response",
    exposure: exposure(cell),
    diagnosticSummary: {},
    artifactPayload: { scientific: "ambiguous", sequence: cell.sequence, attempt },
    autoInfrastructureEvidence: {
      executionStatus: "response-incomplete",
      incompleteReason: null,
      outputTokens: cap,
      configuredMaxOutputTokens: cap,
      responseStatus: "incomplete",
      providerErrorCode: null,
      errorCategory: "response",
    },
    reliabilityTelemetry: {
      tokenUsage: { input: 10, output: cap, reasoningOutput: cap - 100, total: cap + 10 },
      configuredMaxOutputTokens: cap,
      incompleteReason: null,
    },
  };
}

function exposure(cell: P63CalibrationCell): P63ExposureEvidence {
  const af = cell.arm.kind === "AF";
  return {
    mode: af ? "AF-full" : "EL-static",
    budgetTokens: cell.budgetTokens,
    actualExposedTokens: af ? 4046 : Number(cell.budgetTokens),
    fullRepositoryTokens: 4046,
    staticPayloadHash: `offline-payload-${cell.sequence}`,
    exposureSetHash: af ? null : `offline-set-${cell.sequence}`,
    selectorPlanHash: af ? null : `offline-plan-${cell.sequence}`,
    selectedUnitCount: af ? null : (cell.budgetTokens === 0 ? 0 : 1),
  };
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
      responseId: "resp-offline-m",
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

function fakeBackend(result: AgentResult): AgentBackend {
  return { run: async () => result };
}

function tempRun(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `p6-3-v2-e2e-${name}-`));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
