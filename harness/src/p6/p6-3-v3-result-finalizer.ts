import * as crypto from "crypto";
import {
  P6_3_V3_ARTIFACT_BUDGETS,
  P6_3_V3_CALIBRATION_PREDECLARATION,
  P6_3_V3_DELTA_M,
  P6_3_V3_DELTA_R,
  selectP63V3ArtifactBudget,
  type P63V3ArmAggregate,
  type P63V3ArmLabel,
  type P63V3BudgetSelectionDecision,
} from "./p6-3-v3-calibration-predeclaration";
import {
  buildP63V3CalibrationPlan,
  p63V3CalibrationPlanHash,
  type P63V3CalibrationCell,
} from "./p6-3-v3-calibration-runner";
import {
  P6_3_V3_LIVE_CONTROLLER_VERSION,
  P6_3_V3_LIVE_STATE_SCHEMA,
  type P63V3AttemptRecord,
  type P63V3LiveCalibrationState,
} from "./p6-3-v3-live-controller";

export const P6_3_V3_RESULT_FINALIZER_VERSION =
  "p6-3-v3-result-finalizer-v1" as const;
export const P6_3_V3_RESULT_SCHEMA =
  "p6-3-v3-calibration-result-v1" as const;

const ARM_ORDER: readonly P63V3ArmLabel[] = Object.freeze([
  "B0", "B1", "B2", "B3", "B4", "AF",
]);
const EPSILON = 1e-12;

export interface P63V3MRepeatSummary {
  readonly repeat: number;
  readonly passCount: number;
  readonly total: number;
  readonly mean: number;
}

export interface P63V3RSemRepeatSummary {
  readonly repeat: number;
  readonly correct: number;
  readonly total: number;
  readonly mean: number;
  readonly protocolValid: boolean | null;
}

export interface P63V3ArmFinalizationSummary {
  readonly arm: P63V3ArmLabel;
  readonly budgetTokens: number;
  readonly m: {
    readonly observations: number;
    readonly passCount: number;
    readonly total: number;
    readonly mean: number;
    readonly repeatMeans: readonly P63V3MRepeatSummary[];
  };
  readonly rsem: {
    readonly observations: number;
    readonly correct: number;
    readonly total: number;
    readonly mean: number;
    readonly repeatMeans: readonly P63V3RSemRepeatSummary[];
  };
}

export interface P63V3FinalizationResult {
  readonly schemaVersion: typeof P6_3_V3_RESULT_SCHEMA;
  readonly finalizerVersion: typeof P6_3_V3_RESULT_FINALIZER_VERSION;
  readonly runClass: "scientific-calibration";
  readonly calibrationOnly: true;
  readonly confirmatoryStage1AEligible: false;
  readonly source: {
    readonly stateSemanticSha256: string;
    readonly stateSchemaVersion: typeof P6_3_V3_LIVE_STATE_SCHEMA;
    readonly controllerVersion: typeof P6_3_V3_LIVE_CONTROLLER_VERSION;
    readonly checkoutGitSha: string;
    readonly planHash: string;
    readonly treatmentProvenanceHash: string;
    readonly fixedEnvironmentIdentity: string;
    readonly authorizationDigest: string;
  };
  readonly integrity: {
    readonly stateStatus: "completed";
    readonly totalLogicalCells: number;
    readonly validScientificObservations: number;
    readonly committedAttempts: number;
    readonly infrastructureInvalidCommittedAttempts: number;
    readonly interruptedAttempts: number;
    readonly interruptedAttemptsAdjudicatedInfrastructureInvalid: number;
    readonly unresolvedAuditFlag: false;
  };
  readonly frozenRule: {
    readonly repeatCount: number;
    readonly primaryMTasks: number;
    readonly rsemPrimaryProbes: number;
    readonly mObservationsPerArm: number;
    readonly rsemBankObservationsPerArm: number;
    readonly rsemProbeJudgmentsPerArm: number;
    readonly deltaM: number;
    readonly deltaR: number;
    readonly aggregateM: string;
    readonly aggregateRSem: string;
    readonly selectionRule: string;
    readonly tieBreak: string;
  };
  readonly arms: readonly P63V3ArmFinalizationSummary[];
  readonly selection: P63V3BudgetSelectionDecision;
  readonly interpretationBoundary: {
    readonly formalEquivalenceClaimed: false;
    readonly stage1AEffectClaimed: false;
    readonly historicalV2PrimaryEstimatePooled: false;
  };
}

