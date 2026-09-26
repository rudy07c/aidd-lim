# P6-3 EL live calibration cost estimate

**Date:** 2026-09-23  
**Revalidated:** 2026-09-26 against current official GPT-5.6 Luna pricing; rates and planning estimate unchanged  
**Base:** `main@d704d212c9385b2189f152665cb0e1e3cc91f376`  
**Scope:** normal P6-3 calibration workload only; no live API call is authorized by this document.

## 1. Frozen workload

P6-3 live calibration is planned as fresh stateless **Sync** calls with:

- model: `gpt-5.6-luna`
- reasoning effort: `high`
- service tier: `default`
- prompt cache mode: `implicit`
- M: `11 tasks × 12 repeats × 6 arms = 792 calls`
- Rsem: `12 repeats × 6 arms = 72 calls`
- normal total: **864 calls**

Infrastructure-invalid replacements are outside the 864-call normal workload and remain bounded by the separately predeclared max-attempt rule.

## 2. Current OpenAI pricing snapshot

Sources checked on 2026-09-23 and revalidated on 2026-09-26:

- <https://developers.openai.com/api/docs/pricing>
- <https://developers.openai.com/api/docs/models/gpt-5.6-luna>

For GPT-5.6 Luna Standard/Sync short-context requests, prices per 1M tokens are:

- ordinary input: **$0.20**
- cached input: **$0.02**
- cache write: **$0.25**
- output: **$1.20**

The repository estimator in `harness/src/agent-backend/openai/shared.ts` uses the same rates. Batch's 50% discount is not applicable because P6-3 is frozen to Sync execution. The >272K-input long-context multiplier is also not expected to apply to this workload.

## 3. Frozen static-exposure volume

Using the committed P6-3 structural manifest, the six-arm static exposure across all normal calls is:

- total actual static-payload exposure: **1,445,664 tokens**
- average: **1,673.22 tokens/call**
- all-864-calls-at-AF reference: `864 × 4,046 = 3,495,744 tokens`
- P6-3 actual static-exposure ratio vs all-AF: **41.35%**
- reduced static exposure vs all-AF: **2,050,080 tokens**

This reduction concerns only the model-visible repository payload. System instructions, task text, schema overhead, reasoning output, and structured response output are additional.

## 4. Empirical anchor from P6-2

The committed P6-2 AF baseline used the same model (`gpt-5.6-luna`), reasoning=`high`, Sync execution, and AF repository exposure. Its stored estimated cost is:

- **$0.7923262**
- 273 M records + 21 Rsem records = 294 recorded calls
- one M record was an adjudicated infrastructure-invalid HTTP 429 with `usage=0`

Two simple AF-equivalent scalings are therefore:

- using all 294 recorded calls: `$0.7923262 × 864 / 294 = $2.3285`
- using 293 usage-bearing calls: `$0.7923262 × 864 / 293 = $2.3364`

So **$2.34** is a conservative empirical all-AF-equivalent benchmark for the normal 864-call workload.

## 5. Exposure-adjusted interpretation

P6-3 does not expose AF-sized repository context on every arm. Relative to an all-AF 864-call workload, it removes 2,050,080 repository-payload tokens.

If those removed tokens would otherwise be billed entirely as ordinary uncached input, the direct input saving is:

`2,050,080 × $0.20 / 1,000,000 = $0.4100`

If they would otherwise be entirely cached input, the saving is only:

`2,050,080 × $0.02 / 1,000,000 = $0.0410`

Holding non-repository input and output behavior equal to the P6-2 empirical anchor gives an approximate exposure-adjusted range of **$1.93–$2.30**.

This range is not treated as a precise forecast because lower-context arms may change output/reasoning length and prompt-cache hit patterns. The runner must record actual API usage and estimated cost per call.

## 6. Pre-live planning number

For the frozen 864-call normal workload, use:

> **P6-3 normal-run cost estimate: $2.35 USD**

This deliberately rounds the conservative AF-equivalent empirical benchmark upward rather than assuming the expected static-exposure savings will fully materialize.

For operational budgeting, **$3.00 USD** is a reasonable normal-run reserve before infrastructure-invalid replacements. The theoretical max-attempt envelope is much larger: if every logical cell consumed all 3 allowed billable attempts at the AF-equivalent average cost, the rough 3× envelope would be about **$7.01 USD**. This is an operational worst-case envelope, not the expected P6-3 cost.

## 7. Gate status

This document satisfies the `current 864-call cost estimate` item in the P6-3 pre-live checklist only. The merged runner and final pre-live audit are tracked separately. This document does **not** authorize live execution.
