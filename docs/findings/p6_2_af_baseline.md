# P6-2 Artifact-Full baseline completion record

**Status:** COMPLETED / PASSED  
**Date:** 2026-09-22  
**Model:** `gpt-5.6-luna`  
**Reasoning:** `high`  
**Condition:** Artifact-Full (`AF`)  
**Scientific repeats:** `N=21`  
**Source git SHA:** `0a0fd1a262c2e4274f1b946562c9b4e79f6fb71b`  
**Evidence:** `docs/findings/evidence/p6-2-af-baseline/result.json`  
**Evidence SHA-256:** `b7b0e3f9598b034548b8466258a0aae54916fcdfa2ef0f53f9f85636272c7801`

## 1. What was executed

P6-2 was run only after the P6-2 task-selection amendment, fresh variance pilot, M-side independence audit, and formal repeat freeze were complete.

The committed manifest fixes:

- baseline version: `p6-2-af-baseline-v7-repeat21-freeze`
- task bank version: `p6-1-full-task-bank-v3-postflight-coverage`
- task selection version: `p6-2-task-selection-v2-postpilot-low-headroom-frozen`
- primary M bank: 11 tasks
- eligible diagnostic M bank: 2 tasks
- `T-crosscut-5`: `post-pilot-low-headroom`, excluded from primary M but **not** relabeled historical `semantic-floor`
- `Delta_M = 1/11`
- `Delta_R = 1/12`
- alpha: `0.05`
- equivalence CI level: `0.90`
- exact paired-TOST target power: `0.80`
- frozen common repeat count: `21`

The fresh variance-pilot observations were not pooled into this baseline.

## 2. Primary M baseline

The 11 primary tasks were each executed 21 times, for **231 planned primary M observations**.

| metric | result |
|---|---:|
| task count | 11 |
| total repeats | 231 |
| scientifically valid repeats | 231 |
| audit-excluded repeats | 0 |
| passed | 217 |
| failed | 14 |
| pass rate | **0.9393939394** |
| semantic failures | 0 |
| protocol failures | 14 |
| system failures | 0 |
| infrastructure failures | 0 |

Thus the formal AF primary M baseline is:

\[
\hat M_{AF}=\frac{217}{231}=0.9393939394.
\]

All 14 primary failures were classified as `protocol`, not `semantic`. Under the predeclared P6-2 M semantics, protocol failures remain end-to-end modification failures in the scientific denominator while also being reported separately as protocol-reliability diagnostics.

The primary bank therefore remained fully scientifically evaluable: no primary repeat was removed because of provider, harness, system, or unresolved audit failure.

## 3. Diagnostic M baseline

The 2 eligible diagnostic tasks were also scheduled for 21 repeats each.

| metric | result |
|---|---:|
| task count | 2 |
| total repeats | 42 |
| scientifically valid repeats | 41 |
| audit-excluded repeats | 1 |
| passed | 36 |
| pass rate among scientifically valid repeats | **0.8780487805** |
| protocol failures | 5 |
| infrastructure-invalid | 1 |

The single infrastructure-invalid observation was `T-invariant-stress-3`, repeat 19.

## 4. Infrastructure interruption and adjudication

During diagnostic M execution, `T-invariant-stress-3` repeat 19 returned:

- execution status: `provider-error`
- HTTP/provider reason: `429 You have no credits remaining`
- `actualModel = null`
- input/output/total usage = `0`
- no modified paths

This occurred before model execution and therefore did not constitute evidence about task capability. The repeat was explicitly adjudicated with:

- final disposition: `infrastructure-invalid`
- adjudication version: `p6-2-adjudication-v1`
- reviewer: `human-review`

After adjudication, the same run was resumed rather than starting a replacement baseline. The audit flag was resolved and the remaining diagnostic and Rsem measurements completed. The final result has **zero unresolved audit flags**.

Because the invalid repeat was diagnostic rather than primary, the formal primary M bank remains 231/231 scientifically valid.

## 5. Rsem AF baseline

`stage1-neutral-relation-v2` was evaluated with 12 balanced boolean probes over 21 repeats.

| metric | result |
|---|---:|
| repeats | 21 |
| probes per repeat | 12 |
| total probe judgments | 252 |
| correct | 235 |
| semantic accuracy on protocol-valid repeats | **0.9325396825** |
| protocol-evaluable repeats | 21 |
| protocol-valid repeats | 21 |
| protocol failures | 0 |
| protocol reliability | **1.0** |

Thus:

\[
\hat R^{sem}_{AF}=\frac{235}{252}=0.9325396825.
\]

All Rsem repeats were protocol-valid. Four repeats scored 12/12 and the remaining seventeen scored 11/12, so the measure is high but not identically saturated at 1.0.

## 6. Combined failure-domain accounting

Across primary and diagnostic M observations, the final stored failure-domain counts are:

| domain | count |
|---|---:|
| none | 253 |
| semantic | 0 |
| protocol | 19 |
| system | 0 |
| infrastructure | 1 |
| other | 0 |

The infrastructure count is the resolved, diagnostic-only credit-exhaustion event described above.

## 7. Cost and provenance

The final stored estimated cost is:

**`$0.7923262`**

The evidence preserves model/request, prompt/schema, SDK/Node, task-bank, repository, ground-truth, probe-bank, runner, and critical-source fingerprints. The source run was executed from the merged `main` commit `0a0fd1a262c2e4274f1b946562c9b4e79f6fb71b`.

## 8. Interpretation for the next phase

P6-2's completion criterion was not that AF reach a perfect score. It was that AF provide a stable, provenance-complete, scientifically evaluable hub baseline with enough range for later bounded-context conditions to move relative to it.

That condition is satisfied:

- primary M is high but not 1.0 (`0.9394`)
- Rsem is high but not 1.0 (`0.9325`)
- primary M has no audit exclusions
- Rsem has 21/21 protocol-valid repeats
- all failure domains are explicitly separated
- the sole infrastructure interruption is resolved and preserved in provenance
- the frozen N=21 design was used exactly as predeclared

A specific caution follows from the baseline: **all primary M failures were protocol failures, with zero semantic failures**. Therefore P6-3 and later comparisons must continue to report semantic and protocol domains separately. A lower bounded-context M score must not automatically be described as loss of semantic reconstruction unless the failure-domain evidence supports that interpretation.

## 9. Decision

**P6-2 is complete.**

The next research step is:

> **P6-3 — Exposure-Limited static dose-response**

P6-3 must use this committed AF result as the fixed hub baseline and must not reopen P6-2 task membership, margins, or repeat count in response to the observed AF scores.