/**
 * Deterministically finalize one completed P6-3 v3 calibration state.
 *
 * This function is intentionally provider-free and outcome-blind in its rules:
 * all membership, denominators, margins, and the final co-gate come from the
 * already-merged v3 predeclaration and canonical 864-cell plan.
 */
export function finalizeP63V3Calibration(
  state: Readonly<P63V3LiveCalibrationState>
): Readonly<P63V3FinalizationResult> {
  const plan = buildP63V3CalibrationPlan();
  assertTerminalState(state, plan);
  assertAttemptJournalIntegrity(state, plan);

  const invalidCommitted = state.attempts.filter(
    (attempt) => attempt.effectiveValidity === "infrastructure-invalid"
  );
  for (const attempt of invalidCommitted) {
    if (
      attempt.infrastructureAdjudication !== "infrastructure-invalid" ||
      attempt.adjudication?.finalDisposition !== "infrastructure-invalid"
    ) {
      throw new Error(
        `P6-3 v3 finalization refused: sequence ${attempt.sequence} attempt ${attempt.attempt} is infrastructure-invalid without completed adjudication`
      );
    }
  }

  const valid = state.attempts.filter((attempt) => attempt.effectiveValidity === "valid");
  if (valid.length !== plan.length) {
    throw new Error(
      `P6-3 v3 finalization refused: expected ${plan.length} final valid scientific observations, got ${valid.length}`
    );
  }
  const finalBySequence = exactlyOneValidObservationPerSequence(valid, plan);
  const arms = buildArmSummaries(finalBySequence, plan);
  const aggregates: P63V3ArmAggregate[] = arms.map((arm) => Object.freeze({
    label: arm.arm,
    mRate: arm.m.mean,
    rsemRate: arm.rsem.mean,
  }));
  const selection = selectP63V3ArtifactBudget(aggregates);

  const result: P63V3FinalizationResult = {
    schemaVersion: P6_3_V3_RESULT_SCHEMA,
    finalizerVersion: P6_3_V3_RESULT_FINALIZER_VERSION,
    runClass: "scientific-calibration",
    calibrationOnly: true,
    confirmatoryStage1AEligible: false,
    source: {
      stateSemanticSha256: sha256(stableJson(state)),
      stateSchemaVersion: state.schemaVersion,
      controllerVersion: state.controllerVersion,
      checkoutGitSha: state.checkoutGitSha,
      planHash: state.planHash,
      treatmentProvenanceHash: state.treatmentProvenanceHash,
      fixedEnvironmentIdentity: state.fixedEnvironmentIdentity,
      authorizationDigest: state.authorizationDigest,
    },
    integrity: {
      stateStatus: "completed",
      totalLogicalCells: state.totalLogicalCells,
      validScientificObservations: valid.length,
      committedAttempts: state.attempts.length,
      infrastructureInvalidCommittedAttempts: invalidCommitted.length,
      interruptedAttempts: state.interruptedAttempts.length,
      interruptedAttemptsAdjudicatedInfrastructureInvalid:
        state.interruptedAttempts.filter(
          (attempt) => attempt.adjudication?.finalDisposition === "infrastructure-invalid"
        ).length,
      unresolvedAuditFlag: false,
    },
    frozenRule: {
      repeatCount: P6_3_V3_CALIBRATION_PREDECLARATION.execution.repeatCount,
      primaryMTasks: P6_3_V3_CALIBRATION_PREDECLARATION.measurements.M.primaryTaskCount,
      rsemPrimaryProbes:
        P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.booleanProbeCount,
      mObservationsPerArm:
        P6_3_V3_CALIBRATION_PREDECLARATION.measurements.M.primaryTaskCount *
        P6_3_V3_CALIBRATION_PREDECLARATION.execution.repeatCount,
      rsemBankObservationsPerArm:
        P6_3_V3_CALIBRATION_PREDECLARATION.execution.repeatCount,
      rsemProbeJudgmentsPerArm:
        P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.booleanProbeCount *
        P6_3_V3_CALIBRATION_PREDECLARATION.execution.repeatCount,
      deltaM: P6_3_V3_DELTA_M,
      deltaR: P6_3_V3_DELTA_R,
      aggregateM: P6_3_V3_CALIBRATION_PREDECLARATION.measurements.M.aggregate,
      aggregateRSem: P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.aggregate,
      selectionRule: P6_3_V3_CALIBRATION_PREDECLARATION.selection.rule,
      tieBreak: P6_3_V3_CALIBRATION_PREDECLARATION.selection.multipleQualifiersTieBreak,
    },
    arms: Object.freeze(arms),
    selection,
    interpretationBoundary: {
      formalEquivalenceClaimed: false,
      stage1AEffectClaimed: false,
      historicalV2PrimaryEstimatePooled: false,
    },
  };
  return deepFreeze(result);
}

