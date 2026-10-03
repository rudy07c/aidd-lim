import * as crypto from "crypto";
import {
  P6_3_V3_RSEM_COMPLETION_MAX_SCIENTIFIC_ATTEMPTS_PER_CELL,
  P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS,
  P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256,
  P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256,
} from "./p6-3-v3-rsem-completion-predeclaration";
import {
  p63V3RSemCompletionPlanHash,
  type P63V3RSemCompletionCell,
} from "./p6-3-v3-rsem-completion-plan";
import {
  p63V3RSemCompletionProvenanceHash,
  type P63V3PreparedRSemCompletionRun,
} from "./p6-3-v3-rsem-completion-runner";
import {
  decideP63AttemptTransition,
  type P63AttemptFailureDomain,
} from "./p6-3-execution-protocol";
import type {
  P63CellOutcome,
  P63ExposureEvidence,
} from "./p6-3-live-calibration-runner";
import {
  requireP63V3ScientificValidity,
  type P63V3ScientificValidity,
} from "./p6-3-v3-scientific-validity";

export const P6_3_V3_RSEM_COMPLETION_CONTROLLER_VERSION =
  "p6-3-v3-rsem-completion-controller-v1" as const;
export const P6_3_V3_RSEM_COMPLETION_STATE_SCHEMA =
  "p6-3-v3-rsem-completion-state-v1" as const;
export const P6_3_V3_RSEM_COMPLETION_PAID_FLAG =
  "--authorize-paid-live=P6-3-v3-rsem-completion" as const;
export const P6_3_V3_RSEM_COMPLETION_PAID_ENV =
  "P6_3_V3_RSEM_COMPLETION_LIVE_ALLOWED" as const;

const AUTH_BRAND: unique symbol = Symbol(
  "p6-3-v3-rsem-completion-paid-authorization"
);

export type P63V3RSemCompletionStatus =
  | "running"
  | "needs-audit"
  | "completed";

export type P63V3RSemCompletionExecutionMode =
  | "provider-scientific"
  | "offline-verifier";

export type P63V3RSemCompletionAdjudicationDisposition =
  | "scientific-failure"
  | "protocol-failure"
  | "infrastructure-invalid";

export interface P63V3RSemCompletionAdjudication {
  readonly reviewer: string;
  readonly reason: string;
  readonly finalDisposition:
    P63V3RSemCompletionAdjudicationDisposition;
  readonly adjudicatedAt: string;
}

