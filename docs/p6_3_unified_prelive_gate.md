# P6-3 unified pre-live gate

**Status**: pre-live gate implemented; live runner integration pending; no paid/live API execution authorized

## Purpose

P6-3 now has four independently frozen scientific surfaces:

1. EL structural freeze;
2. execution protocol freeze;
3. M mutation protocol parity;
4. Rsem protocol parity.

The unified pre-live gate makes these independent freezes a single fail-closed prerequisite for the future live calibration runner. A live runner must not rely only on the committed `status` fields. It must start from a pass token produced by re-running the frozen offline verifiers against the exact current checkout.

## Single entry point

`runP63UnifiedPreLiveGate(harnessRoot)` in `harness/src/p6/p6-3-unified-prelive-gate.ts` is the single offline entry point.

It re-runs all of the following against the current checkout:

- `verify-p6-3-el-structural-freeze.ts`
- `verify-p6-3-structural-invariant-hardening.ts`
- `verify-p6-3-el-structural-freeze-manifest.ts`
- `verify-p6-3-execution-protocol.ts`
- `verify-p6-3-p62-critical-source-fingerprint.ts`
- `verify-p6-3-mutation-protocol-parity.ts`
- `verify-p6-3-rsem-protocol-parity.ts`
- `verify-p6-3-rsem-leak-proofing.ts`

The structural verifier and structural-manifest verifier share only a gate-owned temporary candidate artifact. All generated verifier artifacts live in an OS temporary directory and are deleted before the gate returns.

Only after all eight return exit status 0 does the gate re-read the four committed frozen manifests:

- `harness/frozen/p6-3-el-structural-freeze.json` — expected `status="frozen-pass"`
- `harness/frozen/p6-3-execution-protocol.json` — expected `status="frozen-pre-live"`
- `harness/frozen/p6-3-mutation-protocol-parity.json` — expected `status="frozen-pass"`
- `harness/frozen/p6-3-rsem-protocol-parity.json` — expected `status="frozen-pass"`

Every manifest must exist, parse as JSON, contain a non-empty `schemaVersion`, and match its already-frozen status exactly. The unified gate does not normalize or rewrite those statuses. The receipt records the SHA-256 of the exact bytes of each manifest together with the checkout git SHA.

## Fail-closed behavior

The gate returns a branded `P63PreLiveGatePassToken`; a plain object containing the same receipt is not accepted by `assertP63PreLiveGatePassToken`.

The verifier also tests two explicit negative cases:

- changing a required manifest away from its declared frozen status must fail;
- removing a required frozen manifest must fail.

Future live-runner integration must require the branded pass token before it can enter any provider/API execution path. This PR establishes the token and gate; wiring that token into the live runner is the next implementation step.

## Offline-only guarantee

The unified gate is deliberately offline. Before spawning each verifier it removes provider API credentials from the child-process environment and sets `P6_3_LIVE_EXECUTION_ALLOWED=0`. Existing frozen verifiers are expected to require no provider access.

The gate receipt always contains:

```json
{
  "preflightPassed": true,
  "liveAuthorized": false
}
```

A successful preflight therefore proves only that the frozen scientific assumptions and parity contracts still hold for that checkout. It does **not** authorize paid/live execution. Explicit live authorization remains a separate final gate.

## CI evidence

`.github/workflows/p6-3-prelive-gate-ci.yml` runs the unified gate on changes to the harness, calibration inputs, synthetic world, P6-2 AF evidence, or this gate itself. CI uploads `p6-3-unified-prelive-receipt.json` so the exact checkout SHA, verifier pass set, and four manifest hashes are auditable.

## Remaining before live

After this gate is merged, the remaining implementation sequence is:

1. integrate M and Rsem P6-3 live calibration execution behind the branded pre-live pass token;
2. verify stateless Sync execution, six-arm block order, immediate infrastructure-only replacement, resume behavior, and calibration-only provenance offline;
3. run a final pre-live audit including call count and cost assumptions;
4. require explicit authorization before any paid/live P6-3 calibration call.
