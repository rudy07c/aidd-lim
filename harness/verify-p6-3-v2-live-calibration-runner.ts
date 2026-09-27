import * as assert from "assert";
import {
  buildP63CalibrationPlan,
  type P63CalibrationCell,
  type P63FrozenBudgets,
} from "./src/p6/p6-3-live-calibration-runner";
import {
  applyP63V2ManualAdjudication,
  assertP63V2ResumeCompatible,
  createP63V2CalibrationState,
  executeP63V2Calibration,
  summarizeP63V2ExecutionState,
  type P63V2CalibrationPersistence,
  type P63V2CellOutcome,
  type P63V2ExecutionPolicy,
} from "./src/p6/p6-3-v2-live-calibration-runner";

const budgets: P63FrozenBudgets = {
  B0: 0,
  B1: 505,
  B2: 1011,
  B3: 2023,
  B4: 3034,
  AF: 4046,
};
const plan = buildP63CalibrationPlan(budgets);
const identity = {
  checkoutGitSha: "offline-v2-runner-test-sha",
  frozenManifestHashes: { design: "offline-test" },
};
const executionPolicy: P63V2ExecutionPolicy = {
  maxScientificAttemptsPerLogicalCell: 3,
};

async function main(): Promise<void> {
  await verifyUnattendedRetryExhaustionAndCollectionContinuation();
  await verifyCleanCollectionSelectionEligibility();
  await verifyUnknownInfrastructureFailsClosed();
  await verifyMissingRawEvidenceFailsClosed();
  await verifyInterruptedAttemptFailsClosed();
  verifyManualResolutionAndResume();
  verifyResumeRejectsPolicyDrift();
  console.log("P6-3 v2 unattended runner offline verification passed");
}

async function verifyUnattendedRetryExhaustionAndCollectionContinuation(): Promise<void> {
  const state = createP63V2CalibrationState({ ...identity, plan, executionPolicy });
  const persistence = memoryPersistence();
  let calls = 0;
  const executor = {
    execute: async (cell: P63CalibrationCell, attempt: number): Promise<P63V2CellOutcome> => {
      calls += 1;
      if (cell.sequence === 0 && attempt < 3) return maxOutputOutcome(cell, attempt);
      if (cell.sequence === 1) return maxOutputOutcome(cell, attempt);
      return scientificSuccess(cell, attempt);
    },
  };

  await executeP63V2Calibration(
    state,
    { ...identity, executionPolicy },
    plan,
    executor,
    persistence
  );

  const summary = summarizeP63V2ExecutionState(state);
  assert.equal(state.status, "needs-design-audit");
  assert.equal(state.cursorCellIndex, 864);
  assert.equal(state.exhaustedCells.length, 1);
  assert.deepEqual(
    pick(state.exhaustedCells[0], ["sequence", "attempts", "status"]),
    { sequence: 1, attempts: 3, status: "censored-exhausted" }
  );
  assert.equal(summary.collectionComplete, true);
  assert.equal(summary.bExposeSelectionEligible, false);
  assert.equal(summary.automaticInfrastructureInvalid, 5);
  assert.equal(summary.replacementAttempts, 4);
  assert.equal(summary.scientificAttempts, 868);
  assert.equal(calls, 868);
  assert.ok(persistence.persistCount > 864, "state should be persisted throughout retries and arm advancement");

  const seq0 = state.attempts.filter((entry) => entry.sequence === 0);
  assert.deepEqual(seq0.map((entry) => entry.attempt), [1, 2, 3]);
  assert.deepEqual(
    seq0.map((entry) => entry.adjudication?.source ?? null),
    ["automatic", "automatic", null]
  );
  const seq1 = state.attempts.filter((entry) => entry.sequence === 1);
  assert.deepEqual(seq1.map((entry) => entry.attempt), [1, 2, 3]);
  assert.ok(seq1.every((entry) => entry.adjudication?.source === "automatic"));
  assert.ok(seq1.every((entry) => entry.autoInfrastructureClassification?.ruleId === "AUTO-INFRA-001"));
}