function assertTerminalState(
  state: Readonly<P63V3LiveCalibrationState>,
  plan: readonly P63V3CalibrationCell[]
): void {
  if (
    state.schemaVersion !== P6_3_V3_LIVE_STATE_SCHEMA ||
    state.controllerVersion !== P6_3_V3_LIVE_CONTROLLER_VERSION
  ) {
    throw new Error("P6-3 v3 finalization refused: state/controller version mismatch");
  }
  if (
    state.runClass !== "scientific-calibration" ||
    state.calibrationOnly !== true ||
    state.confirmatoryStage1AEligible !== false
  ) {
    throw new Error("P6-3 v3 finalization refused: scientific-calibration provenance mismatch");
  }
  if (
    state.status !== "completed" ||
    state.cursorCellIndex !== plan.length ||
    state.totalLogicalCells !== plan.length ||
    state.inFlight !== null ||
    state.auditFlag !== null ||
    state.completedAt === null
  ) {
    throw new Error("P6-3 v3 finalization refused: collection is not terminally completed and audit-free");
  }
  const canonicalPlanHash = p63V3CalibrationPlanHash(plan);
  if (state.planHash !== canonicalPlanHash) {
    throw new Error("P6-3 v3 finalization refused: state plan hash differs from canonical predeclared plan");
  }
  for (const [label, value] of [
    ["checkoutGitSha", state.checkoutGitSha],
    ["treatmentProvenanceHash", state.treatmentProvenanceHash],
    ["fixedEnvironmentIdentity", state.fixedEnvironmentIdentity],
    ["authorizationDigest", state.authorizationDigest],
  ] as const) {
    if (!value || typeof value !== "string") {
      throw new Error(`P6-3 v3 finalization refused: missing ${label}`);
    }
  }
  for (const interrupted of state.interruptedAttempts) {
    if (interrupted.adjudication?.finalDisposition !== "infrastructure-invalid") {
      throw new Error(
        `P6-3 v3 finalization refused: interrupted sequence ${interrupted.sequence} attempt ${interrupted.attempt} lacks infrastructure-invalid adjudication`
      );
    }
  }
}

function assertAttemptJournalIntegrity(
  state: Readonly<P63V3LiveCalibrationState>,
  plan: readonly P63V3CalibrationCell[]
): void {
  const bySequence = new Map<number, Array<{ attempt: number; validity: "valid" | "infrastructure-invalid"; kind: "committed" | "interrupted" }>>();
  for (const attempt of state.attempts) {
    if (
      attempt.effectiveValidity !== "valid" &&
      attempt.effectiveValidity !== "infrastructure-invalid"
    ) {
      throw new Error(`P6-3 v3 finalization refused: malformed validity at sequence ${attempt.sequence}`);
    }
    const cell = plan[attempt.sequence];
    if (!cell) {
      throw new Error(`P6-3 v3 finalization refused: attempt sequence out of range ${attempt.sequence}`);
    }
    assertAttemptMatchesCell(attempt, cell);
    if (!attempt.artifactPath) {
      throw new Error(
        `P6-3 v3 finalization refused: committed sequence ${attempt.sequence} attempt ${attempt.attempt} has no artifact path`
      );
    }
    const rows = bySequence.get(attempt.sequence) ?? [];
    rows.push({ attempt: attempt.attempt, validity: attempt.effectiveValidity, kind: "committed" });
    bySequence.set(attempt.sequence, rows);
  }
  for (const interrupted of state.interruptedAttempts) {
    if (!plan[interrupted.sequence]) {
      throw new Error(`P6-3 v3 finalization refused: interrupted sequence out of range ${interrupted.sequence}`);
    }
    const rows = bySequence.get(interrupted.sequence) ?? [];
    rows.push({ attempt: interrupted.attempt, validity: "infrastructure-invalid", kind: "interrupted" });
    bySequence.set(interrupted.sequence, rows);
  }

  for (let sequence = 0; sequence < plan.length; sequence += 1) {
    const rows = (bySequence.get(sequence) ?? []).sort((a, b) => a.attempt - b.attempt);
    if (rows.length === 0) {
      throw new Error(`P6-3 v3 finalization refused: sequence ${sequence} has no attempt journal`);
    }
    const seen = new Set<number>();
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const expectedAttempt = index + 1;
      if (!Number.isInteger(row.attempt) || row.attempt !== expectedAttempt || seen.has(row.attempt)) {
        throw new Error(
          `P6-3 v3 finalization refused: sequence ${sequence} attempt journal is non-contiguous or duplicated`
        );
      }
      seen.add(row.attempt);
    }
    const validRows = rows.filter((row) => row.validity === "valid");
    if (validRows.length !== 1) {
      throw new Error(
        `P6-3 v3 finalization refused: sequence ${sequence} expected exactly one valid attempt, got ${validRows.length}`
      );
    }
    if (validRows[0].attempt !== rows[rows.length - 1].attempt) {
      throw new Error(
        `P6-3 v3 finalization refused: sequence ${sequence} has attempts after its final valid observation`
      );
    }
  }
}

