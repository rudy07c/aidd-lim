# P6-3 v2 design audit and pre-live requirements

**Status:** design audit / not live-authorized  
**Date:** 2026-09-26  
**Parent evidence:** `docs/findings/p6_3_v1_diagnostic.md`  
**Purpose:** define which parts of P6-3 may change after the v1 protocol-defined hard stop, and freeze the requirements that must be satisfied before a new v2 live calibration can begin.

This document does not authorize paid/live execution.

---

## 1. Scope boundary: structural variables vs execution environment

P6-3 v2 MUST distinguish two classes of parameters.

### 1.1 Structural experimental variables: immutable from v1

The following are scientific design variables and MUST NOT be retuned using the observed v1 outcomes:

```text
T_EL = 4046
B0   = 0
B1   = 505
B2   = 1011
B3   = 2023
B4   = 3034
AF   = 4046
K_cal = 12
```

The six-arm forward/reverse counterbalanced schedule, EL/AF arm identity, common task bank, and the preregistered conjunctive M/Rsem budget-selection logic also remain structural unless a separate design revision explicitly invalidates the study and starts a new calibration family.

In particular, the observed v1 difficulty at a B1 logical cell is NOT grounds to move `B1=505`.

> Budget-grid parameters are structural experimental variables and remain frozen from v1. V2 changes are restricted to execution/reliability mechanics and preregistered secondary measurement.

### 1.2 Execution/reliability mechanics: eligible for v2 revision

The following are measurement-infrastructure parameters and may be revised before v2 live execution, provided the revised values/rules are frozen before any v2 scientific outcome is observed:

- `maxOutputTokens`;
- automatic application of deterministic infrastructure classification rules;
- same-cell replacement orchestration;
- handling of a logical cell after the maximum infrastructure-invalid attempt count is exhausted;
- reliability/censoring provenance fields;
- automatic run continuation for known deterministic cases.

The v2 value of `maxOutputTokens` is intentionally **not selected by this audit document**. It requires a separate pre-live execution-envelope decision and verifier update. No v2 live call may occur while that field is unresolved.

---

## 2. Mutation-protocol parity is not redefined

P6-3 v2 automation changes **who/what applies a deterministic classification rule**, not the scientific meaning of the P6-2 mutation protocol.

The P6-2 forced-choice mutation prompt/parser/scorer semantics and existing failure-domain meaning remain unchanged unless separately versioned and justified.

Therefore:

> Automatic infrastructure adjudication is a procedural automation layer. It MUST NOT silently alter mutation-protocol-parity classification semantics.

A valid v2 implementation must continue to distinguish scientific outcomes (`none`, `semantic`, `protocol`, `system`) from provider/infrastructure invalidity. Unfavorable scientific outcomes are never replaced merely because they are unfavorable.

---

## 3. Deterministic automatic infrastructure classification

### 3.1 AUTO-INFRA-001

The first v2 auto-adjudication rule is frozen as:

```text
AUTO-INFRA-001

IF
  rawFailureDomain == "infrastructure"
  AND executionStatus == "response-incomplete"
  AND incompleteReason == "max_output_tokens"
  AND provider-reported outputTokens == requestedMaxOutputTokensForAttempt
THEN
  finalDisposition = "infrastructure-invalid"
  adjudicationMode = "automatic-rule"
  adjudicationRuleId = "AUTO-INFRA-001"
```

`requestedMaxOutputTokensForAttempt` is the request limit persisted for that specific attempt. The classifier MUST compare against the attempt's own persisted request parameter, not against the current/global v2 limit. This is required both for deterministic provenance and for replaying v1 artifacts if v2 later freezes a different `maxOutputTokens` value.

The attempt artifact must retain the raw provider response/provenance and the requested output-token ceiling required to recompute this decision. The automatic decision must be deterministic from persisted fields.

Human confirmation is not required for a case that exactly matches the frozen rule.

### 3.2 Unknown or ambiguous cases

The runner MUST still stop as `needs-audit` when the persisted evidence does not match a preregistered automatic rule exactly, including at minimum:

