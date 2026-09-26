import * as crypto from "crypto";
import {
  P6_3_CALIBRATION_REPEAT_COUNT,
  P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL,
  buildP63CalibrationSchedule,
  decideP63AttemptTransition,
  type P63CalibrationArm,
  type P63AttemptFailureDomain,
} from "./p6-3-execution-protocol";
import {
  assertP63PreLiveGatePassToken,
  type P63PreLiveGatePassToken,
} from "./p6-3-unified-prelive-gate";
import { P6_2_PRIMARY_TASK_IDS } from "./af-baseline";

export const P6_3_LIVE_CALIBRATION_RUNNER_VERSION =
  "p6-3-live-calibration-runner-v1" as const;
export const P6_3_LIVE_CALIBRATION_STATE_SCHEMA =
  "p6-3-live-calibration-state-v1" as const;
export const P6_3_EXPECTED_NORMAL_CALL_COUNT = 864 as const;
export const P6_3_EXPECTED_M_CALL_COUNT = 792 as const;
export const P6_3_EXPECTED_RSEM_CALL_COUNT = 72 as const;

export type P63Measurement = "M" | "Rsem";
export type P63ArmLabel = "B0" | "B1" | "B2" | "B3" | "B4" | "AF";

export interface P63FrozenBudgets {
  readonly B0: number;
  readonly B1: number;
  readonly B2: number;
  readonly B3: number;
  readonly B4: number;
  readonly AF: number;
}

export interface P63CalibrationCell {
  readonly sequence: number;
  readonly measurement: P63Measurement;
  readonly taskId: string | null;
  readonly repeat: number;
  readonly blockKey: string;
  readonly arm: P63CalibrationArm;
  readonly budgetTokens: number | "full";
}

export interface P63ExposureEvidence {
  readonly mode: "EL-static" | "AF-full";
  readonly budgetTokens: number | "full";
  readonly actualExposedTokens: number;
  readonly fullRepositoryTokens: number;
  readonly staticPayloadHash: string;
  readonly exposureSetHash: string | null;
  readonly selectorPlanHash: string | null;
  readonly selectedUnitCount: number | null;
}

export interface P63CellOutcome {
  readonly failureDomain: P63AttemptFailureDomain | "other";
  readonly executionStatus: string;
  readonly passed: boolean | null;
  readonly semanticScore: number | null;
  readonly protocolValid: boolean | null;
  readonly estimatedCostUsd: number | null;
  readonly failureReason: string | null;
  readonly exposure: P63ExposureEvidence;
  readonly diagnosticSummary: Readonly<Record<string, unknown>>;
  readonly artifactPayload: unknown;
}

export type P63AdjudicationFinalDisposition =
  | "scientific-failure"
  | "protocol-failure"
  | "infrastructure-invalid";

export interface P63AdjudicationRecord {
  readonly reviewer: string;
  readonly reason: string;
  readonly finalDisposition: P63AdjudicationFinalDisposition;
  readonly adjudicatedAt: string;
}

