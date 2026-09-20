export const P6_1_FAILURE_CLASSIFICATION_VERSION = "p6-1-failure-domain-v2";

export type FailureDomain =
  | "none"
  | "semantic"
  | "protocol"
  | "system"
  | "infrastructure"
  | "other";

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
  invalidInfrastructureMin: 2,
} as const;

export interface TaskRepeatLike extends FailureLike {
  taskId: string;
  taskType?: string | null;
  repeat: number;
}

export interface P61TaskClassification {
  taskId: string;
  taskType: string | null;
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
    status === "provider-error"
  ) {
    return flags("infrastructure");
  }

  if (category === "test-failure") {
    // Test-suite execution/compiler failures do not establish semantic inability.
    if (reason.includes(":execution:")) return flags("system");
    return flags("semantic");
  }

  if (PROTOCOL_CATEGORIES.has(category) || PROTOCOL_STATUSES.has(status)) {
    return flags("protocol");
  }

  return flags("other");
}

export function classifyTaskEligibility(
  results: TaskRepeatLike[],
  rule: {
    primaryMinSemanticSuccesses: number;
    semanticFloorMinFailures: number;
    invalidInfrastructureMin: number;
  } = DEFAULT_P6_1_ELIGIBILITY_RULE
): P61TaskClassification {
  if (!results.length) throw new Error("classifyTaskEligibility requires at least one repeat");

  const classified = results.map((result) => ({ result, failure: classifyFailure(result) }));
  const taskId = results[0].taskId;
  const taskType = results[0].taskType ?? null;
  if (results.some((result) => result.taskId !== taskId)) {
    throw new Error("classifyTaskEligibility received mixed task IDs");
  }

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

  let classification: string;
  if (infrastructureInvalidCount >= rule.invalidInfrastructureMin) {
    classification = "invalid-capability-classification";
  } else if (semanticSuccesses === 0 && semanticFailures >= rule.semanticFloorMinFailures) {
    classification = "T_challenge-semantic-floor";
  } else if (semanticSuccesses >= rule.primaryMinSemanticSuccesses) {
    classification = "T_primary-eligible";
  } else {
    classification = "hold-more-semantic-repeats";
  }

  return {
    taskId,
    taskType,
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
    classification,
  };
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
