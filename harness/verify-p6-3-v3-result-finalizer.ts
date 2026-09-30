import assert from "assert";
import {
  P6_3_V3_CALIBRATION_RUNNER_VERSION,
  buildP63V3CalibrationPlan,
  p63V3CalibrationPlanHash,
  type P63V3CalibrationCell,
} from "./src/p6/p6-3-v3-calibration-runner";
import {
  P6_3_V3_LIVE_CONTROLLER_VERSION,
  P6_3_V3_LIVE_STATE_SCHEMA,
  type P63V3AttemptRecord,
  type P63V3InterruptedAttemptRecord,
  type P63V3LiveCalibrationState,
} from "./src/p6/p6-3-v3-live-controller";
import {
  finalizeP63V3Calibration,
  P6_3_V3_RESULT_FINALIZER_VERSION,
  P6_3_V3_RESULT_SCHEMA,
} from "./src/p6/p6-3-v3-result-finalizer";
import type { P63ExposureEvidence } from "./src/p6/p6-3-live-calibration-runner";
import type { P63V3ArmLabel } from "./src/p6/p6-3-v3-calibration-predeclaration";

const NOW = "2026-09-30T00:00:00.000Z";
const CHECKOUT = "c".repeat(40);
const TREATMENT = "t".repeat(64);
const FIXED = "f".repeat(64);
const AUTH = "a".repeat(64);
const SCORING_REPLACEMENT_SEQUENCE = 792;
const INTERRUPTED_REPLACEMENT_SEQUENCE = 10;

interface SyntheticProfile {
  readonly mPassTargets: Readonly<Record<P63V3ArmLabel, number>>;
  readonly rsemCorrectPerBank: Readonly<Record<P63V3ArmLabel, number>>;
}

const SELECT_B2_PROFILE: SyntheticProfile = {
  mPassTargets: { B0: 0, B1: 0, B2: 66, B3: 88, B4: 110, AF: 132 },
  rsemCorrectPerBank: { B0: 2, B1: 2, B2: 6, B3: 8, B4: 10, AF: 12 },
};

const NO_QUALIFIER_PROFILE: SyntheticProfile = {
  mPassTargets: { B0: 0, B1: 0, B2: 0, B3: 132, B4: 132, AF: 132 },
  rsemCorrectPerBank: { B0: 2, B1: 2, B2: 2, B3: 12, B4: 12, AF: 12 },
};

function exposure(cell: Readonly<P63V3CalibrationCell>): P63ExposureEvidence {
  return cell.armKind === "AF"
    ? {
        mode: "AF-full",
        budgetTokens: "full",
        actualExposedTokens: 4046,
        fullRepositoryTokens: 4046,
        staticPayloadHash: "0".repeat(64),
        exposureSetHash: null,
        selectorPlanHash: null,
        selectedUnitCount: null,
      }
    : {
        mode: "EL-static",
        budgetTokens: cell.budgetTokens,
        actualExposedTokens: typeof cell.budgetTokens === "number" ? cell.budgetTokens : 0,
        fullRepositoryTokens: 4046,
        staticPayloadHash: "0".repeat(64),
        exposureSetHash: "1".repeat(64),
        selectorPlanHash: "2".repeat(64),
        selectedUnitCount: typeof cell.budgetTokens === "number" && cell.budgetTokens > 0 ? 1 : 0,
      };
}

function validAttempt(args: {
  cell: Readonly<P63V3CalibrationCell>;
  attempt: number;
  passed: boolean | null;
  semanticScore: number;
  booleanCorrect?: number;
}): P63V3AttemptRecord {
  const diagnosticSummary: Record<string, unknown> = { validity: "valid" };
  if (args.cell.measurement === "Rsem") {
    diagnosticSummary.booleanCorrect = args.booleanCorrect;
    diagnosticSummary.booleanTotal = 12;
  }
  return {
    sequence: args.cell.sequence,
    measurement: args.cell.measurement,
    taskId: args.cell.taskId,
    repeat: args.cell.repeat,
    armLabel: args.cell.armLabel,
    armKind: args.cell.armKind,
    budgetTokens: args.cell.budgetTokens,
    attempt: args.attempt,
    rawValidity: "valid",
    effectiveValidity: "valid",
    rawFailureDomain: "none",
    effectiveFailureDomain: "none",
    infrastructureAdjudication: "not-applicable",
    adjudication: null,
    executionStatus: "ok",
    passed: args.passed,
    semanticScore: args.semanticScore,
    protocolValid: args.cell.measurement === "Rsem" ? true : null,
    estimatedCostUsd: 0,
    failureReason: null,
    exposure: exposure(args.cell),
    diagnosticSummary,
    artifactPath: `attempts/${args.cell.sequence}-attempt-${args.attempt}.json`,
    startedAt: NOW,
    finishedAt: NOW,
  };
}

