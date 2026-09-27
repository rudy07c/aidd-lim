# P6-3 v2 final pre-live audit

**Date:** 2026-09-27  
**Audited merged checkout:** `main@c23f492b993506afb5bdfb57ba80422c1235f7e4`  
**Status:** final v2 offline pre-live audit complete; paid/live provider execution remains unauthorized

## 1. Purpose

This audit records the final evidence state of P6-3 v2 immediately after the final offline pre-live evidence gate was merged to `main`.

It binds the merged checkout, post-merge CI, and the final v2 receipt artifact into one human-readable audit record. It contains no P6-3 v2 M or Rsem scientific outcomes and does not authorize a provider call.

The historical v1 audit remains separately preserved in `docs/p6_3_final_prelive_audit.md`. This document is v2-only.

## 2. Merged checkout

PR #29 (`Freeze P6-3 v2 final pre-live evidence gate`) merged into `main` as:

- merge commit: `c23f492b993506afb5bdfb57ba80422c1235f7e4`;
- PR head: `a5384ff6348b2f4fe9cadc8476510338f142964a`;
- previous `main`: `916fa8577ef45ee9bc4d0ba6ad14a526fe9d53cb`.

The merge commit contains the same tree as the reviewed PR head. The final gate therefore executes against the reviewed v2 final-pre-live implementation while binding the actual merged-main checkout SHA at receipt generation time.

## 3. Post-merge CI evidence

All seven push-triggered workflows on `main@c23f492b993506afb5bdfb57ba80422c1235f7e4` completed successfully:

- P6-3 Mutation Protocol Parity #207 — **success** (`36319312261`)
- P6-3 Rsem Protocol Parity #193 — **success** (`36319312305`)
- P6-3 v2 CLI Dry Gate #14 — **success** (`36319312263`)
- P6-3 v2 End-to-End Offline #13 — **success** (`36319312229`)
- P6-3 Live Calibration Runner Offline #141 — **success** (`36319312247`)
- Harness CI #679 — **success** (`36319312342`)
- P6-3 Unified Pre-Live Gate #179 — **success** (`36319312370`)

The unified pre-live workflow additionally confirms, on the merged checkout:

1. harness typecheck passed;
2. the legacy unified P6-3 gate passed;
3. the final P6-3 v2 pre-live gate passed;
4. the legacy receipt was uploaded;
5. the final v2 receipt was uploaded.

No paid/live provider call is part of any of these workflows.

## 4. Final merged-main receipt

The final receipt was produced by P6-3 Unified Pre-Live Gate run `36319312370` and uploaded as:

- artifact name: `p6-3-v2-final-prelive-receipt`;
- artifact ID: `10931886249`;
- artifact digest: `sha256:daeaa0845eb7b9d7823501861949f9bdd7468563c3ad46f9893bafd0d01c443c`.

The receipt records:

- `schemaVersion = p6-3-v2-final-prelive-receipt-v1`;
- `gateVersion = p6-3-v2-final-prelive-gate-v1`;
- `checkoutGitSha = c23f492b993506afb5bdfb57ba80422c1235f7e4`;
- `calibrationOnly = true`;
- `confirmatoryStage1AEligible = false`;
- `totalLogicalCells = 864`;
- mutation `maxOutputTokens = 14000`;
- Rsem `maxOutputTokens = 8000`;
- `maxScientificAttemptsPerLogicalCell = 3`;
- `preflightPassed = true`;
- `finalPreLiveGateFrozen = true`;
- `paidLiveAuthorizationRequired = true`;
- `liveAuthorized = false`;
- `providerCallsMade = false`.

All **15/15** final verifier entries in the receipt are `pass`.

## 5. Evidence hashes bound by the receipt

Final pre-live specification:

- `harness/frozen/p6-3-v2-final-prelive-spec.json`
  - SHA-256: `b7d20afd14a39d98f0350b8c63c2269ba41477d91ead6e13907e7347fd1e7344`

Frozen evidence:

- `harness/frozen/p6-3-el-structural-freeze.json`
  - `2f26b34f112b4b1ffcf9fd979cdafff20c146bc4236f4a26d5fa72f3ec5f5196`
- `harness/frozen/p6-3-execution-protocol.json`
  - `ea72d6461a3ba1589a221864e8f9b9dc57174bbbf1bba9e87a77c26474c43408`
- `harness/frozen/p6-3-mutation-protocol-parity.json`
  - `fb5c87779390204ad2555ee9390ef5ebe27884a01a983ba16833e00541e4a840`
