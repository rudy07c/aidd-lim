import { createHash } from "crypto";
import {
  P6_3_V3_RSEM_RELIABILITY_AUDIT_COST_CEILING_USD,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_ATTEMPTS_PER_TRIAL,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_RUN_CLASS,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_SPEC_VERSION,
  projectedP63V3RSemReliabilityAttemptCostUsd,
  summarizeP63V3RSemReliabilityCandidate,
  type P63V3RSemReliabilityAuditCandidateCap,
  type P63V3RSemReliabilityAuditCell,
  type P63V3RSemReliabilityDecisionRecord,
} from "./p6-3-v3-rsem-reliability-audit-spec";
import type {
  P63V3PreparedRSemReliabilityAudit,
} from "./p6-3-v3-rsem-reliability-audit-runner";
import type {
  P63V3RSemReliabilityAuditExecutorOutcome,
} from "./p6-3-v3-rsem-reliability-audit-executor";

export const P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTROLLER_VERSION =
  "p6-3-v3-rsem-reliability-audit-controller-v2" as const;
export const P6_3_V3_RSEM_RELIABILITY_AUDIT_STATE_SCHEMA =
  "p6-3-v3-rsem-reliability-audit-state-v2" as const;
export const P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_FLAG =
  "--authorize-paid-live=P6-3-v3-rsem-reliability-audit" as const;
export const P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_ENV =
  "P6_3_V3_RSEM_RELIABILITY_AUDIT_LIVE_ALLOWED" as const;

const AUTH_BRAND: unique symbol = Symbol(
  "p6-3-v3-rsem-reliability-audit-paid-authorization"
);

export type P63V3RSemReliabilityAuditStatus =
  | "running"
  | "needs-audit"
  | "needs-design-audit"
  | "completed";

export type P63V3RSemReliabilityAuditFlagKind =
  | "non-cap-infrastructure-adjudication-required"
  | "max-non-cap-attempts-exhausted"
  | "protocol-invalid"
  | "uncertain-in-flight-attempt"
  | "operational-cost-ceiling-reached"
  | "operational-cost-ceiling-exceeded-after-call"
  | "hard-audit-cap-censored";

export interface P63V3RSemReliabilityAuditFlag {
  readonly kind: P63V3RSemReliabilityAuditFlagKind;
  readonly sequence: number;
  readonly attempt: number;
  readonly reason: string;
  readonly createdAt: string;
}

export interface P63V3RSemReliabilityAuditAdjudication {
  readonly reviewer: string;
  readonly reason: string;
  readonly action: "replace-non-cap-infrastructure" | "abort-audit";
  readonly adjudicatedAt: string;
}

