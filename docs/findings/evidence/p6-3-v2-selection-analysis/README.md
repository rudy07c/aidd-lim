# P6-3 v2 selection-analysis reconciliation

This directory restores the deterministic P6-3 v2 budget-selection provenance to the current `main` lineage after the original analysis work remained on unmerged PR #33 while later result interpretation and P6-3 v3 redesign proceeded on a separate branch lineage.

## Historical origin

The preserved analyzer is byte-identical to the final analyzer from PR #33:

- PR: `#33` (`p6-3-v2-selection-analysis`)
- analyzer Git blob: `ea1cff950cb9162e6582f0cfbebee3c16b30567b`
- historical analysis implementation commit: `2f8b82afa17a86f705b57f26ed623b57dec9dd2c`

The durable compact result is also preserved byte-identically:

- result Git blob: `858b08941362fab19e3cde44916dc092fe464417`
- original workflow run: `36425009382`
- original workflow artifact id: `10970497640`
- original workflow artifact digest: `sha256:ecb8b3fbf9ed671817cce4a4f91add91a66d944fab470b43253266ac01569360`
- original analysis JSON SHA-256: `d5db2f572e7fba33abafee873bd18bed3f3c1c631a8740ac0524ea7b59e8e90b`

## Frozen source evidence

The analysis consumes only the already-preserved v2 live evidence:

- `docs/findings/evidence/p6-3-v2-live-calibration/state.json`
- SHA-256: `e5579674e5fa83c6b68b8f73b9ce67897f7de6cc5f24486f81b57f822ca03069`
- live checkout: `62110faebc0fa748effa90cb0f44f7c05f479c10`
- live plan hash: `6f213e4244a3c12528ed6d27270c54fd18098ce5f3aacbe1f45b28f2c3c93622`

No provider/API call is performed by the reconciliation verifier.

## What the reconciliation verifies

`harness/verify-p6-3-v2-selection-reconciliation.ts` checks that:

1. the restored analyzer is byte-identical to the historical PR #33 analyzer;
2. the restored compact result is byte-identical to the historical PR #33 result;
3. the frozen raw evidence SHA-256 is unchanged;
4. re-running the analyzer against the frozen evidence reproduces the durable scientific quantities: collection integrity, M/Rsem denominators and counts, margins, anchor checks, arm-level gates, qualifying arms, and selection status;
5. the current `docs/findings/p6_3_v2_result_summary_ja.md` reports the same arm-level counts and final `needs-design-audit` decision.

This is provenance repair, not a new analysis. It does not change the P6-3 v2 scientific conclusion and does not make v2 observations eligible for Stage 1A or for pooling into P6-3 v3.

## Scientific result preserved

The reconciled historical result remains:

```text
qualifyingInteriorArms = []
selectedBExpose = null
selectionStatus = needs-design-audit
reason = NO_CONJUNCTIVE_INTERIOR_BUDGET
```

After this reconciliation is merged, PR #33 can be closed as superseded by the current-main archival integration rather than merged directly onto the much newer repository state.
