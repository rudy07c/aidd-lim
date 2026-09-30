# P6-3 v3 — PR B: fixed-environment M executor

**Status:** implementation slice for review; no paid/live execution authorized
**Depends on:** PR #38 Generation-0 `FixedEnvironmentBinding` builder, PR #36/#37 fixed-environment runtime/provenance, existing `OpenAIV3FixedEnvironmentBackend`
**Historical boundary:** `harness/src/p6/p6-3-live-executors.ts` remains unchanged. `executeP63MCell()` and `executeP63RSemCell()` stay historical v2 surfaces.

## 1. Purpose

PR B adds the v3-only M execution path needed to test the Candidate-D separation:

```text
prebuilt run-fixed FixedEnvironmentBinding
        +
artifact evidence for one arm
        ↓
executeP63V3MCell(...)
        ↓
OpenAIV3FixedEnvironmentBackend
        ↓
shared P6-2-compatible mutation validation / scoring / classification
```

The executor does **not** create `E_fixed`. It receives an already-built `Readonly<FixedEnvironmentBinding>` from upstream, validates it, and forwards that exact object to the dedicated v3 backend.

## 2. Frozen PR-B interface contract

`executeP63V3MCell()` requires:

- `contextFiles`: arm-dependent artifact evidence only;
- `evaluationRepository`: full repository used only for post-mutation scoring;
- `syntheticWorldDir` / task / repeat: the existing M evaluation inputs;
- `contextBudget`: artifact budget only;
- `exposure`: the existing artifact-only `P63ExposureEvidence`;
- `fixedEnvironment`: one prebuilt run-fixed binding.

The executor MUST NOT call either `buildGenerationZeroFixedEnvironment()` or `createFixedEnvironmentBinding()`.

Generation-0 authenticity and "built exactly once at run start" remain upstream orchestration responsibilities. PR B only makes later identity verification possible by persisting the exact fixed-environment identity/snapshot in every v3 M cell artifact.

## 3. Historical parity and intentional v3 difference

PR B preserves the existing P6-2/P6-3 mutation execution contract for:

- model / reasoning effort / max output / timeout / retry settings;
- mutation schema/parser;
- write-path validation via `validateP63MutationPathsP62Compatible()`;
- scoring via `runScoring()`;
- repeat classification via `classifyP62MRepeat()`;
- scientific-cell replacement semantics outside the executor.

The intentional difference is prompt framing: `OpenAIV3FixedEnvironmentBackend` adds `FIXED ENVIRONMENT SPECIFICATION` as a separate model-visible channel before `CURRENT REPOSITORY`. Historical `OpenAIBackend` and historical executor functions are not modified.

## 4. Budget separation

`E_fixed` is outside artifact budgets by construction.

`executeP63V3MCell()` forwards `contextBudget` unchanged and returns the caller-supplied `exposure` unchanged. `fixedEnvironment.modelVisibleTokens` is stored only as diagnostic/provider-input provenance; it is never added to `budgetTokens`, `actualExposedTokens`, `B_expose`, or `B_work`.

## 5. Cell-level provenance

Every v3 M outcome records:

- `diagnosticSummary.fixedEnvironmentIdentity`;
- `diagnosticSummary.fixedEnvironmentModelVisibleTokens`;
- `artifactPayload.executorVersion`;
- `artifactPayload.fixedEnvironment = fixedEnvironmentLogSnapshot(...)`.

This is deliberate preparation for a later run-level gate requiring the same identity across every arm/repeat/generation in one treatment family.

PR B does not yet add builder/serializer versions to a run manifest. That remains a run-start provenance task after M/Rsem executor slices are complete.

## 6. Offline verifier

`verify-p6-3-v3-m-executor.ts` performs no provider call. It checks:

1. historical executor file remains v2-only;
2. v3 M executor is a distinct versioned surface;
3. executor consumes but never constructs `E_fixed`;
4. exact binding is forwarded to `OpenAIV3FixedEnvironmentBackend`;
5. frozen mutation provider contract is reused;
6. artifact budget accounting does not mix in fixed-environment tokens;
7. cell artifacts persist identity + exact fixed-environment snapshot;
8. model-facing fixed environment is structurally separate from repository evidence;
9. v3 prompt provenance is independently versioned;
10. fixed-environment snapshot reconstructs the same identity;
11. path validation / scoring / failure classification reuse existing shared scientific semantics.

## 7. Explicit non-goals

This PR does **not**:

- wire `buildGenerationZeroFixedEnvironment()` into a calibration/run-start entrypoint;
- add `executeP63V3RSemCell()`;
- alter historical v2 executors;
- freeze the final blended selector, v3 budget grid, repeat count, or selection margins;
- change `FixedEnvironmentBinding` schema;
- authorize paid/live P6-3 v3 execution.

## 8. Next steps

1. PR C: v3 Rsem wrapper with the same prebuilt `fixedEnvironment` contract.
2. Run-start wiring/provenance: build once from Generation 0, persist builder/serializer versions, and require one fixed-environment identity across all cells.
3. Candidate-D artifact-only selector re-audit and final selector freeze.
4. Budget/repeat/selection-rule predeclaration and unified pre-live gate.
5. Only then run P6-3 v3 live calibration.
