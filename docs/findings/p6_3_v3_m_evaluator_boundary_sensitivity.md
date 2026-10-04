# P6-3 v3 M evaluator-boundary design audit and corrected-evaluator sensitivity

## Status

P6-3 v3 completed its split-provenance calibration analysis with the frozen primary result:

```text
status = needs-design-audit
reason = NO_CONJUNCTIVE_INTERIOR_BUDGET
```

A subsequent post-hoc design audit identified a hidden-evaluator boundary defect that materially affected the primary M endpoint. The original result is preserved and is **not replaced**.

Under a corrected evaluator that removes only the hidden evaluator's direct dependency on the repository-internal `WorldState` type while leaving all H(G) test bodies byte-identical, the same saved 792 M mutations were rescored provider-free.

The corrected-evaluator sensitivity selects:

```text
qualifyingInteriorArms = [B2]
selectedArm = B2
selectedBExpose = 1011
```

This is **post-hoc sensitivity evidence only**. It is not a confirmatory Stage 1A result and does not retroactively authorize `B2` as the frozen Stage 1A EL budget.

---

## 1. Why the design audit was required

The frozen v3 primary aggregates were:

| Arm | Budget | Primary M | Fresh Rsem |
|---|---:|---:|---:|
| B0 | 0 | 0 / 132 = 0.0000 | 76 / 144 = 0.5278 |
| B1 | 505 | 73 / 132 = 0.5530 | 86 / 144 = 0.5972 |
| B2 | 1011 | 0 / 132 = 0.0000 | 98 / 144 = 0.6806 |
| B3 | 2023 | 1 / 132 = 0.0076 | 131 / 144 = 0.9097 |
| B4 | 3034 | 83 / 132 = 0.6288 | 134 / 144 = 0.9306 |
| AF | 4046 | 116 / 132 = 0.8788 | 134 / 144 = 0.9306 |

B2 and B3 showed an extreme non-monotonic M collapse that was approximately uniform across the 11 primary M tasks, while Rsem rose much more smoothly.

This pattern triggered the predeclared `needs-design-audit` interpretation rather than a post-hoc budget choice.

## 2. Hidden evaluator contract mismatch

The hidden evaluator documents the intended boundary as:

```text
repository internal imports are not used;
H(G) interacts only through protocol_adapter.ts
```

However, the implemented `synthetic-world/hidden_regression_tests/H_G.test.ts` directly imported:

```ts
import { WorldState } from "../repository/src/world";
```

and annotated its helper boundary with that concrete repository-internal type.

This contradicts the evaluator's documented protocol-only boundary.

The v3 fixed environment intentionally exposes a generic external WorldProtocol surface rather than repository implementation details. `schema.ts` itself is not artifact exposure; the public contract is supplied separately as common `E_fixed`.

## 3. Failure mechanism

A large family of B2/B3 mutations rewrote the adapter type surface from concrete generic instantiations such as:

```ts
WorldProtocol<WorldState>
OperationResult<WorldState>
```

to the schema defaults:

```ts
WorldProtocol
OperationResult
```

whose state-handle type defaults to `unknown`.

The generated repository could still pass visible and task-specific behavioral checks, but H(G)'s direct concrete `WorldState` annotations caused TypeScript errors such as `TS2322` and `TS2345` before the hidden behavioral tests could run.

Thus a substantial subset of primary M=0 outcomes reflected the interaction:

```text
opaque/generic candidate protocol handle
    ×
hidden evaluator concrete WorldState dependency
    ->
hidden suite compile failure
    ->
M = 0
```

rather than an observed hidden behavioral assertion failure.

## 4. Mechanical A/B/C boundary audit

All 792 frozen M attempt artifacts were classified provider-free with a deliberately conservative five-way scheme:

- `PASS`: frozen primary M pass;
- `A_CANDIDATE_FAILURE_EVIDENCE`: candidate-side behavioral/type/test failure evidence;
- `B_FIXED_PROTOCOL_VIOLATION`: explicit frozen scorer protocol-contract violation;
- `C_EVALUATOR_INTERNAL_TYPE_COUPLING`: narrow H(G) `unknown` ↔ `WorldState` compile-coupling signature;
- `OTHER_OR_UNRESOLVED`: not safely attributable to A/B/C from committed evidence alone.

Result:

