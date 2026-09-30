# P6-3 v3 — run-start fixed-environment wiring

**Status:** implementation slice for review; no paid/live execution authorized  
**Depends on:** PR #38 Generation-0 binding builder, PR #39 v3 M executor, PR #40 v3 Rsem executor  
**Historical boundary:** `harness/p6-3-live-calibration.ts` remains the historical v2 calibration entrypoint and is not rewired by this slice.

## 1. Purpose

This slice closes the remaining ownership gap around `E_fixed` before any v3 calibration entrypoint is allowed to execute cells.

The required invariant is:

```text
Generation-0 repository snapshot
        ↓ exactly once
buildGenerationZeroFixedEnvironment(...)
        ↓
run-fixed FixedEnvironmentBinding
        ├── all v3 M cells
        └── all v3 Rsem cells
```

A cell executor must never rebuild the binding. The run-start layer owns construction, run-level provenance persistence, and post-cell identity verification.

## 2. Production API

`initializeP63V3RunStart(...)` requires:

- the Generation-0 repository snapshot;
- a run-level provenance persistence implementation;
- optional executor/builder dependencies used only for deterministic offline verification.

Initialization performs, in order:

1. build one `FixedEnvironmentBinding` from Generation 0;
2. validate the binding;
3. compute its canonical identity;
4. construct run-level provenance containing the builder and repository-serializer versions plus the exact fixed-environment snapshot;
5. persist that provenance;
6. return two closures, `executeMCell(...)` and `executeRSemCell(...)`, both capturing the same binding object.

No cell can execute before step 5 completes because the initialized context is not returned earlier.

## 3. Run-level provenance

The persisted record is versioned by:

- `P6_3_V3_RUN_FIXED_ENVIRONMENT_PROVENANCE_SCHEMA`;
- `P6_3_V3_RUN_START_WIRING_VERSION`;
- `GENERATION_ZERO_FIXED_ENVIRONMENT_BUILDER_VERSION`;
- `GENERATION_ZERO_REPOSITORY_SERIALIZER_VERSION`.

It also stores:

- `fixedEnvironmentIdentity`;
- the complete `fixedEnvironmentLogSnapshot(...)` record.

This is the run-level reconstruction record for the all-condition-common environment channel. It is separate from artifact exposure and does not change `B_expose` accounting.

## 4. Cell identity gate

After every M or Rsem cell returns, `assertP63V3OutcomeUsesRunFixedEnvironment(...)` verifies both independent cell-level records:

1. `diagnosticSummary.fixedEnvironmentIdentity` exactly equals the run-start identity;
2. `artifactPayload.fixedEnvironment` exactly equals the run-start snapshot.

Either mismatch fails closed before the outcome can be accepted by an upstream v3 calibration runner.

This guards against accidental per-arm/per-repeat rebuilding, wrong binding propagation, or provenance drift even if a downstream executor is later changed.

## 5. Offline verifier

`verify-p6-3-v3-run-start.ts` uses dependency injection and makes no provider call. It verifies:

- historical v2 calibration CLI remains untouched;
- Generation-0 builder is called exactly once per run-start initialization;
- run-level provenance is persisted exactly once before cell execution;
- builder and repository serializer versions are persisted;
- M and Rsem receive the same exact binding object across multiple cells;
- diagnostic identity drift fails closed;
- artifact snapshot drift fails closed.

The dedicated `P6-3 v3 Run-Start Wiring` workflow runs harness typecheck plus this verifier.

## 6. Explicit non-goals

This slice does **not**:

- replace or modify `harness/p6-3-live-calibration.ts`;
- create a paid/live v3 CLI;
- alter historical v2 M or Rsem executors;
- alter v3 M/Rsem scientific semantics;
- modify the artifact selector;
- freeze a final v3 selector or budget grid;
- authorize provider execution;
- treat existing v2 calibration results as v3 evidence.

## 7. Next step

After this run-start ownership/provenance layer is merged, the next design task is Candidate-D artifact-only exposure re-audit under the now-separated context definition:

```text
Context_EL(B) = E_fixed ∪ Exposure_artifact(B, S_select)
```

The re-audit should inspect only artifact-side exposure composition, remain outcome-blind, and decide the exact structural acceptance rule required before the final selector and v3 budget grid can be frozen.