export interface P63V3RSemReliabilityAuditAttemptRecord
  extends P63V3RSemReliabilityDecisionRecord {
  readonly artifactPath: string | null;
  readonly reservedCostUsd: number;
  adjudication: P63V3RSemReliabilityAuditAdjudication | null;
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface P63V3RSemReliabilityAuditInFlight {
  readonly sequence: number;
  readonly attempt: number;
  readonly startedAt: string;
}

export interface P63V3RSemReliabilityAuditInterruptedAttempt {
  readonly sequence: number;
  readonly attempt: number;
  readonly startedAt: string;
  readonly reservedCostUsd: number;
  adjudication: P63V3RSemReliabilityAuditAdjudication | null;
}

export interface P63V3RSemReliabilityAuditState {
  readonly schemaVersion: typeof P6_3_V3_RSEM_RELIABILITY_AUDIT_STATE_SCHEMA;
  readonly controllerVersion:
    typeof P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTROLLER_VERSION;
  readonly specVersion: typeof P6_3_V3_RSEM_RELIABILITY_AUDIT_SPEC_VERSION;
  readonly runClass: typeof P6_3_V3_RSEM_RELIABILITY_AUDIT_RUN_CLASS;
  readonly scientificPoolingAllowed: false;
  readonly checkoutGitSha: string;
  readonly planHash: string;
  readonly provenanceHash: string;
  readonly fixedEnvironmentIdentity: string;
  status: P63V3RSemReliabilityAuditStatus;
  cursorCellIndex: number;
  nextAttempt: number;
  selectedMaxOutputTokens: P63V3RSemReliabilityAuditCandidateCap | null;
  inFlight: P63V3RSemReliabilityAuditInFlight | null;
  attempts: P63V3RSemReliabilityAuditAttemptRecord[];
  interruptedAttempts: P63V3RSemReliabilityAuditInterruptedAttempt[];
  auditFlag: P63V3RSemReliabilityAuditFlag | null;
  accumulatedEstimatedCostUsd: number;
  reservedUnknownCostUsd: number;
  readonly operationalCostCeilingUsd: number;
  readonly startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type P63V3RSemReliabilityAuditAuthorizationToken = Readonly<{
  readonly live: true;
  readonly explicitPaidAuthorization: true;
  readonly environmentAuthorization: true;
  readonly checkoutGitSha: string;
  readonly planHash: string;
  readonly provenanceHash: string;
  readonly authorizationDigest: string;
  [AUTH_BRAND]: true;
}>;

export interface P63V3RSemReliabilityAuditExecutor {
  execute(
    cell: Readonly<P63V3RSemReliabilityAuditCell>,
    attempt: number
  ): Promise<P63V3RSemReliabilityAuditExecutorOutcome>;
}

export interface P63V3RSemReliabilityAuditPersistence {
  persistState(
    state: Readonly<P63V3RSemReliabilityAuditState>
  ): void | Promise<void>;
  persistAttemptArtifact(
    cell: Readonly<P63V3RSemReliabilityAuditCell>,
    attempt: number,
    payload: unknown
  ): string | Promise<string>;
}

export function authorizeP63V3RSemReliabilityAuditPaidInvocation(args: {
  live: boolean;
  paidAuthorization: boolean;
  environment?: NodeJS.ProcessEnv;
  checkoutGitSha: string;
  prepared: Readonly<P63V3PreparedRSemReliabilityAudit>;
}): P63V3RSemReliabilityAuditAuthorizationToken {
  if (!args.live) {
    throw new Error("Rsem reliability audit paid authorization requires live=true");
  }
  if (!args.paidAuthorization) {
    throw new Error(
      `Rsem reliability audit requires explicit ${P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_FLAG}`
    );
  }
  const environment = args.environment ?? process.env;
  if (environment[P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_ENV] !== "1") {
    throw new Error(
      `Rsem reliability audit requires ${P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_ENV}=1`
    );
  }
  const checkoutGitSha = requireSha(args.checkoutGitSha, "checkoutGitSha");
  const provenanceHash = p63V3RSemReliabilityAuditProvenanceHash(args.prepared);
  const authorizationDigest = sha256(stableJson({
    controllerVersion: P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTROLLER_VERSION,
    specVersion: P6_3_V3_RSEM_RELIABILITY_AUDIT_SPEC_VERSION,
    checkoutGitSha,
    planHash: args.prepared.planHash,
    provenanceHash,
    operationalCostCeilingUsd:
      P6_3_V3_RSEM_RELIABILITY_AUDIT_COST_CEILING_USD,
  }));
  return Object.freeze({
    live: true,
    explicitPaidAuthorization: true,
    environmentAuthorization: true,
    checkoutGitSha,
    planHash: args.prepared.planHash,
    provenanceHash,
    authorizationDigest,
    [AUTH_BRAND]: true as const,
  });
}

export function createP63V3RSemReliabilityAuditState(args: {
  prepared: Readonly<P63V3PreparedRSemReliabilityAudit>;
  authorization: P63V3RSemReliabilityAuditAuthorizationToken;
}): P63V3RSemReliabilityAuditState {
  assertAuthorizationCompatible(args.authorization, args.prepared);
  const now = new Date().toISOString();
  return {
    schemaVersion: P6_3_V3_RSEM_RELIABILITY_AUDIT_STATE_SCHEMA,
    controllerVersion: P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTROLLER_VERSION,
    specVersion: P6_3_V3_RSEM_RELIABILITY_AUDIT_SPEC_VERSION,
    runClass: P6_3_V3_RSEM_RELIABILITY_AUDIT_RUN_CLASS,
    scientificPoolingAllowed: false,
    checkoutGitSha: args.authorization.checkoutGitSha,
    planHash: args.prepared.planHash,
    provenanceHash: args.authorization.provenanceHash,
    fixedEnvironmentIdentity:
      args.prepared.provenance.fixedEnvironmentIdentity,
    status: "running",
    cursorCellIndex: 0,
    nextAttempt: 1,
    selectedMaxOutputTokens: null,
    inFlight: null,
    attempts: [],
    interruptedAttempts: [],
    auditFlag: null,
    accumulatedEstimatedCostUsd: 0,
    reservedUnknownCostUsd: 0,
    operationalCostCeilingUsd:
      P6_3_V3_RSEM_RELIABILITY_AUDIT_COST_CEILING_USD,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

export async function executeP63V3ControlledRSemReliabilityAudit(args: {
  state: P63V3RSemReliabilityAuditState;
  prepared: Readonly<P63V3PreparedRSemReliabilityAudit>;
  authorization: P63V3RSemReliabilityAuditAuthorizationToken;
  executor: P63V3RSemReliabilityAuditExecutor;
  persistence: P63V3RSemReliabilityAuditPersistence;
}): Promise<P63V3RSemReliabilityAuditState> {
  const { state, prepared, authorization, executor, persistence } = args;
  assertStateCompatible(state, prepared, authorization);

  while (state.status === "running") {
    const cell = prepared.plan[state.cursorCellIndex];
    if (!cell) {
      throw new Error("Rsem reliability audit cursor escaped the frozen plan");
    }
    if (
      state.nextAttempt < 1 ||
      state.nextAttempt >
        P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_ATTEMPTS_PER_TRIAL
    ) {
      throw new Error("Rsem reliability audit attempt cursor is invalid");
    }

    const projected =
      projectedP63V3RSemReliabilityAttemptCostUsd(cell.candidateCap);
    if (
      state.accumulatedEstimatedCostUsd +
        state.reservedUnknownCostUsd +
        projected >
      state.operationalCostCeilingUsd
    ) {
      setAuditFlag(state, {
        kind: "operational-cost-ceiling-reached",
        sequence: cell.sequence,
        attempt: state.nextAttempt,
        reason:
          `projected cost ${projected.toFixed(6)} with known=${state.accumulatedEstimatedCostUsd.toFixed(6)} reserved=${state.reservedUnknownCostUsd.toFixed(6)} would cross ceiling ${state.operationalCostCeilingUsd.toFixed(2)}`,
      });
      await persistence.persistState(state);
      break;
    }

    const startedAt = new Date().toISOString();
    state.inFlight = {
      sequence: cell.sequence,
      attempt: state.nextAttempt,
      startedAt,
    };
    touch(state);
    await persistence.persistState(state);

    const outcome = await executor.execute(cell, state.nextAttempt);
    const artifactPath = await persistence.persistAttemptArtifact(
      cell,
      state.nextAttempt,
      outcome.artifact
    );
    const finishedAt = new Date().toISOString();
    const decision = outcome.decision;
    const record: P63V3RSemReliabilityAuditAttemptRecord = {
      sequence: cell.sequence,
      candidateCap: cell.candidateCap,
      trial: cell.trial,
      armLabel: cell.armLabel,
      attempt: state.nextAttempt,
      disposition: decision.disposition,
      responseStatus: decision.responseStatus,
      incompleteReason: decision.incompleteReason,
      configuredMaxOutputTokens: decision.configuredMaxOutputTokens,
      inputTokens: decision.inputTokens,
      outputTokens: decision.outputTokens,
      reasoningOutputTokens: decision.reasoningOutputTokens,
      totalTokens: decision.totalTokens,
      structureValid: decision.structureValid,
      capUsageMatchedConfiguredLimit:
        decision.capUsageMatchedConfiguredLimit,
      outputUtilizationRatio: decision.outputUtilizationRatio,
      reasoningUtilizationRatio: decision.reasoningUtilizationRatio,
      estimatedCostUsd: decision.estimatedCostUsd,
      failureReason: decision.failureReason,
      artifactPath,
      reservedCostUsd:
        decision.estimatedCostUsd === null ? projected : 0,
      adjudication: null,
      startedAt,
      finishedAt,
    };
    state.attempts.push(record);
    state.inFlight = null;
    if (
      decision.estimatedCostUsd !== null &&
      Number.isFinite(decision.estimatedCostUsd) &&
      decision.estimatedCostUsd >= 0
    ) {
      state.accumulatedEstimatedCostUsd += decision.estimatedCostUsd;
    } else {
      state.reservedUnknownCostUsd += projected;
    }
    touch(state);

    if (
      state.accumulatedEstimatedCostUsd +
        state.reservedUnknownCostUsd >
      state.operationalCostCeilingUsd
    ) {
      setAuditFlag(state, {
        kind: "operational-cost-ceiling-exceeded-after-call",
        sequence: cell.sequence,
        attempt: record.attempt,
        reason:
          `cost-control total known=${state.accumulatedEstimatedCostUsd.toFixed(6)} reserved=${state.reservedUnknownCostUsd.toFixed(6)} exceeded ceiling ${state.operationalCostCeilingUsd.toFixed(2)}`,
      });
      await persistence.persistState(state);
      break;
    }

    if (decision.disposition === "valid-audit-trial") {
      state.cursorCellIndex += 1;
      state.nextAttempt = 1;
      const next = prepared.plan[state.cursorCellIndex];
      if (!next || next.candidateCap !== cell.candidateCap) {
        const summary = summarizeP63V3RSemReliabilityCandidate(
          state.attempts,
          cell.candidateCap
        );
        if (summary.status !== "qualified") {
          throw new Error(
            `Rsem reliability audit candidate ${cell.candidateCap} reached boundary without qualification`
          );
        }
        state.status = "completed";
        state.selectedMaxOutputTokens = cell.candidateCap;
        state.completedAt = new Date().toISOString();
      }
      touch(state);
      await persistence.persistState(state);
      continue;
    }

    if (decision.disposition === "cap-censored") {
      if (cell.candidateCap === 32000) {
        const nextIndex = prepared.plan.findIndex(
          (candidate) => candidate.candidateCap === 64000
        );
        if (nextIndex < 0) {
          throw new Error("Rsem reliability audit 64k candidate missing");
        }
        state.cursorCellIndex = nextIndex;
        state.nextAttempt = 1;
        state.auditFlag = null;
        touch(state);
        await persistence.persistState(state);
        continue;
      }
      state.status = "needs-design-audit";
      setAuditFlag(state, {
        kind: "hard-audit-cap-censored",
        sequence: cell.sequence,
        attempt: record.attempt,
        reason:
          "64000-token candidate returned provider-declared max_output_tokens censoring; 128000 auto-escalation is prohibited",
      }, false);
      await persistence.persistState(state);
      break;
    }

    if (decision.disposition === "protocol-invalid") {
      setAuditFlag(state, {
        kind: "protocol-invalid",
        sequence: cell.sequence,
        attempt: record.attempt,
        reason: decision.failureReason ?? "protocol-invalid audit response",
      });
      await persistence.persistState(state);
      break;
    }

    if (
      record.attempt >=
      P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_ATTEMPTS_PER_TRIAL
    ) {
      setAuditFlag(state, {
        kind: "max-non-cap-attempts-exhausted",
        sequence: cell.sequence,
        attempt: record.attempt,
        reason:
          "non-cap infrastructure replacement would require a fourth provider-visible attempt",
      });
    } else {
      setAuditFlag(state, {
        kind: "non-cap-infrastructure-adjudication-required",
        sequence: cell.sequence,
        attempt: record.attempt,
        reason:
          decision.failureReason ?? "non-cap infrastructure event requires adjudication",
      });
    }
    await persistence.persistState(state);
    break;
  }

  return state;
}

export function applyP63V3RSemReliabilityAuditAdjudication(args: {
  state: P63V3RSemReliabilityAuditState;
  prepared: Readonly<P63V3PreparedRSemReliabilityAudit>;
  authorization: P63V3RSemReliabilityAuditAuthorizationToken;
  reviewer: string;
  reason: string;
  action: P63V3RSemReliabilityAuditAdjudication["action"];
  adjudicatedAt?: string;
}): void {
  assertStateCompatible(args.state, args.prepared, args.authorization);
  const flag = args.state.auditFlag;
  if (!flag) throw new Error("Rsem reliability audit has no pending audit flag");
  if (
    flag.kind !== "non-cap-infrastructure-adjudication-required" &&
    flag.kind !== "uncertain-in-flight-attempt"
  ) {
    throw new Error(
      `Rsem reliability audit flag ${flag.kind} does not permit replacement adjudication`
    );
  }

  const adjudication: P63V3RSemReliabilityAuditAdjudication = {
    reviewer: requireText(args.reviewer, "reviewer"),
    reason: requireText(args.reason, "reason"),
    action: args.action,
    adjudicatedAt: args.adjudicatedAt ?? new Date().toISOString(),
  };

  if (flag.kind === "non-cap-infrastructure-adjudication-required") {
    const attempt = [...args.state.attempts]
      .reverse()
      .find(
        (item) =>
          item.sequence === flag.sequence &&
          item.attempt === flag.attempt
      );
    if (!attempt || attempt.disposition !== "non-cap-infrastructure") {
      throw new Error("Rsem reliability audit pending attempt not found");
    }
    if (attempt.adjudication) {
      throw new Error("Rsem reliability audit attempt already adjudicated");
    }
    attempt.adjudication = adjudication;
  } else {
    const interrupted = [...args.state.interruptedAttempts]
      .reverse()
      .find(
        (item) =>
          item.sequence === flag.sequence &&
          item.attempt === flag.attempt
      );
    if (!interrupted) {
      throw new Error("Rsem reliability audit interrupted attempt not found");
    }
    if (interrupted.adjudication) {
      throw new Error("Rsem reliability audit interrupted attempt already adjudicated");
    }
    interrupted.adjudication = adjudication;
  }

  if (args.action === "abort-audit") {
    args.state.status = "needs-audit";
    touch(args.state);
    return;
  }

  if (
    flag.attempt >=
    P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_ATTEMPTS_PER_TRIAL
  ) {
    args.state.status = "needs-audit";
    args.state.auditFlag = {
      kind: "max-non-cap-attempts-exhausted",
      sequence: flag.sequence,
      attempt: flag.attempt,
      reason:
        "replacement adjudicated but the three-attempt ceiling is exhausted",
      createdAt: new Date().toISOString(),
    };
    touch(args.state);
    return;
  }

  args.state.status = "running";
  args.state.nextAttempt = flag.attempt + 1;
  args.state.auditFlag = null;
  touch(args.state);
}

export function assertP63V3RSemReliabilityAuditResumeCompatible(args: {
  state: Readonly<P63V3RSemReliabilityAuditState>;
  prepared: Readonly<P63V3PreparedRSemReliabilityAudit>;
  authorization: P63V3RSemReliabilityAuditAuthorizationToken;
}): void {
  assertStateCompatible(args.state, args.prepared, args.authorization);
}

export function recoverInterruptedP63V3RSemReliabilityAuditState(args: {
  state: P63V3RSemReliabilityAuditState;
  prepared: Readonly<P63V3PreparedRSemReliabilityAudit>;
}): void {
  const { state, prepared } = args;
  if (!state.inFlight) return;
  const interrupted = state.inFlight;
  const cell = prepared.plan.find(
    (candidate) => candidate.sequence === interrupted.sequence
  );
  if (!cell) {
    throw new Error(
      `Rsem reliability audit interrupted sequence missing from frozen plan: ${interrupted.sequence}`
    );
  }
  const reservedCostUsd =
    projectedP63V3RSemReliabilityAttemptCostUsd(cell.candidateCap);
  state.reservedUnknownCostUsd += reservedCostUsd;
  state.interruptedAttempts.push({
    sequence: interrupted.sequence,
    attempt: interrupted.attempt,
    startedAt: interrupted.startedAt,
    reservedCostUsd,
    adjudication: null,
  });
  state.inFlight = null;
  setAuditFlag(state, {
    kind: "uncertain-in-flight-attempt",
    sequence: interrupted.sequence,
    attempt: interrupted.attempt,
    reason:
      `provider call may have been issued before interruption; blind replay is prohibited and ${reservedCostUsd.toFixed(6)} USD is reserved conservatively`,
  });
}

export function summarizeP63V3RSemReliabilityAudit(
  state: Readonly<P63V3RSemReliabilityAuditState>
) {
  return Object.freeze({
    status: state.status,
    runClass: state.runClass,
    selectedMaxOutputTokens: state.selectedMaxOutputTokens,
    providerVisibleCommittedAttempts: state.attempts.length,
    interruptedAttempts: state.interruptedAttempts.length,
    accumulatedEstimatedCostUsd: state.accumulatedEstimatedCostUsd,
    reservedUnknownCostUsd: state.reservedUnknownCostUsd,
    costControlTotalUsd:
      state.accumulatedEstimatedCostUsd + state.reservedUnknownCostUsd,
    operationalCostCeilingUsd: state.operationalCostCeilingUsd,
    candidate32000: summarizeP63V3RSemReliabilityCandidate(
      state.attempts,
      32000
    ),
    candidate64000: summarizeP63V3RSemReliabilityCandidate(
      state.attempts,
      64000
    ),
    auditFlag: state.auditFlag,
  });
}

export function p63V3RSemReliabilityAuditProvenanceHash(
  prepared: Readonly<P63V3PreparedRSemReliabilityAudit>
): string {
  return sha256(stableJson(prepared.provenance));
}

function assertStateCompatible(
  state: Readonly<P63V3RSemReliabilityAuditState>,
  prepared: Readonly<P63V3PreparedRSemReliabilityAudit>,
  authorization: P63V3RSemReliabilityAuditAuthorizationToken
): void {
  assertAuthorizationCompatible(authorization, prepared);
  if (
    state.schemaVersion !== P6_3_V3_RSEM_RELIABILITY_AUDIT_STATE_SCHEMA ||
    state.controllerVersion !==
      P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTROLLER_VERSION ||
    state.specVersion !== P6_3_V3_RSEM_RELIABILITY_AUDIT_SPEC_VERSION ||
    state.runClass !== P6_3_V3_RSEM_RELIABILITY_AUDIT_RUN_CLASS ||
    state.scientificPoolingAllowed !== false ||
    state.checkoutGitSha !== authorization.checkoutGitSha ||
    state.planHash !== prepared.planHash ||
    state.provenanceHash !== authorization.provenanceHash ||
    state.fixedEnvironmentIdentity !==
      prepared.provenance.fixedEnvironmentIdentity
  ) {
    throw new Error("Rsem reliability audit state/provenance mismatch");
  }
}

function assertAuthorizationCompatible(
  authorization: P63V3RSemReliabilityAuditAuthorizationToken,
  prepared: Readonly<P63V3PreparedRSemReliabilityAudit>
): void {
  if (!authorization || authorization[AUTH_BRAND] !== true) {
    throw new Error("Rsem reliability audit authorization token is invalid");
  }
  if (
    authorization.planHash !== prepared.planHash ||
    authorization.provenanceHash !==
      p63V3RSemReliabilityAuditProvenanceHash(prepared)
  ) {
    throw new Error("Rsem reliability audit authorization drifted");
  }
}

function setAuditFlag(
  state: P63V3RSemReliabilityAuditState,
  input: Omit<P63V3RSemReliabilityAuditFlag, "createdAt">,
  forceNeedsAudit = true
): void {
  if (forceNeedsAudit) state.status = "needs-audit";
  state.auditFlag = {
    ...input,
    createdAt: new Date().toISOString(),
  };
  touch(state);
}

function requireSha(value: string, label: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(trimmed)) {
    throw new Error(`${label} must be a 40-character git SHA`);
  }
  return trimmed;
}

function requireText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} must be non-empty`);
  return trimmed;
}

function touch(state: P63V3RSemReliabilityAuditState): void {
  state.updatedAt = new Date().toISOString();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