export interface P63V3RSemCompletionAttemptRecord {
  readonly collectionSequence: number;
  readonly canonicalV3Sequence: number;
  readonly repeat: number;
  readonly armLabel: string;
  readonly armKind: "EL" | "AF";
  readonly budgetTokens: number | "full";
  readonly attempt: number;
  readonly rawValidity: P63V3ScientificValidity;
  effectiveValidity: P63V3ScientificValidity;
  readonly rawFailureDomain: P63AttemptFailureDomain | "other";
  effectiveFailureDomain: P63AttemptFailureDomain | "other";
  infrastructureAdjudication:
    | "not-applicable"
    | "pending"
    | "infrastructure-invalid";
  adjudication: P63V3RSemCompletionAdjudication | null;
  readonly executionStatus: string;
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

export interface P63V3RSemCompletionInFlight {
  readonly collectionSequence: number;
  readonly canonicalV3Sequence: number;
  readonly attempt: number;
  readonly startedAt: string;
}

export interface P63V3RSemCompletionInterruptedAttempt {
  readonly collectionSequence: number;
  readonly canonicalV3Sequence: number;
  readonly attempt: number;
  readonly startedAt: string;
  adjudication:
    | (P63V3RSemCompletionAdjudication & {
        readonly finalDisposition: "infrastructure-invalid";
      })
    | null;
}

export interface P63V3RSemCompletionAuditFlag {
  readonly kind:
    | "infrastructure-adjudication-required"
    | "max-infrastructure-attempts-exhausted"
    | "unclassified-failure-domain"
    | "uncertain-in-flight-attempt";
  readonly collectionSequence: number;
  readonly canonicalV3Sequence: number;
  readonly attempt: number;
  readonly reason: string;
  readonly createdAt: string;
}

export interface P63V3RSemCompletionState {
  readonly schemaVersion:
    typeof P6_3_V3_RSEM_COMPLETION_STATE_SCHEMA;
  readonly controllerVersion:
    typeof P6_3_V3_RSEM_COMPLETION_CONTROLLER_VERSION;
  readonly runClass: "scientific-calibration-completion";
  readonly calibrationOnly: true;
  readonly confirmatoryStage1AEligible: false;
  readonly executionMode: P63V3RSemCompletionExecutionMode;
  status: P63V3RSemCompletionStatus;
  readonly checkoutGitSha: string;
  readonly planHash: string;
  readonly provenanceHash: string;
  readonly fixedEnvironmentIdentity: string;
  readonly inheritedMSourceStateSha256: string;
  readonly inheritedMSemanticSha256: string;
  readonly authorizationDigest: string;
  readonly totalLogicalCells: number;
  cursorCollectionSequence: number;
  nextAttempt: number;
  inFlight: P63V3RSemCompletionInFlight | null;
  attempts: P63V3RSemCompletionAttemptRecord[];
  interruptedAttempts: P63V3RSemCompletionInterruptedAttempt[];
  auditFlag: P63V3RSemCompletionAuditFlag | null;
  estimatedCostUsd: number;
  readonly startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type P63V3RSemCompletionAuthorizationToken = Readonly<{
  readonly live: true;
  readonly explicitPaidAuthorization: true;
  readonly environmentAuthorization: true;
  readonly checkoutGitSha: string;
  readonly planHash: string;
  readonly provenanceHash: string;
  readonly fixedEnvironmentIdentity: string;
  readonly executionMode: P63V3RSemCompletionExecutionMode;
  readonly authorizationDigest: string;
  [AUTH_BRAND]: true;
}>;

export interface P63V3RSemCompletionExecutor {
  execute(
    cell: Readonly<P63V3RSemCompletionCell>,
    attempt: number
  ): Promise<P63CellOutcome>;
}

export interface P63V3RSemCompletionPersistence {
  persistState(
    state: Readonly<P63V3RSemCompletionState>
  ): void | Promise<void>;
  persistAttemptArtifact(
    cell: Readonly<P63V3RSemCompletionCell>,
    attempt: number,
    payload: unknown
  ): string | Promise<string>;
}

export interface P63V3RSemCompletionAdjudicationRequest {
  readonly collectionSequence: number;
  readonly attempt: number;
  readonly reviewer: string;
  readonly reason: string;
  readonly finalDisposition:
    P63V3RSemCompletionAdjudicationDisposition;
  readonly adjudicatedAt?: string;
}

export function authorizeP63V3RSemCompletionInvocation(args: {
  live: boolean;
  paidAuthorization: boolean;
  environment?: NodeJS.ProcessEnv;
  checkoutGitSha: string;
  executionMode: P63V3RSemCompletionExecutionMode;
  prepared: Readonly<P63V3PreparedRSemCompletionRun>;
}): P63V3RSemCompletionAuthorizationToken {
  if (!args.live) {
    throw new Error(
      "P6-3 v3 Rsem completion paid authorization requires live=true"
    );
  }
  if (!args.paidAuthorization) {
    throw new Error(
      `P6-3 v3 Rsem completion requires explicit ${P6_3_V3_RSEM_COMPLETION_PAID_FLAG}`
    );
  }
  const environment = args.environment ?? process.env;
  if (environment[P6_3_V3_RSEM_COMPLETION_PAID_ENV] !== "1") {
    throw new Error(
      `P6-3 v3 Rsem completion requires ${P6_3_V3_RSEM_COMPLETION_PAID_ENV}=1`
    );
  }
  assertPreparedSelfConsistent(args.prepared);
  const checkoutGitSha = requireSha(
    args.checkoutGitSha,
    "checkoutGitSha"
  );
  const provenanceHash =
    p63V3RSemCompletionProvenanceHash(args.prepared);
  const authorizationDigest = sha256(
    stableJson({
      controllerVersion:
        P6_3_V3_RSEM_COMPLETION_CONTROLLER_VERSION,
      checkoutGitSha,
      planHash: args.prepared.planHash,
      provenanceHash,
      fixedEnvironmentIdentity:
        args.prepared.provenance.fixedEnvironmentIdentity,
      executionMode: args.executionMode,
      inheritedMSourceStateSha256:
        P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256,
      inheritedMSemanticSha256:
        P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256,
    })
  );
  return Object.freeze({
    live: true,
    explicitPaidAuthorization: true,
    environmentAuthorization: true,
    checkoutGitSha,
    planHash: args.prepared.planHash,
    provenanceHash,
    fixedEnvironmentIdentity:
      args.prepared.provenance.fixedEnvironmentIdentity,
    executionMode: args.executionMode,
    authorizationDigest,
    [AUTH_BRAND]: true as const,
  });
}

export function createP63V3RSemCompletionState(args: {
  prepared: Readonly<P63V3PreparedRSemCompletionRun>;
  authorization: P63V3RSemCompletionAuthorizationToken;
  now?: string;
}): P63V3RSemCompletionState {
  assertAuthorizationCompatible(
    args.authorization,
    args.prepared
  );
  const now = args.now ?? new Date().toISOString();
  return {
    schemaVersion:
      P6_3_V3_RSEM_COMPLETION_STATE_SCHEMA,
    controllerVersion:
      P6_3_V3_RSEM_COMPLETION_CONTROLLER_VERSION,
    runClass: "scientific-calibration-completion",
    calibrationOnly: true,
    confirmatoryStage1AEligible: false,
    executionMode:
      args.authorization.executionMode,
    status: "running",
    checkoutGitSha: args.authorization.checkoutGitSha,
    planHash: args.prepared.planHash,
    provenanceHash: args.authorization.provenanceHash,
    fixedEnvironmentIdentity:
      args.prepared.provenance.fixedEnvironmentIdentity,
    inheritedMSourceStateSha256:
      P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256,
    inheritedMSemanticSha256:
      P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256,
    authorizationDigest:
      args.authorization.authorizationDigest,
    totalLogicalCells:
      P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS,
    cursorCollectionSequence: 0,
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

export function assertP63V3RSemCompletionResumeCompatible(args: {
  state: Readonly<P63V3RSemCompletionState>;
  prepared: Readonly<P63V3PreparedRSemCompletionRun>;
  authorization: P63V3RSemCompletionAuthorizationToken;
}): void {
  const { state, prepared, authorization } = args;
  assertAuthorizationCompatible(authorization, prepared);
  assertPreparedSelfConsistent(prepared);
  if (
    state.schemaVersion !==
      P6_3_V3_RSEM_COMPLETION_STATE_SCHEMA ||
    state.controllerVersion !==
      P6_3_V3_RSEM_COMPLETION_CONTROLLER_VERSION ||
    state.runClass !== "scientific-calibration-completion" ||
    state.calibrationOnly !== true ||
    state.confirmatoryStage1AEligible !== false
  ) {
    throw new Error(
      "Resume refused: P6-3 v3 Rsem completion state/version provenance changed"
    );
  }
  if (
    state.checkoutGitSha !== authorization.checkoutGitSha ||
    state.planHash !== prepared.planHash ||
    state.provenanceHash !==
      authorization.provenanceHash ||
    state.fixedEnvironmentIdentity !==
      prepared.provenance.fixedEnvironmentIdentity ||
    state.executionMode !==
      authorization.executionMode ||
    state.inheritedMSourceStateSha256 !==
      P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256 ||
    state.inheritedMSemanticSha256 !==
      P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256 ||
    state.authorizationDigest !==
      authorization.authorizationDigest
  ) {
    throw new Error(
      "Resume refused: P6-3 v3 Rsem completion provenance changed"
    );
  }
  if (
    state.totalLogicalCells !== prepared.plan.length ||
    state.totalLogicalCells !==
      P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS ||
    state.planHash !==
      p63V3RSemCompletionPlanHash(prepared.plan)
  ) {
    throw new Error(
      "Resume refused: P6-3 v3 Rsem completion plan changed"
    );
  }
  if (
    !Number.isInteger(state.cursorCollectionSequence) ||
    state.cursorCollectionSequence < 0 ||
    state.cursorCollectionSequence > prepared.plan.length
  ) {
    throw new Error(
      "Resume refused: invalid Rsem completion cursor"
    );
  }
  if (
    !Number.isInteger(state.nextAttempt) ||
    state.nextAttempt < 1 ||
    state.nextAttempt >
      P6_3_V3_RSEM_COMPLETION_MAX_SCIENTIFIC_ATTEMPTS_PER_CELL
  ) {
    throw new Error(
      "Resume refused: invalid Rsem completion attempt cursor"
    );
  }
  if (
    !Array.isArray(state.attempts) ||
    !Array.isArray(state.interruptedAttempts)
  ) {
    throw new Error(
      "Resume refused: Rsem completion journals are malformed"
    );
  }
}

export function recoverInterruptedP63V3RSemCompletionState(
  state: P63V3RSemCompletionState
): void {
  const inFlight = state.inFlight;
  if (!inFlight) return;
  const alreadyJournaled = state.interruptedAttempts.some(
    (entry) =>
      entry.collectionSequence ===
        inFlight.collectionSequence &&
      entry.attempt === inFlight.attempt
  );
  if (!alreadyJournaled) {
    state.interruptedAttempts.push({
      collectionSequence:
        inFlight.collectionSequence,
      canonicalV3Sequence:
        inFlight.canonicalV3Sequence,
      attempt: inFlight.attempt,
      startedAt: inFlight.startedAt,
      adjudication: null,
    });
  }
  state.inFlight = null;
  state.status = "needs-audit";
  state.auditFlag = {
    kind: "uncertain-in-flight-attempt",
    collectionSequence:
      inFlight.collectionSequence,
    canonicalV3Sequence:
      inFlight.canonicalV3Sequence,
    attempt: inFlight.attempt,
    reason:
      "A provider-visible fresh Rsem completion attempt was in-flight without a committed result; blind replay is prohibited.",
    createdAt: new Date().toISOString(),
  };
  touch(state);
}

export async function executeP63V3ControlledRSemCompletion(args: {
  state: P63V3RSemCompletionState;
  prepared: Readonly<P63V3PreparedRSemCompletionRun>;
  authorization: P63V3RSemCompletionAuthorizationToken;
  executor: P63V3RSemCompletionExecutor;
  persistence: P63V3RSemCompletionPersistence;
}): Promise<P63V3RSemCompletionState> {
  const {
    state,
    prepared,
    authorization,
    executor,
    persistence,
  } = args;
  assertP63V3RSemCompletionResumeCompatible({
    state,
    prepared,
    authorization,
  });

  if (state.inFlight) {
    recoverInterruptedP63V3RSemCompletionState(state);
    await persistence.persistState(state);
    return state;
  }
  if (
    state.status === "needs-audit" ||
    state.status === "completed"
  ) {
    return state;
  }

  while (
    state.cursorCollectionSequence < prepared.plan.length
  ) {
    const cell =
      prepared.plan[state.cursorCollectionSequence];
    const attempt = state.nextAttempt;
    if (
      !cell ||
      cell.collectionSequence !==
        state.cursorCollectionSequence ||
      cell.canonicalV3Sequence !==
        792 + state.cursorCollectionSequence
    ) {
      throw new Error(
        "P6-3 v3 Rsem completion plan/cursor identity mismatch"
      );
    }

    const startedAt = new Date().toISOString();
    state.inFlight = {
      collectionSequence: cell.collectionSequence,
      canonicalV3Sequence:
        cell.canonicalV3Sequence,
      attempt,
      startedAt,
    };
    touch(state);
    await persistence.persistState(state);

    const outcome = await executor.execute(cell, attempt);
    const validity =
      requireP63V3ScientificValidity(outcome);
    const artifactPath =
      await persistence.persistAttemptArtifact(
        cell,
        attempt,
        outcome.artifactPayload
      );
    const finishedAt = new Date().toISOString();
    const requiresInfrastructureAdjudication =
      validity === "infrastructure-invalid" ||
      outcome.failureDomain === "infrastructure";

    const record: P63V3RSemCompletionAttemptRecord = {
      collectionSequence:
        cell.collectionSequence,
      canonicalV3Sequence:
        cell.canonicalV3Sequence,
      repeat: cell.repeat,
      armLabel: cell.armLabel,
      armKind: cell.armKind,
      budgetTokens: cell.budgetTokens,
      attempt,
      rawValidity: validity,
      effectiveValidity: validity,
      rawFailureDomain: outcome.failureDomain,
      effectiveFailureDomain:
        outcome.failureDomain,
      infrastructureAdjudication:
        requiresInfrastructureAdjudication
          ? "pending"
          : "not-applicable",
      adjudication: null,
      executionStatus: outcome.executionStatus,
      semanticScore: outcome.semanticScore,
      protocolValid: outcome.protocolValid,
      estimatedCostUsd: outcome.estimatedCostUsd,
      failureReason: outcome.failureReason,
      exposure: outcome.exposure,
      diagnosticSummary:
        outcome.diagnosticSummary,
      artifactPath,
      startedAt,
      finishedAt,
    };
    state.attempts.push(record);
    state.inFlight = null;
    state.estimatedCostUsd +=
      outcome.estimatedCostUsd ?? 0;

    if (requiresInfrastructureAdjudication) {
      state.status = "needs-audit";
      state.auditFlag = {
        kind:
          "infrastructure-adjudication-required",
        collectionSequence:
          cell.collectionSequence,
        canonicalV3Sequence:
          cell.canonicalV3Sequence,
        attempt,
        reason:
          `Fresh Rsem completion outcome requires explicit adjudication before replacement or consumption (validity=${validity}, failureDomain=${outcome.failureDomain}).`,
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
        collectionSequence:
          cell.collectionSequence,
        canonicalV3Sequence:
          cell.canonicalV3Sequence,
        attempt,
        reason:
          "Fresh Rsem completion encountered an unclassified failure domain.",
        createdAt: finishedAt,
      };
      touch(state);
      await persistence.persistState(state);
      return state;
    }

    const transition = decideP63AttemptTransition({
      attempt,
      failureDomain: outcome.failureDomain,
      infrastructureAdjudication:
        "not-applicable",
    });
    if (transition !== "advance-next-arm") {
      throw new Error(
        `Unexpected fresh Rsem completion transition: ${transition}`
      );
    }
    advanceCell(state, prepared.plan.length);
    await persistence.persistState(state);
  }

  completeState(state);
  await persistence.persistState(state);
  return state;
}

export function applyP63V3RSemCompletionAdjudication(args: {
  state: P63V3RSemCompletionState;
  prepared: Readonly<P63V3PreparedRSemCompletionRun>;
  request: P63V3RSemCompletionAdjudicationRequest;
}): void {
  const { state, prepared, request } = args;
  if (
    state.status !== "needs-audit" ||
    !state.auditFlag
  ) {
    throw new Error(
      "Fresh Rsem completion adjudication requires needs-audit with an active flag"
    );
  }
  if (
    state.cursorCollectionSequence !==
    request.collectionSequence
  ) {
    throw new Error(
      "Fresh Rsem completion adjudication target must be the current collection cell"
    );
  }
  const cell =
    prepared.plan[state.cursorCollectionSequence];
  if (
    !cell ||
    cell.collectionSequence !==
      request.collectionSequence
  ) {
    throw new Error(
      "Fresh Rsem completion adjudication plan/cursor mismatch"
    );
  }

  const reviewer = requireText(
    request.reviewer,
    "reviewer"
  );
  const reason = requireText(request.reason, "reason");
  if (
    state.auditFlag.kind ===
      "max-infrastructure-attempts-exhausted"
  ) {
    throw new Error(
      "Fresh Rsem completion attempt ceiling is exhausted; further adjudication cannot authorize another provider attempt"
    );
  }
  if (
    state.auditFlag.kind ===
    "uncertain-in-flight-attempt"
  ) {
    const interrupted =
      [...state.interruptedAttempts]
        .reverse()
        .find(
          (entry) =>
            entry.collectionSequence ===
              request.collectionSequence &&
            entry.attempt === request.attempt &&
            entry.adjudication === null
        );
    if (!interrupted) {
      throw new Error(
        "Fresh Rsem completion interrupted attempt not found"
      );
    }
    if (
      request.finalDisposition !==
      "infrastructure-invalid"
    ) {
      throw new Error(
        "An uncertain in-flight Rsem completion attempt may only be adjudicated infrastructure-invalid"
      );
    }
    const adjudication = {
      reviewer,
      reason,
      finalDisposition:
        "infrastructure-invalid" as const,
      adjudicatedAt:
        request.adjudicatedAt ??
        new Date().toISOString(),
    };
    interrupted.adjudication = adjudication;
    applyInfrastructureInvalidTransition(
      state,
      interrupted.attempt,
      interrupted.collectionSequence,
      interrupted.canonicalV3Sequence,
      adjudication.adjudicatedAt
    );
    return;
  }

  const target = [...state.attempts]
    .reverse()
    .find(
      (entry) =>
        entry.collectionSequence ===
          request.collectionSequence &&
        entry.attempt === request.attempt
    );
  if (!target) {
    throw new Error(
      "Fresh Rsem completion adjudication target attempt not found"
    );
  }
  if (target.adjudication) {
    throw new Error(
      "Fresh Rsem completion adjudication target is already adjudicated"
    );
  }
  if (
    state.auditFlag.kind !==
      "infrastructure-adjudication-required" &&
    state.auditFlag.kind !==
      "unclassified-failure-domain"
  ) {
    throw new Error(
      "Fresh Rsem completion active audit flag does not permit attempt adjudication"
    );
  }
  if (
    state.auditFlag.kind ===
      "infrastructure-adjudication-required" &&
    request.finalDisposition !==
      "infrastructure-invalid"
  ) {
    throw new Error(
      "Fresh Rsem completion infrastructure-invalid outcomes may only be adjudicated infrastructure-invalid; missing scientific output cannot be promoted to semantic/protocol evidence"
    );
  }

  const adjudication: P63V3RSemCompletionAdjudication = {
    reviewer,
    reason,
    finalDisposition: request.finalDisposition,
    adjudicatedAt:
      request.adjudicatedAt ??
      new Date().toISOString(),
  };
  target.adjudication = adjudication;

  if (
    request.finalDisposition ===
    "infrastructure-invalid"
  ) {
    target.infrastructureAdjudication =
      "infrastructure-invalid";
    target.effectiveValidity =
      "infrastructure-invalid";
    target.effectiveFailureDomain =
      "infrastructure";
    applyInfrastructureInvalidTransition(
      state,
      target.attempt,
      target.collectionSequence,
      target.canonicalV3Sequence,
      adjudication.adjudicatedAt
    );
    return;
  }

  target.infrastructureAdjudication =
    "not-applicable";
  target.effectiveValidity = "valid";
  target.effectiveFailureDomain =
    request.finalDisposition === "protocol-failure"
      ? "protocol"
      : "semantic";
  state.status = "running";
  state.auditFlag = null;
  advanceCell(state, prepared.plan.length);
}

export function summarizeP63V3RSemCompletionState(
  state: Readonly<P63V3RSemCompletionState>
) {
  return Object.freeze({
    status: state.status,
    logicalCellsCompleted:
      state.cursorCollectionSequence,
    scientificAttempts:
      state.attempts.length +
      state.interruptedAttempts.length,
    replacementAttempts:
      state.attempts.filter(
        (entry) => entry.attempt > 1
      ).length +
      state.interruptedAttempts.filter(
        (entry) => entry.attempt > 1
      ).length,
    interruptedAttempts:
      state.interruptedAttempts.length,
    estimatedCostUsd: state.estimatedCostUsd,
    nextCollectionSequence:
      state.cursorCollectionSequence <
      state.totalLogicalCells
        ? state.cursorCollectionSequence
        : null,
    nextCanonicalV3Sequence:
      state.cursorCollectionSequence <
      state.totalLogicalCells
        ? 792 + state.cursorCollectionSequence
        : null,
    auditFlag: state.auditFlag,
  });
}

function assertAuthorizationCompatible(
  authorization: P63V3RSemCompletionAuthorizationToken,
  prepared: Readonly<P63V3PreparedRSemCompletionRun>
): void {
  if (
    !authorization ||
    authorization[AUTH_BRAND] !== true
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion authorization token is invalid"
    );
  }
  assertPreparedSelfConsistent(prepared);
  const provenanceHash =
    p63V3RSemCompletionProvenanceHash(prepared);
  if (
    authorization.planHash !== prepared.planHash ||
    authorization.provenanceHash !==
      provenanceHash ||
    authorization.fixedEnvironmentIdentity !==
      prepared.provenance.fixedEnvironmentIdentity ||
    (authorization.executionMode !==
      "provider-scientific" &&
      authorization.executionMode !==
        "offline-verifier")
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion authorization drifted"
    );
  }
  const expectedDigest = sha256(
    stableJson({
      controllerVersion:
        P6_3_V3_RSEM_COMPLETION_CONTROLLER_VERSION,
      checkoutGitSha:
        authorization.checkoutGitSha,
      planHash: authorization.planHash,
      provenanceHash,
      fixedEnvironmentIdentity:
        authorization.fixedEnvironmentIdentity,
      executionMode:
        authorization.executionMode,
      inheritedMSourceStateSha256:
        P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256,
      inheritedMSemanticSha256:
        P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256,
    })
  );
  if (
    authorization.authorizationDigest !==
    expectedDigest
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion authorization digest mismatch"
    );
  }
}

function assertPreparedSelfConsistent(
  prepared: Readonly<P63V3PreparedRSemCompletionRun>
): void {
  if (
    prepared.plan.length !==
      P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS ||
    prepared.planHash !==
      p63V3RSemCompletionPlanHash(prepared.plan) ||
    prepared.provenance.planHash !==
      prepared.planHash ||
    prepared.provenance.fixedEnvironmentIdentity !==
      prepared.runStart.provenance
        .fixedEnvironmentIdentity ||
    prepared.provenance.inheritedMSourceStateSha256 !==
      P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256 ||
    prepared.provenance.inheritedMSemanticSha256 !==
      P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion prepared run is internally inconsistent"
    );
  }
}

