import { isCensoredAgentExecutionStatus } from "../run-validity";

export const P6_1_FAILURE_CLASSIFICATION_VERSION = "p6-1-failure-domain-v3";

export type FailureDomain =
  | "none"
  | "semantic"
  | "protocol"
  | "system"
  | "infrastructure"
  | "other";

export type CapabilityClass =
  | "eligible"
  | "semantic-floor"
  | "AF-unstable"
  | "invalid"
  | "pending";

export type AnalysisRole = "main" | "diagnostic";

export interface FailureLike {
  passed: boolean;
  validity?: string | null;
  failureCategory?: string | null;
  failureReason?: string | null;
  executionStatus?: string | null;
}

export interface FailureClassification {
  failureDomain: FailureDomain;
  semanticFailure: boolean;
  protocolFailure: boolean;
  systemFailure: boolean;
  infrastructureFailure: boolean;
}

export const DEFAULT_P6_1_ELIGIBILITY_RULE = {
  primaryMinSemanticSuccesses: 2,
  semanticFloorMinFailures: 2,
  afUnstableMinSemanticFailures: 2,
  invalidInfrastructureMin: 2,
  initialAttempts: 3,
  maxAttempts: 5,
} as const;

export interface TaskRepeatLike extends FailureLike {
  taskId: string;
  taskType?: string | null;
  repeat: number;
}

export interface P61TaskClassification {
  taskId: string;
  taskType: string | null;
  attempts: number;
  semanticSuccesses: number;
  semanticFailures: number;
  semanticEvaluableRepeats: number;
  protocolFailures: number;
  systemFailures: number;
  otherFailures: number;
  infrastructureInvalidCount: number;
  protocolReliabilitySuccesses: number;
  protocolReliabilityTotal: number;
  protocolReliability: number | null;
  capabilityClass: CapabilityClass;
  analysisRole: AnalysisRole;
  needsAdditionalRepeat: boolean;
  decisionReason: string;
  classification: string;
}

const PROTOCOL_CATEGORIES = new Set([
  "output-parse",
  "protocol-contract",
  "mutation-validation",
]);

const PROTOCOL_STATUSES = new Set([
  "output-parse-failure",
  "mutation-validation-failure",
]);

export function classifyFailure(result: FailureLike): FailureClassification {
  if (result.passed) return flags("none");

  const category = result.failureCategory ?? "";
  const status = result.executionStatus ?? "";
  const reason = result.failureReason ?? "";

  if (
    result.validity === "infrastructure-invalid" ||
    category === "provider" ||
    category === "harness" ||
    isCensoredAgentExecutionStatus(status)
  ) {
    return flags("infrastructure");
  }

  if (category === "test-failure") {
    if (reason.includes(":execution:")) return flags("system");
    return flags("semantic");
  }

  if (PROTOCOL_CATEGORIES.has(category) || PROTOCOL_STATUSES.has(status)) {
    return flags("protocol");
  }

  return flags("other");
}

export function analysisRoleForTaskType(taskType: string | null | undefined): AnalysisRole {
  return taskType === "invariant_stressing" ? "diagnostic" : "main";
}