async function verifyCleanCollectionSelectionEligibility(): Promise<void> {
  const state = createP63V2CalibrationState({ ...identity, plan, executionPolicy });
  await executeP63V2Calibration(
    state,
    { ...identity, executionPolicy },
    plan,
    { execute: async (cell, attempt) => scientificSuccess(cell, attempt) },
    memoryPersistence()
  );
  const summary = summarizeP63V2ExecutionState(state);
  assert.equal(state.status, "completed");
  assert.equal(summary.collectionComplete, true);
  assert.equal(summary.exhaustedLogicalCells, 0);
  assert.equal(summary.bExposeSelectionEligible, true);
  assert.equal(summary.scientificAttempts, 864);
}

async function verifyUnknownInfrastructureFailsClosed(): Promise<void> {
  const state = createP63V2CalibrationState({ ...identity, plan, executionPolicy });
  await executeP63V2Calibration(
    state,
    { ...identity, executionPolicy },
    plan,
    {
      execute: async (cell, attempt) => ({
        ...baseOutcome(cell, attempt),
        failureDomain: "infrastructure",
        executionStatus: "response-failed",
        passed: false,
        protocolValid: null,
        failureReason: "provider response failed",
        autoInfrastructureEvidence: {
          executionStatus: "response-failed",
          incompleteReason: null,
          outputTokens: 0,
          configuredMaxOutputTokens: 7000,
          responseStatus: "failed",
          providerErrorCode: null,
          errorCategory: "response",
        },
      }),
    },
    memoryPersistence()
  );
  assert.equal(state.status, "needs-audit");
  assert.equal(state.cursorCellIndex, 0);
  assert.equal(state.nextAttempt, 1);
  assert.equal(state.auditFlag?.kind, "unrecognized-infrastructure-state");
  assert.equal(state.attempts.length, 1);
  assert.equal(state.attempts[0].autoInfrastructureClassification?.disposition, "needs-audit");
}

async function verifyMissingRawEvidenceFailsClosed(): Promise<void> {
  const state = createP63V2CalibrationState({ ...identity, plan, executionPolicy });
  await executeP63V2Calibration(
    state,
    { ...identity, executionPolicy },
    plan,
    {
      execute: async (cell, attempt) => ({
        ...baseOutcome(cell, attempt),
        failureDomain: "infrastructure",
        executionStatus: "response-incomplete",
        passed: false,
        protocolValid: null,
        failureReason: "missing raw evidence",
      }),
    },
    memoryPersistence()
  );
  assert.equal(state.status, "needs-audit");
  assert.equal(state.auditFlag?.kind, "unrecognized-infrastructure-state");
  assert.equal(state.attempts[0].autoInfrastructureClassification, null);
}

async function verifyInterruptedAttemptFailsClosed(): Promise<void> {
  const state = createP63V2CalibrationState({ ...identity, plan, executionPolicy });
  state.inFlight = { sequence: 0, attempt: 1, startedAt: new Date().toISOString() };
  let called = false;
  await executeP63V2Calibration(
    state,
    { ...identity, executionPolicy },
    plan,
    { execute: async (cell, attempt) => { called = true; return scientificSuccess(cell, attempt); } },
    memoryPersistence()
  );
  assert.equal(called, false);
  assert.equal(state.status, "needs-audit");
  assert.equal(state.auditFlag?.kind, "uncertain-in-flight-attempt");
  assert.equal(state.interruptedAttempts.length, 1);
}

