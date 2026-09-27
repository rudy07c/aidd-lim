# P6-3 v2 guarded paid/live wiring

**Status:** provider-capable path wired but not authorized or invoked  
**Scope:** P6-3 v2 calibration only  
**Base safety layer:** `p6-3-v2-final-prelive-gate-v1`

## Purpose

This change wires the already verified P6-3 v2 runtime to the CLI without turning the existence of that wiring into an authorization to spend API credits or make provider calls.

The safety model is deliberately layered:

1. the original final offline pre-live gate remains unchanged and is rerun on the exact checkout;
2. a new paid/live wiring gate verifies the CLI-to-provider wiring itself on the same checkout;
3. the CLI requires two explicit runtime operator signals before either gate can lead toward provider-capable code;
4. those signals produce an in-memory branded runtime-authorization token, which is required by the paid/live gate and remains embedded in its non-serializable pass token;
5. provider-capable modules are dynamically imported only after the runtime authorization and layered exact-checkout gate succeed.

The committed specifications and serialized receipts continue to record `liveAuthorized=false` and `providerCallsMade=false`; they never self-authorize execution.

## Runtime authorization boundary

A live invocation requires both:

- CLI flag `--authorize-paid-live=P6-3-v2`;
- environment variable `P6_3_LIVE_EXECUTION_ALLOWED=1`.

`--live` without the explicit CLI authorization flag fails before the paid/live gate and before provider-capable modules are imported. Supplying the CLI authorization flag without the environment authorization also fails at the same boundary.

When both signals are present, `authorizeP63V2PaidLiveInvocation()` creates an in-memory branded token. `runP63V2PaidLiveGate()` refuses to run without that token, and the resulting paid/live gate pass token carries it forward. The provider-capable live entrypoint accepts only a valid paid/live gate pass token, so calling the gate/entrypoint directly cannot bypass the same runtime authorization check merely by skipping the CLI.

The runtime authorization token is intentionally not serialized into the receipt and cannot turn a committed artifact into standing authorization.

The API key check also occurs before the provider entrypoint is imported.

These runtime controls supplement, rather than replace, the project rule that paid/live execution requires explicit user authorization in the current interaction.

## Exact-checkout gate sequence

Once the two runtime authorization signals and API-key presence check pass, the CLI calls `runP63V2PaidLiveGate()` with the branded runtime authorization token.

That gate first reruns `runP63V2FinalPreLiveGate()` on the exact clean checkout. The base gate still verifies the frozen 864-cell design, execution parameters, AUTO-INFRA behavior, retry/exhaustion policy, secondary reliability implementation, provider adapters offline, frozen exposure resolver, end-to-end persistence/resume behavior, and CLI fail-closed behavior.

The paid/live gate then runs the dedicated live-wiring verifier and binds SHA-256 evidence for:

- the CLI;
- the provider-free authorization preflight;
- the base final pre-live gate;
- the paid/live gate;
- the provider-capable live entrypoint;
- v2 end-to-end runner, resolver, executor adapters, unattended runner, reliability wrapper, and execution parameters;
- the live-wiring verifier itself;
- this operational document.

The paid/live receipt binds the same exact checkout SHA as the nested base final-prelive receipt.

## Provider import boundary

`harness/p6-3-v2-calibration.ts` does not statically import `p6-3-v2-live-entrypoint.ts`, `p6-3-v2-live-executors.ts`, `OpenAIBackend`, or the OpenAI SDK execution surface.

The order is:

`parse/preflight`
→ `explicit paid-live flag + env → branded runtime authorization`
→ `API key presence check`
→ `base final offline gate + paid/live wiring gate`
→ **dynamic import of live entrypoint**
→ `frozen input resolver`
→ `v2 provider executor`
→ `secondary reliability wrapper`
→ `unattended calibration runner`
→ `state / attempt persistence`
→ `final reliability report`

No provider-capable module is loaded by the CLI before the authorization boundary and exact-checkout gates pass.

## State and resume behavior

New runs persist an initial state before scientific provider execution begins. The state identity binds:

- the exact checkout SHA;
- hashes from the base final-prelive receipt;
- hashes from the paid/live wiring receipt;
- the frozen plan and execution policy.

A `--resume` path must already exist. If the persisted state contains an uncertain in-flight provider-visible attempt, the runtime moves it to `needs-audit` and does not blindly issue a replacement call.

Optional `--adjudications <path>` accepts the existing v2 manual-adjudication format. The frozen rule still permits an uncertain in-flight attempt to be resolved only as infrastructure-invalid before continuation.

## Scientific boundary

This wiring does not change:

- `T_EL = 4046`;
- budget grid `0 / 505 / 1011 / 2023 / 3034 / 4046`;
- 256-token static exposure unit size;
- 12-repeat six-arm schedule;
- 864 logical cells;
- mutation max output cap 14,000;
- Rsem max output cap 8,000;
- maximum three scientific attempts per logical cell;
- AUTO-INFRA-001;
- `censored-exhausted-and-continue` behavior;
- the rule that any exhausted cell blocks `B_expose` selection;
- secondary reliability endpoints;
- M/Rsem conjunctive selection logic.

P6-3 v2 remains calibration-only and `confirmatoryStage1AEligible=false`.

## Current authorization state

This wiring change does **not** constitute paid/live authorization and does not execute the 864-cell calibration.

The committed paid/live wiring spec remains:

- `liveExecutionWired=true`;
- `paidLiveAuthorizationRequired=true`;
- `liveExecutionAuthorized=false`.

The paid/live gate receipt remains:

- `liveAuthorized=false`;
- `providerCallsMade=false`.

After this wiring is merged, the exact merged-main checkout must produce a successful paid/live wiring receipt. Only a later interaction containing explicit user authorization may invoke the guarded live command against that audited checkout.
