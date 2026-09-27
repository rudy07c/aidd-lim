# P6-3 EL v2 live calibration cost estimate

**Date:** 2026-09-23  
**Revalidated:** 2026-09-27 against current official GPT-5.6 Luna pricing and the frozen v2 execution envelope  
**Base:** final receipt binds the exact checkout at gate execution time; this document is operational evidence only  
**Scope:** normal P6-3 v2 calibration workload plus retry-envelope interpretation; no live API call is authorized by this document.

## 1. Frozen workload

P6-3 v2 calibration is planned as fresh stateless **Sync** calls with:

- model: `gpt-5.6-luna`
- reasoning effort: `high`
- service tier: `default`
- prompt cache mode: `implicit`
- M: `11 tasks × 12 repeats × 6 arms = 792 logical cells`
- Rsem: `12 repeats × 6 arms = 72 logical cells`
- normal total: **864 logical cells**
- M `max_output_tokens`: **14,000**
- Rsem `max_output_tokens`: **8,000**
- maximum scientific attempts per logical cell: **3**

Infrastructure-invalid replacements are outside the 864-cell normal workload. A logical cell can consume at most three scientific attempts under the frozen v2 execution policy. Reaching that ceiling produces `censored-exhausted`; collection continues, but any exhausted cell blocks `B_expose` selection.

## 2. Current OpenAI pricing snapshot

Official sources rechecked on 2026-09-27:

- <https://developers.openai.com/api/docs/models/gpt-5.6-luna>
- <https://developers.openai.com/api/docs/pricing>

For GPT-5.6 Luna Standard/default short-context text requests, the current model documentation gives:

- ordinary input: **$0.20 / 1M tokens**
- cached input: **$0.02 / 1M tokens**
- cache write: **$0.25 / 1M tokens**
- output: **$1.20 / 1M tokens**

The cache-write rate is 1.25× uncached input. The >272K-input long-context multiplier is not expected to apply to this workload. P6-3 is frozen to Sync execution, so Batch discounts are not used.

## 3. Frozen static-exposure volume

Using the committed P6-3 structural manifest, the six-arm static exposure across all normal logical cells is:

- total actual static-payload exposure: **1,445,664 tokens**
- average: **1,673.22 tokens/cell**
- all-864-cells-at-AF reference: `864 × 4,046 = 3,495,744 tokens`
- P6-3 actual static-exposure ratio vs all-AF: **41.35%**
- reduced static exposure vs all-AF: **2,050,080 tokens**

This concerns only the model-visible repository payload. System instructions, task text, schema overhead, reasoning output, and structured response output are additional.

## 4. Empirical anchor from P6-2

The committed P6-2 AF baseline used the same model (`gpt-5.6-luna`), reasoning=`high`, Sync execution, and AF repository exposure. Its stored estimated cost is:

- **$0.7923262**
- 273 M records + 21 Rsem records = 294 recorded calls
- one M record was an adjudicated infrastructure-invalid HTTP 429 with `usage=0`

Two AF-equivalent scalings are:

- all 294 recorded calls: `$0.7923262 × 864 / 294 = $2.3285`
- 293 usage-bearing calls: `$0.7923262 × 864 / 293 = $2.3364`

So **$2.34** remains the conservative empirical all-AF-equivalent benchmark for one normal 864-cell pass.

The v2 mutation output cap increase from 7,000 to 14,000 does **not** double this expected-cost estimate. API billing is based on tokens actually used, not the configured maximum. The cap change expands the possible tail cost of incomplete/censored attempts; it does not reserve or pre-bill 14,000 output tokens for every M request.

## 5. Exposure-adjusted interpretation

Relative to an all-AF 864-cell workload, P6-3 removes 2,050,080 repository-payload tokens.

If those removed tokens would otherwise be billed entirely as ordinary uncached input:

`2,050,080 × $0.20 / 1,000,000 = $0.4100`

If entirely cached input:

`2,050,080 × $0.02 / 1,000,000 = $0.0410`

Holding non-repository input and output behavior equal to the P6-2 empirical anchor gives an approximate exposure-adjusted range of **$1.93–$2.30**.

This is not a precise forecast because lower-context arms may change reasoning/output length and cache behavior. Actual provider usage and estimated cost must be persisted per attempt.

## 6. Normal-run planning number

For a single normal 864-cell pass, retain:

> **P6-3 v2 normal-run planning estimate: $2.35 USD**

For ordinary operational planning, **$3.00 USD** remains a reasonable one-pass reserve before replacement attempts. This is a planning reserve, not a hard upper bound.

A simple three-attempt empirical scaling of the all-AF usage-bearing benchmark is:

`$2.3364 × 3 = about $7.01`

This **$7.01 figure is not a theoretical maximum**. It is only a 3× empirical-average planning comparison.

## 7. v2 output-cap envelope

Because v2 raises the M output cap to 14,000 while Rsem remains at 8,000, the configured output-token ceilings imply a much larger extreme tail than the empirical average.

If every normal logical cell hit its configured output cap once:

- M: `792 × 14,000 = 11,088,000 output tokens` → **$13.3056**
- Rsem: `72 × 8,000 = 576,000 output tokens` → **$0.6912**
- one-attempt output-only cap contribution: **$13.9968**

If every logical cell consumed all three allowed attempts and every attempt hit its output cap:

- output-only contribution: `3 × $13.9968 = $41.9904`

This is still **not a full monetary upper bound**, because input/cache-write charges would be additional. It is a deliberately pessimistic cap-based output envelope used to prevent the previous `$7.01` empirical scaling from being misread as a theoretical maximum.

The actual experiment is not expected to approach this envelope. Any `max_output_tokens` censoring is separately persisted and summarized by the frozen v2 reliability layer.

## 8. Gate status

This document updates the cost evidence for the frozen v2 execution envelope and current pricing. It does not authorize live execution.

The final v2 pre-live gate separately binds:

- the exact clean checkout SHA at receipt generation time;
- frozen scientific/execution manifests and the actual-v1 AUTO-INFRA fixture;
- v2 runtime/source hashes;
- verifier source hashes and pass results;
- this cost document and other operational evidence.

Paid/live execution remains a separate explicit authorization step after the final pre-live audit.
