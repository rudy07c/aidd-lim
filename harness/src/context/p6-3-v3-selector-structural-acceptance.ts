import type { ArtifactFileCategory } from "../measurement/file-classification";

export const P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC_VERSION =
  "p6-3-v3-selector-structural-acceptance-v1" as const;

export const P6_3_V3_SELECTOR_ACCEPTED_CATEGORY_ORDER: readonly ArtifactFileCategory[] =
  Object.freeze([
    "type_definition",
    "fixed_contract",
    "test",
    "implementation",
  ]);

/**
 * Outcome-blind structural acceptance specification for Candidate C.
 *
 * This is intentionally not a performance threshold. A selector either follows
 * the exact deterministic scheduling rule and invariants below or it does not.
 * M/Rsem outcomes are not inputs to this specification.
 */
export const P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC = Object.freeze({
  version: P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC_VERSION,
  candidate: "C-blended-nested-selector",
  decisionBasis: "artifact-structure-only",
  scheduler: Object.freeze({
    rule: "minimum-projected-normalized-served-load",
    projectedLoadFormula: "(servedContentTokens[c] + nextContentTokens[c]) / max(1, fullContentTokens[c])",
    tieBreak: "fixed-category-order",
    categoryOrder: P6_3_V3_SELECTOR_ACCEPTED_CATEGORY_ORDER,
    withinCategoryOrder: "preserve-input-ranking-then-chunk-order",
  }),
  requiredInvariants: Object.freeze([
    "deterministic-same-input-same-order",
    "complete-repository-coverage-exactly-once",
    "nested-prefix-exposure-under-increasing-budget",
    "within-category-ranking-and-chunk-order-preserved",
    "no-absolute-category-blocking-beyond-exact-scheduler-rule",
    "repository-object-insertion-order-invariant",
    "selector-input-surface-excludes-scientific-outcomes",
    "fixed-environment-channel-excluded-from-selector-and-artifact-budget",
    "canonical-token-counting-used-for-scheduler-loads",
  ]),
  prohibitedScientificInputs: Object.freeze([
    "hidden-test-result",
    "correct-answer",
    "M-outcome",
    "Rsem-outcome",
    "probe-wise-accuracy",
    "provider-response-history",
    "success-failure-diagnostic-label",
  ]),
  fixedEnvironmentTreatment: "outside-selector-outside-B_expose",
  liveAuthorization: false,
} as const);

export interface AcceptedSchedulerStepInput {
  availableCategories: readonly ArtifactFileCategory[];
  servedContentTokens: Readonly<Record<ArtifactFileCategory, number>>;
  fullContentTokens: Readonly<Record<ArtifactFileCategory, number>>;
  nextContentTokens: Readonly<Record<ArtifactFileCategory, number | null>>;
}

/**
 * Executable normative rule for one Candidate-C scheduling step.
 *
 * Among nonempty category queues, choose the category whose next admitted unit
 * yields the smallest projected normalized served load. Exact ties are resolved
 * only by the fixed category order above.
 */
export function chooseStructurallyAcceptedNextCategory(
  input: AcceptedSchedulerStepInput
): ArtifactFileCategory {
  const available = new Set(input.availableCategories);
  const candidates = P6_3_V3_SELECTOR_ACCEPTED_CATEGORY_ORDER.filter((category) =>
    available.has(category)
  );
  if (candidates.length === 0) {
    throw new Error("selector structural acceptance scheduler has no available category");
  }

  let best = candidates[0];
  let bestLoad = projectedLoad(best, input);
  for (const category of candidates.slice(1)) {
    const load = projectedLoad(category, input);
    if (load < bestLoad) {
      best = category;
      bestLoad = load;
    }
  }
  return best;
}

function projectedLoad(
  category: ArtifactFileCategory,
  input: AcceptedSchedulerStepInput
): number {
  const next = input.nextContentTokens[category];
  if (next === null || !Number.isFinite(next) || next <= 0) {
    throw new Error(`selector structural acceptance scheduler has invalid next-token count for ${category}`);
  }
  const served = input.servedContentTokens[category];
  const full = input.fullContentTokens[category];
  if (!Number.isFinite(served) || served < 0 || !Number.isFinite(full) || full < 0) {
    throw new Error(`selector structural acceptance scheduler has invalid load state for ${category}`);
  }
  return (served + next) / Math.max(1, full);
}
