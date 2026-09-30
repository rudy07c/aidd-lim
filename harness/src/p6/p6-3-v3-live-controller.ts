import * as crypto from "crypto";
import {
  P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL,
  decideP63AttemptTransition,
  type P63AttemptFailureDomain,
} from "./p6-3-execution-protocol";
import type { P63CellOutcome, P63ExposureEvidence } from "./p6-3-live-calibration-runner";
import {
  P6_3_V3_CALIBRATION_RUNNER_VERSION,
  p63V3CalibrationPlanHash,
  type P63V3CalibrationCell,
  type P63V3PreparedCalibrationRun,
} from "./p6-3-v3-calibration-runner";
import {
  requireP63V3ScientificValidity,
  type P63V3ScientificValidity,
} from "./p6-3-v3-scientific-validity";

export const P6_3_V3_LIVE_CONTROLLER_VERSION =
  "p6-3-v3-live-controller-v2-validity" as const;
export const P6_3_V3_LIVE_STATE_SCHEMA =
  "p6-3-v3-live-calibration-state-v2-validity" as const;
export const P6_3_V3_PAID_LIVE_AUTHORIZATION_FLAG =
  "--authorize-paid-live=P6-3-v3" as const;
export const P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV =
  "P6_3_V3_LIVE_EXECUTION_ALLOWED" as const;

const PAID_LIVE_RUNTIME_AUTH_BRAND: unique symbol = Symbol(
  "p6-3-v3-paid-live-runtime-authorization"
);

export type P63V3ControllerStatus = "running" | "needs-audit" | "completed";
export type P63V3AdjudicationFinalDisposition =
  | "scientific-failure"
  | "protocol-failure"
  | "infrastructure-invalid";

export interface P63V3PaidLiveInvocationAuthorization {
  readonly live: boolean;
  readonly paidAuthorization: boolean;
  readonly checkoutGitSha: string;
  readonly environment?: NodeJS.ProcessEnv;
}

/**
 * Deliberate operator authorization. This is an intent guard, not a pre-live
 * scientific gate and not a secret. A future CLI must still rerun the complete
 * v3 pre-live gate before constructing a production executor.
 */
export type P63V3PaidLiveRuntimeAuthorizationToken = Readonly<{
  readonly live: true;
  readonly explicitPaidAuthorization: true;
  readonly environmentAuthorization: true;
  readonly checkoutGitSha: string;
  readonly planHash: string;
  readonly treatmentProvenanceHash: string;
  readonly fixedEnvironmentIdentity: string;
  readonly authorizationDigest: string;
  [PAID_LIVE_RUNTIME_AUTH_BRAND]: true;
}>;

export interface P63V3AdjudicationRecord {
  readonly reviewer: string;
  readonly reason: string;
  readonly finalDisposition: P63V3AdjudicationFinalDisposition;
  readonly adjudicatedAt: string;
}