function exactlyOneValidObservationPerSequence(
  valid: readonly P63V3AttemptRecord[],
  plan: readonly P63V3CalibrationCell[]
): readonly P63V3AttemptRecord[] {
  const bySequence = new Map<number, P63V3AttemptRecord[]>();
  for (const attempt of valid) {
    const rows = bySequence.get(attempt.sequence) ?? [];
    rows.push(attempt);
    bySequence.set(attempt.sequence, rows);
  }
  const result: P63V3AttemptRecord[] = [];
  for (let sequence = 0; sequence < plan.length; sequence += 1) {
    const rows = bySequence.get(sequence) ?? [];
    if (rows.length !== 1) {
      throw new Error(
        `P6-3 v3 finalization refused: sequence ${sequence} expected exactly one final scientific observation, got ${rows.length}`
      );
    }
    result.push(rows[0]);
  }
  return Object.freeze(result);
}

function assertAttemptMatchesCell(
  attempt: Readonly<P63V3AttemptRecord>,
  cell: Readonly<P63V3CalibrationCell>
): void {
  if (
    attempt.sequence !== cell.sequence ||
    attempt.measurement !== cell.measurement ||
    attempt.taskId !== cell.taskId ||
    attempt.repeat !== cell.repeat ||
    attempt.armLabel !== cell.armLabel ||
    attempt.armKind !== cell.armKind ||
    attempt.budgetTokens !== cell.budgetTokens
  ) {
    throw new Error(
      `P6-3 v3 finalization refused: attempt identity drift at sequence ${cell.sequence}`
    );
  }
}

