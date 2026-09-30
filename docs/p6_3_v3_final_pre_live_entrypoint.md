# P6-3 v3 final pre-live gate and provider-capable entrypoint

**Status:** hardened final provider-capable wiring exists; no paid/provider run is authorized or executed by this document  
**Final gate:** `p6-3-v3-final-prelive-gate-v2-hardening`  
**Live entrypoint:** `p6-3-v3-live-entrypoint-v1`  
**Result finalizer:** `p6-3-v3-result-finalizer-v1`  
**CLI:** `npm run p6:el-calibration-v3 -- ...`

## 1. Purpose

The final pre-live boundary now covers the complete predeclared scientific path before any v3 paid/live outcome is observed:

- fixed WorldProtocol environment surface;
- Generation-0 fixed-environment binding/provenance;
- v3 M and Rsem executors;
- one-binding run-start ownership;
- outcome-blind structural selector acceptance rule;
- final artifact selector;
- v3 calibration predeclaration;
- v3 864-cell runner;
- fail-closed live state controller;
- independent Rsem scientific-validity propagation;
- deterministic v3 result finalizer;
- concrete runtime dependency/environment verification.

This gate changes no treatment parameter and makes no provider call.

## 2. Exact checkout and runtime-consumed filesystem boundary

`runP63V3FinalPreLiveGate()` still requires the tracked checkout to be clean and records the exact `git rev-parse HEAD` SHA.

The older tracked-only cleanliness check intentionally ignores general untracked files. That is appropriate for run outputs, but the v3 production CLI recursively loads TypeScript files from:

```text
synthetic-world/repository
```

Therefore the hardened gate separately runs:

```text
git ls-files --others --exclude-standard -- synthetic-world/repository
```

and refuses any untracked `.ts` file under that runtime-consumed repository. Unrelated untracked files elsewhere, and non-TypeScript files that the repository loader does not consume, are not globally banned.

The same targeted check is repeated when a final-gate pass token is consumed, closing the gate-to-provider TOCTOU boundary.

## 3. Concrete runtime dependency provenance

The gate verifies the environment that will actually run the experiment, not only dependency intent in `package.json`.

It requires the existing `verify-package-version.ts`, which compares the installed OpenAI SDK version against `package-lock.json`.

The receipt also persists:

```text
nodeVersion
openaiSdkVersion
packageLockSha256
```

The runtime environment is resolved before and after the offline verifier suite and must remain identical. It is resolved again when the pass token is consumed. A changed Node version, installed OpenAI SDK, or package-lock hash makes a previously-issued token invalid.

## 4. Required offline verifier surface

The hardened final gate runs the existing frozen/runtime verifiers with provider credentials removed, including:

- installed package-version parity;
- fixed WorldProtocol public-surface verifier;
- Generation-0 fixed-environment builder verifier;
- v3 M executor verifier;
- v3 Rsem executor verifier;
- v3 run-start verifier;
- structural selector acceptance verifier;
- final selector verifier;
- calibration predeclaration verifier;
- offline calibration runner verifier;
- live-controller verifier;
- **Rsem scientific-validity propagation verifier**;
- **v3 deterministic result-finalizer verifier**;
- mutation-protocol parity verifier;
- Rsem-protocol parity verifier.

The validity and finalizer gates are therefore part of the same pre-live receipt that authorizes entry into the provider-capable path; they are not merely independent CI checks.

Scratch outputs from recomputed historical parity/freeze verifiers are redirected outside the repository checkout.

## 5. Receipt and evidence

After all verifier processes finish, the gate captures the exact source/input/evidence hashes, rechecks tracked cleanliness, rechecks runtime-consumed untracked `.ts` files, re-resolves `HEAD`, and re-resolves runtime dependency provenance.

The source evidence now includes the Step-2/Step-3 and runtime hardening surfaces, including:

- `p6-3-v3-scientific-validity.ts`;
- `p6-3-v3-result-finalizer.ts`;
- `p6-3-v3-runtime-environment.ts`;
- `p6-3-v3-finalize.ts`;
- provider-capable live entrypoint and production CLI;
- `package-lock.json` and package-version resolver.

The hardened receipt is deliberately non-self-authorizing:

