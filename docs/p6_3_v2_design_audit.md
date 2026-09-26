# P6-3 v2 design audit / predeclaration boundary

**Status:** design-audit predeclaration; no P6-3 v2 live execution authorized by this document  
**Predecessor:** `docs/findings/p6_3_v1_diagnostic.md`  
**Purpose:** define what may and may not change after the P6-3 v1 protocol-defined hard stop, before implementation or new live data collection.

## 1. Core principle

P6-3 v1 stopped correctly under its frozen execution protocol. v2 is not a post-hoc attempt to rescue or reinterpret the partial v1 scientific outcomes.

The v2 design audit is restricted to execution/reliability mechanics and newly preregistered secondary measurement. Structural experimental variables that were fixed outcome-blind before v1 remain frozen.

## 2. Budget grid remains immutable

The following grid is not reopened by v1 observations:

```text
T_EL = 4046
B0 = 0
B1 = 505  = floor(T_EL/8)
B2 = 1011 = floor(T_EL/4)
B3 = 2023 = floor(T_EL/2)
B4 = 3034 = floor(3*T_EL/4)
AF = 4046
```

In particular, the fact that the v1 hard stop occurred in a `B1` logical cell is not a permitted reason to move, merge, remove, or retune `B1` or any other budget point.

The budget grid is an experimental design variable. `max_output_tokens`, deterministic infrastructure adjudication, retry/exhaustion mechanics, logging, and execution reliability are execution-environment mechanics and may be audited separately.

## 3. P6-2 mutation-protocol parity boundary

P6-3 v2 must preserve the P6-2 mutation protocol parity semantics that are still part of the scientific measurement contract, including the forced-choice parser/scorer behavior, structured-output parsing semantics, path validation, and failure-domain meaning.

Automating a previously manual deterministic adjudication changes **the procedure that applies the classification rule**, not **the classification semantics themselves**. The v2 automation must therefore not redefine what counts as `infrastructure-invalid` merely to make unattended execution easier.

Any execution parameter that is part of the currently frozen P6-2/P6-3 parity manifest, including `max_output_tokens`, may only change through an explicit v2 amendment with a new manifest/version and a documented explanation of why the change is execution-reliability calibration rather than a budget-grid change. The v1 parity freeze must remain historically intact.

## 4. Deterministic automatic infrastructure adjudication

The v2 runner should operate unattended for cases whose disposition is fully determined by a preregistered rule. Human review is reserved for cases that cannot be classified by those rules.

The first proposed rule family is conceptually:

```text
AUTO-INFRA-001

executionStatus == response-incomplete
AND incompleteReason == frozen max_output_tokens reason
AND provider-reported output usage == frozen maxOutputTokens

=> disposition = infrastructure-invalid
```

The final rule must be encoded in a versioned, machine-readable contract. The runner must persist at least:

- rule ID / version;
- raw provider status and incomplete reason;
- configured output-token cap;
- provider-reported usage;
- resulting disposition;
- attempt identity and logical-cell identity.

Known deterministic provider/infrastructure cases such as predeclared timeout / 5xx / rate-limit exhaustion may be added only if their exact classification rule is frozen and regression-tested before live use.

Unknown, contradictory, malformed, or provenance-incomplete cases must remain `needs-audit` and stop unattended progression.

## 5. Mandatory v1 regression gate

Because v2 removes repeated human confirmation, the automatic classifier itself becomes part of the measurement infrastructure and requires an offline regression gate.

Before any v2 live call, the verifier must replay the **actual preserved v1 attempt artifacts**, not newly fabricated lookalike examples, and compare automatic output with the recorded human adjudications.

Required properties:

1. Every preserved v1 attempt that was human-adjudicated `infrastructure-invalid` must receive the same deterministic disposition from the v2 classifier.
2. No preserved v1 scientific `none`, `semantic`, `protocol`, or `system` outcome may be incorrectly converted into `infrastructure-invalid` by the new classifier.
3. The sequence-32 `T-local-2 / repeat 6 / B1` history must reproduce the v1 three-attempt exhaustion transition when evaluated under the v1 exhaustion policy.
4. Raw status/reason/usage evidence used by the classifier must match the archived artifact; the verifier must not rely only on the already-adjudicated result field.
5. The verifier must fail closed on missing artifact fields, mismatched hashes, or unrecognized cases.

The v1 run reports `10` replacement attempts at the hard stop and one exhausted logical-cell event. The permanent regression fixture should be derived from the preserved run and bound to immutable SHA-256 hashes so the gate cannot silently drift.

