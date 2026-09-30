import {
  BLENDED_STATIC_EXPOSURE_POLICY_VERSION,
  buildCategoryProportionalBlendedOrder,
  type BlendedStaticExposurePlan,
} from "./blended-static-exposure-selector";
import type { PrivilegedRetrievalPlan } from "./privileged-retrieval-controller";
import {
  P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC_VERSION,
} from "./p6-3-v3-selector-structural-acceptance";

export const P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION =
  "p6-3-v3-category-proportional-interleave-final-v1" as const;

export interface P63V3FinalStaticExposurePlan
  extends Omit<BlendedStaticExposurePlan, "policyVersion"> {
  policyVersion: typeof P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION;
  acceptanceSpecVersion: typeof P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC_VERSION;
  validatedPrototypeVersion: typeof BLENDED_STATIC_EXPOSURE_POLICY_VERSION;
}

/**
 * Structurally frozen P6-3 v3 artifact selector.
 *
 * Candidate C passed the predeclared structural acceptance rule on the complete
 * primary synthetic-world task bank before this final policy version was minted.
 * The final selector therefore reuses the already-validated deterministic order
 * without introducing any new scientific degree of freedom at promotion time.
 *
 * `E_fixed` remains a separate channel and is intentionally absent from this API.
 */
export function buildP63V3FinalStaticExposureOrder(args: {
  ranking: PrivilegedRetrievalPlan;
  repositoryFiles: Readonly<Record<string, string>>;
  maxTokensPerUnit: number;
}): P63V3FinalStaticExposurePlan {
  const validated = buildCategoryProportionalBlendedOrder(args);
  if (validated.policyVersion !== BLENDED_STATIC_EXPOSURE_POLICY_VERSION) {
    throw new Error(
      `P6-3 v3 final selector validated prototype version drift: ${validated.policyVersion}`
    );
  }
  return {
    ...validated,
    policyVersion: P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION,
    acceptanceSpecVersion: P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC_VERSION,
    validatedPrototypeVersion: BLENDED_STATIC_EXPOSURE_POLICY_VERSION,
  };
}