function invalidScoringAttempt(
  cell: Readonly<P63V3CalibrationCell>
): P63V3AttemptRecord {
  return {
    sequence: cell.sequence,
    measurement: cell.measurement,
    taskId: cell.taskId,
    repeat: cell.repeat,
    armLabel: cell.armLabel,
    armKind: cell.armKind,
    budgetTokens: cell.budgetTokens,
    attempt: 1,
    rawValidity: "infrastructure-invalid",
    effectiveValidity: "infrastructure-invalid",
    rawFailureDomain: "system",
    effectiveFailureDomain: "system",
    infrastructureAdjudication: "infrastructure-invalid",
    adjudication: {
      reviewer: "synthetic-verifier",
      reason: "synthetic frozen probe-scoring-error replacement",
      finalDisposition: "infrastructure-invalid",
      adjudicatedAt: NOW,
    },
    executionStatus: "probe-scoring-error",
    passed: null,
    semanticScore: null,
    protocolValid: null,
    estimatedCostUsd: 0,
    failureReason: "synthetic scoring error",
    exposure: exposure(cell),
    diagnosticSummary: { validity: "infrastructure-invalid" },
    artifactPath: `attempts/${cell.sequence}-attempt-1.json`,
    startedAt: NOW,
    finishedAt: NOW,
  };
}

function buildSyntheticState(profile: SyntheticProfile): P63V3LiveCalibrationState {
  const plan = buildP63V3CalibrationPlan();
  const mSeen: Record<P63V3ArmLabel, number> = { B0: 0, B1: 0, B2: 0, B3: 0, B4: 0, AF: 0 };
  const attempts: P63V3AttemptRecord[] = [];
  const interruptedAttempts: P63V3InterruptedAttemptRecord[] = [];

  for (const cell of plan) {
    let attemptNumber = 1;
    if (cell.sequence === SCORING_REPLACEMENT_SEQUENCE) {
      assert.equal(cell.measurement, "Rsem");
      attempts.push(invalidScoringAttempt(cell));
      attemptNumber = 2;
    }
    if (cell.sequence === INTERRUPTED_REPLACEMENT_SEQUENCE) {
      interruptedAttempts.push({
        sequence: cell.sequence,
        attempt: 1,
        startedAt: NOW,
        adjudication: {
          reviewer: "synthetic-verifier",
          reason: "synthetic interrupted provider-visible attempt",
          finalDisposition: "infrastructure-invalid",
          adjudicatedAt: NOW,
        },
      });
      attemptNumber = 2;
    }

    if (cell.measurement === "M") {
      mSeen[cell.armLabel] += 1;
      const passed = mSeen[cell.armLabel] <= profile.mPassTargets[cell.armLabel];
      attempts.push(validAttempt({
        cell,
        attempt: attemptNumber,
        passed,
        semanticScore: passed ? 1 : 0,
      }));
    } else {
      const correct = profile.rsemCorrectPerBank[cell.armLabel];
      attempts.push(validAttempt({
        cell,
        attempt: attemptNumber,
        passed: null,
        semanticScore: correct / 12,
        booleanCorrect: correct,
      }));
    }
  }

  return {
    schemaVersion: P6_3_V3_LIVE_STATE_SCHEMA,
    controllerVersion: P6_3_V3_LIVE_CONTROLLER_VERSION,
    calibrationRunnerVersion: P6_3_V3_CALIBRATION_RUNNER_VERSION,
    runClass: "scientific-calibration",
    calibrationOnly: true,
    confirmatoryStage1AEligible: false,
    status: "completed",
    checkoutGitSha: CHECKOUT,
    planHash: p63V3CalibrationPlanHash(plan),
    treatmentProvenanceHash: TREATMENT,
    fixedEnvironmentIdentity: FIXED,
    authorizationDigest: AUTH,
    totalLogicalCells: plan.length,
    cursorCellIndex: plan.length,
    nextAttempt: 1,
    inFlight: null,
    attempts,
    interruptedAttempts,
    auditFlag: null,
    estimatedCostUsd: 0,
    startedAt: NOW,
    updatedAt: NOW,
    completedAt: NOW,
  };
}

function cloneState(state: P63V3LiveCalibrationState): P63V3LiveCalibrationState {
  return JSON.parse(JSON.stringify(state)) as P63V3LiveCalibrationState;
}

function firstValidRSem(state: P63V3LiveCalibrationState): P63V3AttemptRecord {
  const found = state.attempts.find(
    (attempt) => attempt.measurement === "Rsem" && attempt.effectiveValidity === "valid"
  );
  if (!found) throw new Error("synthetic verifier missing valid Rsem attempt");
  return found;
}