- unclassified/`other` failure domain;
- missing or contradictory provider status/provenance;
- missing token usage needed by an automatic rule;
- missing requested output-token ceiling needed to replay `AUTO-INFRA-001`;
- artifact/state inconsistency;
- resume uncertainty that cannot be deterministically resolved;
- any new provider failure shape not covered by a frozen rule.

No catch-all automatic `infrastructure-invalid` rule is allowed.

### 3.3 Additional automatic rules

Timeout/429/5xx or other infrastructure classes may be added later only if their predicates and dispositions are frozen before v2 live execution and regression-tested. This document does not implicitly authorize them.

---

## 4. Mandatory v1 artifact regression gate

Automation MUST NOT be trusted solely because its predicates look equivalent to the former human procedure.

Before v2 live authorization, an offline verifier must run the v2 auto-classifier against the **actual persisted v1 attempt artifacts** that were human-adjudicated during the diagnostic run.

Required property:

```text
for every v1 human-adjudicated infrastructure-invalid attempt:
  autoClassifier(v1Artifact, v1AttemptRequestParams) == humanFinalDisposition
```

The replay must use each v1 attempt's own persisted request ceiling (`7000` for the observed v1 mutation attempts), rather than substituting the future v2 global ceiling.

The verifier must also reconstruct the terminal three-attempt sequence for the exhausted logical cell and reproduce the same v1 terminal fact:

```text
sequence 32 / T-local-2 / repeat 6 / B1
attempts 1..3 -> infrastructure-invalid
=> max-infrastructure-attempts-exhausted
```

The current v1 state reported `replacementAttempts=10` and one terminal exhausted logical cell. The regression fixture set must be derived from the raw v1 run, not hand-authored to resemble it.

Recommended verifier contract:

```text
npm run verify:p6-3-v2-v1-regression
```

The verifier must make zero provider calls.

### 4.1 Fixture provenance

If raw v1 artifacts are copied into a repository fixture pack, the pack must include:

- source run identifier/path;
- source archive SHA-256;
- per-artifact SHA-256;
- original sequence/attempt identifiers;
- persisted request parameters required by the classifier, including the attempt-specific output-token ceiling;
- expected human disposition from the persisted v1 result state.

If the raw artifact contains secrets or provider fields unsuitable for version control, a deterministic sanitization/extraction step may create fixtures, but that transformation itself must be scripted, versioned, and hash-linked back to the preserved source archive.

### 4.2 Live gate

P6-3 v2 live execution is forbidden unless this regression verifier passes 100% for the frozen fixture set.

A single mismatch is a design failure, not a case for manual override.

---

## 5. Exhaustion handling in v2

The v1 rule stopped the entire 864-cell run after one logical cell accumulated three infrastructure-invalid attempts. V2 changes collection continuity while preserving the invalidity of that cell.

The v2 exhaustion rule is frozen as:

```text
attempt < MAX and deterministic infrastructure-invalid
  -> retry same logical cell immediately

attempt == MAX and deterministic infrastructure-invalid
  -> logicalCellStatus = "censored-exhausted"
  -> preserve all attempts/provenance
  -> advance to next planned logical cell
```

The exhausted cell MUST NOT be converted into a scientific failure, zero score, or additional repeat.

The maximum scientific attempts per logical cell remains **3** for v2 unless a separate pre-live revision explicitly versions that parameter. This audit does not use the v1 outcome to increase retry count.

### 5.1 Budget-selection safety gate

Completing collection is not equivalent to having a valid calibration dataset.

After all planned logical cells have been visited:

```text
if exhaustedLogicalCells == 0:
  budget selection may proceed under the preregistered M/Rsem rule
else:
  B_expose selection is withheld
  final status = needs-design-audit
```

Thus v2 may collect the full censoring structure without silently dropping missing cells or selecting a budget from a conditionally observed subset.

No complete-case-only budget selection is permitted when any planned logical cell is `censored-exhausted`.

---

## 6. Newly preregistered secondary reliability endpoints