function buildArmSummaries(
  validBySequence: readonly P63V3AttemptRecord[],
  plan: readonly P63V3CalibrationCell[]
): P63V3ArmFinalizationSummary[] {
  if (validBySequence.length !== plan.length) {
    throw new Error("P6-3 v3 finalization refused: valid observation count/plan mismatch");
  }
  const primaryTasks = [
    ...P6_3_V3_CALIBRATION_PREDECLARATION.measurements.M.primaryTaskIds,
  ].sort();
  const summaries: P63V3ArmFinalizationSummary[] = [];

  for (const arm of ARM_ORDER) {
    const mRows = validBySequence.filter(
      (row) => row.measurement === "M" && row.armLabel === arm
    );
    const rRows = validBySequence.filter(
      (row) => row.measurement === "Rsem" && row.armLabel === arm
    );
    const expectedM =
      P6_3_V3_CALIBRATION_PREDECLARATION.measurements.M.primaryTaskCount *
      P6_3_V3_CALIBRATION_PREDECLARATION.execution.repeatCount;
    const expectedR = P6_3_V3_CALIBRATION_PREDECLARATION.execution.repeatCount;
    if (mRows.length !== expectedM || rRows.length !== expectedR) {
      throw new Error(
        `P6-3 v3 finalization refused: ${arm} observation count mismatch M=${mRows.length}, Rsem=${rRows.length}`
      );
    }

    const mRepeatMeans: P63V3MRepeatSummary[] = [];
    let mPassCount = 0;
    for (
      let repeat = 1;
      repeat <= P6_3_V3_CALIBRATION_PREDECLARATION.execution.repeatCount;
      repeat += 1
    ) {
      const rows = mRows.filter((row) => row.repeat === repeat);
      if (rows.length !== primaryTasks.length) {
        throw new Error(
          `P6-3 v3 finalization refused: ${arm} M repeat ${repeat} expected ${primaryTasks.length} tasks, got ${rows.length}`
        );
      }
      const tasks = rows.map((row) => row.taskId ?? "").sort();
      if (JSON.stringify(tasks) !== JSON.stringify(primaryTasks)) {
        throw new Error(
          `P6-3 v3 finalization refused: ${arm} M repeat ${repeat} task membership mismatch`
        );
      }
      let repeatPasses = 0;
      for (const row of rows) {
        if (typeof row.passed !== "boolean") {
          throw new Error(
            `P6-3 v3 finalization refused: ${arm} M repeat ${repeat} missing boolean pass outcome`
          );
        }
        const expectedScore = row.passed ? 1 : 0;
        if (row.semanticScore === null || !nearlyEqual(row.semanticScore, expectedScore)) {
          throw new Error(
            `P6-3 v3 finalization refused: ${arm} M repeat ${repeat} pass/semanticScore mismatch`
          );
        }
        if (row.passed) repeatPasses += 1;
      }
      mPassCount += repeatPasses;
      mRepeatMeans.push(Object.freeze({
        repeat,
        passCount: repeatPasses,
        total: rows.length,
        mean: repeatPasses / rows.length,
      }));
    }

    const rsemRepeatMeans: P63V3RSemRepeatSummary[] = [];
    let rsemCorrect = 0;
    let rsemTotal = 0;
    for (
      let repeat = 1;
      repeat <= P6_3_V3_CALIBRATION_PREDECLARATION.execution.repeatCount;
      repeat += 1
    ) {
      const rows = rRows.filter((row) => row.repeat === repeat);
      if (rows.length !== 1) {
        throw new Error(
          `P6-3 v3 finalization refused: ${arm} Rsem repeat ${repeat} expected one bank outcome, got ${rows.length}`
        );
      }
      const row = rows[0];
      if (row.taskId !== null || row.passed !== null) {
        throw new Error(
          `P6-3 v3 finalization refused: ${arm} Rsem repeat ${repeat} identity fields drifted`
        );
      }
      if (row.semanticScore === null || !Number.isFinite(row.semanticScore)) {
        throw new Error(
          `P6-3 v3 finalization refused: ${arm} Rsem repeat ${repeat} semanticScore is missing; no zero-imputation or denominator drop is allowed`
        );
      }
      const correct = row.diagnosticSummary.booleanCorrect;
      const total = row.diagnosticSummary.booleanTotal;
      if (
        !Number.isInteger(correct) ||
        !Number.isInteger(total) ||
        total !== P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.booleanProbeCount
      ) {
        throw new Error(
          `P6-3 v3 finalization refused: ${arm} Rsem repeat ${repeat} probe denominator/count drift`
        );
      }
      const correctNumber = correct as number;
      const totalNumber = total as number;
      if (correctNumber < 0 || correctNumber > totalNumber) {
        throw new Error(
          `P6-3 v3 finalization refused: ${arm} Rsem repeat ${repeat} booleanCorrect out of range`
        );
      }
      const rate = correctNumber / totalNumber;
      if (!nearlyEqual(row.semanticScore, rate)) {
        throw new Error(
          `P6-3 v3 finalization refused: ${arm} Rsem repeat ${repeat} semanticScore does not match booleanCorrect/booleanTotal`
        );
      }
      rsemCorrect += correctNumber;
      rsemTotal += totalNumber;
      rsemRepeatMeans.push(Object.freeze({
        repeat,
        correct: correctNumber,
        total: totalNumber,
        mean: rate,
        protocolValid: row.protocolValid,
      }));
    }

    const expectedRsemTotal =
      P6_3_V3_CALIBRATION_PREDECLARATION.execution.repeatCount *
      P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.booleanProbeCount;
    if (rsemTotal !== expectedRsemTotal) {
      throw new Error(
        `P6-3 v3 finalization refused: ${arm} Rsem total denominator drift ${rsemTotal} != ${expectedRsemTotal}`
      );
    }

    summaries.push(deepFreeze({
      arm,
      budgetTokens: P6_3_V3_ARTIFACT_BUDGETS[arm],
      m: {
        observations: mRows.length,
        passCount: mPassCount,
        total: mRows.length,
        mean: mPassCount / mRows.length,
        repeatMeans: mRepeatMeans,
      },
      rsem: {
        observations: rRows.length,
        correct: rsemCorrect,
        total: rsemTotal,
        mean: rsemCorrect / rsemTotal,
        repeatMeans: rsemRepeatMeans,
      },
    }));
  }
  return summaries;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortJson(item)])
    );
  }
  return value;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
}
