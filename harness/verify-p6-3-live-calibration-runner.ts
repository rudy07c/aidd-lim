import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  P6_3_EXPECTED_M_CALL_COUNT,
  P6_3_EXPECTED_NORMAL_CALL_COUNT,
  P6_3_EXPECTED_RSEM_CALL_COUNT,
  applyP63Adjudication,
  buildP63CalibrationPlan,
  createP63CalibrationState,
  executeP63Calibration,
  summarizeP63ExecutionState,
  type P63CalibrationCell,
  type P63CalibrationPersistence,
  type P63CellOutcome,
  type P63FrozenBudgets,
} from "./src/p6/p6-3-live-calibration-runner";
import { buildP63CalibrationSchedule } from "./src/p6/p6-3-execution-protocol";
import { runP63UnifiedPreLiveGate } from "./src/p6/p6-3-unified-prelive-gate";

const EXPOSURE = {
  mode: "EL-static" as const,
  budgetTokens: 0,
  actualExposedTokens: 0,
  fullRepositoryTokens: 4046,
  staticPayloadHash: "0".repeat(64),
  exposureSetHash: "1".repeat(64),
  selectorPlanHash: "2".repeat(64),
  selectedUnitCount: 0,
};

function outcome(
  failureDomain: P63CellOutcome["failureDomain"] = "none"
): P63CellOutcome {
  return {
    failureDomain,
    executionStatus: failureDomain === "infrastructure" ? "provider-error" : "ok",
    passed: failureDomain === "none",
    semanticScore: failureDomain === "none" ? 1 : 0,
    protocolValid: failureDomain === "infrastructure" ? null : failureDomain !== "protocol",
    estimatedCostUsd: 0.001,
    failureReason: failureDomain === "none" ? null : `fixture-${failureDomain}`,
    exposure: EXPOSURE,
    diagnosticSummary: { fixture: true, failureDomain },
    artifactPayload: { fixture: true, failureDomain },
  };
}

function memoryPersistence(): P63CalibrationPersistence & { stateWrites: number; artifactWrites: number } {
  const value = {
    stateWrites: 0,
    artifactWrites: 0,
    persistState: () => {
      value.stateWrites += 1;
    },
    persistAttemptArtifact: (cell: P63CalibrationCell, attempt: number) => {
      value.artifactWrites += 1;
      return `attempts/cell-${cell.sequence}/attempt-${attempt}.json`;
    },
  };
  return value;
}

