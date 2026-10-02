import {
  buildP63CalibrationSchedule,
  P6_3_EXECUTION_PROTOCOL_VERSION,
} from "./p6-3-execution-protocol";
import {
  P6_3_V3_ARTIFACT_BUDGETS,
  type P63V3ArmLabel,
} from "./p6-3-v3-calibration-predeclaration";
import { P6_3_RSEM_PROVIDER_CONTRACT } from "./p6-3-rsem-protocol-parity";

export const P6_3_V3_RSEM_RELIABILITY_AUDIT_SPEC_VERSION =
  "p6-3-v3-rsem-reliability-audit-spec-v2" as const;
export const P6_3_V3_RSEM_RELIABILITY_AUDIT_RUN_CLASS =
  "reliability-audit" as const;

export const P6_3_V3_RSEM_RELIABILITY_AUDIT_CANDIDATE_CAPS =
  Object.freeze([32000, 64000] as const);
export type P63V3RSemReliabilityAuditCandidateCap =
  (typeof P6_3_V3_RSEM_RELIABILITY_AUDIT_CANDIDATE_CAPS)[number];

export const P6_3_V3_RSEM_RELIABILITY_AUDIT_HARD_CAP = 64000 as const;
export const P6_3_V3_RSEM_PROVIDER_TECHNICAL_MAX_OUTPUT_TOKENS = 128000 as const;
export const P6_3_V3_RSEM_RELIABILITY_AUDIT_TRIALS_PER_ARM = 10 as const;
export const P6_3_V3_RSEM_RELIABILITY_AUDIT_VALID_TRIALS_PER_CANDIDATE = 60 as const;
export const P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_ATTEMPTS_PER_TRIAL = 3 as const;
export const P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_VALID_TRIALS = 120 as const;
export const P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_PROVIDER_ATTEMPTS = 360 as const;
export const P6_3_V3_RSEM_RELIABILITY_AUDIT_PROVIDER_MAX_RETRIES = 0 as const;

// Operational evidence only. These values never enter scientific Rsem scoring.
export const P6_3_V3_RSEM_RELIABILITY_AUDIT_PLANNING_MAX_INPUT_TOKENS = 6000 as const;
export const P6_3_V3_RSEM_RELIABILITY_AUDIT_INPUT_PRICE_CEILING_PER_MTOK = 0.25 as const;
export const P6_3_V3_RSEM_RELIABILITY_AUDIT_OUTPUT_PRICE_PER_MTOK = 1.20 as const;
export const P6_3_V3_RSEM_RELIABILITY_AUDIT_COST_CEILING_USD = 22 as const;

export const P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT = Object.freeze({
  version: P6_3_V3_RSEM_RELIABILITY_AUDIT_SPEC_VERSION,
  runClass: P6_3_V3_RSEM_RELIABILITY_AUDIT_RUN_CLASS,
  purpose: "provider-envelope-reliability-only",
  scientificPoolingAllowed: false,
  confirmatoryStage1AEligible: false,
  targetParameter: "Rsem.maxOutputTokens-only",
  provider: Object.freeze({
    model: P6_3_RSEM_PROVIDER_CONTRACT.model,
    reasoningEffort: P6_3_RSEM_PROVIDER_CONTRACT.reasoningEffort,
    requestTimeoutMs: P6_3_RSEM_PROVIDER_CONTRACT.requestTimeoutMs,
    providerMaxRetries: P6_3_V3_RSEM_RELIABILITY_AUDIT_PROVIDER_MAX_RETRIES,
    historicalScientificProviderMaxRetries: P6_3_RSEM_PROVIDER_CONTRACT.providerMaxRetries,
    serviceTier: P6_3_RSEM_PROVIDER_CONTRACT.serviceTier,
    promptCacheMode: P6_3_RSEM_PROVIDER_CONTRACT.promptCacheMode,
    storeResponses: P6_3_RSEM_PROVIDER_CONTRACT.storeResponses,
    executionMode: P6_3_RSEM_PROVIDER_CONTRACT.executionMode,
  }),
  candidateCaps: P6_3_V3_RSEM_RELIABILITY_AUDIT_CANDIDATE_CAPS,
  hardAuditCap: P6_3_V3_RSEM_RELIABILITY_AUDIT_HARD_CAP,
  providerTechnicalMaxOutputTokens: P6_3_V3_RSEM_PROVIDER_TECHNICAL_MAX_OUTPUT_TOKENS,
  trialsPerArm: P6_3_V3_RSEM_RELIABILITY_AUDIT_TRIALS_PER_ARM,
  validTrialsPerCandidate: P6_3_V3_RSEM_RELIABILITY_AUDIT_VALID_TRIALS_PER_CANDIDATE,
  maxAttemptsPerTrial: P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_ATTEMPTS_PER_TRIAL,
  maxValidTrials: P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_VALID_TRIALS,
  maxProviderAttempts: P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_PROVIDER_ATTEMPTS,
  executionScheduleVersion: P6_3_EXECUTION_PROTOCOL_VERSION,
  armLabels: Object.freeze(["B0", "B1", "B2", "B3", "B4", "AF"] as const),
  acceptanceRule: "zero-provider-declared-max-output-token-censoring-in-60-valid-balanced-trials",
  rejectionRule: "first-provider-declared-max-output-token-censoring-rejects-current-candidate",
  hardCapFailureAction: "needs-design-audit-no-128k-auto-escalation",
  nonCapInfrastructureAction: "needs-audit-human-adjudication-before-replacement",
  protocolInvalidAction: "needs-audit-no-cap-inference",
  semanticSelectionInputsAllowed: false,
  instrumentationAmendments: Object.freeze({
    sdkAutomaticRetriesDisabled: true,
    rationale:
      "make-one-controller-attempt-map-to-one-sdk-provider-attempt-and-surface-non-cap-infrastructure-events",
    capCensoringUsesProviderIncompleteReason: true,
    outputTokenEqualityIsDiagnosticOnly: true,
  }),
  headroomDiagnosticsAffectQualification: false,
  operationalCost: Object.freeze({
    planningMaxInputTokensPerAttempt:
      P6_3_V3_RSEM_RELIABILITY_AUDIT_PLANNING_MAX_INPUT_TOKENS,
    inputPriceCeilingPerMillionTokensUsd:
      P6_3_V3_RSEM_RELIABILITY_AUDIT_INPUT_PRICE_CEILING_PER_MTOK,
    outputPricePerMillionTokensUsd:
      P6_3_V3_RSEM_RELIABILITY_AUDIT_OUTPUT_PRICE_PER_MTOK,
    accumulatedEstimatedCostCeilingUsd:
      P6_3_V3_RSEM_RELIABILITY_AUDIT_COST_CEILING_USD,
    unknownUsageAttemptPolicy:
      "reserve-candidate-specific-projected-worst-case-cost",
    interruptedAttemptPolicy:
      "reserve-candidate-specific-projected-worst-case-cost",
    action: "needs-audit-before-call-if-cost-control-total-plus-projected-attempt-crosses-ceiling",
  }),
  liveAuthorization: false,
} as const);

