# P6-3 v3 result finalizer

## Status

This document records Step 3 of `docs/p6_3_post_audit_execution_plan.md`.

The finalizer is a provider-free, pre-live analysis contract. It must be merged before any P6-3 v3 outcome is observed. It does not authorize paid/live execution.

## Purpose

Completing 864 logical cells is necessary but not sufficient to select `B_expose`.

The finalizer closes the previously missing path:

```text
completed state
  -> final scientific observation per sequence
  -> exact M / Rsem membership and denominators
  -> frozen arm aggregates
  -> already-predeclared co-gate
  -> immutable machine-readable result
```

No result-dependent rule is introduced here. Membership, repeat count, capacity grid, margins, aggregate definitions, tie-break, and the selection function all come from the existing v3 predeclaration and canonical calibration plan.

## Preconditions

Finalization requires all of the following:

- current v3 state/controller schema versions;
- `runClass=scientific-calibration`;
- `calibrationOnly=true`;
- `confirmatoryStage1AEligible=false`;
- `status=completed`;
- `cursorCellIndex=864` and `totalLogicalCells=864`;
- `inFlight=null`;
- `auditFlag=null`;
- non-null `completedAt`;
- state `planHash` equal to `buildP63V3CalibrationPlan()`;
- all interrupted provider-visible attempts explicitly adjudicated `infrastructure-invalid`;
- committed infrastructure-invalid attempts explicitly adjudicated `infrastructure-invalid`;
- contiguous, non-duplicated attempt numbering within every logical sequence;
- exactly one `effectiveValidity=valid` scientific observation for every sequence 0..863;
- no attempt after the final valid observation for a sequence.

`effectiveValidity`, not failure domain alone, determines whether an attempt is a final scientific observation. This directly preserves the Step-2 repair for cases such as `probe-scoring-error = infrastructure-invalid + system`.

## Canonical plan identity

Every committed attempt is checked against the canonical v3 plan at the same sequence:

- measurement;
- task ID;
- repeat;
- arm label;
- arm kind;
- artifact budget.

A state with the right counts but different membership is refused.

## M aggregation

For each arm, the finalizer requires:

```text
11 primary tasks x 12 repeats = 132 M observations
```

For every repeat:

- all 11 frozen primary tasks appear exactly once;
- `passed` is boolean;
- `semanticScore` is exactly consistent with the binary pass outcome.

The arm aggregate is:

```text
M = passCount / 132
```

## Rsem aggregation

For each arm, the finalizer requires:

```text
12 bank-level repeats
12 boolean probes per repeat
144 probe judgments per arm
```

For every repeat:

- exactly one Rsem bank-level observation exists;
- `taskId=null` and `passed=null`;
- `semanticScore` is present and finite;
- `diagnosticSummary.booleanCorrect` is an integer;
- `diagnosticSummary.booleanTotal` is exactly 12;
- `semanticScore == booleanCorrect / booleanTotal`.

The arm aggregate is:

```text
Rsem = totalCorrect / 144
```

A valid observation with a missing/null Rsem score does **not** become zero and does **not** reduce the denominator. Finalization refuses before the co-gate is evaluated.

This rule is outcome-independent and prevents protocol/system observations without a complete primary score from being silently converted into a favorable or unfavorable estimate after collection.

## Selection

Only after the six exact arm aggregates have been constructed does the finalizer call the already-frozen:

```text
selectP63V3ArtifactBudget()
```

No parallel or replacement selection implementation is introduced.

The normal machine result therefore ends in one of the already-predeclared outcomes:

```text
selected
```

with the minimum qualifying interior budget, or:

```text
needs-design-audit
NO_CONJUNCTIVE_INTERIOR_BUDGET
```

when no interior budget satisfies both endpoint guards.

A structurally incomplete/unscorable state is different from `NO_CONJUNCTIVE_INTERIOR_BUDGET`: it is refused before scientific selection rather than being mapped onto a no-qualifier result.

## Machine-readable result

`finalizeP63V3Calibration()` returns a versioned result containing:

- semantic SHA-256 of the complete state object;
- checkout, plan, treatment, fixed-environment, and authorization identities;
- valid/invalid/interrupted attempt counts;
- frozen measurement/selection rule metadata;
- M pass counts and rates per arm;
- Rsem correct counts, denominators, and rates per arm;
- the exact output of `selectP63V3ArtifactBudget()`;
- explicit boundaries that no formal-equivalence claim, Stage 1A effect claim, or v2-primary-estimate pooling is made.

`harness/p6-3-v3-finalize.ts` is the provider-free file entrypoint:

```bash
npx ts-node p6-3-v3-finalize.ts --state <run-dir>/state.json
```

By default it writes `<run-dir>/result.json`. An existing result may only be reused if its bytes are identical; different content is refused.

## Offline verification

`harness/verify-p6-3-v3-result-finalizer.ts` builds synthetic completed states only. It does not use observed v2 outcomes or any future v3 outcome and makes zero provider calls.

It verifies at least:

- successful deterministic finalization of a synthetic selected-budget case;
- successful deterministic `needs-design-audit` no-qualifier case;
- 864 final scientific observations;
- invalid committed replacement exclusion;
- interrupted replacement exclusion;
- attempt-journal contiguity;
- exact canonical plan membership;
- M 132/arm denominator and task membership;
- Rsem 12 banks / 144 judgments per arm;
- null Rsem score fail-close;
- Rsem denominator drift fail-close;
- unadjudicated invalid/interrupted attempts fail-close;
- no historical v2 primary estimate pooling.

## Scientific boundary

This step changes no v3 treatment and observes no v3 result.

After this finalizer is merged and green, the next canonical step is Step 4: add the finalizer and remaining runtime-environment checks to the final pre-live gate. Paid/live calibration remains blocked until Steps 4 and 5 are complete.