export interface P63V3AttemptRecord {
  readonly sequence: number;
  readonly measurement: "M" | "Rsem";
  readonly taskId: string | null;
  readonly repeat: number;
  readonly armLabel: string;
  readonly armKind: "EL" | "AF";
  readonly budgetTokens: number | "full";
  readonly attempt: number;
  readonly rawValidity: P63V3ScientificValidity;
  effectiveValidity: P63V3ScientificValidity;
  readonly rawFailureDomain: P63AttemptFailureDomain | "other";
  effectiveFailureDomain: P63AttemptFailureDomain | "other";
  infrastructureAdjudication: "not-applicable" | "pending" | "infrastructure-invalid";
  adjudication: P63V3AdjudicationRecord | null;
  readonly executionStatus: string;
  readonly passed: boolean | null;
  readonly semanticScore: number | null;
  readonly protocolValid: boolean | null;
  readonly estimatedCostUsd: number | null;
  readonly failureReason: string | null;
  readonly exposure: P63ExposureEvidence;
  readonly diagnosticSummary: Readonly<Record<string, unknown>>;
  artifactPath: string | null;
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface P63V3InFlightAttempt {
  readonly sequence: number;
  readonly attempt: number;
  readonly startedAt: string;
}

export interface P63V3InterruptedAttemptRecord {
  readonly sequence: number;
  readonly attempt: number;
  readonly startedAt: string;
  adjudication: (P63V3AdjudicationRecord & {
    readonly finalDisposition: "infrastructure-invalid";
  }) | null;
}

export interface P63V3CalibrationAuditFlag {
  readonly kind:
    | "infrastructure-adjudication-required"
    | "max-infrastructure-attempts-exhausted"
    | "unclassified-failure-domain"
    | "uncertain-in-flight-attempt";
  readonly sequence: number;
  readonly attempt: number;
  readonly reason: string;
  readonly createdAt: string;
}

export interface P63V3LiveCalibrationState {
  readonly schemaVersion: typeof P6_3_V3_LIVE_STATE_SCHEMA;
  readonly controllerVersion: typeof P6_3_V3_LIVE_CONTROLLER_VERSION;
  readonly calibrationRunnerVersion: typeof P6_3_V3_CALIBRATION_RUNNER_VERSION;
  readonly runClass: "scientific-calibration";
  readonly calibrationOnly: true;
  readonly confirmatoryStage1AEligible: false;
  status: P63V3ControllerStatus;
  readonly checkoutGitSha: string;
  readonly planHash: string;
  readonly treatmentProvenanceHash: string;
  readonly fixedEnvironmentIdentity: string;
  readonly authorizationDigest: string;
  readonly totalLogicalCells: number;
  cursorCellIndex: number;
  nextAttempt: number;
  inFlight: P63V3InFlightAttempt | null;
  attempts: P63V3AttemptRecord[];
  interruptedAttempts: P63V3InterruptedAttemptRecord[];
  auditFlag: P63V3CalibrationAuditFlag | null;
  estimatedCostUsd: number;
  readonly startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface P63V3ControlledExecutor {
  execute(
    cell: Readonly<P63V3CalibrationCell>,
    attempt: number
  ): Promise<P63CellOutcome>;
}

export interface P63V3LiveControllerPersistence {
  persistState(state: P63V3LiveCalibrationState): void | Promise<void>;
  persistAttemptArtifact(
    cell: Readonly<P63V3CalibrationCell>,
    attempt: number,
    payload: unknown
  ): string | Promise<string>;
}

export interface P63V3AdjudicationRequest {
  readonly sequence: number;
  readonly attempt: number;
  readonly reviewer: string;
  readonly reason: string;
  readonly finalDisposition: P63V3AdjudicationFinalDisposition;
  readonly adjudicatedAt?: string;
}

export function p63V3TreatmentProvenanceHash(
  prepared: Readonly<P63V3PreparedCalibrationRun>
): string {
  return sha256(stableJson(prepared.provenance));
}

/** Provider-free two-signal operator authorization, bound to one exact checkout/treatment. */
export function authorizeP63V3PaidLiveInvocation(args: {
  invocation: P63V3PaidLiveInvocationAuthorization;
  prepared: Readonly<P63V3PreparedCalibrationRun>;
}): P63V3PaidLiveRuntimeAuthorizationToken {
  const { invocation, prepared } = args;
  if (!invocation.live) {
    throw new Error("P6-3 v3 paid/live runtime authorization requires live=true");
  }
  if (!invocation.paidAuthorization) {
    throw new Error(
      `P6-3 v3 live execution blocked: explicit ${P6_3_V3_PAID_LIVE_AUTHORIZATION_FLAG} is required; no provider calls were made.`
    );
  }
  const environment = invocation.environment ?? process.env;
  if (environment[P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV] !== "1") {
    throw new Error(
      `P6-3 v3 live execution blocked: ${P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV}=1 is required in addition to the paid-live flag; no provider calls were made.`
    );
  }
  const checkoutGitSha = requireSha(invocation.checkoutGitSha, "checkoutGitSha");
  assertPreparedSelfConsistent(prepared);
  const treatmentProvenanceHash = p63V3TreatmentProvenanceHash(prepared);
  const authDigest = authorizationDigest({
    checkoutGitSha,
    planHash: prepared.planHash,
    treatmentProvenanceHash,
    fixedEnvironmentIdentity: prepared.provenance.fixedEnvironmentIdentity,
  });
  return Object.freeze({
    live: true,
    explicitPaidAuthorization: true,
    environmentAuthorization: true,
    checkoutGitSha,
    planHash: prepared.planHash,
    treatmentProvenanceHash,
    fixedEnvironmentIdentity: prepared.provenance.fixedEnvironmentIdentity,
    authorizationDigest: authDigest,
    [PAID_LIVE_RUNTIME_AUTH_BRAND]: true as const,
  });
}

export function assertP63V3PaidLiveRuntimeAuthorizationToken(
  token: P63V3PaidLiveRuntimeAuthorizationToken,
  prepared: Readonly<P63V3PreparedCalibrationRun>
): void {
  if (
    !token ||
    token[PAID_LIVE_RUNTIME_AUTH_BRAND] !== true ||
    token.live !== true ||
    token.explicitPaidAuthorization !== true ||
    token.environmentAuthorization !== true
  ) {
    throw new Error("P6-3 v3 requires a valid runtime paid/live authorization token");
  }
  assertPreparedSelfConsistent(prepared);
  const treatmentProvenanceHash = p63V3TreatmentProvenanceHash(prepared);
  if (
    token.planHash !== prepared.planHash ||
    token.treatmentProvenanceHash !== treatmentProvenanceHash ||
    token.fixedEnvironmentIdentity !== prepared.provenance.fixedEnvironmentIdentity
  ) {
    throw new Error("P6-3 v3 paid/live authorization token is bound to a different treatment");
  }
  const expectedDigest = authorizationDigest({
    checkoutGitSha: token.checkoutGitSha,
    planHash: token.planHash,
    treatmentProvenanceHash,
    fixedEnvironmentIdentity: token.fixedEnvironmentIdentity,
  });
  if (token.authorizationDigest !== expectedDigest) {
    throw new Error("P6-3 v3 paid/live authorization token digest mismatch");
  }
}

export function createP63V3LiveCalibrationState(args: {
  prepared: Readonly<P63V3PreparedCalibrationRun>;
  authorization: P63V3PaidLiveRuntimeAuthorizationToken;
  now?: string;
}): P63V3LiveCalibrationState {
  assertP63V3PaidLiveRuntimeAuthorizationToken(args.authorization, args.prepared);
  const now = args.now ?? new Date().toISOString();
  return {
    schemaVersion: P6_3_V3_LIVE_STATE_SCHEMA,
    controllerVersion: P6_3_V3_LIVE_CONTROLLER_VERSION,
    calibrationRunnerVersion: P6_3_V3_CALIBRATION_RUNNER_VERSION,
    runClass: "scientific-calibration",
    calibrationOnly: true,
    confirmatoryStage1AEligible: false,
    status: "running",
    checkoutGitSha: args.authorization.checkoutGitSha,
    planHash: args.prepared.planHash,
    treatmentProvenanceHash: args.authorization.treatmentProvenanceHash,
    fixedEnvironmentIdentity: args.prepared.provenance.fixedEnvironmentIdentity,
    authorizationDigest: args.authorization.authorizationDigest,
    totalLogicalCells: args.prepared.plan.length,
    cursorCellIndex: 0,
    nextAttempt: 1,
    inFlight: null,
    attempts: [],
    interruptedAttempts: [],
    auditFlag: null,
    estimatedCostUsd: 0,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

export function assertP63V3ResumeCompatible(args: {
  state: P63V3LiveCalibrationState;
  prepared: Readonly<P63V3PreparedCalibrationRun>;
  authorization: P63V3PaidLiveRuntimeAuthorizationToken;
}): void {
  const { state, prepared, authorization } = args;
  assertP63V3PaidLiveRuntimeAuthorizationToken(authorization, prepared);
  assertPreparedSelfConsistent(prepared);
  if (
    state.schemaVersion !== P6_3_V3_LIVE_STATE_SCHEMA ||
    state.controllerVersion !== P6_3_V3_LIVE_CONTROLLER_VERSION ||
    state.calibrationRunnerVersion !== P6_3_V3_CALIBRATION_RUNNER_VERSION ||
    state.runClass !== "scientific-calibration" ||
    state.calibrationOnly !== true ||
    state.confirmatoryStage1AEligible !== false
  ) {
    throw new Error("Resume refused: P6-3 v3 state/version provenance changed");
  }
  if (state.checkoutGitSha !== authorization.checkoutGitSha) {
    throw new Error("Resume refused: P6-3 v3 checkout SHA changed");
  }
  if (
    state.planHash !== prepared.planHash ||
    state.totalLogicalCells !== prepared.plan.length ||
    state.planHash !== p63V3CalibrationPlanHash(prepared.plan)
  ) {
    throw new Error("Resume refused: P6-3 v3 calibration plan changed");
  }
  if (
    state.treatmentProvenanceHash !== p63V3TreatmentProvenanceHash(prepared) ||
    state.fixedEnvironmentIdentity !== prepared.provenance.fixedEnvironmentIdentity
  ) {
    throw new Error("Resume refused: P6-3 v3 treatment provenance changed");
  }
  if (state.authorizationDigest !== authorization.authorizationDigest) {
    throw new Error("Resume refused: P6-3 v3 paid/live authorization changed");
  }
  if (
    !Number.isInteger(state.cursorCellIndex) ||
    state.cursorCellIndex < 0 ||
    state.cursorCellIndex > prepared.plan.length
  ) {
    throw new Error("Resume refused: invalid P6-3 v3 cursorCellIndex");
  }
  if (
    !Number.isInteger(state.nextAttempt) ||
    state.nextAttempt < 1 ||
    state.nextAttempt > P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL
  ) {
    throw new Error("Resume refused: invalid P6-3 v3 nextAttempt");
  }
  if (!Array.isArray(state.attempts) || !Array.isArray(state.interruptedAttempts)) {
    throw new Error("Resume refused: P6-3 v3 attempt journals are malformed");
  }
  for (const attempt of state.attempts) {
    if (
      (attempt.rawValidity !== "valid" && attempt.rawValidity !== "infrastructure-invalid") ||
      (attempt.effectiveValidity !== "valid" && attempt.effectiveValidity !== "infrastructure-invalid")
    ) {
      throw new Error("Resume refused: P6-3 v3 attempt scientific validity is malformed");
    }
  }
}

/**
 * A persisted provider-visible in-flight attempt is never blindly repeated.
 * Resume moves it into needs-audit until a human explicitly marks it invalid.
 */
export function recoverInterruptedP63V3State(state: P63V3LiveCalibrationState): void {
  const inFlight = state.inFlight;
  if (!inFlight) return;
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
    reason:
      "A P6-3 v3 scientific attempt was provider-visible/in-flight without a committed result; do not repeat it until explicitly adjudicated infrastructure-invalid.",
    createdAt: new Date().toISOString(),
  };
  touch(state);
}

/**
 * Fail-closed v3 state machine. The controller itself is provider-neutral: the
 * supplied executor is the only operation that can perform a scientific call.
 */
export async function executeP63V3ControlledCalibration(args: {
  state: P63V3LiveCalibrationState;
  prepared: Readonly<P63V3PreparedCalibrationRun>;
  authorization: P63V3PaidLiveRuntimeAuthorizationToken;
  executor: P63V3ControlledExecutor;
  persistence: P63V3LiveControllerPersistence;
}): Promise<P63V3LiveCalibrationState> {
  const { state, prepared, authorization, executor, persistence } = args;
  assertP63V3ResumeCompatible({ state, prepared, authorization });
  if (state.inFlight) {
    recoverInterruptedP63V3State(state);
    await persistence.persistState(state);
    return state;
  }
  if (state.status === "needs-audit" || state.status === "completed") return state;

  while (state.cursorCellIndex < prepared.plan.length) {
    const cell = prepared.plan[state.cursorCellIndex];
    const attempt = state.nextAttempt;
    if (!cell || cell.sequence !== state.cursorCellIndex) {
      throw new Error("P6-3 v3 plan/cursor sequence mismatch");
    }
    const startedAt = new Date().toISOString();
    state.inFlight = { sequence: cell.sequence, attempt, startedAt };
    touch(state);
    await persistence.persistState(state);

    // Intentionally not wrapped in an automatic retry catch. If execution or
    // artifact persistence throws after provider visibility, persisted inFlight
    // forces explicit interruption adjudication on resume.
    const outcome = await executor.execute(cell, attempt);
    const validity = requireP63V3ScientificValidity(outcome);
    const artifactPath = await persistence.persistAttemptArtifact(
      cell,
      attempt,
      outcome.artifactPayload
    );
    const finishedAt = new Date().toISOString();
    const requiresInfrastructureAdjudication =
      validity === "infrastructure-invalid" || outcome.failureDomain === "infrastructure";
    const record: P63V3AttemptRecord = {
      sequence: cell.sequence,
      measurement: cell.measurement,
      taskId: cell.taskId,
      repeat: cell.repeat,
      armLabel: cell.armLabel,
      armKind: cell.armKind,
      budgetTokens: cell.budgetTokens,
      attempt,
      rawValidity: validity,
      effectiveValidity: validity,
      rawFailureDomain: outcome.failureDomain,
      effectiveFailureDomain: outcome.failureDomain,
      infrastructureAdjudication:
        requiresInfrastructureAdjudication ? "pending" : "not-applicable",
      adjudication: null,
      executionStatus: outcome.executionStatus,
      passed: outcome.passed,
      semanticScore: outcome.semanticScore,
      protocolValid: outcome.protocolValid,
      estimatedCostUsd: outcome.estimatedCostUsd,
      failureReason: outcome.failureReason,
      exposure: outcome.exposure,
      diagnosticSummary: outcome.diagnosticSummary,
      artifactPath,
      startedAt,
      finishedAt,
    };
    state.attempts.push(record);
    state.inFlight = null;
    state.estimatedCostUsd += outcome.estimatedCostUsd ?? 0;

    if (requiresInfrastructureAdjudication) {
      state.status = "needs-audit";
      state.auditFlag = {
        kind: "infrastructure-adjudication-required",
        sequence: cell.sequence,
        attempt,
        reason:
          `P6-3 v3 outcome requires explicit validity adjudication before the logical cell may be replaced or consumed (validity=${validity}, failureDomain=${outcome.failureDomain}).`,
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
        reason: "P6-3 v3 scientific execution encountered an unclassified failure domain.",
        createdAt: finishedAt,
      };
      touch(state);
      await persistence.persistState(state);
      return state;
    }

    const transition = decideP63AttemptTransition({
      attempt,
      failureDomain: outcome.failureDomain,
      infrastructureAdjudication: "not-applicable",
    });
    if (transition !== "advance-next-arm") {
      throw new Error(`Unexpected P6-3 v3 scientific transition: ${transition}`);
    }
    advanceCell(state, prepared.plan.length);
    await persistence.persistState(state);
  }
  completeState(state);
  await persistence.persistState(state);
  return state;
}

export function applyP63V3Adjudication(args: {
  state: P63V3LiveCalibrationState;
  prepared: Readonly<P63V3PreparedCalibrationRun>;
  request: P63V3AdjudicationRequest;
}): void {
  const { state, prepared, request } = args;
  if (state.status !== "needs-audit" || !state.auditFlag) {
    throw new Error("P6-3 v3 adjudication requires needs-audit with an active audit flag");
  }
  const reviewer = requireText(request.reviewer, "reviewer");
  const reason = requireText(request.reason, "reason");
  if (state.cursorCellIndex !== request.sequence) {
    throw new Error("P6-3 v3 adjudication target must be the current logical cell");
  }
  const cell = prepared.plan[state.cursorCellIndex];
  if (!cell || cell.sequence !== request.sequence) {
    throw new Error("P6-3 v3 adjudication plan/cursor mismatch");
  }
  if (request.finalDisposition === "protocol-failure" && cell.measurement === "M") {
    throw new Error(
      "P6-3 v3 M adjudication preserves P6-2/P6-3 semantics and does not use protocol-failure final disposition"
    );
  }
  if (state.auditFlag.kind === "uncertain-in-flight-attempt") {
    resolveUncertainInterruptedAttempt(state, request, reviewer, reason);
    return;
  }
  const target = [...state.attempts]
    .reverse()
    .find((entry) => entry.sequence === request.sequence && entry.attempt === request.attempt);
  if (!target) throw new Error("P6-3 v3 adjudication target attempt not found");
  const adjudication: P63V3AdjudicationRecord = {
    reviewer,
    reason,
    finalDisposition: request.finalDisposition,
    adjudicatedAt: request.adjudicatedAt ?? new Date().toISOString(),
  };

  if (target.infrastructureAdjudication === "pending") {
    target.adjudication = adjudication;
    if (request.finalDisposition === "infrastructure-invalid") {
      target.infrastructureAdjudication = "infrastructure-invalid";
      target.effectiveValidity = "infrastructure-invalid";
      target.effectiveFailureDomain =
        target.rawFailureDomain === "other" ? "infrastructure" : target.rawFailureDomain;
      applyInfrastructureInvalidTransition(
        state,
        target.attempt,
        target.sequence,
        adjudication.adjudicatedAt
      );
      return;
    }
    target.infrastructureAdjudication = "not-applicable";
    target.effectiveValidity = "valid";
    target.effectiveFailureDomain =
      request.finalDisposition === "protocol-failure" ? "protocol" : "semantic";
    state.status = "running";
    state.auditFlag = null;
    advanceCell(state, prepared.plan.length);
    return;
  }

  if (target.rawFailureDomain === "other") {
    target.adjudication = adjudication;
    if (request.finalDisposition === "infrastructure-invalid") {
      target.effectiveValidity = "infrastructure-invalid";
      target.effectiveFailureDomain = "infrastructure";
      target.infrastructureAdjudication = "infrastructure-invalid";
      applyInfrastructureInvalidTransition(
        state,
        target.attempt,
        target.sequence,
        adjudication.adjudicatedAt
      );
      return;
    }
    target.infrastructureAdjudication = "not-applicable";
    target.effectiveValidity = "valid";
    target.effectiveFailureDomain =
      request.finalDisposition === "protocol-failure" ? "protocol" : "semantic";
    state.status = "running";
    state.auditFlag = null;
    advanceCell(state, prepared.plan.length);
    return;
  }
  throw new Error(
    `P6-3 v3 adjudication target is not audit-resolvable: validity=${target.rawValidity}, failureDomain=${target.rawFailureDomain}`
  );
}

export function summarizeP63V3ExecutionState(
  state: P63V3LiveCalibrationState
): {
  logicalCellsCompleted: number;
  scientificAttempts: number;
  replacementAttempts: number;
  interruptedAttempts: number;
  estimatedCostUsd: number;
  status: P63V3ControllerStatus;
  nextSequence: number | null;
} {
  return {
    logicalCellsCompleted: state.cursorCellIndex,
    scientificAttempts: state.attempts.length + state.interruptedAttempts.length,
    replacementAttempts:
      state.attempts.filter((entry) => entry.attempt > 1).length +
      state.interruptedAttempts.filter((entry) => entry.attempt > 1).length,
    interruptedAttempts: state.interruptedAttempts.length,
    estimatedCostUsd: state.estimatedCostUsd,
    status: state.status,
    nextSequence:
      state.cursorCellIndex < state.totalLogicalCells ? state.cursorCellIndex : null,
  };
}

function resolveUncertainInterruptedAttempt(
  state: P63V3LiveCalibrationState,
  request: P63V3AdjudicationRequest,
  reviewer: string,
  reason: string
): void {
  const target = [...state.interruptedAttempts].reverse().find(
    (entry) =>
      entry.sequence === request.sequence &&
      entry.attempt === request.attempt &&
      entry.adjudication === null
  );
  if (!target) {
    throw new Error("P6-3 v3 uncertain interrupted attempt not found or already adjudicated");
  }
  if (request.finalDisposition !== "infrastructure-invalid") {
    throw new Error(
      "P6-3 v3 uncertain interrupted outcome has no trustworthy scientific output; it may only be resolved as infrastructure-invalid"
    );
  }
  const adjudication = {
    reviewer,
    reason,
    finalDisposition: "infrastructure-invalid" as const,
    adjudicatedAt: request.adjudicatedAt ?? new Date().toISOString(),
  };
  target.adjudication = adjudication;
  applyInfrastructureInvalidTransition(
    state,
    target.attempt,
    target.sequence,
    adjudication.adjudicatedAt
  );
}

function applyInfrastructureInvalidTransition(
  state: P63V3LiveCalibrationState,
  attempt: number,
  sequence: number,
  adjudicatedAt: string
): void {
  const transition = decideP63AttemptTransition({
    attempt,
    failureDomain: "infrastructure",
    infrastructureAdjudication: "infrastructure-invalid",
  });
  if (transition === "retry-same-cell") {
    state.status = "running";
    state.auditFlag = null;
    state.nextAttempt = attempt + 1;
    state.inFlight = null;
    touch(state);
    return;
  }
  state.status = "needs-audit";
  state.auditFlag = {
    kind: "max-infrastructure-attempts-exhausted",
    sequence,
    attempt,
    reason:
      `P6-3 v3 logical cell exhausted ${P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL} infrastructure-invalid scientific attempts.`,
    createdAt: adjudicatedAt,
  };
  state.inFlight = null;
  touch(state);
}

function advanceCell(state: P63V3LiveCalibrationState, planLength: number): void {
  state.cursorCellIndex += 1;
  state.nextAttempt = 1;
  state.inFlight = null;
  state.auditFlag = null;
  state.status = state.cursorCellIndex >= planLength ? "completed" : "running";
  touch(state);
  if (state.status === "completed") state.completedAt = state.updatedAt;
}

function completeState(state: P63V3LiveCalibrationState): void {
  state.status = "completed";
  state.cursorCellIndex = state.totalLogicalCells;
  state.nextAttempt = 1;
  state.inFlight = null;
  state.auditFlag = null;
  touch(state);
  state.completedAt = state.updatedAt;
}

function assertPreparedSelfConsistent(
  prepared: Readonly<P63V3PreparedCalibrationRun>
): void {
  if (
    prepared.plan.length !== 864 ||
    prepared.provenance.logicalCellCount !== prepared.plan.length ||
    prepared.planHash !== p63V3CalibrationPlanHash(prepared.plan) ||
    prepared.provenance.planHash !== prepared.planHash ||
    prepared.provenance.fixedEnvironmentIdentity !==
      prepared.runStart.provenance.fixedEnvironmentIdentity
  ) {
    throw new Error("P6-3 v3 prepared calibration run is internally inconsistent");
  }
}

function authorizationDigest(args: {
  checkoutGitSha: string;
  planHash: string;
  treatmentProvenanceHash: string;
  fixedEnvironmentIdentity: string;
}): string {
  return sha256(stableJson({
    authorizationVersion: "p6-3-v3-paid-live-runtime-authorization-v1",
    controllerVersion: P6_3_V3_LIVE_CONTROLLER_VERSION,
    ...args,
  }));
}

function requireSha(value: string, name: string): string {
  const trimmed = value.trim();
  if (!/^[0-9a-f]{40}$/i.test(trimmed)) {
    throw new Error(`${name} must be a 40-character Git SHA`);
  }
  return trimmed.toLowerCase();
}

function requireText(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${name} must be non-empty`);
  return trimmed;
}

function touch(state: P63V3LiveCalibrationState): void {
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

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
