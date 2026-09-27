# P6-3 v2 secondary reliability freeze

**Status:** preregistered secondary reliability measurement; no paid/live execution authorized by this document  
**Parent execution freeze:** `docs/p6_3_v2_execution_parameter_audit.md`  
**Machine implementation:** `harness/src/p6/p6-3-v2-secondary-reliability.ts`

## 1. Purpose

P6-3 v1 exposed a measurement-reliability issue: provider-reported `max_output_tokens` censoring can occur during mutation calls. The v1 observations motivate measurement of censoring and token usage, but they remain exploratory only. This document fixes the v2 secondary reliability measurement before any v2 live data are collected.

These outcomes do not replace primary M or Rsem. They describe the behavior of the execution envelope and make missing scientific observations observable rather than silently conditioning analysis on attempts that happened to complete.

## 2. Provider-visible attempts are retained

Secondary reliability summaries preserve every provider-visible scientific attempt.

For committed attempts this includes:

- successful scientific observations;
- semantic or protocol outcomes;
- deterministic `infrastructure-invalid` replacement attempts;
- attempts belonging to a logical cell that later becomes `censored-exhausted`.

An uncertain in-flight attempt whose provider call may have occurred but whose result was not committed is also retained as an interrupted attempt. It has no invented artifact or token usage and is censoring-unclassifiable.

No valid-only filtering is permitted for censoring or token-usage summaries.

## 3. Per-attempt persistence

Every committed v2 attempt used by the unattended runner persists a versioned reliability envelope around the original scientific artifact payload. The envelope contains:

- sequence, measurement, task, repeat, arm and attempt identity;
- provider-reported output tokens;
- provider-reported reasoning-output tokens where available;
- provider-reported input and total tokens where available;
- configured max output tokens;
- raw incomplete reason;
- the original scientific artifact payload unchanged inside the envelope.

Token telemetry fields are required to be present in the schema but may be `null` when the provider did not report them. Missing values are never converted to zero.

If automatic-infrastructure raw evidence is present, its execution status, output-token count, configured cap, and incomplete reason must agree with the reliability envelope. Identity or telemetry mismatch is fail-closed.

## 4. Secondary max-output censoring is distinct from AUTO-INFRA-001

The secondary endpoint asks whether the provider reported max-output censoring. It is deliberately broader than the unattended adjudication rule.

For a committed attempt:

```text
executionStatus == response-incomplete
AND incompleteReason == max_output_tokens
=> maxOutputCensored = true
```

If `response-incomplete` has another explicit reason, `maxOutputCensored = false`.

If `response-incomplete` has no reason, or an incomplete reason appears with a contradictory non-incomplete status, then:

```text
maxOutputCensored = null   # unclassifiable
```

A normal non-incomplete status with no incomplete reason is `false`.

This differs from `AUTO-INFRA-001`, which additionally requires provider-reported output usage to equal the configured max-output cap before unattended `infrastructure-invalid` adjudication. Secondary reliability measurement must not erase the provider-observed censoring phenomenon merely because the stricter automatic-adjudication evidence is incomplete.

A committed `maxOutputCensored=true` attempt must still have effective failure domain `infrastructure`; otherwise the analyzer fails closed.

## 5. Logical-cell outcomes

For every planned logical cell, the analyzer records:

- committed attempt count;
- interrupted attempt count;
- total provider-visible attempt count;
- tri-state any-max-output-censoring;
- attempts-to-valid-scientific-observation;
- whether the cell ended `censored-exhausted`.

Cell censoring is aggregated conservatively:

```text
any true       => true
no true + null => null
all false      => false
no evidence    => null
```

A scientific observation is the first committed attempt whose effective failure domain is one of:

```text
none / semantic / protocol / system
```

`infrastructure` and `other` do not count as scientific observations.

For a terminal completed collection, a logical cell with provider-visible attempts but neither a scientific observation nor a recorded exhaustion is an integrity error.

## 6. Censoring-rate denominators

Censoring rates use only classifiable observations as denominators.

For each arm, report separately:

- committed attempts;
- interrupted attempts;
- total provider-visible attempts;
- censoring-classifiable attempts;
- censoring-unclassifiable attempts;
- max-output-censored attempts;
- attempt censoring rate = censored attempts / classifiable attempts;
- attempted logical cells;
- censoring-classifiable logical cells;
- censoring-unclassifiable logical cells;
- logical cells with any censoring;
- logical-cell censoring rate = censored cells / classifiable cells.

Interrupted attempts therefore remain visible but are not silently placed in the non-censored denominator.

No arm is omitted because its count is zero.

## 7. M task × arm summaries

For M only, every task × arm combination is reported using the same classifiable/unclassifiable denominator rules at both attempt and logical-cell levels.

This is descriptive reliability analysis. It does not preregister a monotonicity test, B1-specific test, bimodality claim, or any other confirmatory arm-pattern hypothesis.

## 8. Token distributions and missing values

Per-arm token summaries retain sorted raw observed points plus:

- minimum;
- Q25;
- Q50;
- Q75;
- maximum;
- observed count;
- missing count.

Quantiles use the frozen rule:

```text
nearest-rank-q25-q50-q75-v1
rank(p) = max(1, ceil(p * n))
```

No mean is part of the preregistered primary reliability summary. The v1 exploratory run showed very large within-arm token variation, so raw distributions/ranges/quantiles are retained rather than reducing the endpoint to an average.

Missing provider token fields increase `missing`; interrupted attempts also contribute missing token telemetry. Neither is converted to zero or dropped.

## 9. Exhausted-cell reporting and selection gate

Every `censored-exhausted` cell is listed by sequence, measurement, task, repeat, arm and attempt count without post-hoc removal.

This secondary summary does not relax the primary selection gate:

```text
any exhausted logical cell
=> collection may finish
=> status = needs-design-audit
=> B_expose selection prohibited
```

## 10. Integrity gates

The analyzer fails closed on at least:

- duplicate sequence/attempt identities;
- missing committed attempt artifact;
- wrong reliability-artifact schema;
- mismatch between state identity and artifact identity;
- malformed token telemetry;
- disagreement between recorded automatic-infrastructure raw evidence and persisted telemetry;
- provider max-output censoring whose effective failure domain is not infrastructure;
- interrupted attempt referring to an unknown plan sequence;
- terminal attempted cell with neither scientific observation nor exhaustion.

## 11. Offline verification before live use

`verify:p6-3-v2-secondary-reliability` verifies:

1. the tri-state censoring truth table;
2. one censored attempt followed by a valid scientific observation;
3. three censored attempts ending `censored-exhausted`;
4. a valid observation with missing reasoning-token telemetry;
5. a `response-incomplete` attempt with missing reason remaining unclassifiable and excluded from censoring-rate denominators;
6. an uncertain in-flight provider-visible attempt remaining visible as interrupted, with missing token telemetry and unclassifiable censoring;
7. telemetry/AUTO-INFRA evidence mismatch failing closed;
8. attempt-artifact identity mutation failing closed;
9. the preserved v1 fixture remaining a regression-only input: all 43 archived attempts are inspected and the 11 provider-reported `max_output_tokens` events are reproduced, without treating v1 as confirmatory arm evidence.

## 12. Remaining live boundary

Paid/live P6-3 v2 execution remains blocked. A later PR must wire this reliability wrapper into a v2-only live executor/CLI using the frozen v2 execution contract, persist the final reliability report, and pass a final pre-live gate bound to the exact checkout and manifest hashes.