export function classifyTaskEligibility(
  results: TaskRepeatLike[],
  rule: {
    primaryMinSemanticSuccesses: number;
    semanticFloorMinFailures: number;
    afUnstableMinSemanticFailures: number;
    invalidInfrastructureMin: number;
    initialAttempts: number;
    maxAttempts: number;
  } = DEFAULT_P6_1_ELIGIBILITY_RULE
): P61TaskClassification {
  if (!results.length) throw new Error("classifyTaskEligibility requires at least one repeat");
  if (rule.maxAttempts < rule.initialAttempts) throw new Error("maxAttempts must be >= initialAttempts");

  const classified = results.map((result) => ({ result, failure: classifyFailure(result) }));
  const taskId = results[0].taskId;
  const taskType = results[0].taskType ?? null;
  if (results.some((result) => result.taskId !== taskId)) {
    throw new Error("classifyTaskEligibility received mixed task IDs");
  }

  const attempts = results.length;
  const semanticSuccesses = classified.filter(({ result }) => result.passed).length;
  const semanticFailures = classified.filter(({ failure }) => failure.semanticFailure).length;
  const protocolFailures = classified.filter(({ failure }) => failure.protocolFailure).length;
  const systemFailures = classified.filter(({ failure }) => failure.systemFailure).length;
  const infrastructureInvalidCount = classified.filter(({ failure }) => failure.infrastructureFailure).length;
  const otherFailures = classified.filter(({ result, failure }) => !result.passed && failure.failureDomain === "other").length;
  const semanticEvaluableRepeats = semanticSuccesses + semanticFailures;

  const protocolReliabilityTotal = results.length - infrastructureInvalidCount;
  const protocolReliabilitySuccesses = Math.max(0, protocolReliabilityTotal - protocolFailures);
  const protocolReliability = protocolReliabilityTotal > 0
    ? protocolReliabilitySuccesses / protocolReliabilityTotal
    : null;

  let capabilityClass: CapabilityClass = "pending";
  let decisionReason = "initial-attempts-incomplete";

  if (attempts >= rule.initialAttempts) {
    if (infrastructureInvalidCount >= rule.invalidInfrastructureMin) {
      capabilityClass = "invalid";
      decisionReason = "infrastructure-invalid-threshold";
    } else if (semanticSuccesses >= rule.primaryMinSemanticSuccesses) {
      capabilityClass = "eligible";
      decisionReason = "semantic-success-threshold";
    } else if (semanticSuccesses === 0 && semanticFailures >= rule.semanticFloorMinFailures) {
      capabilityClass = "semantic-floor";
      decisionReason = "semantic-floor-threshold";
    } else if (
      semanticSuccesses === 1 &&
      semanticFailures >= rule.afUnstableMinSemanticFailures
    ) {
      capabilityClass = "AF-unstable";
      decisionReason = "one-success-multiple-semantic-failures";
    } else if (attempts >= rule.maxAttempts) {
      if (semanticSuccesses === 1) {
        capabilityClass = "AF-unstable";
        decisionReason = "max-attempts-one-semantic-success";
      } else {
        capabilityClass = "invalid";
        decisionReason = "max-attempts-insufficient-semantic-evidence";
      }
    } else {
      capabilityClass = "pending";
      decisionReason = "additional-semantic-evidence-required";
    }
  }

  const analysisRole = analysisRoleForTaskType(taskType);
  const needsAdditionalRepeat = capabilityClass === "pending" && attempts >= rule.initialAttempts && attempts < rule.maxAttempts;
  const classification = legacyClassification(capabilityClass, analysisRole);

  return {
    taskId,
    taskType,
    attempts,
    semanticSuccesses,
    semanticFailures,
    semanticEvaluableRepeats,
    protocolFailures,
    systemFailures,
    otherFailures,
    infrastructureInvalidCount,
    protocolReliabilitySuccesses,
    protocolReliabilityTotal,
    protocolReliability,
    capabilityClass,
    analysisRole,
    needsAdditionalRepeat,
    decisionReason,
    classification,
  };
}

function legacyClassification(capabilityClass: CapabilityClass, analysisRole: AnalysisRole): string {
  switch (capabilityClass) {
    case "eligible":
      return analysisRole === "main" ? "T_primary-eligible" : "T_diagnostic-eligible";
    case "semantic-floor":
      return "T_challenge-semantic-floor";
    case "AF-unstable":
      return "T_challenge-AF-unstable";
    case "invalid":
      return "invalid-capability-classification";
    default:
      return "hold-more-semantic-repeats";
  }
}

function flags(failureDomain: FailureDomain): FailureClassification {
  return {
    failureDomain,
    semanticFailure: failureDomain === "semantic",
    protocolFailure: failureDomain === "protocol",
    systemFailure: failureDomain === "system",
    infrastructureFailure: failureDomain === "infrastructure",
  };
}