export interface P63AttemptRecord {
  readonly sequence: number;
  readonly measurement: P63Measurement;
  readonly taskId: string | null;
  readonly repeat: number;
  readonly armLabel: P63ArmLabel;
  readonly armKind: "EL" | "AF";
  readonly budgetTokens: number | "full";
  readonly attempt: number;
  readonly rawFailureDomain: P63AttemptFailureDomain | "other";
  effectiveFailureDomain: P63AttemptFailureDomain | "other";
  infrastructureAdjudication: "not-applicable" | "pending" | "infrastructure-invalid";
  adjudication: P63AdjudicationRecord | null;
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

export interface P63InFlightAttempt {
  readonly sequence: number;
  readonly attempt: number;
  readonly startedAt: string;
}

export interface P63InterruptedAttemptRecord {
  readonly sequence: number;
  readonly attempt: number;
  readonly startedAt: string;
  adjudication: (P63AdjudicationRecord & {
    readonly finalDisposition: "infrastructure-invalid";
  }) | null;
}

export interface P63CalibrationAuditFlag {
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

export interface P63CalibrationState {
  readonly schemaVersion: typeof P6_3_LIVE_CALIBRATION_STATE_SCHEMA;
  readonly runnerVersion: typeof P6_3_LIVE_CALIBRATION_RUNNER_VERSION;
  readonly runClass: "scientific-calibration";
  readonly calibrationOnly: true;
  readonly confirmatoryStage1AEligible: false;
  status: "running" | "needs-audit" | "completed";
  readonly checkoutGitSha: string;
  readonly frozenManifestHashes: Readonly<Record<string, string>>;
  readonly planHash: string;
  readonly totalLogicalCells: number;
  cursorCellIndex: number;
  nextAttempt: number;
  inFlight: P63InFlightAttempt | null;
  attempts: P63AttemptRecord[];
  interruptedAttempts: P63InterruptedAttemptRecord[];
  auditFlag: P63CalibrationAuditFlag | null;
  estimatedCostUsd: number;
  readonly startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface P63CalibrationExecutor {
  execute(cell: P63CalibrationCell, attempt: number): Promise<P63CellOutcome>;
}

export interface P63CalibrationPersistence {
  persistState(state: P63CalibrationState): void | Promise<void>;
  persistAttemptArtifact(
    cell: P63CalibrationCell,
    attempt: number,
    payload: unknown
  ): string | Promise<string>;
}

export interface P63AdjudicationRequest {
  readonly sequence: number;
  readonly attempt: number;
  readonly reviewer: string;
  readonly reason: string;
  readonly finalDisposition: P63AdjudicationFinalDisposition;
  readonly adjudicatedAt?: string;
}

export function buildP63CalibrationPlan(
  budgets: P63FrozenBudgets,
  primaryTaskIds: readonly string[] = P6_2_PRIMARY_TASK_IDS
): readonly P63CalibrationCell[] {
  assertBudgets(budgets);
  const expectedPrimary = [...P6_2_PRIMARY_TASK_IDS];
  if (stableJson([...primaryTaskIds]) !== stableJson(expectedPrimary)) {
    throw new Error("P6-3 M plan must use the frozen 11-task primary bank in frozen order");
  }
  const schedule = buildP63CalibrationSchedule();
  if (schedule.length !== P6_3_CALIBRATION_REPEAT_COUNT) {
    throw new Error(`P6-3 schedule must contain ${P6_3_CALIBRATION_REPEAT_COUNT} repeats`);
  }
  const cells: P63CalibrationCell[] = [];
  let sequence = 0;
  for (const taskId of primaryTaskIds) {
    for (const scheduled of schedule) {
      const blockKey = `M:${taskId}:repeat-${scheduled.repeat}`;
      for (const arm of scheduled.arms) {
        cells.push(freezeCell({
          sequence: sequence++, measurement: "M", taskId,
          repeat: scheduled.repeat, blockKey, arm,
          budgetTokens: budgetForArm(arm, budgets),
        }));
      }
    }
  }
  const mCount = cells.length;
  if (mCount !== P6_3_EXPECTED_M_CALL_COUNT) {
    throw new Error(`P6-3 M plan expected ${P6_3_EXPECTED_M_CALL_COUNT} cells, got ${mCount}`);
  }
  for (const scheduled of schedule) {
    const blockKey = `Rsem:bank-12:repeat-${scheduled.repeat}`;
    for (const arm of scheduled.arms) {
      cells.push(freezeCell({
        sequence: sequence++, measurement: "Rsem", taskId: null,
        repeat: scheduled.repeat, blockKey, arm,
        budgetTokens: budgetForArm(arm, budgets),
      }));
    }
  }
  if (cells.length - mCount !== P6_3_EXPECTED_RSEM_CALL_COUNT) {
    throw new Error(`P6-3 Rsem plan expected ${P6_3_EXPECTED_RSEM_CALL_COUNT} cells, got ${cells.length - mCount}`);
  }
  if (cells.length !== P6_3_EXPECTED_NORMAL_CALL_COUNT) {
    throw new Error(`P6-3 normal plan expected ${P6_3_EXPECTED_NORMAL_CALL_COUNT} cells, got ${cells.length}`);
  }
  assertBlockContiguity(cells);
  return Object.freeze(cells);
}

export function p63CalibrationPlanHash(plan: readonly P63CalibrationCell[]): string {
  return sha256(stableJson(plan));
}

export function createP63CalibrationState(
  token: P63PreLiveGatePassToken,
  plan: readonly P63CalibrationCell[]
): P63CalibrationState {
  assertP63PreLiveGatePassToken(token);
  if (plan.length !== P6_3_EXPECTED_NORMAL_CALL_COUNT) {
    throw new Error("P6-3 calibration state requires the complete frozen 864-cell normal plan");
  }
  const now = new Date().toISOString();
  return {
    schemaVersion: P6_3_LIVE_CALIBRATION_STATE_SCHEMA,
    runnerVersion: P6_3_LIVE_CALIBRATION_RUNNER_VERSION,
    runClass: "scientific-calibration",
    calibrationOnly: true,
    confirmatoryStage1AEligible: false,
    status: "running",
    checkoutGitSha: token.receipt.checkoutGitSha,
    frozenManifestHashes: manifestHashes(token),
    planHash: p63CalibrationPlanHash(plan),
    totalLogicalCells: plan.length,
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

export function assertP63ResumeCompatible(
  state: P63CalibrationState,
  token: P63PreLiveGatePassToken,
  plan: readonly P63CalibrationCell[]
): void {
  assertP63PreLiveGatePassToken(token);
  if (
    state.schemaVersion !== P6_3_LIVE_CALIBRATION_STATE_SCHEMA ||
    state.runnerVersion !== P6_3_LIVE_CALIBRATION_RUNNER_VERSION ||
    state.runClass !== "scientific-calibration" ||
    state.calibrationOnly !== true ||
    state.confirmatoryStage1AEligible !== false
  ) throw new Error("Resume refused: P6-3 calibration state/version provenance changed");
  if (state.checkoutGitSha !== token.receipt.checkoutGitSha) {
    throw new Error(`Resume refused: checkout SHA changed (${state.checkoutGitSha} -> ${token.receipt.checkoutGitSha})`);
  }
  if (stableJson(state.frozenManifestHashes) !== stableJson(manifestHashes(token))) {
    throw new Error("Resume refused: frozen pre-live manifest hashes changed");
  }
  if (state.planHash !== p63CalibrationPlanHash(plan) || state.totalLogicalCells !== plan.length) {
    throw new Error("Resume refused: frozen P6-3 calibration plan changed");
  }
  if (!Number.isInteger(state.cursorCellIndex) || state.cursorCellIndex < 0 || state.cursorCellIndex > plan.length) {
    throw new Error("Resume refused: invalid P6-3 cursorCellIndex");
  }
  if (!Number.isInteger(state.nextAttempt) || state.nextAttempt < 1 || state.nextAttempt > P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL) {
    throw new Error("Resume refused: invalid P6-3 nextAttempt");
  }
  if (!Array.isArray(state.attempts) || !Array.isArray(state.interruptedAttempts)) {
    throw new Error("Resume refused: P6-3 attempt journals are malformed");
  }
}

export function recoverInterruptedP63State(state: P63CalibrationState): void {
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
    reason: "A scientific attempt was marked in-flight without a committed result; do not blindly repeat a potentially billable/provider-visible call. Resolve it explicitly as infrastructure-invalid before retrying.",
    createdAt: new Date().toISOString(),
  };
  touch(state);
}

export async function executeP63Calibration(
  state: P63CalibrationState,
  token: P63PreLiveGatePassToken,
  plan: readonly P63CalibrationCell[],
  executor: P63CalibrationExecutor,
  persistence: P63CalibrationPersistence
): Promise<P63CalibrationState> {
  assertP63ResumeCompatible(state, token, plan);
  if (state.inFlight) {
    recoverInterruptedP63State(state);
    await persistence.persistState(state);
    return state;
  }
  if (state.status === "needs-audit" || state.status === "completed") return state;
  while (state.cursorCellIndex < plan.length) {
    const cell = plan[state.cursorCellIndex];
    const attempt = state.nextAttempt;
    if (!cell || cell.sequence !== state.cursorCellIndex) throw new Error("P6-3 plan/cursor sequence mismatch");
    const startedAt = new Date().toISOString();
    state.inFlight = { sequence: cell.sequence, attempt, startedAt };
    touch(state);
    await persistence.persistState(state);
    const outcome = await executor.execute(cell, attempt);
    const artifactPath = await persistence.persistAttemptArtifact(cell, attempt, outcome.artifactPayload);
    const finishedAt = new Date().toISOString();
    const record: P63AttemptRecord = {
      sequence: cell.sequence, measurement: cell.measurement, taskId: cell.taskId,
      repeat: cell.repeat, armLabel: cell.arm.label, armKind: cell.arm.kind,
      budgetTokens: cell.budgetTokens, attempt,
      rawFailureDomain: outcome.failureDomain,
      effectiveFailureDomain: outcome.failureDomain,
      infrastructureAdjudication: outcome.failureDomain === "infrastructure" ? "pending" : "not-applicable",
      adjudication: null,
      executionStatus: outcome.executionStatus, passed: outcome.passed,
      semanticScore: outcome.semanticScore, protocolValid: outcome.protocolValid,
      estimatedCostUsd: outcome.estimatedCostUsd, failureReason: outcome.failureReason,
      exposure: outcome.exposure, diagnosticSummary: outcome.diagnosticSummary,
      artifactPath, startedAt, finishedAt,
    };
    state.attempts.push(record);
    state.inFlight = null;
    state.estimatedCostUsd += outcome.estimatedCostUsd ?? 0;
    if (outcome.failureDomain === "infrastructure") {
      state.status = "needs-audit";
      state.auditFlag = {
        kind: "infrastructure-adjudication-required", sequence: cell.sequence, attempt,
        reason: "Infrastructure-domain outcome requires explicit adjudication before the same logical cell may be replaced.",
        createdAt: finishedAt,
      };
      touch(state);
      await persistence.persistState(state);
      return state;
    }
    if (outcome.failureDomain === "other") {
      state.status = "needs-audit";
      state.auditFlag = {
        kind: "unclassified-failure-domain", sequence: cell.sequence, attempt,
        reason: "P6-3 scientific execution encountered an unclassified failure domain.",
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
    if (transition !== "advance-next-arm") throw new Error(`Unexpected P6-3 scientific transition: ${transition}`);
    advanceCell(state, plan.length);
    await persistence.persistState(state);
  }
  completeState(state);
  await persistence.persistState(state);
  return state;
}

export function applyP63Adjudication(
  state: P63CalibrationState,
  plan: readonly P63CalibrationCell[],
  request: P63AdjudicationRequest
): void {
  if (state.status !== "needs-audit" || !state.auditFlag) {
    throw new Error("P6-3 adjudication requires a needs-audit state with an active audit flag");
  }
  const reviewer = requireText(request.reviewer, "reviewer");
  const reason = requireText(request.reason, "reason");
  if (state.cursorCellIndex !== request.sequence) {
    throw new Error("P6-3 adjudication target must be the current logical cell");
  }
  const cell = plan[state.cursorCellIndex];
  if (!cell || cell.sequence !== request.sequence) throw new Error("P6-3 adjudication plan/cursor mismatch");
  if (request.finalDisposition === "protocol-failure" && cell.measurement === "M") {
    throw new Error("P6-3 M adjudication preserves P6-2 semantics and does not use protocol-failure final disposition");
  }
  if (state.auditFlag.kind === "uncertain-in-flight-attempt") {
    resolveUncertainInterruptedAttempt(state, request, reviewer, reason);
    return;
  }
  const target = [...state.attempts].reverse()
    .find((entry) => entry.sequence === request.sequence && entry.attempt === request.attempt);
  if (!target) throw new Error("P6-3 adjudication target attempt not found");
  const adjudication: P63AdjudicationRecord = {
    reviewer, reason, finalDisposition: request.finalDisposition,
    adjudicatedAt: request.adjudicatedAt ?? new Date().toISOString(),
  };
  if (target.rawFailureDomain === "infrastructure") {
    if (target.infrastructureAdjudication !== "pending") throw new Error("P6-3 infrastructure adjudication target is not pending");
    target.adjudication = adjudication;
    if (request.finalDisposition === "infrastructure-invalid") {
      target.infrastructureAdjudication = "infrastructure-invalid";
      target.effectiveFailureDomain = "infrastructure";
      applyInfrastructureInvalidTransition(state, target.attempt, target.sequence, adjudication.adjudicatedAt);
      return;
    }
    target.infrastructureAdjudication = "not-applicable";
    target.effectiveFailureDomain = "semantic";
    state.status = "running";
    state.auditFlag = null;
    advanceCell(state, plan.length);
    return;
  }
  if (target.rawFailureDomain === "other") {
    target.adjudication = adjudication;
    if (request.finalDisposition === "infrastructure-invalid") {
      target.effectiveFailureDomain = "infrastructure";
      target.infrastructureAdjudication = "infrastructure-invalid";
      applyInfrastructureInvalidTransition(state, target.attempt, target.sequence, adjudication.adjudicatedAt);
      return;
    }
    target.infrastructureAdjudication = "not-applicable";
    target.effectiveFailureDomain = request.finalDisposition === "protocol-failure" ? "protocol" : "semantic";
    state.status = "running";
    state.auditFlag = null;
    advanceCell(state, plan.length);
    return;
  }
  throw new Error(`P6-3 adjudication target raw failure domain is not audit-resolvable: ${target.rawFailureDomain}`);
}

export function summarizeP63ExecutionState(state: P63CalibrationState): {
  logicalCellsCompleted: number;
  scientificAttempts: number;
  replacementAttempts: number;
  interruptedAttempts: number;
  estimatedCostUsd: number;
  status: P63CalibrationState["status"];
  nextSequence: number | null;
} {
  const interruptedAttempts = state.interruptedAttempts ?? [];
  return {
    logicalCellsCompleted: state.cursorCellIndex,
    scientificAttempts: state.attempts.length + interruptedAttempts.length,
    replacementAttempts:
      state.attempts.filter((entry) => entry.attempt > 1).length +
      interruptedAttempts.filter((entry) => entry.attempt > 1).length,
    interruptedAttempts: interruptedAttempts.length,
    estimatedCostUsd: state.estimatedCostUsd,
    status: state.status,
    nextSequence: state.cursorCellIndex < state.totalLogicalCells ? state.cursorCellIndex : null,
  };
}

function resolveUncertainInterruptedAttempt(
  state: P63CalibrationState,
  request: P63AdjudicationRequest,
  reviewer: string,
  reason: string
): void {
  const target = [...state.interruptedAttempts].reverse().find(
    (entry) => entry.sequence === request.sequence && entry.attempt === request.attempt && entry.adjudication === null
  );
  if (!target) throw new Error("P6-3 uncertain interrupted attempt record not found or already adjudicated");
  if (request.finalDisposition !== "infrastructure-invalid") {
    throw new Error("P6-3 uncertain interrupted outcome has no trustworthy scientific output; it may only be resolved as infrastructure-invalid");
  }
  const adjudication = {
    reviewer, reason, finalDisposition: "infrastructure-invalid" as const,
    adjudicatedAt: request.adjudicatedAt ?? new Date().toISOString(),
  };
  target.adjudication = adjudication;
  applyInfrastructureInvalidTransition(state, target.attempt, target.sequence, adjudication.adjudicatedAt);
}

function applyInfrastructureInvalidTransition(
  state: P63CalibrationState,
  attempt: number,
  sequence: number,
  adjudicatedAt: string
): void {
  const transition = decideP63AttemptTransition({
    attempt, failureDomain: "infrastructure",
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
    kind: "max-infrastructure-attempts-exhausted", sequence, attempt,
    reason: `P6-3 logical cell exhausted ${P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL} infrastructure-invalid scientific attempts.`,
    createdAt: adjudicatedAt,
  };
  state.inFlight = null;
  touch(state);
}

function budgetForArm(arm: P63CalibrationArm, budgets: P63FrozenBudgets): number | "full" {
  return arm.kind === "AF" ? "full" : budgets[arm.label];
}

function freezeCell(cell: P63CalibrationCell): P63CalibrationCell {
  return Object.freeze({ ...cell, arm: Object.freeze({ ...cell.arm }) });
}

function assertBudgets(budgets: P63FrozenBudgets): void {
  const labels: P63ArmLabel[] = ["B0", "B1", "B2", "B3", "B4", "AF"];
  for (const label of labels) {
    const value = budgets[label];
    if (!Number.isInteger(value) || value < 0) throw new Error(`P6-3 frozen budget ${label} must be a non-negative integer`);
  }
  if (budgets.B0 !== 0) throw new Error("P6-3 B0 must remain 0");
  if (!(budgets.B0 < budgets.B1 && budgets.B1 < budgets.B2 && budgets.B2 < budgets.B3 && budgets.B3 < budgets.B4 && budgets.B4 < budgets.AF)) {
    throw new Error("P6-3 frozen budgets must remain strictly increasing through AF");
  }
}

function assertBlockContiguity(cells: readonly P63CalibrationCell[]): void {
  const spans = new Map<string, { first: number; last: number; count: number }>();
  for (const cell of cells) {
    const current = spans.get(cell.blockKey);
    if (!current) spans.set(cell.blockKey, { first: cell.sequence, last: cell.sequence, count: 1 });
    else { current.last = cell.sequence; current.count += 1; }
  }
  for (const [blockKey, span] of spans) {
    if (span.count !== 6 || span.last - span.first !== 5) throw new Error(`P6-3 six-arm block is not contiguous: ${blockKey}`);
  }
}

function manifestHashes(token: P63PreLiveGatePassToken): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(token.receipt.manifests)
      .map(([key, evidence]) => [key, evidence.sha256])
      .sort(([a], [b]) => a.localeCompare(b))
  ));
}

function advanceCell(state: P63CalibrationState, planLength: number): void {
  state.cursorCellIndex += 1;
  state.nextAttempt = 1;
  state.inFlight = null;
  state.auditFlag = null;
  state.status = state.cursorCellIndex >= planLength ? "completed" : "running";
  touch(state);
  if (state.status === "completed") state.completedAt = state.updatedAt;
}

function completeState(state: P63CalibrationState): void {
  state.status = "completed";
  state.cursorCellIndex = state.totalLogicalCells;
  state.nextAttempt = 1;
  state.inFlight = null;
  state.auditFlag = null;
  touch(state);
  state.completedAt = state.updatedAt;
}

function touch(state: P63CalibrationState): void { state.updatedAt = new Date().toISOString(); }
function requireText(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${name} must be non-empty`);
  return trimmed;
}
function stableJson(value: unknown): string { return JSON.stringify(sortJson(value)); }
function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) result[key] = sortJson((value as Record<string, unknown>)[key]);
    return result;
  }
  return value;
}
function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