function main(): void {
  const selectedState = buildSyntheticState(SELECT_B2_PROFILE);
  const selected = finalizeP63V3Calibration(selectedState);
  assert.equal(selected.schemaVersion, P6_3_V3_RESULT_SCHEMA);
  assert.equal(selected.finalizerVersion, P6_3_V3_RESULT_FINALIZER_VERSION);
  assert.equal(selected.integrity.validScientificObservations, 864);
  assert.equal(selected.integrity.committedAttempts, 865);
  assert.equal(selected.integrity.infrastructureInvalidCommittedAttempts, 1);
  assert.equal(selected.integrity.interruptedAttempts, 1);
  assert.equal(selected.integrity.interruptedAttemptsAdjudicatedInfrastructureInvalid, 1);
  assert.equal(selected.arms.length, 6);
  for (const arm of selected.arms) {
    assert.equal(arm.m.total, 132);
    assert.equal(arm.rsem.observations, 12);
    assert.equal(arm.rsem.total, 144);
  }
  assert.equal(selected.selection.status, "selected");
  assert.equal(selected.selection.selectedArm, "B2");
  assert.equal(selected.selection.selectedBExpose, 1011);
  assert.equal(selected.interpretationBoundary.historicalV2PrimaryEstimatePooled, false);

  const noQualifier = finalizeP63V3Calibration(buildSyntheticState(NO_QUALIFIER_PROFILE));
  assert.equal(noQualifier.selection.status, "needs-design-audit");
  assert.equal(noQualifier.selection.selectedArm, null);
  assert.equal(noQualifier.selection.selectedBExpose, null);
  assert.equal(noQualifier.selection.reason, "NO_CONJUNCTIVE_INTERIOR_BUDGET");

  const incomplete = cloneState(selectedState);
  incomplete.status = "running";
  incomplete.completedAt = null;
  assert.throws(
    () => finalizeP63V3Calibration(incomplete),
    /not terminally completed/
  );

  const planDrift = cloneState(selectedState);
  (planDrift as { planHash: string }).planHash = "d".repeat(64);
  assert.throws(
    () => finalizeP63V3Calibration(planDrift),
    /plan hash differs/
  );

  const nullScore = cloneState(selectedState);
  firstValidRSem(nullScore).semanticScore = null;
  assert.throws(
    () => finalizeP63V3Calibration(nullScore),
    /semanticScore is missing; no zero-imputation or denominator drop is allowed/
  );

  const denominatorDrift = cloneState(selectedState);
  firstValidRSem(denominatorDrift).diagnosticSummary = {
    ...firstValidRSem(denominatorDrift).diagnosticSummary,
    booleanTotal: 11,
  };
  assert.throws(
    () => finalizeP63V3Calibration(denominatorDrift),
    /probe denominator\/count drift/
  );

  const membershipDrift = cloneState(selectedState);
  const firstM = membershipDrift.attempts.find(
    (attempt) => attempt.measurement === "M" && attempt.effectiveValidity === "valid"
  );
  if (!firstM) throw new Error("synthetic verifier missing M attempt");
  (firstM as { taskId: string | null }).taskId = "not-a-primary-task";
  assert.throws(
    () => finalizeP63V3Calibration(membershipDrift),
    /attempt identity drift/
  );

  const invalidNotAdjudicated = cloneState(selectedState);
  const invalid = invalidNotAdjudicated.attempts.find(
    (attempt) => attempt.effectiveValidity === "infrastructure-invalid"
  );
  if (!invalid) throw new Error("synthetic verifier missing invalid attempt");
  invalid.infrastructureAdjudication = "pending";
  invalid.adjudication = null;
  assert.throws(
    () => finalizeP63V3Calibration(invalidNotAdjudicated),
    /infrastructure-invalid without completed adjudication/
  );

  const interruptedNotAdjudicated = cloneState(selectedState);
  interruptedNotAdjudicated.interruptedAttempts[0].adjudication = null;
  assert.throws(
    () => finalizeP63V3Calibration(interruptedNotAdjudicated),
    /lacks infrastructure-invalid adjudication/
  );

  const nonContiguous = cloneState(selectedState);
  const replacementValid = nonContiguous.attempts.find(
    (attempt) => attempt.sequence === SCORING_REPLACEMENT_SEQUENCE && attempt.effectiveValidity === "valid"
  );
  if (!replacementValid) throw new Error("synthetic verifier missing replacement valid attempt");
  (replacementValid as { attempt: number }).attempt = 3;
  assert.throws(
    () => finalizeP63V3Calibration(nonContiguous),
    /non-contiguous or duplicated/
  );

  process.stdout.write(JSON.stringify({
    verifier: "p6-3-v3-result-finalizer-v1",
    providerCalls: 0,
    checks: [
      "terminal-864-state-required",
      "exactly-one-valid-observation-per-sequence",
      "committed-invalid-replacement-excluded",
      "interrupted-invalid-replacement-excluded",
      "attempt-journal-contiguity",
      "canonical-plan-identity",
      "M-132-per-arm-and-task-membership",
      "Rsem-12-banks-144-probe-judgments-per-arm",
      "null-Rsem-score-fails-closed",
      "Rsem-denominator-drift-fails-closed",
      "frozen-co-gate-selected-case",
      "frozen-co-gate-no-qualifier-case",
      "v2-primary-estimate-not-pooled",
    ],
  }, null, 2) + "\n");
}

main();
