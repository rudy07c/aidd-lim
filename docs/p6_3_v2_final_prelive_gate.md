# P6-3 v2 final pre-live gate

**Status:** final v2 offline evidence gate frozen; paid/live provider execution remains unauthorized  
**Scope:** P6-3 v2 calibration only  
**Predecessors:** `docs/p6_3_v2_design_audit.md`, `docs/p6_3_v2_end_to_end_wiring.md`

## Purpose

This gate is the final machine-verifiable evidence binder before the separate human authorization step for paid/live P6-3 v2 calibration.

It does **not** execute a provider call and does **not** authorize one. Its job is to prove that one exact clean checkout contains the expected frozen design, execution/reliability contracts, runtime wiring, verifier implementations, and operational evidence.

## Frozen final spec

The machine-readable specification is:

- `harness/frozen/p6-3-v2-final-prelive-spec.json`

It freezes:

- calibration-only provenance;
- 864 logical cells;
- mutation `max_output_tokens=14000`;
- Rsem `max_output_tokens=8000`;
- maximum 3 scientific attempts per logical cell;
- the frozen evidence-file set;
- the v2 runtime/source-file set;
- the complete verifier-script set;
- operational evidence files;
- `liveExecutionAuthorized=false`;
- a requirement that the exact checkout SHA be bound only when the receipt is generated from that checkout.

The checkout SHA is intentionally **not embedded into the committed spec**. Doing so would create a self-reference problem because the commit containing that SHA would itself change the SHA. Instead, the final gate resolves `git rev-parse HEAD` from a clean checkout immediately before verification and verifies that the checkout remains unchanged afterward.

## Receipt contents

`runP63V2FinalPreLiveGate()` produces `p6-3-v2-final-prelive-receipt-v1` containing:

- exact checkout Git SHA;
- 864-cell plan confirmation;
- 14000/8000 output caps;
- three-attempt ceiling;
- all final verifier pass results;
- SHA-256 of the final spec;
- SHA-256 of all frozen evidence files;
- SHA-256 of v2 runtime/source files;
- SHA-256 of every verifier source file;
- SHA-256 of operational evidence including the current cost estimate;
- `finalPreLiveGateFrozen=true`;
- `paidLiveAuthorizationRequired=true`;
- `liveAuthorized=false`;
- `providerCallsMade=false`.

## Offline verifier set

The gate re-runs the structural/protocol parity gates plus the complete v2 reliability/execution stack, including:

- structural freeze and invariant hardening;
- execution protocol freeze;
- P6-2 mutation parity;
- Rsem parity and leak-proofing;
- v2 execution-parameter freeze;
- actual-v1 AUTO-INFRA regression;
- unattended retry/exhaustion runner;
- secondary reliability analyzer;
- provider-adapter offline verifier;
- frozen runtime input resolver;
- v2 end-to-end wiring;
- CLI fail-closed verifier.

All spawned verifiers run with provider API keys removed and `P6_3_LIVE_EXECUTION_ALLOWED=0` regardless of the parent process environment.

## CLI boundary after this freeze

The CLI preflight now reports:

- `finalPreLiveGateFrozen=true`;
- `paidLiveAuthorizationRequired=true`;
- `liveExecutionAllowed=false`.

The CLI still does not import the provider executor. Even when `OPENAI_API_KEY` and `P6_3_LIVE_EXECUTION_ALLOWED=1` are externally present, `--live` fails before provider code can be imported with the explicit reason that paid/live authorization is not wired.

This is intentional. Freezing the evidence gate and authorizing paid execution are separate operations.

## Cost evidence

`docs/p6_3_cost_estimate.md` is updated for the v2 14,000-token mutation cap. The normal-run planning estimate remains `$2.35` because API billing uses actual tokens, not configured token ceilings. The document now distinguishes the empirical 3× planning comparison (`~$7.01`) from the much larger cap-based extreme output envelope (`$41.9904` output-only for every logical cell exhausting all three attempts).

## What remains after merge

After this gate is merged, the next step is a **final v2 pre-live audit on the merged main checkout**. That audit should record:

1. the exact merged checkout SHA;
2. the final v2 receipt artifact and its evidence hashes;
3. post-merge CI results;
4. confirmation that `--live` remains fail-closed;
5. confirmation that no paid/live call occurred.

Only after that audit, and only after explicit user authorization in a later turn, may paid/live execution be wired/invoked.
