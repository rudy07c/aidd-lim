# P6-3 v3 final artifact selector freeze

**Status:** selector-only structural freeze  
**Final selector:** `p6-3-v3-category-proportional-interleave-final-v1`  
**Acceptance specification:** `p6-3-v3-selector-structural-acceptance-v1`  
**Live eligibility:** false

## 1. Decision

Candidate C passed the already-merged, outcome-blind structural acceptance specification when applied to the actual P6-3 primary synthetic-world task bank. The assessment read repository structure, privileged structural ranking inputs, task/naming metadata, and ground-truth structure required to construct the evaluator-side ranking. It did not read M outcomes, Rsem outcomes, provider responses, or `E_fixed`.

The predeclared action for a structural pass was promotion under a new final selector version. This document records that promotion without changing the validated selection algorithm.

## 2. Historical prototype remains preserved

The diagnostic prototype remains versioned as:

```text
p6-3-v3-category-proportional-interleave-prototype-v1
```

It is not renamed or rewritten. Historical audit output that reported `diagnostic-prototype`, `freezeEligible=false`, and `structuralAcceptanceGateFrozen=false` remains valid as a record of the pre-acceptance stage.

The production/final v3 artifact selector is separately versioned as:

```text
p6-3-v3-category-proportional-interleave-final-v1
```

The final module records both:

- the frozen acceptance-spec version;
- the validated prototype version from which the exact order is inherited.

## 3. Final selector semantics

The final selector intentionally introduces no new ordering rule at promotion time. It calls the structurally validated Candidate-C implementation and preserves its exact ordered artifact units.

That implementation had already been checked against the frozen normative scheduler:

```text
projected_load(c) =
  (servedContentTokens[c] + nextContentTokens[c])
  / max(1, fullContentTokens[c])
```

At each step the category with minimum projected load is selected; exact ties use the fixed order:

```text
type_definition
fixed_contract
test
implementation
```

Within each category, privileged ranking and deterministic chunk order are preserved.

## 4. Actual-world promotion gate

`harness/assess-p6-3-v3-selector-promotion.ts` applies the already-frozen rule to the complete primary task bank and fails if any task differs from the independent normative scheduler.

`harness/verify-p6-3-v3-final-selector.ts` then independently verifies that, for every primary task:

1. the final selector exactly preserves the validated prototype order;
2. the final order exactly matches the frozen acceptance scheduler;
3. final provenance pins the acceptance-spec version;
4. final provenance pins the validated prototype version;
5. the final selector imports no scientific-outcome, provider, live-calibration, Rsem, evaluator-result, or fixed-environment runtime dependency.

This is an offline structural gate and makes no provider call.

## 5. Scope of the freeze

This promotion establishes:

```text
selectorStructurallyFrozen = true
```

It does **not** establish:

```text
budgetGridFrozen = false
measurementSelectionRuleFrozen = false
liveEligible = false
```

In particular, this PR does not choose the v3 `B_expose` grid, repeat count, M/Rsem selection margins, or authorize paid/live calibration.

## 6. Context boundary remains unchanged

The v3 context definition remains:

```text
Context_EL(B) = E_fixed ∪ Exposure_artifact(B, S_select)
```

The final selector operates only on `Exposure_artifact`. `E_fixed` is absent from the selector API and remains outside `B_expose`.

## 7. Next gate

With the artifact selector structurally frozen, the remaining pre-live scientific design step is to predeclare the v3 calibration design separately:

- exact `B_expose` budget grid;
- repeat count;
- M and Rsem decision/selection rules;
- any interior-budget criterion;
- treatment-family identity/provenance requirements;
- explicit statement that v2 results remain historical and are not pooled into v3 primary estimates.

Those quantities must be frozen before any v3 provider/live outcome is observed.