```text
preflightPassed = true
exactCleanCheckoutVerified = true
runtimeConsumedUntrackedFilesVerified = true
paidLiveAuthorizationRequired = true
liveAuthorized = false
providerCallsMade = false
```

It also records the result-finalizer version and runtime dependency provenance.

## 6. Production CLI and authorization order

Dry mode remains the default:

```bash
npm run p6:el-calibration-v3
```

It runs the complete hardened pre-live gate and stops without loading the provider-capable live entrypoint.

A future paid/live invocation still requires all of:

```bash
P6_3_V3_LIVE_EXECUTION_ALLOWED=1 \
OPENAI_API_KEY=... \
npm run p6:el-calibration-v3 -- \
  --live \
  --authorize-paid-live=P6-3-v3
```

The CLI checks, in order:

1. hardened final pre-live gate;
2. `--live` request;
3. explicit `--authorize-paid-live=P6-3-v3`;
4. `P6_3_V3_LIVE_EXECUTION_ALLOWED=1`;
5. `OPENAI_API_KEY`.

Only after those checks does it dynamically import the provider-capable entrypoint.

The entrypoint immediately revalidates the final token against the still-current checkout, targeted untracked-file boundary, and runtime dependency environment. The controller then binds the paid-live runtime token to checkout SHA, plan hash, treatment-provenance hash, and `E_fixed` identity.

## 7. Persistence, resume, and post-collection finalization

For a new run, the provider-capable entrypoint persists before the first scientific executor call:

```text
p6-3-v3-final-prelive-receipt.json
fixed-environment-run.json
treatment-provenance.json
state.json
```

Attempt payloads are committed under `attempts/`. The controller persists `inFlight` before each provider-visible attempt, so interruption cannot silently create an automatic duplicate call.

Resume recomputes the current hardened final gate and requires exact persisted provenance compatibility. Unresolved provider-visible `inFlight` attempts stop in `needs-audit` until explicitly adjudicated.

Completing 864 cells does not itself select `B_expose`. After terminal completion, the provider-free finalizer must convert the state into exactly one valid scientific observation per sequence, enforce M=132 outcomes/arm and Rsem=144 probe judgments/arm, and only then call the already-predeclared co-gate.

A missing/null Rsem primary score, membership drift, denominator drift, or unresolved invalid replacement fails finalization rather than being imputed or silently dropped.

## 8. Offline verification

`verify-p6-3-v3-runtime-environment.ts` verifies without provider calls that:

- installed OpenAI SDK provenance resolves and matches the lockfile;
- Node and lockfile provenance are recordable;
- a tracked repository `.ts` is allowed;
- an untracked non-TypeScript note is not treated as runtime input;
- an untracked runtime-consumed `.ts` under `synthetic-world/repository` is rejected.

`verify-p6-3-v3-final-prelive-entrypoint.ts` then executes the actual hardened final gate and verifies:

- the receipt carries runtime and result-finalizer provenance;
- package-version, validity-propagation and result-finalizer verifiers are required by the gate;
- hardened source files are included in receipt evidence;
- dry CLI succeeds with provider credentials removed;
- direct production entrypoint refuses a missing API key;
- the actual entrypoint/persistence/controller path completes all 864 cells using mock M/Rsem executors;
- exactly 792 M and 72 Rsem mock calls occur;
- a single run-fixed `E_fixed` binding is shared;
- completed resume makes zero additional scientific calls;
- provider-capable dynamic import remains after all explicit authorization/API-key guards.

Actual provider calls made by these verifiers: **0**.

## 9. Scientific boundary remains unchanged

This hardening does not alter:

- `B_expose` grid;
- artifact chunk size;
- selector order;
- `E_fixed` content;
- task/probe membership;
- repeat count or schedule;
- `Delta_M` / `Delta_R`;
- conjunctive co-gate;
- minimum-budget tie-break;
- no-interior-budget stop rule;
- calibration-only status;
- non-pooling of v2 primary estimates.

This completes Step 4 of `docs/p6_3_post_audit_execution_plan.md` once the PR is merged and all CI is green. Step 5 (main protection / operational work-order protection) remains required before any paid/live v3 calibration.
