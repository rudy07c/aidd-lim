# P6-3 v3 calibration runner — offline pre-live wiring

**Status:** offline/pre-live runner wiring only; amended before any v3 provider outcome to persist the inherited v2 M reliability envelope; provider/live execution is not authorized  
**Runner version:** `p6-3-v3-calibration-runner-v2-m-reliability`  
**Treatment provenance schema:** `p6-3-v3-calibration-treatment-provenance-v2-m-reliability`  
**Predeclaration:** `p6-3-v3-calibration-predeclaration-v2-m-reliability-inheritance`  
**Final selector:** `p6-3-v3-category-proportional-interleave-final-v1`

## 1. Purpose

This runner closes the offline wiring boundary between the frozen P6-3 v3 design and a future paid/live calibration.

It proves that the exact predeclared treatment can be constructed end-to-end without a provider call:

```text
Generation-0 repository
  -> one run-fixed E_fixed
  -> exact 864-cell predeclared schedule
  -> final-selector artifact exposure for B0...B4
  -> full artifact repository for AF
  -> v3 M / Rsem run-start closures
```

The pre-live amendment also makes the M execution-reliability envelope explicit in treatment provenance. P6-3 v3 inherits the already-frozen P6-3 v2 mutation provider envelope, including `maxOutputTokens = 14000`; the historical 7,000-token P6-2/P6-3-v1 parity contract remains unchanged as historical provenance.

## 2. v3-only artifact exposure runtime

`harness/src/context/p6-3-v3-static-exposure-runtime.ts` is additive and does not modify the historical EL exposure runtime.

For M it uses:

```text
GroundTruthDelta + naming scheme + repository
  -> frozen privileged structural ranking
  -> p6-3-v3-category-proportional-interleave-final-v1
  -> whole-unit B_expose prefix
```

For Rsem it uses prompt strings only to derive the bank-level entity union, then applies the same structural ranking and final selector.

The Rsem selector API has no input for:

- correct answers;
- prior Rsem scores;
- M outcomes;
- hidden-test outcomes;
- provider responses;
- E_fixed.

`E_fixed` therefore cannot enter selector ordering or artifact-budget accounting.

## 3. Exact calibration plan

`buildP63V3CalibrationPlan()` reconstructs the schedule from the merged predeclaration and the frozen P6-3 execution protocol.

Expected cells remain:

```text
M     = 11 tasks × 12 repeats × 6 arms = 792
Rsem  =            12 repeats × 6 arms = 72
Total = 864
```

Each arm therefore appears exactly 144 times.

The runner owns a distinct v3 plan hash and does not call the historical v2 live runner to obtain the plan. The M reliability amendment does not change this plan hash because it changes provider execution headroom, not logical-cell identity or treatment exposure.

## 4. Artifact treatment construction

For B0...B4, `buildP63V3CellExposure()` calls only the v3 final-selector exposure runtime.

The frozen capacity grid remains:

| arm | artifact budget |
|---|---:|
| B0 | 0 |
| B1 | 505 |
| B2 | 1011 |
| B3 | 2023 |
| B4 | 3034 |
| AF | full / 4046 |

B0 therefore produces an empty artifact context while the separate run-fixed `E_fixed` remains present at execution time.

AF bypasses finite selection and receives the complete artifact repository. It still receives the same `E_fixed` as every EL arm.

## 5. M execution-reliability provenance

P6-3 v3 M now uses a dedicated versioned reliability identity:

```text
p6-3-v3-m-execution-reliability-v1-inherit-v2
```

whose source is:

```text
p6-3-v2-execution-parameters-v1
```

The complete v3 M provider contract equals the frozen v2 mutation provider contract:

```text
model = gpt-5.6-luna
reasoningEffort = high
maxOutputTokens = 14000
requestTimeoutMs = 180000
providerMaxRetries = 2
serviceTier = default
promptCacheMode = implicit
storeResponses = false
maxToolRounds = 0
```

This amendment was made before any v3 provider outcome. It does not alter `B_expose`, `E_fixed`, selector ordering, task/probe membership, repeats, margins, or the co-gate.

## 6. Run-start and provenance boundary

`prepareP63V3CalibrationRun()` performs preparation only. It does not execute any logical cell.

It:

1. reconstructs and hashes the exact 864-cell plan;
2. calls `initializeP63V3RunStart()` once;
3. therefore builds exactly one Generation-0 `FixedEnvironmentBinding`;
4. persists the existing run-fixed environment provenance;
5. persists v3 treatment provenance containing the predeclaration, schedule, selector, exposure-runtime, M/Rsem executor, plan, budget, task/probe-bank, fixed-environment identities, and M reliability envelope;
6. returns the prepared plan and run-start closures.

The persisted treatment provenance explicitly carries:

```text
mExecutionReliabilityVersion = p6-3-v3-m-execution-reliability-v1-inherit-v2
mReliabilitySourceVersion = p6-3-v2-execution-parameters-v1
mProviderMaxOutputTokens = 14000
liveAuthorized = false
```

## 7. Offline verifier

`harness/verify-p6-3-v3-calibration-runner.ts` uses the real synthetic-world repository, task bank, probe bank, final selector, and Generation-0 fixed-environment builder.

It verifies:

- deterministic 864-cell plan and plan hash;
- 792 M cells and 72 Rsem cells;
- 144 cells per arm;
- 72 unique static treatment exposures (`11×6` M + `1×6` Rsem), each built twice to verify determinism;
- B0 has zero artifact evidence;
- AF contains the full 4046-token artifact repository;
- every finite arm is produced by the v3 final-selector path;
- run-fixed environment provenance is persisted exactly once;
- complete treatment provenance is persisted exactly once;
- treatment provenance records the inherited v2 M reliability version and `maxOutputTokens = 14000`;
- all 864 mock-dispatched cells pass through `initializeP63V3RunStart()` and receive the same binding object;
- the run-start fail-closed identity/snapshot checks accept every mock outcome;
- new v3 runner/exposure modules do not import historical v2 live executors or outcome artifacts;
- provider call count is zero.

The executor dependencies are mocked only at the final execution boundary. The actual Generation-0 fixed-environment builder is used.

## 8. Historical boundary

This amendment does not rewrite:

- `p6-3-mutation-protocol-parity.ts` and its historical 7,000-token contract;
- `p6-3-live-executors.ts`;
- `p6-3-v2-live-executors.ts`;
- historical v2 calibration state/results;
- the historical EL selector/runtime;
- v2 scientific evidence.

The v2 execution-parameter contract is imported as a frozen reliability source, not as scientific outcome data.

## 9. Live boundary

The provider-capable entrypoint remains separately guarded by the hardened final pre-live gate and explicit paid/live authorization. This document does not authorize a provider call.

Before the first live call, the exact checkout must pass the final pre-live gate again and the runtime environment must satisfy all supported dependency requirements.
