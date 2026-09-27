import { isCensoredAgentExecutionStatus } from "../run-validity";

export const P6_3_V2_AUTO_INFRA_CLASSIFIER_VERSION =
  "p6-3-v2-auto-infra-classifier-v1" as const;

export const P6_3_V2_AUTO_INFRA_MAX_OUTPUT_RULE_ID =
  "AUTO-INFRA-001" as const;

export type P63V2AutoInfraDisposition =
  | "infrastructure-invalid"
  | "not-applicable"
  | "needs-audit";

/**
 * Raw execution evidence only. Deliberately excludes any human adjudication or
 * already-final disposition so the classifier cannot pass regression by
 * copying the answer it is supposed to reproduce.
 */
export interface P63V2AutoInfraEvidence {
  readonly executionStatus: string | null;
  readonly incompleteReason: string | null;
  readonly outputTokens: number | null;
  readonly configuredMaxOutputTokens: number | null;
  readonly responseStatus?: string | null;
  readonly providerErrorCode?: string | null;
  readonly errorCategory?: string | null;
}

export interface P63V2AutoInfraClassification {
  readonly classifierVersion: typeof P6_3_V2_AUTO_INFRA_CLASSIFIER_VERSION;
  readonly disposition: P63V2AutoInfraDisposition;
  readonly ruleId: typeof P6_3_V2_AUTO_INFRA_MAX_OUTPUT_RULE_ID | null;
  readonly reason: string;
}

/**
 * Deterministic v2 adjudication rule family.
 *
 * AUTO-INFRA-001 is intentionally narrow: it automates only the exact
 * response-incomplete/max_output_tokens pattern whose disposition was
 * repeatedly confirmed by humans in P6-3 v1. Other censored or contradictory
 * provider states remain fail-closed and require audit.
 *
 * This changes who applies the adjudication, not the P6-2/P6-3 failure-domain
 * semantics themselves.
 */
export function classifyP63V2AutoInfrastructure(
  evidence: P63V2AutoInfraEvidence
): P63V2AutoInfraClassification {
  const status = evidence.executionStatus;
  const reason = evidence.incompleteReason;

  if (status === "response-incomplete" && reason === "max_output_tokens") {
    if (!isNonNegativeInteger(evidence.outputTokens)) {
      return audit("AUTO-INFRA-001 candidate is missing a valid provider-reported output token count");
    }
    if (!isPositiveInteger(evidence.configuredMaxOutputTokens)) {
      return audit("AUTO-INFRA-001 candidate is missing a valid frozen maxOutputTokens value");
    }
    if (evidence.outputTokens !== evidence.configuredMaxOutputTokens) {
      return audit(
        `AUTO-INFRA-001 evidence is contradictory: outputTokens=${evidence.outputTokens} maxOutputTokens=${evidence.configuredMaxOutputTokens}`
      );
    }
    return {
      classifierVersion: P6_3_V2_AUTO_INFRA_CLASSIFIER_VERSION,
      disposition: "infrastructure-invalid",
      ruleId: P6_3_V2_AUTO_INFRA_MAX_OUTPUT_RULE_ID,
      reason: "Provider response was incomplete because the frozen max-output-token limit was reached exactly.",
    };
  }

  // A max-output reason attached to any other status is contradictory rather
  // than silently ignored.
  if (reason === "max_output_tokens") {
    return audit(
      `max_output_tokens incompleteReason appeared with unexpected executionStatus=${String(status)}`
    );
  }

  // Existing failure semantics already identify these statuses as censored.
  // v2 may add more deterministic AUTO-INFRA rules later, but until then they
  // must stop unattended progression rather than being guessed at.
  if (isCensoredAgentExecutionStatus(status)) {
    return audit(`Censored executionStatus=${String(status)} has no frozen automatic adjudication rule`);
  }

  return {
    classifierVersion: P6_3_V2_AUTO_INFRA_CLASSIFIER_VERSION,
    disposition: "not-applicable",
    ruleId: null,
    reason: "Execution evidence does not match a frozen automatic infrastructure rule.",
  };
}

function audit(reason: string): P63V2AutoInfraClassification {
  return {
    classifierVersion: P6_3_V2_AUTO_INFRA_CLASSIFIER_VERSION,
    disposition: "needs-audit",
    ruleId: null,
    reason,
  };
}

function isNonNegativeInteger(value: number | null): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: number | null): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
