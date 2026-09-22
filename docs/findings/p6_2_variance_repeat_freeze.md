# P6-2 variance pilot / scientific repeat freeze

## Status

**Formal scientific repeat count is frozen at 21.**

The fresh 11-task AF-vs-AF pilot produced the numerical common-repeat candidate `21`, and the subsequent record-level M-side independence audit established that all 176 corresponding fresh M records came from distinct fresh OpenAI responses rather than reuse of the historical variance-pilot journal.

Formal freeze:

`P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT = 21`

Primary evidence:

- fresh variance result: `docs/findings/evidence/p6-2-variance-pilot-fresh-11-task/result.json`
- M independence audit: `docs/findings/evidence/p6-2-m-independence-audit.json`
- audit interpretation: `docs/findings/p6_2_variance_m_independence_audit.md`

## Historical 12-task design

- primary M tasks: 12
- Delta_M = 1/12
- accepted AF-vs-AF pairs: 8
- M sample SD: 0.09383263553830025
- M one-sided 95% SD-UCB: 0.16863138961044855
- exact power at n=30: 0.6816437585696477
- requiredN within the predeclared n<=30 ceiling: none
- diagnostic extension of the same exact formula beyond the ceiling: n=37
- status: statistical-design-needs-audit
- evidence: `docs/findings/evidence/p6-2-variance-pilot/result.json`

The historical 12-task result remains immutable and must not be reported as though it yielded N=21.

## Task-selection amendment

A bank-wide audit of the 12 historical primary tasks found only `T-crosscut-5` with persistent semantic failures (4 success / 11 semantic failure / 1 protocol failure; all 11 semantic failures share `boostTalFen: fails when Osk=nim`). The Osk dependency and same failure existed before the variance pilot, but persistent low-headroom frequency under Luna/AF was established post-pilot. Therefore the task is not retroactively relabeled historical `semantic-floor`; it is excluded from P6-2+ as `post-pilot-low-headroom`.

The old 8 pairs reaggregated to 11 tasks yield diagnostic M requiredN=21 and Rsem requiredN=11, but those values remain explicitly **not freeze-eligible** because the same historical observations informed task selection.

Historical diagnostic 11-task M differences:

`[0,-1,0,+1,+1,-1,0,-1] / 11`

## Fresh 11-task design

- primary M tasks: 11
- Delta_M = 1/11
- Delta_R = 1/12
- accepted fresh AF-vs-AF pairs: 8
- historical AF observations were not pooled into the fresh pilot
- M pairwise differences: `[-1,0,0,0,-1,-1,+1,+1] / 11`
- M sample SD: 0.07586572367238911
- M one-sided 95% SD-UCB: 0.13634214080510762
- M requiredN: **21**
- Rsem sample SD: 0.05892556509887899
- Rsem one-sided 95% SD-UCB: 0.1058981224304308
- Rsem requiredN: **16**
- common repeat: `max(8, 21, 16) = 21`
- needsAudit from sizing logic: false
- estimated pilot cost: USD 0.47460515
- evidence: `docs/findings/evidence/p6-2-variance-pilot-fresh-11-task/result.json`

## M-side independence verification

The fresh M sample SD happens to equal the historical post-selection 11-task diagnostic SD. This is explained by the two pair-difference vectors being different permutations of the same discrete multiset (`-1/11` x3, `0` x3, `+1/11` x2). Equal mean/SD therefore follows mathematically and does not imply identical observations.

Because this equality created a legitimate provenance concern, a stronger journal-level audit was performed before validating the freeze.

The audit compared all `8 pairs x 11 tasks x 2 arms = 176` corresponding M records and found:

- records compared: **176 / 176**
- missing artifacts: **0**
- missing response IDs: **0**
- unique fresh response IDs: **176**
- corresponding historical/fresh response-ID matches: **0**
- corresponding historical/fresh raw-response matches: **0**
- identical classified result events: **0**
- fresh journal timestamps outside the fresh run window: **0**
- earliest fresh journal timestamp: `2026-09-21T11:46:29.143Z`
- latest fresh journal timestamp: `2026-09-21T12:41:55.107Z`
- latest historical journal timestamp: `2026-09-21T08:00:35.524Z`
- all fresh journal times after the historical maximum: **true**
- audit verdict: **`independent-new-api-calls`**

The journal timestamp evidence is based on filesystem mtimes because the M journal schema did not persist an API execution timestamp. The response-ID and raw-response comparisons provide the primary independence evidence.

The permanent verifier `npm run verify:p6-af-variance-m-independence` binds the formal freeze to this committed audit evidence.

## Formal decision

The post-selection optimism concern is resolved by using the independently sampled fresh 11-task pilot rather than the historical 11-task reaggregation.

The scientific repeat count for the current P6-2 design is therefore formally frozen at:

**N = 21**

This decision does not erase the design sensitivity:

- historical 12-task design: target power not reached within n<=30; diagnostic extension n=37
- current 11-task design after the documented task-selection amendment: fresh M requiredN=21, fresh Rsem requiredN=16, common frozen repeat=21

Both must remain visible in later reporting so the effect of the reclassification is transparent.
