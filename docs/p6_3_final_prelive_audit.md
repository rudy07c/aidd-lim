# P6-3 final pre-live audit

**Date:** 2026-09-26  
**Audited runner base:** `main@6a8f92636c8bd82af2b496e8c848f81d08bc20a2` (PR #13 merged)  
**Status:** offline pre-live audit; paid/live execution remains unauthorized

## 1. Purpose

This audit binds the frozen P6-3 scientific design to the merged live-calibration runner checkout immediately before any paid/live calibration call.

It does not contain P6-3 M or Rsem outcomes and does not authorize provider execution.

## 2. Merged runner evidence

PR #13 (`Integrate P6-3 live calibration runner`) merged into `main` as:

- merge commit: `6a8f92636c8bd82af2b496e8c848f81d08bc20a2`
- runner PR head: `651b96bbf63f7f7f51f4c349356faf65f2fbf29a`
- PR review findings addressed before merge:
  - interrupted `inFlight` attempts are journaled as consumed attempts and require explicit audited recovery;
  - unclassified outcomes have an explicit adjudication path without weakening P6-2 M/Rsem disposition semantics.

Pre-merge CI on the final PR head passed all five relevant workflows, including the dedicated live-runner offline verifier and real CLI dry path.

Post-merge push CI evidence on the merged runner checkout:

- P6-3 Live Calibration Runner Offline #17 — **success** (`36223673002`)
- P6-3 Unified Pre-Live Gate #38 — **success** (`36223672927`)
- P6-3 Mutation Protocol Parity #66 — **success** (`36223672952`)
- P6-3 Rsem Protocol Parity #52 — **success** (`36223672914`)
- Harness CI #531 — must be **success** before this audit PR is merged and before paid/live authorization is considered.

## 3. Frozen workload and execution semantics

The merged runner constructs exactly:

- M: `11 × 12 × 6 = 792` logical cells;
- Rsem: `12 × 6 = 72` logical cells;
- total normal workload: **864 logical cells**.

Execution remains:

- model: `gpt-5.6-luna`;
- reasoning effort: `high`;
- fresh stateless **Sync** calls;
- six-arm forward/reverse cyclic counterbalancing;
- contiguous six-arm task/repeat blocks;
- `B0..B4` through frozen EL static exposure;
- AF through the direct full-repository path;
- P6-2 mutation protocol parity and P6-2 Rsem protocol parity;
- max 3 scientific attempts per logical cell, with same-cell replacement only after explicit `infrastructure-invalid` adjudication.

The runner persists an `inFlight` marker before provider execution. A crash with an uncertain call does not blindly repeat it: the attempt is journaled as consumed, requires explicit audit resolution, and counts toward the 3-attempt ceiling.

## 4. Calibration-only provenance

P6-3 output is explicitly marked:

- `runClass="scientific-calibration"`;
- `calibrationOnly=true`;
- `confirmatoryStage1AEligible=false`.

P6-3 results therefore cannot be silently reused as Stage 1A confirmatory evidence.

## 5. Cost snapshot revalidation

OpenAI's official GPT-5.6 Luna model page was rechecked on 2026-09-26. Standard short-context text pricing remains:

- input: **$0.20 / 1M tokens**;
- cached input: **$0.02 / 1M tokens**;
- cache write: **$0.25 / 1M tokens**;
- output: **$1.20 / 1M tokens**.

Official source:

- <https://developers.openai.com/api/docs/models/gpt-5.6-luna>

The July 30, 2026 OpenAI API changelog records the GPT-5.6 Luna price reduction reflected in these rates:

- <https://developers.openai.com/api/docs/changelog>

The previously recorded empirical estimate therefore remains valid for planning:

- normal 864-call estimate: **$2.35 USD**;
- normal-run reserve: **$3.00 USD**;
- rough theoretical 3-attempt envelope: **about $7.01 USD**, not an expected cost.

Actual usage/cost is persisted per scientific attempt by the runner.

## 6. Paid/live authorization boundary

The merged runner still requires all of the following before it can enter provider execution:

1. `--live`;
2. `--authorize-paid-live=P6-3`;
3. `P6_3_LIVE_EXECUTION_ALLOWED=1`;
4. `OPENAI_API_KEY`.

The unified pre-live gate itself always returns `liveAuthorized=false` and therefore cannot self-authorize paid execution.

## 7. Final gate disposition

Once Harness CI #531 on `main@6a8f92636c8bd82af2b496e8c848f81d08bc20a2` is confirmed successful and this documentation-only audit is merged, the remaining gate is **explicit user authorization to start the paid/live P6-3 calibration**.

No paid/live API call is authorized by this audit document.
