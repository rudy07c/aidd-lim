# P6-3 v3 selector structural acceptance specification

**Status:** pre-freeze structural acceptance rule; no selector promotion, budget freeze, or paid/live execution authorized  
**Scope:** Candidate C artifact-only blended selector under `Context_EL(B) = E_fixed ∪ Exposure_artifact(B, S_select)`  
**Depends on:** Candidate D fixed-environment separation and the v3 run-start ownership/provenance path merged through PR #41

## 1. Why this is a separate freeze step

The current Candidate-C implementation is still explicitly versioned as a prototype:

```text
p6-3-v3-category-proportional-interleave-prototype-v1
```

The existing structural audit demonstrates useful properties but deliberately reports `freezeEligible=false`, because the exact acceptance rule had not been predeclared.

This document freezes that missing rule **before** any selector is promoted to a final v3 policy and before any new M/Rsem calibration outcome is collected.

The rule is intentionally not of the form “category share must be within X%”. Such a tolerance would introduce an arbitrary numerical degree of freedom after observing the repository structure. Instead, acceptance is defined by an exact deterministic scheduling invariant.

## 2. Normative scheduling rule

For each artifact category `c`, let:

- `served_c` = cumulative content tokens already selected from category `c`;
- `full_c` = canonical content tokens in the full repository belonging to category `c`;
- `next_c` = canonical content tokens in the next queued artifact unit for category `c`.

At every selection step, among categories with a nonempty queue, compute:

```text
projected_load(c) = (served_c + next_c) / max(1, full_c)
```

Select the category with the smallest `projected_load(c)`.

Exact ties are resolved only by the fixed order:

```text
type_definition
fixed_contract
test
implementation
```

Within a category, the selector must preserve the frozen privileged ranking and then the deterministic chunk order of each ranked file. The cross-category scheduler may interleave those queues but may not reorder their contents.

The executable normative implementation is:

```text
harness/src/context/p6-3-v3-selector-structural-acceptance.ts
```

Its version is:

```text
p6-3-v3-selector-structural-acceptance-v1
```

## 3. Required structural invariants

A Candidate-C implementation is structurally acceptable only if all of the following hold:

1. same repository, ranking, chunk size, and selector version produce the same ordered units;
2. the complete ranked repository is covered exactly once;
3. increasing `B_expose` yields nested prefixes of one frozen artifact order;
4. within-category ranking and chunk order are preserved;
5. cross-category order is exactly the projected-normalized-load scheduler above, not an absolute category block;
6. repository object insertion order does not affect the result;
7. the selector input/dependency surface excludes scientific outcomes and provider-response history;
8. `E_fixed` is not a selector input and is not counted inside `B_expose`;
9. scheduler loads use the canonical token counter.

These are structural constraints. None refers to M, Rsem, probe accuracy, hidden-test success, or whether a particular v2/v3 budget performed well.

## 4. Prohibited scientific inputs

The acceptance specification explicitly excludes:

- hidden-test results;
- correct answers;
- M outcomes;
- Rsem outcomes;
- probe-wise accuracy;
- provider-response history;
- success/failure diagnostic labels derived from prior calibration.

Task relevance/dependency information already permitted by the privileged structural ranking remains allowed because it is evaluator-side structural information, not an observed scientific outcome.

## 5. Fixed-environment boundary

The structural acceptance rule applies only to artifact evidence:

```text
Exposure_artifact(B, S_select)
```

It does not schedule, score, count, or otherwise inspect `E_fixed`.

The fixed WorldProtocol surface remains a separate run-fixed channel built once from Generation 0 and reused across conditions/measurements. This selector specification therefore cannot reintroduce the v2 treatment-boundary confound in which public WorldProtocol observability varied with artifact budget.

## 6. Offline verifier

`harness/verify-p6-3-v3-selector-structural-acceptance.ts` provides an independent oracle derived from the normative scheduling function and tests the current prototype against synthetic structural fixtures.

It verifies:

- exact scheduler parity;
- determinism;
- complete unit coverage exactly once;
- nested prefix exposure under increasing budgets;
- preservation of within-category order;
- repository insertion-order invariance;
- selector dependency exclusion for scientific outcome/runtime-result modules;
- exclusion of fixed-environment dependencies;
- canonical-token use in the normative scheduler.

The fixtures are not calibration worlds and no provider is called.

## 7. What this PR does not decide

Freezing this acceptance rule does **not** by itself declare the current prototype to be the final v3 selector.

In particular it does not:

- rename the prototype policy version;
- change the existing design-audit `freezeEligible=false` decision;
- freeze the final v3 budget grid;
- freeze repeat count or M/Rsem selection margins;
- authorize a v3 live/provider run;
- reuse v2 outcomes as v3 primary evidence.

Those actions require a subsequent promotion/freeze step after this acceptance specification is merged and independently applied.

## 8. Next gate after merge

The next PR should apply this already-frozen rule to Candidate C and the actual synthetic-world repository structure, then produce a binary structural decision:

```text
passes structural acceptance -> promote under a new final selector version
fails structural acceptance  -> remain in design audit; do not tune from M/Rsem
```

Only after selector promotion should the v3 artifact budget grid and measurement selection rule be predeclared.