| Arm | PASS | A | B | C | OTHER | Total |
|---|---:|---:|---:|---:|---:|---:|
| B0 | 0 | 28 | 24 | 0 | 80 | 132 |
| B1 | 73 | 30 | 18 | 0 | 11 | 132 |
| B2 | 0 | 7 | 1 | **102** | 22 | 132 |
| B3 | 1 | 5 | 1 | **81** | 44 | 132 |
| B4 | 83 | 2 | 1 | 12 | 34 | 132 |
| AF | 116 | 0 | 0 | 0 | 16 | 132 |
| **Total** | **273** | **72** | **45** | **195** | **207** | **792** |

Of the 195 C-class cases, 194 also contained direct evidence of the generic-argument omission mechanism.

C is therefore strongly concentrated in B2/B3:

```text
B2 + B3 C cases = 183 / 195 = 93.8%
```

This concentration mirrors the anomalous primary M collapse.

## 5. Corrected evaluator

The post-hoc sensitivity evaluator changes only the H(G) helper type boundary.

It removes the concrete repository-internal import and derives an opaque state handle from the protocol itself:

```ts
type WorldStateHandle = ReturnType<typeof protocol.reset>;
```

The helper functions use `WorldStateHandle`, while every `describe` / `test` body remains byte-identical to the frozen H(G).

The correction therefore does not remove hidden behavioral assertions or alter expected semantic behavior. It repairs the documented evaluator abstraction boundary.

The implementation records both original and corrected H(G) SHA-256 values and explicitly marks the analysis:

```text
analysisClass = post-hoc-design-audit-sensitivity
primaryEvidenceMutated = false
providerCallsMade = false
```

## 6. Proof-of-correction

A deterministic 10-case proof was run before the full 792-case sensitivity:

- 3 B2 C cases;
- 3 B3 C cases;
- 1 B1 original PASS;
- 1 AF original PASS;
- 1 A candidate failure;
- 1 B protocol violation.

Observed result:

```text
C:     6 / 6 changed FAIL -> PASS
PASS:  2 / 2 remained PASS
A:     0 / 1 rescued
B:     0 / 1 rescued
PASS -> FAIL: 0
```

This established that the correction operated in the intended direction before the full rescore.

## 7. Full 792-case corrected-evaluator sensitivity

The provider-free full rescore produced:

```text
total             = 792
originalPasses    = 273
correctedPasses   = 464
changedToPass     = 191
changedToFail     = 0
```

By original audit class:

| Original class | Total | Corrected PASS | FAIL→PASS |
|---|---:|---:|---:|
| A candidate failure | 72 | 0 | 0 |
| B protocol violation | 45 | 0 | 0 |
| C evaluator coupling | 195 | **188** | **188** |
| OTHER / unresolved | 207 | 3 | 3 |
| original PASS | 273 | 273 | 0 |

The key specificity checks therefore held over the full dataset:

- no original PASS became FAIL;
- no A candidate failure was rescued;
- no B fixed-protocol violation was rescued;
- 188 / 195 narrow C cases became PASS.

## 8. Corrected M aggregates

The corrected M rates are:

| Arm | Primary M | Corrected M | Change |
|---|---:|---:|---:|
| B0 | 0 / 132 = 0.0000 | 0 / 132 = **0.0000** | 0 |
| B1 | 73 / 132 = 0.5530 | 74 / 132 = **0.5606** | +1 |
| B2 | 0 / 132 = 0.0000 | 97 / 132 = **0.7348** | +97 |
| B3 | 1 / 132 = 0.0076 | 82 / 132 = **0.6212** | +81 |
| B4 | 83 / 132 = 0.6288 | 95 / 132 = **0.7197** | +12 |
| AF | 116 / 132 = 0.8788 | 116 / 132 = **0.8788** | 0 |

The B2/B3 collapse is therefore not robust to correction of the evaluator's internal-type dependency.

## 9. Frozen co-gate reused unchanged

No margin, budget, Rsem observation, or tie-break rule was altered.

The post-hoc analysis reused the frozen selector function `selectP63V3ArtifactBudget()` with:

```text
Delta_M = 1/11
Delta_R = 1/12
tie-break = smallest qualifying interior budget
```

and combined corrected M with the already-completed fresh Rsem family.

The diagnostic margins were:

### B1

```text
M above B0     = 0.5606  PASS
M below AF     = 0.3182  PASS
Rsem above B0  = 0.0694  FAIL
Rsem below AF  = 0.3333  PASS
```

### B2

```text
M above B0     = 0.7348  PASS
M below AF     = 0.1439  PASS
Rsem above B0  = 0.1528  PASS
Rsem below AF  = 0.2500  PASS
```