async function main(): Promise<void> {
  const harnessRoot = path.resolve(__dirname);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(harnessRoot, "frozen/p6-3-el-structural-freeze.json"), "utf8")
  ) as any;
  const budgets = manifest.freezeCandidate.budgets as P63FrozenBudgets;
  const primaryTaskIds = manifest.freezeCandidate.primaryMTaskIds as string[];
  const plan = buildP63CalibrationPlan(budgets, primaryTaskIds);

  assert.equal(plan.length, P6_3_EXPECTED_NORMAL_CALL_COUNT);
  assert.equal(plan.filter((cell) => cell.measurement === "M").length, P6_3_EXPECTED_M_CALL_COUNT);
  assert.equal(plan.filter((cell) => cell.measurement === "Rsem").length, P6_3_EXPECTED_RSEM_CALL_COUNT);

  const schedule = buildP63CalibrationSchedule();
  const firstTask = primaryTaskIds[0];
  for (const scheduled of schedule) {
    const block = plan.filter(
      (cell) => cell.measurement === "M" && cell.taskId === firstTask && cell.repeat === scheduled.repeat
    );
    assert.equal(block.length, 6);
    assert.deepEqual(
      block.map((cell) => cell.arm.label),
      scheduled.arms.map((arm) => arm.label),
      `arm order drifted for repeat ${scheduled.repeat}`
    );
    assert.equal(block[5].sequence - block[0].sequence, 5);
  }

  const rsemBlocks = new Map<number, P63CalibrationCell[]>();
  for (const cell of plan.filter((item) => item.measurement === "Rsem")) {
    const block = rsemBlocks.get(cell.repeat) ?? [];
    block.push(cell);
    rsemBlocks.set(cell.repeat, block);
  }
  assert.equal(rsemBlocks.size, 12);
  for (const block of rsemBlocks.values()) {
    assert.equal(block.length, 6);
    assert.equal(block[5].sequence - block[0].sequence, 5);
  }

  // Positive token comes only from the unified fail-closed gate. This remains
  // offline because the gate strips all provider credentials from child verifiers.
  const token = runP63UnifiedPreLiveGate(harnessRoot);
  assert.equal(token.receipt.liveAuthorized, false);

  assert.throws(
    () => createP63CalibrationState({ receipt: token.receipt } as any, plan),
    /valid unified pre-live gate pass token/,
    "unbranded receipt must not create a live calibration state"
  );

  // 1) Infrastructure outcome stops before the next arm.
  const state = createP63CalibrationState(token, plan);
  const persistence = memoryPersistence();
  const seen: Array<{ sequence: number; attempt: number }> = [];
  let first = true;
  await executeP63Calibration(
    state,
    token,
    plan,
    {
      execute: async (cell, attempt) => {
        seen.push({ sequence: cell.sequence, attempt });
        if (first) {
          first = false;
          return outcome("infrastructure");
        }
        return outcome("none");
      },
    },
    persistence
  );
  assert.equal(state.status, "needs-audit");
  assert.equal(state.cursorCellIndex, 0);
  assert.equal(state.attempts.length, 1);
  assert.equal(state.attempts[0].infrastructureAdjudication, "pending");
  assert.deepEqual(seen, [{ sequence: 0, attempt: 1 }]);

  // 2) Explicit infrastructure-invalid adjudication reopens the same cell and
  // increments scientific attempt, then the remaining 864-cell plan completes.
  applyP63Adjudication(state, plan, {
    sequence: 0,
    attempt: 1,
    reviewer: "offline-verifier",
    reason: "fixture infrastructure invalid",
    finalDisposition: "infrastructure-invalid",
    adjudicatedAt: "2026-09-26T00:00:00.000Z",
  });
  assert.equal(state.status, "running");
  assert.equal(state.cursorCellIndex, 0);
  assert.equal(state.nextAttempt, 2);

  await executeP63Calibration(
    state,
    token,
    plan,
    {
      execute: async (cell, attempt) => {
        seen.push({ sequence: cell.sequence, attempt });
        return outcome("none");
      },
    },
    persistence
  );
  assert.equal(state.status, "completed");
  assert.equal(state.cursorCellIndex, 864);
  assert.equal(state.attempts.length, 865);
  assert.deepEqual(seen.slice(0, 3), [
    { sequence: 0, attempt: 1 },
    { sequence: 0, attempt: 2 },
    { sequence: 1, attempt: 1 },
  ]);
  const summary = summarizeP63ExecutionState(state);
  assert.equal(summary.logicalCellsCompleted, 864);
  assert.equal(summary.replacementAttempts, 1);

  // 3) Three infrastructure-invalid scientific attempts exhaust the cell and
  // never advance to the next arm or launch a fourth attempt.
  const exhausted = createP63CalibrationState(token, plan);
  const exhaustedPersistence = memoryPersistence();
  let infraCalls = 0;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await executeP63Calibration(
      exhausted,
      token,
      plan,
      {
        execute: async (cell, actualAttempt) => {
          infraCalls += 1;
          assert.equal(cell.sequence, 0);
          assert.equal(actualAttempt, attempt);
          return outcome("infrastructure");
        },
      },
      exhaustedPersistence
    );
    assert.equal(exhausted.status, "needs-audit");
    assert.equal(exhausted.cursorCellIndex, 0);
    applyP63Adjudication(exhausted, plan, {
      sequence: 0,
      attempt,
      reviewer: "offline-verifier",
      reason: `fixture infrastructure invalid ${attempt}`,
      finalDisposition: "infrastructure-invalid",
      adjudicatedAt: `2026-09-26T00:00:0${attempt}.000Z`,
    });
  }
  assert.equal(infraCalls, 3);
  assert.equal(exhausted.status, "needs-audit");
  assert.equal(exhausted.auditFlag?.kind, "max-infrastructure-attempts-exhausted");
  assert.equal(exhausted.attempts.length, 3);
  assert.equal(exhausted.cursorCellIndex, 0);

  // 4) A system-domain outcome is scientific under the frozen protocol and
  // advances; the next infrastructure cell then proves ordering was preserved.
  const systemState = createP63CalibrationState(token, plan);
  const systemPersistence = memoryPersistence();
  const systemSeen: number[] = [];
  await executeP63Calibration(
    systemState,
    token,
    plan,
    {
      execute: async (cell) => {
        systemSeen.push(cell.sequence);
        if (cell.sequence === 0) return outcome("system");
        return outcome("infrastructure");
      },
    },
    systemPersistence
  );
  assert.deepEqual(systemSeen, [0, 1]);
  assert.equal(systemState.cursorCellIndex, 1);
  assert.equal(systemState.status, "needs-audit");

  // 5) A persisted in-flight marker is never blindly retried on resume.
  const interrupted = createP63CalibrationState(token, plan);
  interrupted.inFlight = {
    sequence: 0,
    attempt: 1,
    startedAt: "2026-09-26T00:00:00.000Z",
  };
  let interruptedCalls = 0;
  await executeP63Calibration(
    interrupted,
    token,
    plan,
    {
      execute: async () => {
        interruptedCalls += 1;
        return outcome("none");
      },
    },
    memoryPersistence()
  );
  assert.equal(interruptedCalls, 0);
  assert.equal(interrupted.status, "needs-audit");
  assert.equal(interrupted.auditFlag?.kind, "uncertain-in-flight-attempt");

  console.log(JSON.stringify({
    status: "pass",
    planCells: plan.length,
    normalMCalls: P6_3_EXPECTED_M_CALL_COUNT,
    normalRsemCalls: P6_3_EXPECTED_RSEM_CALL_COUNT,
    infrastructureReplacementVerified: true,
    maxAttemptStopVerified: true,
    systemDomainAdvanceVerified: true,
    uncertainInFlightFailClosedVerified: true,
    providerCalls: 0,
  }, null, 2));
}

main().catch((error) => {
  console.error("verify-p6-3-live-calibration-runner failed:", error);
  process.exit(1);
});
