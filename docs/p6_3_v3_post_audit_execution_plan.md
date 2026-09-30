# P6-3 post-audit execution plan

## Status

This document freezes the execution order agreed after the repository-wide audit of the P6-3 v2 864-cell analysis lineage and the P6-3 v3 pre-live implementation.

The purpose is not to introduce new scientific assumptions. It preserves the work-order contract so that a future ChatGPT/GPT session, branch, or operator can recover the intended sequence without reconstructing it from conversation history.

**Current rule:** do not start P6-3 v3 paid/live calibration until Steps 1-5 below are complete and green.

## Why this document exists

The audit found that session/branch divergence can preserve code and even preserve the same scientific conclusion while losing the agreed order of work. P6-3 v2 demonstrated this concretely: the deterministic 864-cell selection analyzer remained on PR #33 while a separate lineage carried the same result into human-readable findings and then into the v3 redesign.

The main lesson is therefore:

> Work-order decisions are part of the research artifact and must be versioned alongside code, evidence, and scientific predeclarations.

This plan is the recovery anchor for the remainder of P6-3.

## Frozen execution order

### Step 1 — Reconcile the P6-3 v2 analysis lineage into `main`

Goal: restore the complete provenance chain from frozen v2 raw evidence to the documented v2 selection result.

Required work:

- Keep PR #33 open until reconciliation is complete.
- Work from a fresh branch based on current `main`.
- Port the historical deterministic analyzer, durable machine-readable result, and CI/provenance guarantees that exist only on PR #33.
- Verify on current `main` that:
  - the frozen `state.json` yields exactly 864 valid scientific observations after infrastructure-invalid replacement handling;
  - M and Rsem aggregates reproduce the historical arm-level values;
  - the frozen conjunctive rule yields `NO_CONJUNCTIVE_INTERIOR_BUDGET`;
  - `selectedBExpose = null` and `selectionStatus = needs-design-audit`;
  - the machine-readable result agrees with `docs/findings/p6_3_v2_result_summary_ja.md` on the primary numerical results and scientific conclusion.
- Keep this code historical-v2-only; do not make v3 production logic depend on the v2 analyzer.

Completion gate:

- Reconciliation PR merged to `main` with all relevant CI green.
- Only after that, close PR #33 as superseded by the reconciliation PR.

Do not proceed if:

- current raw evidence cannot reproduce the historical result;
- any primary aggregate or selection conclusion disagrees between machine output and the current main findings document;
- provenance cannot be tied to the frozen evidence hash and historical live checkout.

### Step 2 — Repair P6-3 v3 Rsem validity propagation

Goal: prevent Rsem observations classified as scientifically invalid from being silently advanced as valid scientific observations.

Known defect to repair:

- historical Rsem failure semantics can produce `validity = infrastructure-invalid` with `failureDomain = system` for `probe-scoring-error`;
- `P63CellOutcome` currently preserves `failureDomain` but loses `validity`;
- the v3 controller replaces only `failureDomain = infrastructure`, so the validity information can be lost before adjudication/replacement.

Required work:

- Preserve validity and failure-domain semantics as separate concepts from executor through controller and persisted attempt/state artifacts.
- Ensure any `infrastructure-invalid` Rsem outcome cannot become the final scientific observation for a logical cell merely because its raw failure domain is `system`.
- Add offline regression coverage for `probe-scoring-error` and for a missing/null Rsem scientific score.
- Do not alter historical v2 semantics or results.

Completion gate:

- Dedicated v3 Rsem validity tests green.
- Existing M, Rsem parity, v2 historical, and v3 controller regression tests remain green.

Do not proceed if:

- validity is still reconstructed indirectly from failure domain;
- a null/missing Rsem score can be accepted as a completed scientific observation.

### Step 3 — Implement and freeze the P6-3 v3 result finalizer

Goal: close the analysis path before any v3 live outcome is observed.

The v3 finalizer must be independent from the historical v2 implementation but may inherit its design principles.

Required work:

- Refuse selection unless the v3 calibration state is terminally complete and audit-clean.
- Require exactly one final scientific observation for every logical sequence 0-863 after valid replacement handling.
- Require the frozen measurement structure exactly:
  - M: 11 primary tasks × 12 repeats = 132 outcomes per arm;
  - Rsem: 12 primary probes × 12 repeats = 144 judgments per arm.
- Fail closed on:
  - missing/null Rsem score;
  - task or probe membership drift;
  - denominator drift;
  - duplicate or missing final scientific observation;
  - unresolved audit/in-flight state;
  - treatment identity/provenance mismatch.
