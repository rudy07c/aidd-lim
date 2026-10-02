# P6-3 v3 Rsem reliability audit predeclaration

**Status:** complete pre-live reliability-audit design freeze; paid/provider execution is not authorized by this document  
**Run class:** `reliability-audit`  
**Machine-readable freeze:** `harness/frozen/p6-3-v3-rsem-reliability-audit.json`

## 1. Purpose and boundary

The incomplete P6-3 v3 live calibration established an execution-reliability failure in the frozen Rsem envelope:

```text
maxOutputTokens = 8000
reasoningEffort = high
```

At logical sequence 793, all three allowed attempts returned `response-incomplete / max_output_tokens`, each with exactly 8,000 output tokens and exactly 8,000 reasoning tokens, and no usable scientific response.

This audit exists only to answer:

> What predeclared Rsem `maxOutputTokens` envelope can complete the existing P6-3 v3 Rsem measurement path without exact-cap censoring under a balanced reliability qualification?

This is not a scientific calibration. Audit calls are never pooled into:

- primary Rsem denominators;
- `B_expose` selection;
- the P6-3 M/Rsem co-gate;
- Stage 1A confirmatory evidence.

The stopped v3 calibration remains immutable diagnostic evidence and is not resumed by this audit.

## 2. Variable changed

Only one provider parameter is varied:

```text
Rsem maxOutputTokens
```

The following remain fixed:

- model: `gpt-5.6-luna`;
- reasoning effort: `high`;
- request timeout: `180000 ms`;
- provider SDK retries: `2`;
- service tier: `default`;
- prompt-cache mode: `implicit`;
- response storage: `false`;
- Sync execution;
- v3 Rsem prompt/instructions;
- the frozen 12-probe bank;
- structured-output schema shape;
- parser/structural-validity requirements;
- run-fixed `E_fixed`;
- final artifact selector;
- B0/B1/B2/B3/B4/AF context construction.

No budget point is retuned because the diagnostic stop happened at B1.

## 3. Candidate cap ladder

The candidate ladder is frozen before new audit outcomes:

```text
32000 -> 64000
```

The prior failed 8,000-token cap is not retested.

OpenAI's reasoning guidance recommends reserving at least 25,000 tokens for reasoning and outputs when first experimenting with reasoning models. The first audit candidate is therefore not the mechanical 16,000-token doubling from 8,000. Instead, 32,000 is the smallest binary headroom candidate above that external guidance threshold.

The provider currently documents a 128,000-token maximum output for GPT-5.6 Luna. That technical maximum is recorded as provenance only. It is not an automatic escalation target.

If 64,000 is rejected, the audit stops:

```text
status = needs-design-audit
reason = hard-audit-cap-censored
```

There is no automatic 128,000-token test or amendment. Requiring more than 64,000 tokens for this 12-boolean-probe measurement is treated as evidence that the Rsem prompt/executor/measurement construction itself requires design review.

External references checked before this freeze:

- <https://developers.openai.com/api/docs/models/gpt-5.6-luna>
- <https://developers.openai.com/api/docs/guides/reasoning>

## 4. Balanced audit sample

For each candidate cap:

```text
6 arms x 10 valid audit trials = 60 valid trials
```

The arms are:

```text
B0 B1 B2 B3 B4 AF
```

Each arm contributes exactly 10 valid trials.

The order is the first 10 balanced blocks of the already-frozen P6-3 execution schedule. The audit does not assume that artifact budget and censoring risk are monotonic. In particular, it does not test only B1 and does not treat AF as the unique worst case.

Across both candidates the maximum qualification denominator is:

```text
120 valid audit trials
```

This denominator is distinct from provider attempts.

## 5. Candidate acceptance and rejection

A candidate qualifies only when all 60 planned balanced audit trials produce valid audit observations and:

```text
exact-cap max_output_tokens censoring = 0 / 60
```

The first exact-cap censoring event rejects the current candidate immediately. The remaining trials at that candidate need not be collected.

The escalation rule is fixed:

```text
32000 rejected -> evaluate 64000
64000 rejected -> needs-design-audit
```

The audit does not interpolate a new cap, choose a value based on semantic performance, or retune the trial count after observing outcomes.

### Statistical interpretation

The `0/60` rule is an operational qualification criterion, not a proof that the true censoring probability is below 5%.

Under an independent Bernoulli approximation, a true censoring rate of 5% would yield zero censoring events in 60 trials with probability:

```text
0.95^60 ~= 0.0461
```

The exact one-sided 95% upper bound after 0/60 is about 4.87%.

Provider calls are not asserted to be iid, so these calculations motivate the qualification size but are not promoted into a stronger probability claim.

## 6. Non-cap infrastructure events

The following do not count as evidence that a candidate cap is insufficient:

- timeout;
- HTTP 429;
- 5xx/provider error;
- refusal;
- other incomplete/provider states that do not meet the exact-cap censoring predicate.

Such an event transitions the audit to `needs-audit`. A human adjudication is required before the same planned trial may be replaced.

At most three provider-visible attempts are permitted for one planned audit trial.

```text
maxAttemptsPerPlannedTrial = 3
```

If replacement would require a fourth attempt, the audit remains `needs-audit`.

An interrupted/in-flight call is not blindly repeated. It must be treated as a consumed attempt and resolved explicitly before continuation.

## 7. Exact-cap censoring predicate

A provider response counts as cap censoring only when all of the following are true:

```text
response status        != completed
incomplete reason      == max_output_tokens
provider output tokens == configured candidate cap
```

This is an execution-reliability event, not a semantic failure.

## 8. Semantic firewall

The cap decision path may consume only operational fields such as:

- response status;
- incomplete reason;
- configured candidate cap;
- provider-reported input/output/reasoning/total tokens;
- structural output validity;
- attempt/trial/arm identity;
- estimated cost.

The cap decision path must not consume:

- `booleanCorrect`;
- `booleanAccuracy`;
- semantic score;
- probe correctness;
- arm-level Rsem differences.

Raw structured output may be preserved in an attempt artifact for provenance, but the controller state and cap analyzer receive only a decision record that excludes semantic correctness fields.

Completed output is checked only for structural validity: exact probe IDs must be present and every answer must be exactly `"true"` or `"false"`. No answer is compared with a correct answer inside the audit path.

## 9. Cost and call boundary

Qualification denominator and provider-call envelope are intentionally separate:

```text
maximum valid audit trials = 120
maximum attempts/trial     = 3
control-envelope attempts  = 360
```

Operational cost evidence is frozen separately in:

`docs/p6_3_v3_rsem_reliability_audit_cost_estimate.md`

The machine-readable audit contract freezes:

```text
accumulated estimated cost ceiling = USD 22.00
```

Before each provider call, the controller must check whether accumulated estimated cost plus the candidate-specific projected worst-case attempt cost would exceed that ceiling. If so, it stops before the call as `needs-audit`.

Cost is an operational stop only. It is not a scientific or cap-selection endpoint.

## 10. Authorization boundary

This predeclaration does not authorize paid/provider execution.

Before a paid audit begins, the repository must have:

1. this predeclaration merged;
2. the machine-readable freeze merged;
3. the cost estimate merged;
4. plan/executor/controller/analyzer implementation merged;
5. provider-free verifiers passing;
6. a final pre-live gate receipt binding the exact clean checkout and all relevant source/frozen/operational evidence;
7. separate explicit paid/live authorization.

No result from the stopped scientific calibration may be changed or resumed as part of this audit.
