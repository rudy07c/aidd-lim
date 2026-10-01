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

Unlike the historical path-filtered workflows, this workflow runs on every pull request. It:

1. checks out the proposed merge state;
2. installs the locked harness dependencies;
3. typechecks the harness;
4. runs the hardened provider-free P6-3 v3 final pre-live verifier.

The hardened verifier already includes the frozen selector/treatment checks, Rsem validity propagation, deterministic result-finalizer verification, runtime dependency parity, exact-checkout checks, and the mocked 864-cell live-entrypoint/resume path. It makes no provider call.

This wrapper exists so GitHub branch protection can require one stable status that is always reported instead of depending on path-filtered checks that may not exist on unrelated pull requests.

## 3. GitHub protection settings required for `main`

Before Step 5 is considered complete, repository settings should enforce the following for `main`:

- require a pull request before merging;
- block direct pushes to `main`;
- require status check `P6-3 Required Merge Gate / required`;
- require the branch to be up to date before merging, if supported by the selected protection mechanism;
- block force pushes;
- block branch deletion;
- do not configure an ordinary bypass that would allow routine direct changes to `main`.

Review-count requirements are optional for this single-maintainer research repository and are separate from the scientific pre-live guarantees. The required technical boundary is PR-only mutation plus the stable required merge gate.

## 4. Why the existing path-filtered CI is not the branch-protection anchor

Existing workflows such as `Harness CI`, `P6-3 Unified Pre-Live Gate`, and the specialized P6-3 verifier workflows remain valuable regression evidence. Many use path filters, however, so they are not guaranteed to emit a check for every pull request.

Making a path-filtered check globally required can leave an unrelated PR permanently waiting for a status that was never created. The always-on merge gate avoids that failure mode while continuing to reuse the already-merged hardened P6-3 final pre-live verifier.

Specialized CI should remain enabled and must still be investigated if it runs and fails. The required merge gate is not permission to ignore a failing specialized workflow.

## 5. Verification of Step 5

Step 5 is complete only after both repository-visible conditions hold:

1. this policy and the canonical execution-plan checkpoint are merged to `main`; and
2. GitHub reports protection/rules for `main` that prevent direct mutation and require `P6-3 Required Merge Gate / required` before merge.

Until condition 2 is independently observed, Step 6 paid/live calibration remains blocked even if all code-level pre-live gates are green.

## 6. Session handoff rule

Every new GPT/session continuation should:

1. read `docs/p6_3_post_audit_execution_plan.md`;
2. read this protection policy if Step 5 or later is current;
3. inspect current `main`, open P6-3 PRs, and branch-protection state;
4. continue from the first incomplete completion condition rather than from the newest code alone.
