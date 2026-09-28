# P6-3 v2 EL static calibration result

## Status

P6-3 v2 paid/live collection completed all **864 / 864 logical cells** without any exhausted logical cell or unresolved audit flag. The collection itself is therefore terminally `completed` and eligible for the preregistered `B_expose` selection step.

Applying the preregistered M / Rsem conjunctive point-estimate guard to the frozen evidence yields a different, selection-stage conclusion:

> **No interior budget qualifies. `B_expose` is not selected. P6-3 enters `needs-design-audit`.**

This distinction is important: the live collection succeeded operationally, but the frozen calibration grid did not contain an interior budget satisfying both scientific endpoints simultaneously.

P6-3 remains **calibration-only**. This result is not Stage 1A confirmatory evidence and the P6-3 responses are not reusable as Stage 1A observations.

## Provenance

Raw evidence was committed before scientific outcome analysis:

- source evidence: `docs/findings/evidence/p6-3-v2-live-calibration/state.json`
- source evidence SHA-256: `e5579674e5fa83c6b68b8f73b9ce67897f7de6cc5f24486f81b57f822ca03069`
- live checkout git SHA: `62110faebc0fa748effa90cb0f44f7c05f479c10`
- live plan hash: `6f213e4244a3c12528ed6d27270c54fd18098ce5f3aacbe1f45b28f2c3c93622`
- raw-evidence preservation commit: `b8a80a7a1b236eb9a734f76c4e5784232a039be8`
- raw-evidence merge commit: `c999ddbe9cdc0b6ce9d7b7298f6ed31049834560`

The deterministic offline analysis was run in GitHub Actions with no provider/API calls:

- analysis implementation commit: `2f8b82afa17a86f705b57f26ed623b57dec9dd2c`
- workflow run: `36425009382`
- workflow artifact id: `10970497640`
- workflow artifact digest: `sha256:ecb8b3fbf9ed671817cce4a4f91add91a66d944fab470b43253266ac01569360`
- extracted analysis JSON SHA-256: `d5db2f572e7fba33abafee873bd18bed3f3c1c631a8740ac0524ea7b59e8e90b`
- durable compact result: `docs/findings/evidence/p6-3-v2-selection-analysis/result.json`

The CI typecheck, frozen-evidence analysis, and analysis-artifact upload all succeeded.

## Collection integrity

The terminal evidence contains:

- valid scientific logical observations: **864**
- committed attempt records: **866**
- committed infrastructure-invalid attempts: **2**
- interrupted provider-visible attempts: **1**
- exhausted logical cells: **0**
- unresolved audit flag: **none**

The interrupted attempt is the already-recorded host-reboot event at sequence 199 / attempt 1. It was separately adjudicated `infrastructure-invalid` and therefore is not a scientific observation. The two committed infrastructure-invalid attempts were one-for-one replacements under the frozen v2 protocol.

These reliability events do not determine the budget-selection result. In particular, the fact that the two automatic infrastructure-invalid events occurred in B3 is descriptive only and is not evidence of an arm-specific reliability effect.

## Frozen selection rule

The P6-3 v2 calibration uses:

- `K_cal = 12`
- primary M bank: 11 tasks
- primary Rsem bank: 12 balanced probes
- `Delta_M = 1/11`
- `Delta_R = 1/12`

For an interior budget `B` to qualify, both endpoints must satisfy:

```text
M0 + Delta_M <= MB <= MAF - Delta_M
R0 + Delta_R <= RB <= RAF - Delta_R
```

M and Rsem are a **conjunctive co-gate**: one endpoint cannot compensate for failure of the other. If multiple interior budgets pass, the smallest budget is selected.

Because the design is perfectly balanced, the inequalities can be evaluated without floating-point boundary ambiguity as integer outcome counts:

- M: 11 tasks × 12 repeats = 132 outcomes per arm; `Delta_M` = **12 pass-count units**
- Rsem: 12 probes × 12 repeats = 144 probe judgments per arm; `Delta_R` = **12 correct-answer units**

