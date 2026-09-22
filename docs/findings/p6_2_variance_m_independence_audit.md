# P6-2 fresh variance pilot M-side independence audit

## Status

**OPEN / MERGE BLOCKING.**

The numerical repeat candidate `21` from the fresh 11-task AF-vs-AF variance pilot is not a valid formal freeze until M-side journal provenance is independently compared against the historical 12-task pilot.

## Trigger

The fresh M sample SD is `0.07586572367238911`. The historical pilot, after diagnostic removal of `T-crosscut-5`, also yields `0.07586572367238911` (raw SD-UCB differs only at floating-point tail precision).

The pairwise M difference vectors are not identical:

- historical 11-task diagnostic reaggregation: `[0,-1,0,+1,+1,-1,0,-1] / 11`
- fresh 11-task pilot: `[-1,0,0,0,-1,-1,+1,+1] / 11`

These vectors are permutations of the same multiset (`-1/11` x3, `0` x3, `+1/11` x2), which fully explains the exact equality of mean and sample SD. Therefore the SD equality is not itself evidence of stale-journal reuse, but it is sufficient to justify a stricter provenance check before merge.

## Why committed result.json is insufficient

M events in the committed variance `result.json` contain classified task results but do not persist the OpenAI `responseId` or raw model response. During the live run those fields are persisted separately for every M record under:

`pair-N/attempt-K/<arm>/<task>/model_provenance.json`

and

`pair-N/attempt-K/<arm>/<task>/agent_response.txt`.

`runs/_calibration/` is gitignored, so these journal artifacts are available only in the original local run directories unless explicitly converted into committed evidence.

## Audit population

Compare exactly the 176 M records in the current 11-task bank:

- 8 accepted pairs
- 11 primary tasks
- 2 arms per pair

For each `(pairId, taskId, arm)` key, use the accepted attempt from each result independently. This matters because the historical pilot contains an infrastructure replacement attempt.

## Required comparison fields

For every corresponding record, preserve:

- pair ID
- task ID
- arm
- fresh/historical accepted attempt number
- fresh/historical arm execution order
- fresh/historical OpenAI response ID
- fresh/historical raw response and SHA-256
- exact response-ID equality flag
- exact raw-response equality flag
- journal timestamp and per-file mtimes
- result-event SHA-256/equality as a secondary diagnostic

The existing journal schema does not persist a provider/API execution timestamp for M calls. The audit therefore labels filesystem mtime explicitly as filesystem evidence; it must not be represented as an OpenAI API timestamp.

## Decision rule

`independent-new-api-calls` requires all of the following:

1. all 176 fresh and historical journal artifact bundles exist;
2. all 176 fresh and historical response IDs are present;
3. all 176 fresh response IDs are unique;
4. corresponding fresh/historical response ID equality count is 0;
5. corresponding fresh/historical raw response equality count is 0;
6. every fresh journal timestamp lies in the fresh run window (with the audit tool's small filesystem tolerance);
7. the earliest fresh M journal timestamp is later than the latest historical M journal timestamp.

Any missing provenance, reused response ID, reused corresponding raw response, or incompatible timestamp evidence yields `independence-not-established` and the formal freeze remains invalid.

## Tooling

Generate the machine-readable evidence from the original local journals:

```bash
cd harness
npm run p6:audit-af-variance-m-independence -- \
  --historical ../runs/_calibration/p6-2-af-variance-pilot-luna__2026-09-21T06-11-21-275Z/result.json \
  --fresh ../runs/_calibration/p6-2-af-variance-pilot-luna__2026-09-21T11-46-12-077Z/result.json \
  --out ../docs/findings/evidence/p6-2-m-independence-audit.json
```

Then run:

```bash
npm run verify:p6-af-variance-m-independence
```

The generated JSON intentionally contains the raw fresh/historical model responses as well as hashes so the exact comparison is inspectable and reproducible. Once the evidence is committed, Harness CI reruns the permanent verifier.

## Current conclusion

No conclusion about formal M independence is recorded yet because the original local journal files are not committed to the repository and are not accessible from the GitHub-side review environment. PR #2 must remain unmerged until the generated audit evidence is committed and the permanent verifier passes.
