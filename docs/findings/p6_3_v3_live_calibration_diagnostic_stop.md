# P6-3 v3 live calibration diagnostic stop

## Status

P6-3 v3 live calibration was stopped by the predeclared fail-close execution protocol after one Rsem logical cell exhausted all three allowed scientific attempts as `infrastructure-invalid`.

This run is **not a completed P6-3 v3 calibration**. It must not be used to select or freeze `B_expose`, must not be passed off as a completed M/Rsem co-gate result, and must not be reinterpreted as Stage 1A confirmatory evidence.

The completed observations and failed attempts are nevertheless important diagnostic evidence for the execution/reliability layer.

## 1. Why v3 was run

P6-3 v2 completed its 864 logical cells, but the post-run audit found that the finite artifact exposure budget mixed two conceptually different channels:

1. artifact evidence whose visibility should vary with `B_expose`;
2. a fixed external WorldProtocol contract that should be common environment/interface evidence.

In v2, visibility of the fixed contract changed together with artifact exposure. This made the observed dose-response difficult to interpret cleanly as an effect of artifact evidence alone.

P6-3 v3 therefore separated the channels:

```text
Context_EL(B) = E_fixed ∪ Exposure_artifact(B, S_select)
```

where `E_fixed` is built once from Generation 0 and held constant across all arms, repeats, and measurements, while only artifact evidence varies with the exposure budget.

The capacity grid, task/probe banks, repeat structure, and conjunctive M/Rsem co-gate were intentionally retained rather than retuned after observing v2.

## 2. Pre-live reliability corrections

Before any v3 provider outcome existed, the final dry preflight exposed two execution-environment issues.

### M output envelope

The first v3 M executor had accidentally fallen back to the historical 7,000-token mutation cap. P6-3 v2 had already superseded that envelope after live censoring and had frozen `maxOutputTokens = 14000`.

v3 was corrected before live execution to inherit the complete frozen v2 M reliability envelope.

### Node runtime

The installed OpenAI SDK required Node `>=22.0.0`. The v3 final pre-live gate was hardened to fail closed if the runtime does not satisfy the SDK engine requirement.

The exact-main local dry preflight then passed on:

- checkout git SHA: `c6b078dae6a9f8536b9dd283e06ccb4384850d47`
- Node: `v22.21.1`
- planned logical cells: `864`
- exact clean checkout verified: `true`
- provider calls during dry preflight: `false`

Only after this gate passed was paid/live execution authorized.

## 3. Planned calibration

The v3 calibration plan remained:

```text
M     = 11 tasks × 12 repeats × 6 arms = 792
Rsem  =            12 repeats × 6 arms = 72
Total = 864
```

The exposure arms were:

| arm | artifact exposure |
|---|---:|
| B0 | 0 |
| B1 | 505 |
| B2 | 1011 |
| B3 | 2023 |
| B4 | 3034 |
| AF | full / 4046 |

The run remained calibration-only and was not eligible to become Stage 1A confirmatory evidence.

## 4. Live run identity and stop state

- run directory: `runs/p6-3-v3-live-2026-10-02T01-05-47-094Z`
- checkout git SHA: `c6b078dae6a9f8536b9dd283e06ccb4384850d47`
- planned logical cells: `864`
- completed logical cells at stop: `793`
- scientific attempts recorded: `796`
- replacement attempts: `2`
- interrupted attempts: `0`
- runner estimated cost at stop: `USD 4.18506503`
- terminal controller status: `needs-audit`
- terminal audit flag: `max-infrastructure-attempts-exhausted`
- exhausted sequence: `793`
- exhausted attempt: `3`

The plan orders all 792 M cells before Rsem. Therefore:

- M collection reached `792 / 792` logical cells;
- Rsem sequence `792` completed;
- Rsem sequence `793` failed to produce a valid scientific observation after three attempts.

No arm-level M interpretation is asserted in this report. Mechanical completion of the M cells is distinct from scientific interpretation of their outcomes.

## 5. Exhausted Rsem logical cell

The exhausted cell was:

- sequence: `793`
- measurement: `Rsem`
- repeat: `1`
- arm: `B1`
- artifact budget: `505`

All three attempts had the same provider-side completion pattern:

```text
executionStatus   = response-incomplete
validity          = infrastructure-invalid
failureDomain     = infrastructure
failureReason     = max_output_tokens
rawResponse       = ""
maxOutputTokens   = 8000
output tokens     = 8000
reasoning tokens  = 8000
```

The three attempts were explicitly human-adjudicated `infrastructure-invalid`.

After the third adjudication, the controller transitioned to:

```text
status    = needs-audit
auditFlag = max-infrastructure-attempts-exhausted
sequence  = 793
attempt   = 3
```

No fourth attempt was made.

## 6. Interpretation

### What this run does establish

The run establishes that the frozen P6-3 v3 Rsem execution envelope can censor a scientific observation before the 864-cell calibration completes.