V1 observations motivated these endpoints; therefore v1 data are exploratory/hypothesis-generating only. Formal evaluation begins with newly collected v2 data.

For every arm and, where applicable, every `task × arm`, v2 must preserve and report at minimum:

1. logical-cell censoring indicator;
2. `max_output_tokens` censoring indicator;
3. number of scientific attempts required to obtain a valid observation;
4. `censored-exhausted` indicator;
5. provider-reported output token usage;
6. provider-reported reasoning-output token usage when available;
7. execution status / incomplete reason;
8. automatic rule ID or human-audit provenance responsible for any infrastructure disposition.

Distribution reporting must not rely on means alone. The analysis should preserve raw points and report suitable counts, ranges and quantiles. Claims of multimodality, monotonicity, non-monotonicity, or a special B1 effect are not preregistered findings and must not be inferred from v1 observations.

These are **secondary reliability endpoints**. Primary P6-3 purpose remains calibration of `B_expose` using M and Rsem under the frozen budget grid.

---

## 7. Unattended-run requirement

The operational target for v2 is:

> known deterministic cases run without human interaction; only genuinely unknown/ambiguous states stop the run.

A valid v2 runner should therefore be able to execute the full planned schedule from one command without repeated `y/N` adjudication for `AUTO-INFRA-001` cases.

Automatic progression must remain crash-safe and resumable:

- persist in-flight state before provider calls;
- persist completed attempt artifact before applying transition;
- derive automatic adjudication from persisted evidence;
- persist the rule ID and disposition before retry/advance;
- never issue an unrecorded fourth scientific attempt;
- preserve frozen arm order and temporal adjacency semantics;
- stop on state/provenance ambiguity rather than guessing.

---

## 8. Required offline verification before v2 live

At minimum, the v2 verification suite must prove:

1. the v1 budget grid and `K_cal=12` are unchanged;
2. forward/reverse arm schedule is unchanged;
3. AF/EL execution path separation is unchanged;
4. P6-2 mutation prompt/parser/scorer parity remains intact;
5. `AUTO-INFRA-001` fires iff every frozen predicate is satisfied using the attempt-specific requested output-token ceiling;
6. near-miss cases do not auto-adjudicate (wrong domain/status/reason/token count, missing usage, missing request ceiling, etc.);
7. every human-adjudicated v1 infrastructure-invalid fixture is reproduced exactly using its original request parameters;
8. the v1 exhausted cell is reconstructed correctly from its actual fixtures;
9. attempts 1-2 auto-retry the same logical cell;
10. attempt 3 auto-marks the cell `censored-exhausted` and advances to the next planned cell without a fourth attempt;
11. exhausted cells never contribute M/Rsem as zero or scientific failures;
12. any `censored-exhausted` cell blocks `B_expose` selection after collection;
13. unknown/unclassified cases still stop as `needs-audit`;
14. secondary reliability endpoints are persisted for all attempts, including censored attempts;
15. verifier execution makes zero provider calls.

---

## 9. Remaining design gates

P6-3 v2 is **not live-ready** until all of the following are completed:

- [ ] immutable v1 raw-run archive created outside the mutable run directory;
- [ ] archive SHA-256 appended to `docs/findings/p6_3_v1_diagnostic.md`;
- [ ] actual v1 adjudicated artifacts materialized into a regression-fixture workflow with source hashes and original request parameters;
- [ ] deterministic auto-classifier implemented;
- [ ] v1 regression verifier passes 100%;
- [ ] v2 exhaustion transition implemented and offline-verified;
- [ ] secondary reliability endpoint schema/reporting implemented and verified;
- [ ] `maxOutputTokens` v2 value selected and frozen by an explicit pre-live execution-envelope decision;
- [ ] all affected manifests/fingerprints regenerated and frozen;
- [ ] final pre-live audit records exact checkout SHA and manifest hashes;
- [ ] only after all gates pass may a new paid/live P6-3 v2 run be explicitly authorized.

Until these gates are satisfied, the v1 run remains the latest live evidence and must be treated as diagnostic/exploratory only.
