# P6-3 v3 live controller — offline fail-closed verification

**Status:** live-controller semantics wired and verified offline; no provider/live invocation authorized by this document  
**Controller:** `p6-3-v3-live-controller-v1`  
**State schema:** `p6-3-v3-live-calibration-state-v1`  
**Consumes:** merged `p6-3-v3-calibration-runner-v1`

## 1. Purpose

The v3 treatment and 864-cell runner are already frozen. This slice adds only the operational state machine needed to execute that treatment safely in a later paid/live run.

It does not redefine:

- `E_fixed`;
- artifact selector;
- budget grid;
- task/probe bank;
- repeat count;
- schedule;
- M/Rsem endpoints or margins;
- budget selection rule.

The controller is provider-neutral. The only operation that can make a scientific/provider call is an executor callback supplied by a later live entrypoint.

## 2. Runtime authorization boundary

A v3 paid/live runtime token requires all of the following explicit signals:

```text
live = true
--authorize-paid-live=P6-3-v3
P6_3_V3_LIVE_EXECUTION_ALLOWED=1
```

The token is then cryptographically bound to:

- exact checkout Git SHA;
- exact v3 plan hash;
- exact treatment-provenance hash;
- exact run-fixed `E_fixed` identity.

The flag/environment pair is an operator-intent guard, not a scientific pre-live gate and not a secret. A future production entrypoint must still rerun the complete v3 pre-live verification against the exact clean checkout before invoking a provider.

No CLI or production provider entrypoint is added in this slice.

## 3. State provenance and resume

The persisted v3 state records:

- controller/state-schema versions;
- calibration-runner version;
- checkout Git SHA;
- plan hash;
- treatment-provenance hash;
- fixed-environment identity;
- authorization digest;
- total logical cells;
- cursor / next attempt;
- committed attempts;
- uncertain interrupted attempts;
- audit flag;
- accumulated estimated cost.

Resume is refused if the checkout, plan, treatment provenance, `E_fixed`, authorization digest, controller schema, or runner version differs from the persisted state.

This prevents a partially completed run from silently continuing under a changed treatment or checkout.

## 4. Provider-visible in-flight safety

Before calling the supplied executor, the controller persists:

```text
inFlight = { sequence, attempt, startedAt }
```

The controller intentionally does not catch an executor/provider exception and automatically retry it.

If execution terminates after that persistence point but before a committed result is journaled, resume converts the in-flight record into:

```text
status = needs-audit
auditFlag = uncertain-in-flight-attempt
```

No replacement call occurs automatically.

Because no trustworthy scientific output exists, this interruption may only be adjudicated as:

```text
infrastructure-invalid
```

Only then can the same logical cell proceed to the next allowed attempt.

## 5. Infrastructure replacement semantics

A returned `failureDomain = infrastructure` also stops immediately in `needs-audit`.

There is no automatic scientific replacement. A human adjudication is required.

If adjudicated `infrastructure-invalid`:

- attempt 1 -> retry same logical cell as attempt 2;
- attempt 2 -> retry same logical cell as attempt 3;
- attempt 3 -> stop with `max-infrastructure-attempts-exhausted`.

The ceiling is inherited unchanged from `p6-3-execution-protocol-v1`.

If an apparent infrastructure/unclassified result is adjudicated as a real scientific failure, the logical cell is consumed and the plan advances rather than replacing the observation.

For M, `protocol-failure` remains prohibited as a final adjudication disposition, preserving the earlier mutation endpoint semantics. Rsem may retain protocol failure as its distinct failure domain.

## 6. Offline verifier

`harness/verify-p6-3-v3-live-controller.ts` uses the real v3 prepared treatment/Generation-0 binding but mock scientific executors.

It verifies:

1. live runtime authorization rejects missing live mode;
2. rejects missing `--authorize-paid-live=P6-3-v3`;
3. rejects missing `P6_3_V3_LIVE_EXECUTION_ALLOWED=1`;
4. rejects malformed checkout SHA;
5. authorization/state are bound to exact checkout, plan, treatment provenance and `E_fixed`;
6. an 864-cell happy-path mock run completes with exactly 864 attempt-1 observations;
7. infrastructure failure stops after one call with no automatic retry;
8. explicit infrastructure-invalid adjudication permits attempts 2 and 3 only;
9. a third infrastructure-invalid attempt ends in `max-infrastructure-attempts-exhausted`;
10. a thrown provider-visible mock leaves persisted `inFlight`;
11. resume makes no executor call and changes that state to `uncertain-in-flight-attempt`;
12. uncertain interruption cannot be adjudicated as a scientific result;
13. M `protocol-failure` adjudication is rejected;
14. an infrastructure result adjudicated as a genuine scientific failure advances without replacement;
15. checkout or treatment drift causes resume refusal;
16. controller source has no OpenAI import or v2 live entrypoint/result dependency.

Provider/API calls made by this verifier: **0**.

## 7. Boundary after this slice

After this controller is merged, the final engineering boundary before an actual paid v3 calibration is a **v3 final pre-live/paid-live entrypoint gate**. That later gate must:

- require a clean tracked checkout;
- recompute/verify the merged v3 predeclaration, selector, runner, Rsem/mutation parity, fixed-environment and controller gates;
- bind the paid/live authorization to that exact checkout;
- load only the frozen task/probe inputs;
- persist run-start, treatment and controller state before the first provider call;
- expose explicit resume/adjudication commands;
- make no scientific design change.

Even after that wiring exists, an actual paid/provider calibration should occur only after explicit operator authorization. This document itself does not provide such authorization.
