# P6-3 v3 calibration predeclaration

**Status:** complete scientific-design freeze for the next v3 calibration; amended before any v3 provider outcome to restore the frozen v2 M reliability envelope; provider/live execution remains unauthorized
**Predeclaration version:** `p6-3-v3-calibration-predeclaration-v2-m-reliability-inheritance`
**Final artifact selector:** `p6-3-v3-category-proportional-interleave-final-v1`

## 1. Scope

P6-3 v3 exists because v2 mixed two conceptually different channels inside one finite artifact budget:

```text
fixed environment/interface information
artifact evidence
```

v3 has already separated those channels and frozen the artifact selector:

```text
Context_EL(B) = E_fixed ∪ Exposure_artifact(B_expose, S_select)
```

This document freezes the remaining calibration choices **before any v3 provider outcome is collected**.

## 2. What changes from v2

The scientific treatment construction changes in two intended ways:

- `E_fixed` is built once from Generation 0, kept outside `B_expose`, and reused unchanged across arms, measurements, and repeats;
- artifact evidence uses the structurally frozen final Candidate-C selector.

The measurement bank, repeat design, capacity grid, margins, and selection logic are intentionally not retuned.

### Pre-live M reliability inheritance amendment

The final pre-live audit found one unintended execution-envelope regression before any v3 provider call: the first v3 M executor still referenced the historical P6-2/P6-3-v1 mutation parity contract with `maxOutputTokens = 7000`.

That 7,000-token envelope had already been superseded for P6-3 v2, before its live run, after v1 demonstrated repeated exact-cap `max_output_tokens` censoring. The frozen v2 mutation reliability contract raised only this provider output cap to `14000` while retaining the same model, reasoning effort, timeout, SDK retry count, service tier, cache mode, response storage, and tool-round settings.

v3 therefore inherits the complete frozen v2 mutation provider contract:

```text
M maxOutputTokens = 14000
reliability source = p6-3-v2-execution-parameters-v1
```

The historical 7,000-token parity contract remains unchanged as provenance; it is not rewritten. This amendment changes execution reliability only. It does not alter `E_fixed`, artifact exposure, the budget grid, task/probe membership, repeat count, margins, or selection rule, and no v3 outcome was available to tune the amendment.

This remains the conservative choice because v2 outcomes are already known. Introducing a finer grid around a previously observed transition, changing margins, or changing repeats now would create additional post-outcome researcher degrees of freedom. v3 therefore reuses the historical **capacity design** unchanged while correcting the treatment-boundary confound and preserving the already-amended v2 M execution envelope.

## 3. Frozen artifact-capacity grid

The artifact repository still has canonical full payload capacity:

```text
T_artifact = 4046 tokens
```

with artifact chunks capped at 256 tokens.

The v3 grid is exactly:

| arm | nominal `B_expose` |
|---|---:|
| B0 | 0 |
| B1 | 505 |
| B2 | 1011 |
| B3 | 2023 |
| B4 | 3034 |
| AF | 4046 / full artifact |

This is the same nominal capacity grid frozen before the v2 live run. It is reused for continuity, not re-estimated from v2 outcomes.

### B0 semantics

`B0` now means:

```text
zero artifact evidence + common E_fixed
```

It no longer means that the model is deprived of the fixed WorldProtocol environment/interface surface.

### AF semantics

`AF` means:

```text
full artifact evidence + the same common E_fixed
```

Thus `E_fixed` is not a treatment difference between B0…B4 and AF.

## 4. Frozen measurement design

### M

Primary M bank remains the frozen 11-task bank from P6-2.

```text
Delta_M = 1/11
```

For an arm `B`, `M(B)` is the mean binary pass rate across the 11 primary tasks and 12 repeats.

The v3 M provider reliability envelope inherits P6-3 v2:

```text
model = gpt-5.6-luna
reasoning = high
maxOutputTokens = 14000
requestTimeoutMs = 180000
providerMaxRetries = 2
serviceTier = default
promptCacheMode = implicit
storeResponses = false
maxToolRounds = 0
```

### Rsem

Rsem remains the 12 boolean probes under naming scheme:

```text
A-obfuscated
```

with:

```text
Delta_R = 1/12
```

For an arm `B`, `Rsem(B)` is the mean semantic score across repeats, equivalently the aggregate probe-judgment success rate under the frozen historical Rsem scorer.

### Repeats and order

Repeat count remains:

```text
12
```

using the existing balanced forward/reverse rotated P6-3 execution schedule.

Expected logical cells therefore remain:

```text
M     = 11 tasks × 12 repeats × 6 arms = 792
Rsem  =            12 repeats × 6 arms = 72
Total = 864
```

Infrastructure-invalid replacement rules remain governed by the historical P6-3 execution protocol and do not convert into additional scientific observations.

## 5. Frozen conjunctive co-gate

Only `B1`…`B4` are candidate interior budgets.

An interior arm `B` qualifies only when **all four** guards hold:

```text
M(B)    - M(B0)    >= Delta_M
M(AF)   - M(B)     >= Delta_M
Rsem(B) - Rsem(B0) >= Delta_R
Rsem(AF)- Rsem(B)  >= Delta_R
```

The endpoints are conjunctive. Strong M cannot compensate for failed Rsem and strong Rsem cannot compensate for failed M.

No monotonic dose-response assumption is required.

If multiple arms qualify, select the one with the smallest `B_expose`.

If no interior arm qualifies:

```text
status = needs-design-audit
reason = NO_CONJUNCTIVE_INTERIOR_BUDGET
selectedBExpose = null
```

There is no fallback to “closest to interior”, no endpoint-specific override, and no post-hoc grid interpolation.

## 6. Frozen treatment identity

A valid v3 calibration run must pin at minimum:

- final selector policy version;
- selector structural-acceptance spec version;
- Generation-0 fixed-environment builder version;
- Generation-0 repository serializer version;
- fixed-environment policy version;
- run-start wiring version;
- v3 M executor version;
- v3 M execution-reliability version and its v2 source version;
- v3 M provider `maxOutputTokens = 14000`;
- v3 Rsem executor version;
- historical balanced execution-protocol version;
- exact 11-task M bank;
- exact 12-probe Rsem bank;
- exact artifact budget grid and chunk size.

The run-start `FixedEnvironmentBinding` identity must be identical across all v3 M/Rsem arms and repeats in the treatment family.

## 7. Historical v2 data boundary

P6-3 v2 remains historical evidence about the old treatment definition.

It is **not pooled** with v3 primary calibration estimates because v3 changes the observable treatment:

```text
v2: artifact budget could control fixed-contract observability
v3: E_fixed is common and outside artifact budget
```

The v2 primary M/Rsem outcomes are not inputs to the v3 grid, margins, or selection calculation. The v2 execution-reliability contract is reused only as an already-frozen provider envelope established before the v2 live run.

## 8. What this freeze does not authorize

This predeclaration does not itself authorize:

- provider/API calls;
- paid/live execution;
- use of v3 calibration as Stage 1A confirmatory evidence;
- modification of the frozen selector after seeing v3 results;
- modification of grid, repeats, margins, task/probe bank, or co-gate after seeing v3 results.

The code-level predeclaration therefore contains:

```text
liveAuthorization = false
confirmatoryStage1AEligible = false
```

## 9. Current gate

The merged v3 final pre-live gate must verify this amended predeclaration, the v3 M executor, the frozen v2 reliability source contract, the final selector, the single run-fixed `E_fixed`, the 864-cell plan, the validity propagation path, and the deterministic result finalizer on the exact checkout that will execute the calibration.

No paid/live execution is authorized by this document.
