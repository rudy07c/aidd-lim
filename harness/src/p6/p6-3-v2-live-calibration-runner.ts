import {
  p63CalibrationPlanHash,
  type P63CalibrationCell,
  type P63CellOutcome,
} from "./p6-3-live-calibration-runner";
import {
  classifyP63V2AutoInfrastructure,
  P6_3_V2_AUTO_INFRA_CLASSIFIER_VERSION,
  type P63V2AutoInfraClassification,
  type P63V2AutoInfraEvidence,
} from "./p6-3-v2-auto-infra";

export const P6_3_V2_LIVE_CALIBRATION_RUNNER_VERSION =
  "p6-3-v2-live-calibration-runner-v1" as const;
export const P6_3_V2_LIVE_CALIBRATION_STATE_SCHEMA =
  "p6-3-v2-live-calibration-state-v1" as const;

export interface P63V2ExecutionPolicy {
  readonly maxScientificAttemptsPerLogicalCell: number;
}

export interface P63V2CellOutcome extends P63CellOutcome {
  readonly autoInfrastructureEvidence?: P63V2AutoInfraEvidence | null;
}

export interface P63V2CalibrationExecutor {
  execute(cell: P63CalibrationCell, attempt: number): Promise<P63V2CellOutcome>;
}

export interface P63V2CalibrationPersistence {
  persistState(state: P63V2CalibrationState): void | Promise<void>;
  persistAttemptArtifact(
    cell: P63CalibrationCell,
    attempt: number,
    payload: unknown
  ): string | Promise<string>;
}

export interface P63V2AutomaticAdjudication {
  readonly source: "automatic";
  readonly classifierVersion: typeof P6_3_V2_AUTO_INFRA_CLASSIFIER_VERSION;
  readonly ruleId: string;
  readonly reason: string;
  readonly adjudicatedAt: string;
}

export interface P63V2ManualAdjudication {
  readonly source: "manual";
  readonly reviewer: string;
  readonly reason: string;
  readonly finalDisposition:
    | "scientific-failure"
    | "protocol-failure"
    | "infrastructure-invalid";
  readonly adjudicatedAt: string;
}