### B3

```text
M above B0     = 0.6212  PASS
M below AF     = 0.2576  PASS
Rsem above B0  = 0.3819  PASS
Rsem below AF  = 0.0208  FAIL
```

### B4

```text
M above B0     = 0.7197  PASS
M below AF     = 0.1591  PASS
Rsem above B0  = 0.4028  PASS
Rsem below AF  = 0.0000  FAIL
```

Therefore:

```text
sensitivitySelection.status = selected
qualifyingInteriorArms = [B2]
selectedArm = B2
selectedBExpose = 1011
reason = CONJUNCTIVE_INTERIOR_BUDGET_SELECTED
```

B2 is the only interior arm that satisfies all four frozen guards under the corrected-evaluator sensitivity.

## 10. Interpretation boundary

The result supports the following statement:

> The frozen P6-3 v3 primary conclusion that no qualifying interior budget existed is not robust to correction of a documented hidden-evaluator abstraction-boundary defect. Under a protocol-only corrected evaluator, the saved mutations yield B2 as the sole qualifying interior arm.

It does **not** support the stronger statements that:

- the original frozen primary result should be overwritten;
- B2 is now formally preregistered or confirmatorily selected;
- Stage 1A may treat B2 as if it had been selected before outcomes were observed;
- the 191 changed outcomes are new independent model observations;
- finite context has been shown superior to full context;
- the main ILM research hypothesis has been confirmed.

The corrected rescore is a deterministic post-hoc sensitivity analysis over already observed model mutations.

## 11. Status of the primary result

The historical primary result remains:

```text
P6-3 v3 frozen primary:
needs-design-audit / NO_CONJUNCTIVE_INTERIOR_BUDGET
```

It should now be accompanied by the design-audit finding:

```text
primary M is materially contaminated by an evaluator-boundary defect
and must not be interpreted as a clean budget-response estimate.
```

The corrected-evaluator sensitivity is:

```text
post-hoc sensitivity:
B2 / 1011 is the sole qualifying interior arm
```

These two statements are not contradictory: they refer to the frozen primary measurement apparatus and the corrected post-hoc apparatus respectively.

## 12. Recommended next scientific step

Do **not** promote B2 directly into Stage 1A from this sensitivity result.

The next step should create a new preregistered repair-calibration boundary in which the corrected protocol-only H(G) is frozen **before** any new provider observations are collected.

The minimal scientifically clean repair is:

1. freeze the corrected H(G) source and SHA-256;
2. freeze the same v3 budget grid, M task bank, repeat structure, margins, and co-gate without retuning them;
3. explicitly state that the repair is motivated by an evaluator implementation defect, not by a new scientific hypothesis;
4. collect fresh M observations under the corrected evaluator;
5. decide separately, before provider collection, whether the already valid v3 fresh-Rsem family may be inherited under a split-provenance repair design or whether Rsem will also be recollected;
6. do not use the post-hoc corrected M values as the new primary M estimate;
7. keep Stage 1A blocked until the repair calibration reaches its predeclared selection rule.

A split-provenance repair that inherits the unaffected Rsem family may be defensible and avoids unnecessary provider work, but that inheritance decision must itself be frozen before fresh M collection and must explicitly acknowledge that the existing Rsem outcomes have already been observed.

A fully fresh M+Rsem repair calibration has the cleanest independence story but repeats valid Rsem provider work.

## 13. Evidence and reproducibility boundary

The committed diagnostic source M evidence remains:

`docs/findings/evidence/p6-3-v3-live-diagnostic-stop/`

The post-hoc analysis code is on the design-audit branch and makes no provider calls:

```text
harness/analyze-p6-3-v3-m-evaluator-boundary.ts
harness/p6-3-v3-m-evaluator-sensitivity.ts
harness/analyze-p6-3-v3-corrected-m-cogate-sensitivity.ts
```

Local generated outputs used for this finding are:

```text
runs/p6-3-v3-m-evaluator-boundary-audit.json
runs/p6-3-v3-m-evaluator-sensitivity-proof.json
runs/p6-3-v3-m-evaluator-sensitivity-full.json
runs/p6-3-v3-corrected-m-cogate-sensitivity.json
runs/p6-3-v3-rsem-completion-2026-10-03T12-08-05-640Z/split-provenance-result.json
```

These generated sensitivity outputs are local analysis artifacts at the time of this document. Their repository promotion/checksums should be handled explicitly if they are to become durable repository evidence.

No provider calls are authorized by this finding.
