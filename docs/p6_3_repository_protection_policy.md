# P6-3 repository protection policy

**Status:** Step 5 operational policy for `docs/p6_3_post_audit_execution_plan.md`  
**Scope:** protect the frozen P6-3 v3 pre-live treatment, finalizer, and agreed work order before paid/live calibration.

## 1. Required repository workflow

All implementation and scientific-workflow changes must follow:

```text
branch -> pull request -> required CI -> review -> merge
```

Do not push implementation commits directly to `main`.

If the canonical P6-3 execution order changes, update `docs/p6_3_post_audit_execution_plan.md` in the same pull request that changes the workflow/scientific decision.

## 2. Stable required status check

The repository provides one status check intended specifically for branch protection:

```text
P6-3 Required Merge Gate / required
```

It is defined by:

```text
.github/workflows/p6-3-required-merge-gate.yml
```

Unlike the historical path-filtered workflows, this workflow runs on every pull request, so GitHub can safely require it globally.

The required merge gate is deliberately **fast**. It:

1. checks patch integrity with `git diff --check`;
2. classifies the changed paths;
3. installs the locked harness dependencies and typechecks only when code/workflow paths changed;
4. verifies that the canonical Step-5 policy/plan artifacts remain present.

It does **not** rerun the full hardened final-pre-live integration verifier on every pull request. That verifier recursively runs many lower-level checks and exercises the mocked 864-cell entrypoint/resume path; duplicating it in an always-on branch-protection check makes normal PR feedback unnecessarily slow.

## 3. Fast merge CI versus heavy scientific/pre-live CI

The CI layers have different purposes:

### Fast merge gate

```text
P6-3 Required Merge Gate / required
```

Purpose: stable, always-reported branch-protection status with fast feedback.

### Targeted regression workflows

Existing workflows such as `Harness CI`, Rsem/mutation parity, controller/finalizer checks, and other P6-3 workflows continue to run only when their path filters are relevant.

Purpose: component/regression evidence for the files actually changed.

### Heavy final pre-live integration gate

```text
P6-3 v3 Final Pre-Live Entrypoint
```

Purpose: verify the complete provider-free pre-live chain, including lower verifier composition, dry CLI, exact runtime provenance, and mocked 864-cell entrypoint/resume behavior.

This heavy gate remains mandatory evidence before a paid/live P6-3 v3 calibration, but it is not the globally required status for every unrelated pull request.

A failing targeted or heavy workflow must still be investigated and must not be ignored merely because the fast required merge gate is green.

## 4. GitHub protection settings required for `main`

Before Step 5 is considered complete, repository settings should enforce the following for `main`:

- require a pull request before merging;
- block direct pushes to `main`;
- require status check `P6-3 Required Merge Gate / required`;
- require the branch to be up to date before merging, if supported by the selected protection mechanism;
- block force pushes;
- block branch deletion;
- do not configure an ordinary bypass that would allow routine direct changes to `main`.

Review-count requirements are optional for this single-maintainer research repository and are separate from the scientific pre-live guarantees. The required technical boundary is PR-only mutation plus the stable required merge gate.

## 5. Why path-filtered CI is not the branch-protection anchor

Many existing workflows use path filters, so they are not guaranteed to emit a check for every pull request.

Making one of those checks globally required can leave an unrelated PR permanently waiting for a status that was never created. The always-on merge gate avoids that failure mode without forcing every PR to pay the runtime cost of the complete P6-3 pre-live integration suite.

## 6. Verification of Step 5

Step 5 is complete only after both repository-visible conditions hold:

1. this policy, the always-on merge gate, and the canonical execution-plan checkpoint are merged to `main`; and
2. GitHub reports protection/rules for `main` that prevent direct mutation and require `P6-3 Required Merge Gate / required` before merge.

Until condition 2 is independently observed, Step 6 paid/live calibration remains blocked even if all code-level pre-live gates are green.

Before Step 6 itself, rerun and require success from the complete hardened P6-3 v3 final pre-live integration gate on the exact live checkout. Branch protection and the heavy scientific pre-live gate serve different purposes and neither substitutes for the other.

## 7. Session handoff rule

Every new GPT/session continuation should:

1. read `docs/p6_3_post_audit_execution_plan.md`;
2. read this protection policy if Step 5 or later is current;
3. inspect current `main`, open P6-3 PRs, branch-protection state, and the latest heavy pre-live gate when Step 6 is near;
4. continue from the first incomplete completion condition rather than from the newest code alone.