export interface P63V3RSemReliabilityAuditCell {
  readonly sequence: number;
  readonly candidateIndex: number;
  readonly candidateCap: P63V3RSemReliabilityAuditCandidateCap;
  readonly trial: number;
  readonly blockKey: string;
  readonly armLabel: P63V3ArmLabel;
  readonly armKind: "EL" | "AF";
  readonly budgetTokens: number | "full";
}

export type P63V3RSemReliabilityAuditDisposition =
  | "valid-audit-trial"
  | "cap-censored"
  | "non-cap-infrastructure"
  | "protocol-invalid";

export interface P63V3RSemReliabilityDecisionRecord {
  readonly sequence: number;
  readonly candidateCap: P63V3RSemReliabilityAuditCandidateCap;
  readonly trial: number;
  readonly armLabel: P63V3ArmLabel;
  readonly attempt: number;
  readonly disposition: P63V3RSemReliabilityAuditDisposition;
  readonly responseStatus: string | null;
  readonly incompleteReason: string | null;
  readonly configuredMaxOutputTokens: P63V3RSemReliabilityAuditCandidateCap;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningOutputTokens: number;
  readonly totalTokens: number;
  readonly structureValid: boolean | null;
  readonly capUsageMatchedConfiguredLimit: boolean | null;
  readonly outputUtilizationRatio: number | null;
  readonly reasoningUtilizationRatio: number | null;
  readonly estimatedCostUsd: number | null;
  readonly failureReason: string | null;
}

export interface P63V3RSemReliabilityCandidateSummary {
  readonly candidateCap: P63V3RSemReliabilityAuditCandidateCap;
  readonly status: "incomplete" | "qualified" | "rejected" | "needs-audit";
  readonly validTrialCount: number;
  readonly capCensoringCount: number;
  readonly maxOutputUtilizationRatio: number | null;
  readonly p95OutputUtilizationRatio: number | null;
  readonly maxReasoningUtilizationRatio: number | null;
  readonly nonCapInfrastructureAttemptCount: number;
  readonly protocolInvalidAttemptCount: number;
}