**Live gate:** any regression mismatch blocks P6-3 v2 live execution.

## 6. Unattended retry and exhaustion mechanics

For a deterministic infrastructure-invalid attempt, v2 may automatically retry the same logical cell under the frozen same-cell replacement rule until the preregistered maximum scientific attempt count is reached.

Unlike v1, reaching the maximum need not terminate collection of every remaining logical cell. The proposed v2 collection behavior is:

```text
valid scientific observation
  -> record and advance

deterministic infrastructure-invalid, attempts remaining
  -> record automatic adjudication and retry same logical cell

deterministic infrastructure-invalid, max attempts reached
  -> mark logical cell `censored-exhausted`
  -> preserve all attempts
  -> advance to next planned logical cell

unknown / non-deterministically classifiable infrastructure state
  -> needs-audit
  -> stop unattended progression
```

This change is a collection/reliability change, not permission to ignore missing scientific observations.

## 7. B_expose selection gate under exhausted cells

The collection runner and the scientific selection gate are separate.

v2 may continue collecting after a `censored-exhausted` cell so that the full censoring structure is observable. However, under the conservative preregistered gate:

```text
exhausted logical cells == 0
  -> B_expose selection may proceed using the preregistered M/Rsem rule

exhausted logical cells > 0
  -> do not select or freeze B_expose
  -> retain the completed dataset
  -> status = needs-design-audit
```

This prevents the runner from discarding difficult cells merely to obtain a complete-case dose-response estimate.

If a different missing-data rule is ever desired, it must be separately justified and frozen before new live data; it must not be invented after seeing v2 outcomes.

## 8. Censoring / token-usage secondary endpoints

The v1 partial run may motivate these endpoints but does not confirm them. v2 must preregister them before collecting new data.

Secondary protocol/reliability outcomes should include at least:

- per-attempt `max_output_tokens` censoring indicator;
- per-logical-cell any-censoring indicator;
- attempts-to-valid-scientific-observation;
- `censored-exhausted` indicator;
- provider-reported total output tokens;
- provider-reported reasoning-output tokens where available;
- raw execution status / incomplete reason;
- arm, task, repeat, and measurement identity for each attempt.

Predeclared summaries should include:

- arm-level censoring counts and rates;
- task x arm censoring counts and rates for M;
- attempt-count distribution by arm;
- raw token-usage distributions by arm, with points / ranges / quantiles rather than means alone;
- exhausted-cell locations without post-hoc removal.

Claims of monotonicity, non-monotonicity, bimodality, or a special `B1` effect are not preregistered findings and must not be inferred from v1 exploratory observations. Any later confirmatory test for such a pattern requires an explicit hypothesis and analysis rule fixed before the data used for that test are collected.

## 9. Execution-parameter audit still required

This document does not yet choose a new `max_output_tokens`, reasoning setting, maximum-attempt count, or other provider envelope value.

Before v2 implementation is frozen, the design audit must separately decide whether to:

- preserve or amend the `7000` output-token cap;
- preserve or amend the three-scientific-attempt ceiling;
- preserve the current reasoning effort and timeout;
- add deterministic rules for other provider/infrastructure statuses.

Any amendment must be justified as an execution/reliability decision, versioned, reflected in the v2 manifests, and validated offline before paid live execution.

## 10. v2 pre-live gates

P6-3 v2 live execution is blocked until all of the following hold:

1. v1 run evidence is archived and SHA-256 bound.
2. v1 diagnostic finding records checkout SHA and all four v1 manifest hashes.
3. budget grid equality with v1 is machine-verified.
4. P6-2 mutation parser/scorer/path/failure semantics retained by v2 are parity-verified.
5. deterministic auto-adjudication rules are versioned and machine-readable.
6. the auto-classifier passes the actual-v1-artifact regression gate exactly.
7. `censored-exhausted` collection semantics and the no-`B_expose`-selection-on-any-exhaustion gate are offline-tested.
8. secondary censoring/token-usage endpoints and summaries are frozen before new live data.
9. unknown/unrecognized failure states demonstrably fail closed to `needs-audit`.
10. a final pre-live audit records the exact v2 checkout SHA and all v2 manifest hashes.

Only after these gates pass should a new P6-3 v2 live calibration begin from the first planned logical cell. v1 scientific observations are not pooled into v2 primary M/Rsem calibration estimates.
