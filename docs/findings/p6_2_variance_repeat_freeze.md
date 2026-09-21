# P6-2 variance pilot / scientific repeat freeze

## Decision

Current P6-2 scientific repeat count is **21**. The freeze is based only on the fresh 11-task AF-vs-AF variance pilot; historical observations used for task selection were not pooled into the formal sizing sample.

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
- no historical AF observations pooled
- M sample SD: 0.07586572367238911
- M one-sided 95% SD-UCB: 0.13634214080510762
- M requiredN: 21
- Rsem sample SD: 0.05892556509887899
- Rsem one-sided 95% SD-UCB: 0.1058981224304308
- Rsem requiredN: 16
- common repeat rule: max(8, 21, 16) = **21**
- needsAudit: false
- estimated pilot cost: USD 0.47460515
- evidence: `docs/findings/evidence/p6-2-variance-pilot-fresh-11-task/result.json`

## Interpretation

The two designs must remain visible together. The historical 12-task design did not satisfy the power target within n<=30, whereas the current 11-task design yields a feasible frozen repeat count of 21 on an independent fresh variance sample. This difference is partly a consequence of the explicit task-selection amendment; it must not be presented as though the original 12-task design itself had requiredN=21.