export function buildP63V3RSemReliabilityAuditPlan():
  readonly P63V3RSemReliabilityAuditCell[] {
  const schedule = buildP63CalibrationSchedule().slice(
    0,
    P6_3_V3_RSEM_RELIABILITY_AUDIT_TRIALS_PER_ARM
  );
  if (schedule.length !== P6_3_V3_RSEM_RELIABILITY_AUDIT_TRIALS_PER_ARM) {
    throw new Error("P6-3 v3 Rsem reliability audit schedule is too short");
  }

  const cells: P63V3RSemReliabilityAuditCell[] = [];
  for (const [candidateIndex, candidateCap] of
    P6_3_V3_RSEM_RELIABILITY_AUDIT_CANDIDATE_CAPS.entries()) {
    for (const scheduled of schedule) {
      const blockKey =
        `Rsem-reliability:cap-${candidateCap}:trial-${scheduled.repeat}`;
      for (const arm of scheduled.arms) {
        const armLabel = arm.label as P63V3ArmLabel;
        cells.push(Object.freeze({
          sequence: cells.length,
          candidateIndex,
          candidateCap,
          trial: scheduled.repeat,
          blockKey,
          armLabel,
          armKind: arm.kind,
          budgetTokens: arm.kind === "AF"
            ? "full"
            : P6_3_V3_ARTIFACT_BUDGETS[armLabel],
        }));
      }
    }
  }

  if (cells.length !== P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_VALID_TRIALS) {
    throw new Error(
      `P6-3 v3 Rsem reliability audit expected ${P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_VALID_TRIALS} planned trials, got ${cells.length}`
    );
  }
  for (const cap of P6_3_V3_RSEM_RELIABILITY_AUDIT_CANDIDATE_CAPS) {
    const candidate = cells.filter((cell) => cell.candidateCap === cap);
    if (candidate.length !== P6_3_V3_RSEM_RELIABILITY_AUDIT_VALID_TRIALS_PER_CANDIDATE) {
      throw new Error(`P6-3 v3 Rsem reliability audit candidate ${cap} plan size drift`);
    }
    for (const label of P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT.armLabels) {
      const armCount = candidate.filter((cell) => cell.armLabel === label).length;
      if (armCount !== P6_3_V3_RSEM_RELIABILITY_AUDIT_TRIALS_PER_ARM) {
        throw new Error(
          `P6-3 v3 Rsem reliability audit candidate ${cap} arm ${label} expected ${P6_3_V3_RSEM_RELIABILITY_AUDIT_TRIALS_PER_ARM}, got ${armCount}`
        );
      }
    }
  }
  return Object.freeze(cells);
}

export function summarizeP63V3RSemReliabilityCandidate(
  records: readonly P63V3RSemReliabilityDecisionRecord[],
  candidateCap: P63V3RSemReliabilityAuditCandidateCap
): P63V3RSemReliabilityCandidateSummary {
  const candidate = records.filter((record) => record.candidateCap === candidateCap);
  const capCensoringCount = candidate.filter(
    (record) => record.disposition === "cap-censored"
  ).length;
  const protocolInvalidAttemptCount = candidate.filter(
    (record) => record.disposition === "protocol-invalid"
  ).length;
  const nonCapInfrastructureAttemptCount = candidate.filter(
    (record) => record.disposition === "non-cap-infrastructure"
  ).length;
  const validRecords = candidate.filter(
    (record) => record.disposition === "valid-audit-trial"
  );
  const validTrialCount = new Set(
    validRecords.map((record) => record.sequence)
  ).size;
  const outputUtilizations = validRecords
    .map((record) => record.outputUtilizationRatio)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  const reasoningUtilizations = validRecords
    .map((record) => record.reasoningUtilizationRatio)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  let status: P63V3RSemReliabilityCandidateSummary["status"] = "incomplete";
  if (capCensoringCount > 0) status = "rejected";
  else if (protocolInvalidAttemptCount > 0) status = "needs-audit";
  else if (
    validTrialCount ===
    P6_3_V3_RSEM_RELIABILITY_AUDIT_VALID_TRIALS_PER_CANDIDATE
  ) status = "qualified";

  return Object.freeze({
    candidateCap,
    status,
    validTrialCount,
    capCensoringCount,
    nonCapInfrastructureAttemptCount,
    protocolInvalidAttemptCount,
    maxOutputUtilizationRatio:
      outputUtilizations.length > 0
        ? outputUtilizations[outputUtilizations.length - 1]
        : null,
    p95OutputUtilizationRatio:
      outputUtilizations.length > 0
        ? percentileNearestRank(outputUtilizations, 0.95)
        : null,
    maxReasoningUtilizationRatio:
      reasoningUtilizations.length > 0
        ? reasoningUtilizations[reasoningUtilizations.length - 1]
        : null,
  });
}

function percentileNearestRank(
  sortedAscending: readonly number[],
  probability: number
): number {
  if (sortedAscending.length === 0) {
    throw new Error("percentile requires at least one value");
  }
  const rank = Math.max(
    1,
    Math.ceil(probability * sortedAscending.length)
  );
  return sortedAscending[Math.min(sortedAscending.length - 1, rank - 1)];
}

export function projectedP63V3RSemReliabilityAttemptCostUsd(
  candidateCap: P63V3RSemReliabilityAuditCandidateCap
): number {
  const input =
    P6_3_V3_RSEM_RELIABILITY_AUDIT_PLANNING_MAX_INPUT_TOKENS *
    P6_3_V3_RSEM_RELIABILITY_AUDIT_INPUT_PRICE_CEILING_PER_MTOK /
    1_000_000;
  const output =
    candidateCap *
    P6_3_V3_RSEM_RELIABILITY_AUDIT_OUTPUT_PRICE_PER_MTOK /
    1_000_000;
  return input + output;
}