export interface P63V2AttemptRecord {
  readonly sequence: number;
  readonly measurement: "M" | "Rsem";
  readonly taskId: string | null;
  readonly repeat: number;
  readonly armLabel: "B0" | "B1" | "B2" | "B3" | "B4" | "AF";
  readonly armKind: "EL" | "AF";
  readonly budgetTokens: number | "full";
  readonly attempt: number;
  readonly rawFailureDomain: "none" | "semantic" | "protocol" | "system" | "infrastructure" | "other";
  effectiveFailureDomain: "none" | "semantic" | "protocol" | "system" | "infrastructure" | "other";
  readonly executionStatus: string;
  readonly passed: boolean | null;
  readonly semanticScore: number | null;
  readonly protocolValid: boolean | null;
  readonly estimatedCostUsd: number | null;
  readonly failureReason: string | null;
  readonly exposure: P63CellOutcome["exposure"];
  readonly diagnosticSummary: Readonly<Record<string, unknown>>;
  readonly autoInfrastructureEvidence: P63V2AutoInfraEvidence | null;
  autoInfrastructureClassification: P63V2AutoInfraClassification | null;
  adjudication: P63V2AutomaticAdjudication | P63V2ManualAdjudication | null;
  artifactPath: string | null;
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface P63V2InterruptedAttemptRecord {
  readonly sequence: number;
  readonly attempt: number;
  readonly startedAt: string;
  adjudication: P63V2ManualAdjudication | null;
}

export interface P63V2ExhaustedCellRecord {
  readonly sequence: number;
  readonly measurement: "M" | "Rsem";
  readonly taskId: string | null;
  readonly repeat: number;
  readonly armLabel: "B0" | "B1" | "B2" | "B3" | "B4" | "AF";
  readonly attempts: number;
  readonly status: "censored-exhausted";
  readonly exhaustedAt: string;
}

export interface P63V2AuditFlag {
  readonly kind:
    | "unrecognized-infrastructure-state"
    | "unclassified-failure-domain"
    | "uncertain-in-flight-attempt";
  readonly sequence: number;
  readonly attempt: number;
  readonly reason: string;
  readonly createdAt: string;
}

export interface P63V2CalibrationState {
  readonly schemaVersion: typeof P6_3_V2_LIVE_CALIBRATION_STATE_SCHEMA;
  readonly runnerVersion: typeof P6_3_V2_LIVE_CALIBRATION_RUNNER_VERSION;
  readonly runClass: "scientific-calibration";
  readonly calibrationOnly: true;
  readonly confirmatoryStage1AEligible: false;
  status: "running" | "needs-audit" | "completed" | "needs-design-audit";
  readonly checkoutGitSha: string;
  readonly frozenManifestHashes: Readonly<Record<string, string>>;
  readonly planHash: string;
  readonly totalLogicalCells: number;
  readonly executionPolicy: P63V2ExecutionPolicy;
  cursorCellIndex: number;
  nextAttempt: number;
  inFlight: { sequence: number; attempt: number; startedAt: string } | null;
  attempts: P63V2AttemptRecord[];
  interruptedAttempts: P63V2InterruptedAttemptRecord[];
  exhaustedCells: P63V2ExhaustedCellRecord[];
  auditFlag: P63V2AuditFlag | null;
  estimatedCostUsd: number;
  readonly startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface P63V2ManualAdjudicationRequest {
  readonly sequence: number;
  readonly attempt: number;
  readonly reviewer: string;
  readonly reason: string;
  readonly finalDisposition:
    | "scientific-failure"
    | "protocol-failure"
    | "infrastructure-invalid";
  readonly adjudicatedAt?: string;
}

export function createP63V2CalibrationState(args: {
  checkoutGitSha: string;
  frozenManifestHashes: Readonly<Record<string, string>>;
  plan: readonly P63CalibrationCell[];
  executionPolicy: P63V2ExecutionPolicy;
}): P63V2CalibrationState {
  assertExecutionPolicy(args.executionPolicy);
  const now = new Date().toISOString();
  return {
    schemaVersion: P6_3_V2_LIVE_CALIBRATION_STATE_SCHEMA,
    runnerVersion: P6_3_V2_LIVE_CALIBRATION_RUNNER_VERSION,
    runClass: "scientific-calibration",
    calibrationOnly: true,
    confirmatoryStage1AEligible: false,
    status: "running",
    checkoutGitSha: requireText(args.checkoutGitSha, "checkoutGitSha"),
    frozenManifestHashes: Object.freeze({ ...args.frozenManifestHashes }),
    planHash: p63CalibrationPlanHash(args.plan),
    totalLogicalCells: args.plan.length,
    executionPolicy: Object.freeze({ ...args.executionPolicy }),
    cursorCellIndex: 0,
    nextAttempt: 1,
    inFlight: null,
    attempts: [],
    interruptedAttempts: [],
    exhaustedCells: [],
    auditFlag: null,
    estimatedCostUsd: 0,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

export function assertP63V2ResumeCompatible(
  state: P63V2CalibrationState,
  args: {
    checkoutGitSha: string;
    frozenManifestHashes: Readonly<Record<string, string>>;
    plan: readonly P63CalibrationCell[];
    executionPolicy: P63V2ExecutionPolicy;
  }
): void {
  assertExecutionPolicy(args.executionPolicy);
  if (
    state.schemaVersion !== P6_3_V2_LIVE_CALIBRATION_STATE_SCHEMA ||
    state.runnerVersion !== P6_3_V2_LIVE_CALIBRATION_RUNNER_VERSION ||
    state.runClass !== "scientific-calibration" ||
    state.calibrationOnly !== true ||
    state.confirmatoryStage1AEligible !== false
  ) throw new Error("Resume refused: P6-3 v2 calibration state/version provenance changed");
  if (state.checkoutGitSha !== args.checkoutGitSha) {
    throw new Error("Resume refused: P6-3 v2 checkout SHA changed");
  }
  if (stableJson(state.frozenManifestHashes) !== stableJson(args.frozenManifestHashes)) {
    throw new Error("Resume refused: P6-3 v2 frozen manifest hashes changed");
  }
  if (state.planHash !== p63CalibrationPlanHash(args.plan) || state.totalLogicalCells !== args.plan.length) {
    throw new Error("Resume refused: P6-3 v2 calibration plan changed");
  }
  if (stableJson(state.executionPolicy) !== stableJson(args.executionPolicy)) {
    throw new Error("Resume refused: P6-3 v2 execution policy changed");
  }
  if (!Number.isInteger(state.cursorCellIndex) || state.cursorCellIndex < 0 || state.cursorCellIndex > args.plan.length) {
    throw new Error("Resume refused: invalid P6-3 v2 cursorCellIndex");
  }
  if (!Number.isInteger(state.nextAttempt) || state.nextAttempt < 1 || state.nextAttempt > args.executionPolicy.maxScientificAttemptsPerLogicalCell) {
    throw new Error("Resume refused: invalid P6-3 v2 nextAttempt");
  }
  if (!Array.isArray(state.attempts) || !Array.isArray(state.interruptedAttempts) || !Array.isArray(state.exhaustedCells)) {
    throw new Error("Resume refused: P6-3 v2 journals are malformed");
  }
}

export function recoverInterruptedP63V2State(state: P63V2CalibrationState): void {
  if (!state.inFlight) return;
  const inFlight = state.inFlight;
  const alreadyJournaled = state.interruptedAttempts.some(
    (entry) => entry.sequence === inFlight.sequence && entry.attempt === inFlight.attempt
  );
  if (!alreadyJournaled) {
    state.interruptedAttempts.push({
      sequence: inFlight.sequence,
      attempt: inFlight.attempt,
      startedAt: inFlight.startedAt,
      adjudication: null,
    });
  }
  state.inFlight = null;
  state.status = "needs-audit";
  state.auditFlag = {
    kind: "uncertain-in-flight-attempt",
    sequence: inFlight.sequence,
    attempt: inFlight.attempt,
    reason: "A provider-visible v2 attempt was in-flight without a committed result; do not blindly repeat it.",
    createdAt: new Date().toISOString(),
  };
  touch(state);
}

export async function executeP63V2Calibration(
  state: P63V2CalibrationState,
  identity: {
    checkoutGitSha: string;
    frozenManifestHashes: Readonly<Record<string, string>>;
    executionPolicy: P63V2ExecutionPolicy;
  },
  plan: readonly P63CalibrationCell[],
  executor: P63V2CalibrationExecutor,
  persistence: P63V2CalibrationPersistence
): Promise<P63V2CalibrationState> {
  assertP63V2ResumeCompatible(state, { ...identity, plan });
  if (state.inFlight) {
    recoverInterruptedP63V2State(state);
    await persistence.persistState(state);
    return state;
  }
  if (state.status !== "running") return state;

  while (state.cursorCellIndex < plan.length) {
    const cell = plan[state.cursorCellIndex];
    const attempt = state.nextAttempt;
    if (!cell || cell.sequence !== state.cursorCellIndex) throw new Error("P6-3 v2 plan/cursor sequence mismatch");

    const startedAt = new Date().toISOString();
    state.inFlight = { sequence: cell.sequence, attempt, startedAt };
    touch(state);
    await persistence.persistState(state);

    const outcome = await executor.execute(cell, attempt);
    const artifactPath = await persistence.persistAttemptArtifact(cell, attempt, outcome.artifactPayload);
    const finishedAt = new Date().toISOString();
    const record = attemptRecord(cell, attempt, outcome, artifactPath, startedAt, finishedAt);
    state.attempts.push(record);
    state.inFlight = null;
    state.estimatedCostUsd += outcome.estimatedCostUsd ?? 0;

    if (outcome.failureDomain === "infrastructure") {
      const evidence = outcome.autoInfrastructureEvidence ?? null;
      record.autoInfrastructureClassification = evidence
        ? classifyP63V2AutoInfrastructure(evidence)
        : null;
      if (record.autoInfrastructureClassification?.disposition === "infrastructure-invalid") {
        const classification = record.autoInfrastructureClassification;
        if (!classification.ruleId) throw new Error("P6-3 v2 automatic infrastructure decision missing ruleId");
        record.adjudication = {
          source: "automatic",
          classifierVersion: classification.classifierVersion,
          ruleId: classification.ruleId,
          reason: classification.reason,
          adjudicatedAt: finishedAt,
        };
        record.effectiveFailureDomain = "infrastructure";
        transitionAfterInfrastructureInvalid(state, plan, cell, attempt, finishedAt);
        await persistence.persistState(state);
        if (state.status !== "running") return state;
        continue;
      }

      state.status = "needs-audit";
      state.auditFlag = {
        kind: "unrecognized-infrastructure-state",
        sequence: cell.sequence,
        attempt,
        reason: record.autoInfrastructureClassification?.reason ??
          "Infrastructure outcome did not provide raw evidence for a frozen automatic adjudication rule.",
        createdAt: finishedAt,
      };
      touch(state);
      await persistence.persistState(state);
      return state;
    }

    if (outcome.failureDomain === "other") {
      state.status = "needs-audit";
      state.auditFlag = {
        kind: "unclassified-failure-domain",
        sequence: cell.sequence,
        attempt,
        reason: "P6-3 v2 scientific execution encountered an unclassified failure domain.",
        createdAt: finishedAt,
      };
      touch(state);
      await persistence.persistState(state);
      return state;
    }

    advanceCell(state, plan.length);
    await persistence.persistState(state);
    if (state.status !== "running") return state;
  }

  finalizeCollection(state);
  await persistence.persistState(state);
  return state;
}

export function applyP63V2ManualAdjudication(
  state: P63V2CalibrationState,
  plan: readonly P63CalibrationCell[],
  request: P63V2ManualAdjudicationRequest
): void {
  if (state.status !== "needs-audit" || !state.auditFlag) {
    throw new Error("P6-3 v2 manual adjudication requires an active needs-audit state");
  }
  if (state.cursorCellIndex !== request.sequence) {
    throw new Error("P6-3 v2 adjudication target must be the current logical cell");
  }
  const cell = plan[state.cursorCellIndex];
  if (!cell || cell.sequence !== request.sequence) throw new Error("P6-3 v2 adjudication plan/cursor mismatch");
  const reviewer = requireText(request.reviewer, "reviewer");
  const reason = requireText(request.reason, "reason");
  const adjudicatedAt = request.adjudicatedAt ?? new Date().toISOString();
  const adjudication: P63V2ManualAdjudication = {
    source: "manual",
    reviewer,
    reason,
    finalDisposition: request.finalDisposition,
    adjudicatedAt,
  };

  if (state.auditFlag.kind === "uncertain-in-flight-attempt") {
    if (request.finalDisposition !== "infrastructure-invalid") {
      throw new Error("Uncertain in-flight v2 attempts may only be resolved as infrastructure-invalid");
    }
    const interrupted = [...state.interruptedAttempts].reverse().find(
      (entry) => entry.sequence === request.sequence && entry.attempt === request.attempt && entry.adjudication === null
    );
    if (!interrupted) throw new Error("P6-3 v2 interrupted attempt not found or already adjudicated");
    interrupted.adjudication = adjudication;
    transitionAfterInfrastructureInvalid(state, plan, cell, request.attempt, adjudicatedAt);
    return;
  }

  const target = [...state.attempts].reverse().find(
    (entry) => entry.sequence === request.sequence && entry.attempt === request.attempt
  );
  if (!target) throw new Error("P6-3 v2 adjudication target attempt not found");
  target.adjudication = adjudication;

  if (request.finalDisposition === "infrastructure-invalid") {
    target.effectiveFailureDomain = "infrastructure";
    transitionAfterInfrastructureInvalid(state, plan, cell, request.attempt, adjudicatedAt);
    return;
  }

  if (request.finalDisposition === "protocol-failure" && cell.measurement === "M") {
    throw new Error("P6-3 v2 M adjudication preserves P6-2 semantics and does not use protocol-failure final disposition");
  }
  target.effectiveFailureDomain = request.finalDisposition === "protocol-failure" ? "protocol" : "semantic";
  state.status = "running";
  state.auditFlag = null;
  advanceCell(state, plan.length);
}

export function summarizeP63V2ExecutionState(state: P63V2CalibrationState): {
  logicalCellsCompleted: number;
  scientificAttempts: number;
  replacementAttempts: number;
  automaticInfrastructureInvalid: number;
  exhaustedLogicalCells: number;
  interruptedAttempts: number;
  estimatedCostUsd: number;
  collectionComplete: boolean;
  bExposeSelectionEligible: boolean;
  status: P63V2CalibrationState["status"];
  nextSequence: number | null;
} {
  const collectionComplete = state.status === "completed" || state.status === "needs-design-audit";
  return {
    logicalCellsCompleted: state.cursorCellIndex,
    scientificAttempts: state.attempts.length + state.interruptedAttempts.length,
    replacementAttempts:
      state.attempts.filter((entry) => entry.attempt > 1).length +
      state.interruptedAttempts.filter((entry) => entry.attempt > 1).length,
    automaticInfrastructureInvalid: state.attempts.filter(
      (entry) => entry.adjudication?.source === "automatic" && entry.effectiveFailureDomain === "infrastructure"
    ).length,
    exhaustedLogicalCells: state.exhaustedCells.length,
    interruptedAttempts: state.interruptedAttempts.length,
    estimatedCostUsd: state.estimatedCostUsd,
    collectionComplete,
    bExposeSelectionEligible: state.status === "completed" && state.exhaustedCells.length === 0,
    status: state.status,
    nextSequence: state.cursorCellIndex < state.totalLogicalCells ? state.cursorCellIndex : null,
  };
}

function attemptRecord(
  cell: P63CalibrationCell,
  attempt: number,
  outcome: P63V2CellOutcome,
  artifactPath: string,
  startedAt: string,
  finishedAt: string
): P63V2AttemptRecord {
  return {
    sequence: cell.sequence,
    measurement: cell.measurement,
    taskId: cell.taskId,
    repeat: cell.repeat,
    armLabel: cell.arm.label,
    armKind: cell.arm.kind,
    budgetTokens: cell.budgetTokens,
    attempt,
    rawFailureDomain: outcome.failureDomain,
    effectiveFailureDomain: outcome.failureDomain,
    executionStatus: outcome.executionStatus,
    passed: outcome.passed,
    semanticScore: outcome.semanticScore,
    protocolValid: outcome.protocolValid,
    estimatedCostUsd: outcome.estimatedCostUsd,
    failureReason: outcome.failureReason,
    exposure: outcome.exposure,
    diagnosticSummary: outcome.diagnosticSummary,
    autoInfrastructureEvidence: outcome.autoInfrastructureEvidence ?? null,
    autoInfrastructureClassification: null,
    adjudication: null,
    artifactPath,
    startedAt,
    finishedAt,
  };
}

function transitionAfterInfrastructureInvalid(
  state: P63V2CalibrationState,
  plan: readonly P63CalibrationCell[],
  cell: P63CalibrationCell,
  attempt: number,
  adjudicatedAt: string
): void {
  const maxAttempts = state.executionPolicy.maxScientificAttemptsPerLogicalCell;
  state.inFlight = null;
  state.auditFlag = null;
  if (attempt < maxAttempts) {
    state.status = "running";
    state.nextAttempt = attempt + 1;
    touch(state);
    return;
  }
  if (attempt !== maxAttempts) throw new Error("P6-3 v2 infrastructure attempt exceeded frozen execution policy");
  state.exhaustedCells.push({
    sequence: cell.sequence,
    measurement: cell.measurement,
    taskId: cell.taskId,
    repeat: cell.repeat,
    armLabel: cell.arm.label,
    attempts: attempt,
    status: "censored-exhausted",
    exhaustedAt: adjudicatedAt,
  });
  advanceCell(state, plan.length);
}

function advanceCell(state: P63V2CalibrationState, planLength: number): void {
  state.cursorCellIndex += 1;
  state.nextAttempt = 1;
  state.inFlight = null;
  state.auditFlag = null;
  if (state.cursorCellIndex >= planLength) finalizeCollection(state);
  else {
    state.status = "running";
    touch(state);
  }
}

function finalizeCollection(state: P63V2CalibrationState): void {
  state.cursorCellIndex = state.totalLogicalCells;
  state.nextAttempt = 1;
  state.inFlight = null;
  state.auditFlag = null;
  state.status = state.exhaustedCells.length > 0 ? "needs-design-audit" : "completed";
  touch(state);
  state.completedAt = state.updatedAt;
}

function assertExecutionPolicy(policy: P63V2ExecutionPolicy): void {
  if (!Number.isInteger(policy.maxScientificAttemptsPerLogicalCell) || policy.maxScientificAttemptsPerLogicalCell < 1) {
    throw new Error("P6-3 v2 maxScientificAttemptsPerLogicalCell must be a positive integer");
  }
}

function requireText(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${name} must be non-empty`);
  return trimmed;
}

function touch(state: P63V2CalibrationState): void {
  state.updatedAt = new Date().toISOString();
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