function applyInfrastructureInvalidTransition(
  state: P63V3RSemCompletionState,
  attempt: number,
  collectionSequence: number,
  canonicalV3Sequence: number,
  adjudicatedAt: string
): void {
  const transition = decideP63AttemptTransition({
    attempt,
    failureDomain: "infrastructure",
    infrastructureAdjudication:
      "infrastructure-invalid",
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
    kind:
      "max-infrastructure-attempts-exhausted",
    collectionSequence,
    canonicalV3Sequence,
    attempt,
    reason:
      `Fresh Rsem completion logical cell exhausted ${P6_3_V3_RSEM_COMPLETION_MAX_SCIENTIFIC_ATTEMPTS_PER_CELL} infrastructure-invalid attempts.`,
    createdAt: adjudicatedAt,
  };
  state.inFlight = null;
  touch(state);
}

function advanceCell(
  state: P63V3RSemCompletionState,
  planLength: number
): void {
  state.cursorCollectionSequence += 1;
  state.nextAttempt = 1;
  state.inFlight = null;
  state.auditFlag = null;
  state.status =
    state.cursorCollectionSequence >= planLength
      ? "completed"
      : "running";
  touch(state);
  if (state.status === "completed") {
    state.completedAt = state.updatedAt;
  }
}

function completeState(
  state: P63V3RSemCompletionState
): void {
  state.status = "completed";
  state.cursorCollectionSequence =
    state.totalLogicalCells;
  state.nextAttempt = 1;
  state.inFlight = null;
  state.auditFlag = null;
  touch(state);
  state.completedAt = state.updatedAt;
}

function requireSha(
  value: string,
  label: string
): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(trimmed)) {
    throw new Error(
      `${label} must be a 40-character git SHA`
    );
  }
  return trimmed;
}

function requireText(
  value: string,
  label: string
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} must be non-empty`);
  }
  return trimmed;
}

function touch(
  state: P63V3RSemCompletionState
): void {
  state.updatedAt = new Date().toISOString();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map(stableJson).join(",") + "]";
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      "{" +
      Object.keys(record)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) +
            ":" +
            stableJson(record[key])
        )
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return crypto
    .createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}