- Aggregate the six frozen arms deterministically.
- Only after successful aggregation, call the already-frozen v3 selection function/co-gate.
- Persist an immutable machine-readable finalization artifact containing enough provenance to reconstruct the decision, including source state identity/hash, numerator/denominator values, qualifying arms, and the final selection status.
- Do not read or pool P6-3 v2 outcomes when producing the v3 primary estimate.

Completion gate:

- Finalizer implementation and offline verifier merged before any v3 paid/live provider call.
- Synthetic tests demonstrate both `selected` and `needs-design-audit` paths without using observed v3 results.

Do not proceed if:

- any aggregation or missing-data policy remains to be decided after live collection;
- selection can be computed directly from a completed state without passing finalizer integrity checks.

### Step 4 — Re-harden the P6-3 v3 final pre-live gate

Goal: ensure the exact runtime that will execute the paid calibration is the runtime that passed all scientific and environmental checks.

Required work:

- Add v3 result-finalizer presence/offline verification to the final pre-live gate.
- Reverify the frozen treatment contract:
  - exact checkout identity;
  - frozen final selector;
  - one run-start `E_fixed` binding reused unchanged;
  - artifact-only `B_expose` accounting;
  - repeat count and 864-cell schedule;
  - `Delta_M`, `Delta_R`, conjunctive co-gate, and tie-break;
  - no v2 outcome pooling.
- Detect untracked/local-only files that can be consumed by the synthetic-world runtime rather than relying only on tracked-worktree cleanliness.
- Include installed runtime dependency parity in the live-environment gate, including OpenAI SDK lockfile parity.
- Record Node/OpenAI SDK/runtime provenance in the receipt where practical.

Completion gate:

- Final pre-live gate and all lower-level gates green on the exact candidate live checkout.

Do not proceed if:

- the gate only proves CI dependency parity but not the local live environment;
- runtime-consumed repository input can differ from the checked Git tree.

### Step 5 — Protect `main` and preserve the work-order contract

Goal: reduce branch/session divergence and accidental mutation of preregistered research artifacts.

Required work:

- Continue the repository rule: branch → PR → CI → merge; no direct `main` writes.
- Enable GitHub branch protection/ruleset for `main` if repository permissions support it.
- Require the relevant CI checks before merge.
- Keep this execution-plan document updated only through reviewed PRs when the agreed sequence itself legitimately changes.
- If a future session proposes work out of sequence, it must first explain and version any change to this plan rather than silently bypass it.

Completion gate:

- Direct-main mutation is blocked technically where possible, and operationally prohibited regardless.
- Steps 1-4 are merged and green.

### Step 6 — Execute fresh P6-3 v3 live calibration

Goal: collect a new v3 calibration under the repaired/frozen treatment and analysis pipeline.

Entry conditions:

- Steps 1-5 complete.
- Explicit paid/live authorization is provided.
- Final pre-live receipt is valid for the exact checkout and runtime environment.

Execution rules:

- Run v3 as a fresh calibration; do not reuse v2 observations as v3 primary observations.
- Collect the frozen 864 logical cells under the v3 treatment.
- Preserve replacement/adjudication provenance for any infrastructure-invalid attempt.
- After collection, run the already-merged v3 result finalizer without changing its rules.
- Accept either scientific outcome:
  - an interior `B_expose` satisfies the frozen M/Rsem co-gate; or
  - no interior budget qualifies and the result returns to `needs-design-audit`.

Interpretation boundary:

- The prediction that `E_fixed + final selector` may remove the v2 synchronized B2→B3 jump is falsifiable, not assumed.
- A smoother or more distributed M response has not yet been observed under v3.
- Failure to obtain a qualifying interior budget is a valid scientific result, not an implementation failure by itself.

## Sequence invariant

The frozen order is:

```text
v2 provenance reconciliation
        ↓
Rsem validity fix
        ↓
v3 result finalizer
        ↓
pre-live gate hardening
        ↓
main protection / final repository controls
        ↓
fresh v3 paid/live calibration
```

No paid/live v3 outcome should be observed before the first five stages are closed.

## Session handoff rule

Any new AI session or human operator continuing P6-3 should begin by checking this document against current `main` and identifying the first incomplete step. It should not infer the next action solely from the newest code, newest PR number, or newest conversation summary.

If implementation and this document disagree, stop and reconcile the disagreement through a PR before proceeding.