- `harness/frozen/p6-3-rsem-protocol-parity.json`
  - `134e742db585ca3d196016567a61bb8d8cd3a6e0ca66918befd85be5f9aa1e96`
- `harness/frozen/p6-3-v1-auto-infra-regression.json`
  - `87ba46009a9b7753defed9d2f01b49b58c9e0f30ed69efb8290ab28755e56677`
- `harness/frozen/p6-3-v2-execution-parameters.json`
  - `903f33aa46c8e5cd50871aa1ad6867eb48a6e66b75bba2a2c341d22d1b487a1d`

Operational evidence:

- `docs/p6_3_cost_estimate.md`
  - `5180b25ceb55bf5e903f6252954099858844d90511fe88a270b91a789ef001aa`
- `docs/p6_3_v2_design_audit.md`
  - `081625e1035a41b95a66944eb74d7001bf0867aec1f671ba4fed0fb23146a5d3`
- `docs/p6_3_v2_end_to_end_wiring.md`
  - `0ccbbd47721a2ffb18d08e7a970bdb5c1a199a2571a981ad7bf0a289936f5f8e`

The receipt additionally binds SHA-256 hashes for all ten v2 runtime/source files and all fifteen verifier source files. The receipt artifact is the canonical machine-readable list for those per-file hashes.

## 6. Scientific and execution boundary

This audit does not alter any scientific design variable or v2 reliability rule. In particular, it leaves unchanged:

- `T_EL = 4046`;
- EL budget grid `0 / 505 / 1011 / 2023 / 3034 / 4046`;
- static-exposure unit size `256`;
- six-arm counterbalancing and 864-cell plan;
- P6-2-compatible M mutation semantics;
- P6-2-compatible Rsem semantics;
- AUTO-INFRA-001 classification semantics;
- three-scientific-attempt ceiling;
- `censored-exhausted-and-continue` collection behavior;
- any-exhausted-cell blocks `B_expose` selection;
- preregistered secondary reliability endpoints and summaries.

P6-3 v2 remains a calibration-only run and is not Stage 1A confirmatory evidence.

## 7. CLI fail-closed status

The merged CLI remains intentionally dry-only with respect to paid/provider execution.

The post-merge **P6-3 v2 CLI Dry Gate #14** passed while explicitly testing the fail-closed boundary. The CLI preflight reports:

- `finalPreLiveGateFrozen = true`;
- `paidLiveAuthorizationRequired = true`;
- `liveExecutionAllowed = false`.

The CLI does not import the v2 provider executor. Supplying a fake `OPENAI_API_KEY` together with `P6_3_LIVE_EXECUTION_ALLOWED=1` does not open the path: `--live` still fails before provider code can be imported.

Therefore the merged-main audited state has no paid/live execution path and no provider call occurred during this audit.

## 8. Cost evidence

The v2 cost document was revalidated on 2026-09-27 against the then-current official GPT-5.6 Luna pricing used by the project:

- ordinary input: `$0.20 / 1M tokens`;
- cached input: `$0.02 / 1M tokens`;
- cache write: `$0.25 / 1M tokens`;
- output: `$1.20 / 1M tokens`.

The frozen v2 operational interpretation is:

- normal 864-cell planning estimate: **$2.35 USD**;
- ordinary one-pass operational reserve: **$3.00 USD**;
- empirical 3× average-cost comparison: **about $7.01 USD** — not a theoretical maximum;
- extreme three-attempt output-cap envelope: **$41.9904 USD output-only**, with input/cache-write charges additional.

Configured `max_output_tokens` is a ceiling, not a reservation of billable output tokens, so the 14,000-token mutation cap does not by itself double the expected normal-run cost.

## 9. Final disposition

The final v2 offline pre-live evidence gate is merged, the exact merged-main checkout is bound by the final receipt, all seven post-merge workflows are green, the CLI remains fail-closed, and no paid/live provider call has occurred.

Accordingly, the implementation is now at the boundary immediately before a separate paid/live authorization and wiring step.

This audit **does not itself authorize that step**.

Any later change that wires or otherwise changes the paid/live execution path changes the audited checkout. Before any provider call, the final v2 pre-live gate must therefore be re-run on that exact post-wiring clean checkout and a new receipt must bind that checkout. Paid/live execution may occur only after explicit user authorization in the current interaction and successful re-gating of the exact code that would perform the calls.
