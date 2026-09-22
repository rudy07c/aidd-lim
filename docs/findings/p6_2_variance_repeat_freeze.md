# P6-2 variance pilot / scientific repeat freeze

## Merge-blocking provenance audit status

**Formal scientific repeat freeze is currently invalid / pending.** The fresh 11-task AF-vs-AF pilot produced a numerical candidate of **21**, but that candidate must not be treated as formally frozen until the fresh M-side journal is proven independent from the historical pilot at the response-ID/raw-response level.

Reason for the block: the fresh M sample SD (`0.07586572367238911`) equals the historical 11-task post-selection reaggregation SD to floating-point precision. The pairwise vectors are **not** identical:

- historical diagnostic reaggregation: `[0,-1,0,+1,+1,-1,0,-1] / 11`
- fresh pilot: `[-1,0,0,0,-1,-1,+1,+1] / 11`

They nevertheless have exactly the same multiset (`-1/11` x3, `0` x3, `+1/11` x2), so equal mean/SD follows mathematically from that discrete multiset and is not by itself evidence of journal reuse. The stronger provenance check remains mandatory before merge.

The committed `result.json` files do not contain M-side `responseId` or raw model response fields. Those are written separately by the live runner to each local M journal directory as `model_provenance.json` and `agent_response.txt`. Because `runs/_calibration/` is gitignored, the journal-level comparison must be generated from the original local historical/fresh run directories and committed as `docs/findings/evidence/p6-2-m-independence-audit.json`.

Until `npm run verify:p6-af-variance-m-independence` passes against that committed evidence, PR #2 must not be merged and `P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT = 21` is only a provisional code value, not a valid formal freeze.

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

## Task-selection amendment

A bank-wide audit of the 12 historical primary tasks found only `T-crosscut-5` with persistent semantic failures (4 success / 11 semantic failure / 1 protocol failure; all 11 semantic failures share `boostTalFen: fails when Osk=nim`). The Osk dependency and same failure existed before the variance pilot, but persistent low-headroom frequency under Luna/AF was established post-pilot. Therefore the task is not retroactively relabeled historical `semantic-floor`; it is excluded from P6-2+ as `post-pilot-low-headroom`.

The old 8 pairs reaggregated to 11 tasks yield diagnostic M requiredN=21 and Rsem requiredN=11, but those values are explicitly not freeze-eligible because the same observations informed task selection.

## Fresh 11-task design

- primary M tasks: 11
- Delta_M = 1/11
- Delta_R = 1/12
- accepted fresh AF-vs-AF pairs: 8
- no historical AF observations intentionally pooled by the pilot design
- M pairwise differences: `[-1,0,0,0,-1,-1,+1,+1] / 11`
- M sample SD: 0.07586572367238911
- M one-sided 95% SD-UCB: 0.13634214080510762
- M requiredN: 21
- Rsem sample SD: 0.05892556509887899
- Rsem one-sided 95% SD-UCB: 0.1058981224304308
- Rsem requiredN: 16
- numerical common-repeat candidate: max(8, 21, 16) = **21**
- needsAudit from sizing logic: false
- estimated pilot cost: USD 0.47460515
- evidence: `docs/findings/evidence/p6-2-variance-pilot-fresh-11-task/result.json`

## Interpretation

The two designs must remain visible together. The historical 12-task design did not satisfy the power target within n<=30, whereas the current 11-task design numerically yields 21 on the fresh variance result. However, the M-side independence audit is now a separate merge-blocking provenance requirement. Only after all 176 corresponding M records (8 pairs x 11 tasks x 2 arms) show distinct fresh response IDs, no corresponding raw-response reuse, and fresh journal timestamps after the historical run may 21 be restored as the formal scientific repeat freeze.