For the exhausted logical cell, GPT-5.6 Luna at `reasoningEffort = high` reached the exact frozen Rsem output ceiling of 8,000 tokens on all three allowed attempts and returned no usable scientific response.

Because the response body required for the 12 boolean probes was absent, the observation cannot be scored as an Rsem success or failure.

The run also provides a live validation of the fail-close control path:

- provider-visible attempts were journaled;
- invalid observations did not enter the scientific dataset;
- replacements required explicit human adjudication;
- no blind retry occurred;
- the third invalid attempt did not lead to a fourth attempt;
- previously completed observations were preserved.

### What this run does not establish

This run does **not** establish that:

- `B1 = 505` has low semantic reconstructability;
- B1 caused the censoring;
- no interior `B_expose` exists;
- v3 reproduces the v2 co-gate result;
- the completed M outcomes imply any particular arm ordering.

The censoring event occurred on B1, but this incomplete run was not designed to infer arm-specific censoring risk from a single exhausted logical cell.

## 7. Why the final v3 result cannot be produced

The frozen v3 finalizer requires:

- terminal completion of the calibration state;
- all 864 logical sequences resolved;
- exactly one final valid scientific observation for every sequence;
- exact M and Rsem denominators and bank membership;
- no unresolved audit state.

The present run stops at sequence 793 with no valid scientific observation for that logical cell. Therefore it is not a valid input for a completed P6-3 v3 M/Rsem co-gate result.

The missing observation must not be imputed, converted to a scientific failure, or silently skipped.

## 8. Reliability diagnosis

The immediate reliability concern is the frozen Rsem provider envelope:

```text
maxOutputTokens = 8000
reasoningEffort = high
```

The three independent attempts all reached the exact 8,000-token ceiling, making random transport/API failure a poor description of the observed pattern. The direct observed failure mode is deterministic output censoring at the configured ceiling.

This is analogous in execution shape to the earlier P6-3 v1 M reliability stop, where exact-cap censoring exhausted the three-attempt allowance. The measurement and executor are different, so the two incidents are not scientifically pooled, but the same protocol discipline applies: do not change the envelope inside the stopped run.

## 9. Changes that must not be made to this run

The current run must remain frozen as diagnostic evidence.

In particular, do not:

- raise Rsem `maxOutputTokens` and resume the same run;
- perform attempt 4;
- skip sequence 793;
- reinterpret an infrastructure-invalid attempt as a scientific Rsem failure;
- change the budget grid, margins, task/probe banks, or selector based on this stop;
- combine the incomplete v3 observations with v2 as one primary estimate.

Any reliability amendment must define a new treatment/provenance boundary before further scientific collection.

## 10. Candidate next steps

No next-step choice is fixed by this report. The following alternatives remain open.

### Option A — amend Rsem reliability and rerun all 864 cells

Freeze a revised Rsem execution envelope, create a new calibration identity, and rerun the complete 864-cell design.

This is the simplest analysis/provenance path because all M and Rsem observations belong to one revised run, at the cost of repeating the already completed 792 M cells.

### Option B — freeze the completed M evidence and recollect only Rsem

Preserve the 792 completed M logical cells from this run as inherited frozen evidence, define a new preregistered Rsem reliability envelope, and collect a fresh 72-cell Rsem family.

This could avoid unnecessary M provider work because the observed defect is specific to the Rsem execution path. However, it cannot be implemented as a casual resume of the present state. It requires an explicit new provenance contract and finalizer rule describing how inherited M evidence and newly collected Rsem evidence form one calibration analysis unit.

### Option C — run a provider-envelope reliability audit first

Before starting a new scientific calibration, run a separate reliability-only audit to determine a mechanically justified Rsem output ceiling.

Such an audit must define its escalation rule before observing new calibration outcomes and must remain separate from the scientific M/Rsem primary estimate.

## 11. Current conclusion

The correct status of the P6-3 v3 live calibration is:

```text
scientific calibration: incomplete

M collection:
792 / 792 logical cells completed

Rsem collection:
1 / 72 logical cells completed
next logical cell exhausted 3 infrastructure-invalid attempts

stop reason:
three consecutive response-incomplete / max_output_tokens events
at the frozen Rsem maxOutputTokens = 8000

terminal state:
needs-audit / max-infrastructure-attempts-exhausted
```

The main finding from this run is therefore not a dose-response result. It is the discovery of an unresolved **Rsem execution-reliability bottleneck** under the frozen v3 envelope, together with successful live validation that the experimental controller fails closed rather than converting that infrastructure failure into scientific evidence.

## Evidence boundary

The raw live run currently remains under the local run directory named above. This report records the observed run state and diagnostic interpretation but does not itself archive the complete local run payload into `docs/findings/evidence/`.

If the raw run is later promoted into repository evidence, its state, attempt artifacts, receipts, adjudications, and checksums should be preserved immutably and linked from this report.