function verifyManualResolutionAndResume(): void {
  const state = createP63V2CalibrationState({ ...identity, plan, executionPolicy });
  state.status = "needs-audit";
  state.auditFlag = {
    kind: "unrecognized-infrastructure-state",
    sequence: 0,
    attempt: 1,
    reason: "offline manual resolution test",
    createdAt: new Date().toISOString(),
  };
  state.attempts.push({
    sequence: 0,
    measurement: plan[0].measurement,
    taskId: plan[0].taskId,
    repeat: plan[0].repeat,
    armLabel: plan[0].arm.label,
    armKind: plan[0].arm.kind,
    budgetTokens: plan[0].budgetTokens,
    attempt: 1,
    rawFailureDomain: "infrastructure",
    effectiveFailureDomain: "infrastructure",
    executionStatus: "response-failed",
    passed: false,
    semanticScore: 0,
    protocolValid: null,
    estimatedCostUsd: 0,
    failureReason: "offline",
    exposure: exposure(plan[0]),
    diagnosticSummary: {},
    autoInfrastructureEvidence: null,
    autoInfrastructureClassification: null,
    adjudication: null,
    artifactPath: "offline.json",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });

  applyP63V2ManualAdjudication(state, plan, {
    sequence: 0,
    attempt: 1,
    reviewer: "offline-human",
    reason: "explicitly reviewed unknown infrastructure state",
    finalDisposition: "infrastructure-invalid",
  });
  assert.equal(state.status, "running");
  assert.equal(state.cursorCellIndex, 0);
  assert.equal(state.nextAttempt, 2);
  assert.equal(state.attempts[0].adjudication?.source, "manual");
}

function verifyResumeRejectsPolicyDrift(): void {
  const state = createP63V2CalibrationState({ ...identity, plan, executionPolicy });
  assert.throws(() => assertP63V2ResumeCompatible(state, {
    ...identity,
    plan,
    executionPolicy: { maxScientificAttemptsPerLogicalCell: 4 },
  }), /execution policy changed/);
}

function maxOutputOutcome(cell: P63CalibrationCell, attempt: number): P63V2CellOutcome {
  return {
    ...baseOutcome(cell, attempt),
    failureDomain: "infrastructure",
    executionStatus: "response-incomplete",
    passed: false,
    semanticScore: 0,
    protocolValid: null,
    failureReason: "Response status=incomplete reason=max_output_tokens",
    autoInfrastructureEvidence: {
      executionStatus: "response-incomplete",
      incompleteReason: "max_output_tokens",
      outputTokens: 7000,
      configuredMaxOutputTokens: 7000,
      responseStatus: "incomplete",
      providerErrorCode: null,
      errorCategory: "response",
    },
  };
}

function scientificSuccess(cell: P63CalibrationCell, attempt: number): P63V2CellOutcome {
  return {
    ...baseOutcome(cell, attempt),
    failureDomain: "none",
    executionStatus: "ok",
    passed: cell.measurement === "M" ? true : null,
    semanticScore: 1,
    protocolValid: true,
    failureReason: null,
    autoInfrastructureEvidence: null,
  };
}

function baseOutcome(cell: P63CalibrationCell, attempt: number): P63V2CellOutcome {
  return {
    failureDomain: "none",
    executionStatus: "ok",
    passed: true,
    semanticScore: 1,
    protocolValid: true,
    estimatedCostUsd: 0,
    failureReason: null,
    exposure: exposure(cell),
    diagnosticSummary: {},
    artifactPayload: { sequence: cell.sequence, attempt },
    autoInfrastructureEvidence: null,
  };
}

function exposure(cell: P63CalibrationCell): P63V2CellOutcome["exposure"] {
  return {
    mode: cell.arm.kind === "AF" ? "AF-full" : "EL-static",
    budgetTokens: cell.budgetTokens,
    actualExposedTokens: cell.arm.kind === "AF" ? 4046 : Number(cell.budgetTokens),
    fullRepositoryTokens: 4046,
    staticPayloadHash: `offline-${cell.sequence}`,
    exposureSetHash: cell.arm.kind === "AF" ? null : `set-${cell.sequence}`,
    selectorPlanHash: cell.arm.kind === "AF" ? null : `plan-${cell.sequence}`,
    selectedUnitCount: cell.arm.kind === "AF" ? null : 1,
  };
}

function memoryPersistence(): P63V2CalibrationPersistence & { persistCount: number } {
  const persistence = {
    persistCount: 0,
    persistState: () => { persistence.persistCount += 1; },
    persistAttemptArtifact: (cell: P63CalibrationCell, attempt: number) =>
      `attempts/${cell.sequence}-${attempt}.json`,
  };
  return persistence;
}

function pick<T extends object>(value: T, keys: readonly (keyof T)[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [String(key), value[key]]));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