The separate anchor-span guard also requires `AF - B0 >= 2 Delta` for both endpoints.

## Anchor check

Both endpoint anchors have sufficient span:

| Endpoint | B0 | AF | Span | Required minimum | Result |
|---|---:|---:|---:|---:|---|
| M | 0 / 132 = 0.0000 | 124 / 132 = 0.9394 | 0.9394 | 2/11 = 0.1818 | pass |
| Rsem | 80 / 144 = 0.5556 | 132 / 144 = 0.9167 | 0.3611 | 2/12 = 0.1667 | pass |

Therefore the failure to select `B_expose` is **not** caused by insufficient B0-to-AF measurement headroom.

## Dose-response observations and gate result

| Arm | Nominal budget | M | Rsem | M guard | Rsem guard | Conjunctive candidate |
|---|---:|---:|---:|---|---|---|
| B0 | 0 | 0 / 132 = 0.0000 | 80 / 144 = 0.5556 | anchor | anchor | — |
| B1 | 505 | 0 / 132 = 0.0000 | 72 / 144 = 0.5000 | fail | fail | no |
| B2 | 1011 | 0 / 132 = 0.0000 | 74 / 144 = 0.5139 | fail | fail | no |
| B3 | 2023 | 125 / 132 = 0.9470 | 113 / 144 = 0.7847 | fail | **pass** | no |
| B4 | 3034 | 123 / 132 = 0.9318 | 142 / 144 = 0.9861 | fail | fail | no |
| AF | 4046 | 124 / 132 = 0.9394 | 132 / 144 = 0.9167 | anchor | anchor | — |

The integer-margin details are:

- **B1**: M is 0 units above B0; Rsem is 8 units below B0. It is not an interior candidate.
- **B2**: M is 0 units above B0; Rsem is 6 units below B0. It is not an interior candidate.
- **B3**: M is 125 units above B0 but **1 unit above the AF anchor**, so it fails the required AF-side M margin. Rsem is 33 units above B0 and 19 units below AF, so Rsem alone passes.
- **B4**: M is only 1 unit below AF, far short of the required 12-unit AF-side margin. Rsem is 10 units above AF, so Rsem also fails the AF-side guard.

Thus:

```text
qualifyingInteriorArms = []
selectionStatus = needs-design-audit
selectedBExpose = null
reasonCode = NO_CONJUNCTIVE_INTERIOR_BUDGET
```

## Interpretation

The observed M curve is descriptively very coarse under this grid: B0, B1, and B2 all yield `M=0`, while B3 and B4 are already close to the fresh AF anchor. Rsem has an interior point at B3, but the preregistered design explicitly forbids using Rsem to compensate for an AF-near M value.

B3 exceeding AF by one M pass and B4 exceeding AF on Rsem should not be read as evidence that finite exposure is intrinsically superior to AF. `K_cal=12` was frozen for calibration/counterbalancing, not for formal equivalence, superiority, or monotonic dose-response inference. These are point estimates used only by the preregistered selection guard.

The result therefore supports only the following design conclusion:

> The current six-level P6-3 v2 grid does not identify a non-degenerate EL budget satisfying the frozen joint M/Rsem criterion.

It does **not** support selecting B3 because it looks useful on Rsem, relaxing the M upper guard after observing the data, choosing an unregistered midpoint from the same run, or treating the P6-3 observations as Stage 1A confirmatory evidence.

## Required next step

The P6-3 predeclaration states that when no internal budget satisfies both endpoints, the current run must stop at `needs-design-audit`. The observed curve must not be used to add a convenient budget to this same calibration run.

If P6-3 is continued, the next step is therefore:

1. diagnose why the static exposure grid produces the observed B2→B3 transition, without changing the completed v2 result;
2. predeclare a **new versioned calibration design** before any new outcome is observed;
3. freeze its candidate grid / selector semantics / stopping and selection rules;
4. execute a **fresh** calibration run only after that new design passes offline review;
5. keep all v2 observations separate from the new calibration and from eventual Stage 1A confirmatory data.

No new paid/live execution is authorized by this finding itself.
