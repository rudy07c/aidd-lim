# P6-3 v3 Rsem reliability audit cost estimate

**Date:** 2026-10-03
**Scope:** operational planning for the predeclared Rsem reliability audit only
**Scientific status:** operational evidence for reliability-audit freeze v2; not a scientific endpoint and not a live authorization

## 1. Workload envelope

The audit has two predeclared candidate caps:

```text
32000
64000
```

Each candidate requires at most:

```text
6 arms x 10 valid trials = 60 valid audit trials
```

The 64,000-token candidate is entered only if 32,000 is rejected.

The qualification denominator therefore has a maximum of:

```text
120 valid audit trials
```

Non-cap infrastructure replacement is limited to three attempts per planned trial, giving a deliberately simple control envelope of:

```text
120 x 3 = 360 provider attempts
```

This 360 figure is an execution-control ceiling, not an expected call count.

For audit v2, SDK automatic retries are disabled (`maxRetries=0`), so one controller attempt is not silently expanded by SDK retry behavior. The scientific Rsem retry contract is not changed by this audit-only instrumentation rule.

## 2. Current GPT-5.6 Luna pricing and provider limits

Official OpenAI documentation rechecked on 2026-10-03 gives GPT-5.6 Luna Standard/Sync text pricing:

- input: **$0.20 / 1M tokens**
- cached input: **$0.02 / 1M tokens**
- cache write: **$0.25 / 1M tokens**
- output: **$1.20 / 1M tokens**
- maximum output: **128,000 tokens**

Official reasoning guidance also states that reasoning tokens are billed as output tokens and count toward `max_output_tokens`.

Sources:

- <https://developers.openai.com/api/docs/models/gpt-5.6-luna>
- <https://developers.openai.com/api/docs/guides/reasoning>

The audit remains Sync/default execution; Batch discounts are not used.

## 3. Historical Rsem usage anchor

The completed P6-3 v2 Rsem family used the same model/reasoning family and the same six artifact-exposure arms with an 8,000-token cap.

Provider-reported input tokens in the v2 Rsem records were arm-dependent and deterministic in the observed run:

```text
B0 = 1060
B1 = 1398
B2 = 1882
B3 = 2934
B4 = 4021
AF = 5105
```

The promoted P6-3 v3 diagnostic archive shows that adding the run-fixed `E_fixed` changed the observed B0 Rsem input from the historical 1,060-token shape to 1,303 tokens. The same v3 archive records:

```text
E_fixed model-visible tokens = 147
B0 v3 provider input tokens  = 1303
B1 v3 provider input tokens  = 1615
```

The cost envelope therefore uses a rounded planning input ceiling of:

```text
6000 input tokens / attempt
```

This is above the historical AF input of 5,105 and above the simple v2-AF-plus-observed-v3-overhead reference. It is an operational planning value, not a claim that provider tokenization can never drift.

## 4. Output-cap control envelope

For cost-stop planning, use the deliberately conservative split:

```text
180 attempts at 32,000
180 attempts at 64,000
```

Although the predeclared early-rejection rule normally makes this joint extreme unreachable, it gives a simple upper control envelope.

Configured output capacity represented by that envelope is:

```text
180 x 32000 + 180 x 64000
= 17,280,000 output tokens
```

At $1.20 / 1M output tokens:

```text
17.28 x $1.20 = $20.736
```

This is output-only and assumes every attempt consumes its full candidate cap.

## 5. Conservative input component

To avoid understating the input side, apply the highest current short-context input rate relevant to this workload, the cache-write rate:

```text
$0.25 / 1M input tokens
```

to the rounded 6,000-token planning ceiling for all 360 attempts:

```text
360 x 6000 = 2,160,000 input tokens
2.16 x $0.25 = $0.540
```

The workload is far below the >272K-input long-context threshold, so the documented long-context multiplier is not expected to apply.

## 6. Control-envelope cost and operational stop

Combining the pessimistic configured-output envelope with the conservative input component:

```text
$20.736 + $0.540 = $21.276
```

The operational accumulated-cost ceiling is frozen by the mechanical rule:

```text
ceil control-envelope cost to the next whole USD
```

giving:

```text
operational cost ceiling = $22.00
```

This is not the expected audit cost. Normal completed responses historically used much less than their configured output caps.

The controller must also apply a pre-call projection. Before a call at candidate cap `C`:

```text
projected worst-case attempt cost
  = 6000 x $0.25 / 1M
  + C    x $1.20 / 1M
```

The cost-control total is:

```text
accumulatedEstimatedCostUsd
+ reservedUnknownCostUsd
```

If a provider-visible attempt returns without usable usage/cost accounting, or if a process resumes with a provider attempt left in-flight, the controller cannot know the provider-side billed work exactly. That attempt is therefore conservatively assigned the same candidate-specific projected worst-case cost and added to `reservedUnknownCostUsd`. The reservation remains in the run's control total even after a replacement is adjudicated.

If:

```text
accumulatedEstimatedCostUsd
+ reservedUnknownCostUsd
+ projectedWorstCaseAttemptCostUsd(C)
> 22.00
```

the controller stops before issuing the provider call:

```text
status = needs-audit
reason = operational-cost-ceiling-reached
```

## 7. Interpretation limits

The $22.00 figure is an operational fail-close ceiling derived from:

- the predeclared maximum attempt envelope;
- the two candidate output caps;
- current official pricing;
- a rounded input planning ceiling informed by preserved v2/v3 Rsem provider usage.

It is not a theoretical guarantee on provider billing under every future pricing or tokenization change.

Actual usage and estimated cost must be persisted for each completed provider-visible attempt. Interrupted attempts without recoverable usage are represented by conservative reserved cost instead of being treated as free.

A pricing/model/runtime change requires a new versioned operational evidence update before paid execution.

This document does not authorize paid/live calls.
