# P6-3 post-audit execution plan

**Status:** canonical next-work order after the 2026-09-30 repository/history audit  
**Scope:** P6-3 v2 provenance repair through P6-3 v3 paid/live calibration  
**Rule:** do not skip or reorder the numbered stages below unless a new repository document explicitly supersedes this plan and records why.

## Why this document exists

The audit found that a previous GPT/session branch split preserved the scientific conclusion but broke the repository-level work sequence: the P6-3 v2 deterministic selection analyzer and machine-readable result remained on unmerged PR #33, while a separate lineage carried the same result into human-readable findings and then into the P6-3 v3 redesign.

The main lesson is therefore not merely to preserve code or conclusions. The repository must also preserve the **agreed execution order** that connects one scientific step to the next. This document is the canonical handoff for that order so a future session can resume without reconstructing the plan from chat history.

## Current checkpoint — 2026-10-01

Repository-visible progress against this plan is:

```text
1. v2 provenance reconciliation       COMPLETE — PR #48
2. Rsem validity propagation fix      COMPLETE — PR #49
3. v3 result finalizer                COMPLETE — PR #50
4. final pre-live gate hardening      COMPLETE — PR #51
5. main / workflow protection         IN PROGRESS
6. fresh v3 paid/live calibration     BLOCKED BY STEP 5
```

The merged Step-4 main checkpoint is `74b2fee9527e15bc52982fdf108cf462fa919451`. No P6-3 v3 paid/provider calibration has been performed at this checkpoint.

Step 5 is the first incomplete completion condition. Repository-side protection artifacts are defined in `docs/p6_3_repository_protection_policy.md`; Step 5 remains incomplete until GitHub itself enforces the required `main` protection/rules and that state is independently observed.

## 1. Reconcile the P6-3 v2 analysis lineage into `main`

- Do **not** close PR #33 until the reconciliation is merged.
- Start from current `main`, not from the old PR #33 base.
- Restore the historical deterministic analyzer, machine-readable result, and CI/provenance guarantees as historical-v2-only artifacts.
- CI must prove that:
  - frozen `state.json` produces exactly 864 final scientific observations after infrastructure-invalid replacements are excluded;
  - the analyzer reconstructs the frozen M/Rsem aggregates;
  - the result is `NO_CONJUNCTIVE_INTERIOR_BUDGET` / `needs-design-audit`;
  - the machine result agrees with the current `docs/findings/p6_3_v2_result_summary_ja.md` arm-level counts and final decision.
- After this reconciliation is merged, close PR #33 as superseded by the current-main reconciliation PR rather than merging the stale branch directly.

**Completion condition:** raw v2 evidence → deterministic analyzer → durable machine result → current human-readable summary is a reproducible chain on `main`.

**Checkpoint:** complete via PR #48; PR #33 was then closed as superseded rather than merged.

## 2. Fix P6-3 v3 Rsem validity propagation

The audit confirmed a specific information-loss bug:

- frozen Rsem semantics can produce `validity = infrastructure-invalid` with `failureDomain = system` for `probe-scoring-error`;
- the pre-repair `P63CellOutcome` carried `failureDomain` but not `validity`;
- the v3 Rsem executor therefore dropped the validity information;
- the live controller only treated `failureDomain === infrastructure` as replacement-eligible, so the invalid observation could otherwise advance as if it were a scientific observation.

Required changes:

- preserve scientific validity separately from failure domain through executor, controller, persisted state, and attempt artifacts;
- keep M's historical classifier semantics unchanged;
- ensure an Rsem observation marked `infrastructure-invalid` cannot become a final scientific observation merely because its raw failure domain is `system`;
- add an offline regression test covering `probe-scoring-error` and any equivalent missing-score invalid path.

**Completion condition:** validity and failure domain remain distinct, no invalid Rsem observation can silently enter the scientific dataset, and the behavior is frozen by offline tests.

**Checkpoint:** complete via PR #49.

## 3. Implement the P6-3 v3 result finalizer before live data exist

Use the design principles of the historical v2 analyzer, but implement a new v3-specific finalizer. Do not import v2 results into the v3 primary estimate.

The finalizer must fail closed unless all of the following hold:

- the calibration state is terminally complete;
- all 864 logical cell sequences are resolved;
- infrastructure-invalid/replacement attempts are excluded from scientific observations according to the frozen semantics;
- every sequence 0–863 has exactly one final scientific observation;
- M contains exactly `11 tasks × 12 repeats = 132` outcomes per arm with exact task membership;
- Rsem contains exactly `12 probes × 12 repeats = 144` judgments per arm with exact probe-bank membership;
- missing/null Rsem score, task/probe membership drift, denominator drift, unresolved audit state, or ambiguous replacement history causes refusal rather than implicit imputation.

