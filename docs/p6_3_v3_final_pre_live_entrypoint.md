# P6-3 v3 final pre-live gate and provider-capable entrypoint

**Status:** final provider-capable wiring exists; no paid/provider run is authorized or executed by this document  
**Final gate:** `p6-3-v3-final-prelive-gate-v1`  
**Live entrypoint:** `p6-3-v3-live-entrypoint-v1`  
**CLI:** `npm run p6:el-calibration-v3 -- ...`

## 1. Purpose

All scientific design and lower-level v3 runtime pieces are already merged:

- fixed WorldProtocol environment surface;
- Generation-0 fixed-environment binding/provenance;
- v3 M and Rsem executors;
- one-binding run-start ownership;
- outcome-blind structural selector acceptance rule;
- final artifact selector;
- v3 calibration predeclaration;
- v3 864-cell offline runner;
- fail-closed live state controller.

This slice adds the final engineering boundary between those frozen pieces and a future paid/provider calibration.

It does **not** change any treatment parameter and it does **not** execute a paid/provider run.

## 2. Final exact-checkout pre-live gate

`runP63V3FinalPreLiveGate()` first requires a clean tracked checkout and resolves the exact `git rev-parse HEAD` SHA.

It then reconstructs the exact 864-cell plan and executes the merged offline verifier surfaces with provider credentials stripped from the environment:

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
- mutation-protocol parity verifier;
- Rsem-protocol parity verifier.

Scratch outputs from recomputed historical parity/freeze verifiers are redirected outside the repository checkout.

After all verifier processes finish, the gate captures the exact source/input/evidence hashes, then **re-runs tracked-worktree cleanliness and re-resolves `HEAD`**. The gate emits a pass receipt only if the checkout is still clean and `HEAD` is byte-for-byte the same SHA captured before verification. This prevents a verifier-side tracked mutation or concurrent checkout movement from being hidden behind an earlier SHA.

The resulting receipt contains hashes for:

- v3 scientific/runtime source files;
- the provider-capable live entrypoint;
- the production CLI;
- frozen mutation/Rsem parity evidence;
- task/probe/ground-truth inputs;
- every verifier used by the final gate.

The receipt is deliberately non-self-authorizing:

```text
preflightPassed = true
exactCleanCheckoutVerified = true
paidLiveAuthorizationRequired = true
liveAuthorized = false
providerCallsMade = false
```

A pass token is also **revalidated when it is consumed**. `assertP63V3FinalPreLiveGatePassToken()` again requires the current tracked worktree to be clean and the current `HEAD` to equal `receipt.checkoutGitSha`. Therefore changing the tracked checkout after the gate but before the provider-capable entrypoint or resume boundary fails closed instead of reusing a stale receipt.

## 3. Production CLI

Dry mode is the default:

```bash
npm run p6:el-calibration-v3
```

It runs the entire final pre-live gate and stops without loading the provider-capable live entrypoint.

A future paid/live invocation requires all of:

```bash
P6_3_V3_LIVE_EXECUTION_ALLOWED=1 \
OPENAI_API_KEY=... \
npm run p6:el-calibration-v3 -- \
  --live \
  --authorize-paid-live=P6-3-v3
```

The CLI checks, in order:

1. final exact-checkout pre-live gate;
2. `--live` request;
3. explicit `--authorize-paid-live=P6-3-v3`;
4. `P6_3_V3_LIVE_EXECUTION_ALLOWED=1`;
5. `OPENAI_API_KEY`.

Only after those checks does it dynamically import the provider-capable entrypoint.

The entrypoint immediately revalidates the final pre-live token against the current tracked checkout. The controller then repeats the explicit authorization checks and binds the runtime token to checkout SHA, plan hash, treatment-provenance hash, and `E_fixed` identity.

## 4. Run-directory persistence order

For a new run, the provider-capable entrypoint resolves a run directory and persists the following before the first scientific executor call:

```text
p6-3-v3-final-prelive-receipt.json
fixed-environment-run.json
treatment-provenance.json
state.json
```

Attempt payloads are then committed as:

```text
attempts/<sequence>-<measurement>-<arm>-attempt-<n>.json
```

The controller persists `inFlight` in `state.json` before each executor/provider-visible attempt. Therefore a process interruption cannot silently cause an automatic duplicate provider call on resume.

## 5. Frozen runtime inputs

The live entrypoint loads M tasks in the exact predeclared 11-task ID order.

Rsem probes are loaded in the exact 12-probe ID order from the frozen Rsem parity manifest. The entrypoint rejects missing probes, non-boolean probes, or naming-scheme drift.

Finite artifact exposures are constructed by the final v3 selector runtime. Because static exposure is repeat-independent, the provider executor caches only the 72 unique treatment exposures:

```text
11 M tasks × 6 arms + 1 Rsem bank × 6 arms = 72
```

This cache changes no treatment content; it prevents recomputing identical static evidence across 12 repeats.

## 6. Resume and adjudication

Resume is explicit:

```bash
npm run p6:el-calibration-v3 -- \
  --live \
  --authorize-paid-live=P6-3-v3 \
  --resume runs/.../state.json
```

The CLI recomputes the current final gate. The live entrypoint then revalidates that gate against the still-current tracked checkout, prepares the treatment, and requires exact equality of the persisted:

- final pre-live receipt;
- run-fixed environment provenance;
- treatment provenance;
- controller checkout/plan/treatment/`E_fixed` identities.

If the persisted state contains an unresolved provider-visible `inFlight` attempt, resume first converts it to `uncertain-in-flight-attempt` and stops in `needs-audit`; it does not retry.

Adjudications are supplied from a JSON array with `--adjudications <path>`. Replacement remains limited to explicitly adjudicated infrastructure-invalid attempts and the existing three-attempt ceiling.

## 7. Offline final verifier

`verify-p6-3-v3-final-prelive-entrypoint.ts` verifies the final wiring without a provider call.

It checks:

- exact clean-checkout final gate passes all merged v3 verifier surfaces;
- the receipt includes hashes for the live entrypoint and CLI;
- production CLI dry-run succeeds with provider credentials removed;
- direct production entrypoint refuses a missing API key when no test executor is injected;
- the actual live-entrypoint persistence/exposure/controller path completes all 864 cells using mock M/Rsem executors;
- exactly 792 M and 72 Rsem mock calls occur;
- one run-fixed binding object is shared across the whole mocked run;
- pre-live receipt, fixed-environment provenance, treatment provenance and state are persisted;
- exactly 864 attempt artifacts are written;
- completed resume verifies the same provenance and makes zero additional scientific calls;
- CLI source order places the dynamic provider-capable import after all explicit authorization/API-key guards.

The final gate itself additionally requires post-verifier tracked cleanliness/HEAD stability, and every pass-token consumption rechecks the current checkout SHA before entering provider-capable execution.

Actual provider calls made by the verifier: **0**.

## 8. Scientific boundary remains unchanged

This final wiring does not alter:

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

The next action after this PR is **not automatically to run the provider**. The repository may be technically live-ready after all PR checks pass, but a paid calibration still requires an explicit operator decision/authorization at the time of execution.