Only after these checks may the finalizer call the already-frozen v3 co-gate and produce either:

```text
selectedBExpose = <interior budget>
```

or:

```text
selectionStatus = needs-design-audit
selectedBExpose = null
```

Persist an immutable machine-readable result including source state identity/hash, scientific numerators/denominators, qualifying arms, selection decision, and relevant treatment/provenance identities.

**Completion condition:** collection → scientific-observation resolution → M/Rsem aggregation → frozen budget selection is fully deterministic and merged before any v3 outcome is observed.

**Checkpoint:** complete via PR #50.

## 4. Re-harden the P6-3 v3 pre-live gate

After stages 2 and 3, update the final pre-live gate so it proves the entire collection-and-finalization path is frozen.

At minimum verify:

- v3 result finalizer and its offline verifier are present and passing;
- exact checkout/HEAD identity and clean state before and after the gate;
- frozen final selector identity;
- single Generation-0 `E_fixed` identity reused across the run;
- `E_fixed` remains outside `B_expose` / artifact evidence accounting;
- frozen budget grid, repeat count, `Delta_M`, `Delta_R`, conjunctive co-gate, and minimum-budget tie-break remain unchanged;
- runtime-consumed repository inputs do not contain untracked/local-only files that could alter treatment input;
- installed runtime dependency parity is checked, including the OpenAI SDK version already represented by `verify-package-version.ts`;
- where practical, Node/OpenAI SDK versions are recorded in the pre-live receipt/provenance.

**Completion condition:** a clean checkout that passes the final gate is sufficient to identify both the treatment and the deterministic result-processing path that will be used after collection.

**Checkpoint:** complete via PR #51. Its PR-triggered Final Pre-Live Entrypoint, Harness CI, Unified Pre-Live Gate, Rsem Protocol Parity, and Mutation Protocol Parity workflows all completed successfully.

## 5. Protect `main` and preserve the execution order operationally

Continue the repository workflow as:

```text
branch → PR → CI → review → merge
```

Do not write implementation commits directly to `main`.

The repository-side Step-5 policy is `docs/p6_3_repository_protection_policy.md`. It defines the stable always-on branch-protection check with exact GitHub check-run name:

```text
P6-3 Required Merge Gate
```

implemented by:

```text
.github/workflows/p6-3-required-merge-gate.yml
```

Unlike historical path-filtered workflows, this check must be emitted on every pull request so it is safe to configure as a globally required status.

Where repository settings permit, enable branch protection / rules so direct pushes to `main` are blocked and the required merge gate must pass before merge. Block force pushes and branch deletion. Do not use an ordinary bypass path for routine implementation changes.

For future GPT/session handoffs:

1. read this document first;
2. inspect current `main` and open P6-3 PRs;
3. identify the first numbered stage whose completion condition is not satisfied;
4. continue from that stage rather than inferring the plan from the latest code alone;
5. if the plan itself must change, update this document in the same PR that changes the scientific/workflow decision.

**Completion condition:** repository policy and project documentation both preserve the agreed work order, **and GitHub itself enforces PR-only mutation of `main` with `P6-3 Required Merge Gate` required before merge**.

**Current status:** in progress. Repository-side policy/check preparation is being completed first; GitHub protection is not to be treated as complete until the protected/rules state is independently observed.

## 6. Only then run the fresh P6-3 v3 paid/live calibration

Paid/live execution remains prohibited until stages 1–5 are complete and all required CI is green.

The v3 calibration is a **fresh** calibration:

- collect the predeclared 864 logical cells under the v3 treatment;
- keep all P6-3 v2 observations separate from the v3 primary estimate;
- do not pool v2 and v3 responses;
- run the frozen v3 finalizer after collection rather than implementing analysis logic after seeing outcomes.

The scientific question remains falsifiable. The v3 design predicts that separating fixed external contract exposure (`E_fixed`) from artifact evidence and using the frozen final selector may avoid the v2-style synchronized B2→B3 M jump and may expose usable interior budgets. This is **not** an assumed outcome.

A valid outcome may still be:

```text
selectionStatus = needs-design-audit
```

If so, treat that as the result of the frozen design rather than modifying the grid, margins, selector, or failure handling post hoc within the same calibration.

**Completion condition:** v3 live evidence is collected under the frozen treatment and transformed into the scientific selection result only by the pre-live-merged finalizer.

## Canonical order

```text
1. v2 provenance reconciliation       [complete]
        ↓
2. Rsem validity propagation fix      [complete]
        ↓
3. v3 result finalizer                [complete]
        ↓
4. final pre-live gate hardening      [complete]
        ↓
5. main / workflow protection         [current]
        ↓
6. fresh v3 paid/live calibration     [blocked]
```

No later implementation convenience, session split, or already-written code should be treated as authority to bypass this order. The repository-visible completion conditions above determine the next step.
