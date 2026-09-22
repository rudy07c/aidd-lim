# P6-2 fresh variance pilot M-side independence audit

## Status

**CLOSED / PASSED — M-side independence established.**

The fresh 11-task AF-vs-AF variance pilot is supported by a committed, record-level provenance audit showing that all 176 M records came from distinct fresh OpenAI responses rather than reuse of the historical variance-pilot journal. The numerical common-repeat candidate `21` is therefore provenance-eligible for the formal scientific repeat freeze.

Machine-readable evidence:

`docs/findings/evidence/p6-2-m-independence-audit.json`

Permanent verifier:

`npm run verify:p6-af-variance-m-independence`

## Trigger

The fresh M sample SD is `0.07586572367238911`. The historical pilot, after diagnostic removal of `T-crosscut-5`, also yields the same sample SD to floating-point precision.

The pairwise M difference vectors are not identical:

- historical 11-task diagnostic reaggregation: `[0,-1,0,+1,+1,-1,0,-1] / 11`
- fresh 11-task pilot: `[-1,0,0,0,-1,-1,+1,+1] / 11`

These vectors are permutations of the same multiset (`-1/11` x3, `0` x3, `+1/11` x2). Mean and sample SD are permutation-invariant, so the exact SD equality is mathematically explained by the discrete outcome multiset and is not evidence of stale-journal reuse.

Because the same SD could nevertheless have concealed an execution/provenance error, merge remained blocked until response-level independence was tested.

## Why committed result.json alone was insufficient

M events in the committed variance `result.json` contain classified task results but do not persist the OpenAI `responseId` or raw model response. During each live run those fields are persisted separately for every M record under:

`pair-N/attempt-K/<arm>/<task>/model_provenance.json`

and

`pair-N/attempt-K/<arm>/<task>/agent_response.txt`.

`runs/_calibration/` is gitignored, so the original local historical/fresh journal directories were used once to generate the committed machine-readable audit artifact.

## Audit population and matching rule

Exactly 176 M records were compared:

- 8 accepted pairs
- 11 current primary tasks
- 2 arms per pair

For each `(pairId, taskId, arm)` key, the audit independently selected the accepted attempt from each result. This is important because the historical pilot contains an infrastructure-replacement attempt.

For every corresponding record the audit preserves:

- pair ID, task ID, and arm
- fresh/historical accepted attempt number
- fresh/historical arm execution order
- fresh/historical OpenAI response ID
- fresh/historical raw response and SHA-256
- exact response-ID equality flag
- exact raw-response equality flag
- journal timestamp and per-file mtimes
- result-event SHA-256/equality as a secondary diagnostic

## Result

The committed audit verdict is:

`independent-new-api-calls`

Summary:

- expected records: **176**
- compared records: **176**
- missing fresh artifact records: **0**
- missing historical artifact records: **0**
- missing fresh response IDs: **0**
- missing historical response IDs: **0**
- unique fresh response IDs: **176**
- unique historical response IDs: **176**
- corresponding response-ID matches: **0**
- corresponding raw-response matches: **0**
- identical classified result events: **0**
- fresh journal timestamps outside fresh run window: **0**
- earliest fresh M journal timestamp: `2026-09-21T11:46:29.143Z`
- latest fresh M journal timestamp: `2026-09-21T12:41:55.107Z`
- latest historical M journal timestamp: `2026-09-21T08:00:35.524Z`
- all fresh M journal timestamps later than the latest historical M journal timestamp: **true**

This rules out reuse of corresponding historical M responses under the recorded journal provenance: no response ID was reused, no corresponding raw model response was reused, all 176 fresh response IDs are unique, and the fresh journal artifacts belong to the later fresh-run time window.

## Timestamp evidence limitation

The M journal schema used by these runs did not persist a provider/API execution timestamp. Therefore `journalTimestamp` in the audit is derived from filesystem mtimes for `agent_response.txt`, `model_provenance.json`, and `repeat_meta.json` and is explicitly **not** represented as an OpenAI API timestamp.

This limitation does not affect the strongest independence evidence: OpenAI response IDs are present for all 176 corresponding records, all 176 fresh IDs are unique, and the historical/fresh response-ID intersection for corresponding records is zero. Raw responses are also different for all 176 corresponding records.

## Decision

The fresh M variance sample is accepted as independently generated. No M-only rerun is required.

Accordingly:

1. the post-selection diagnostic historical 11-task reaggregation remains diagnostic-only and is not pooled into the fresh sample;
2. the fresh 11-task sizing values remain the basis for repeat planning;
3. `M requiredN = 21`, `Rsem requiredN = 16`, and common repeat `max(8,21,16) = 21` may be treated as the formal scientific repeat freeze;
4. the historical 12-task result remains separately reported (`n<=30` insufficient; diagnostic extension approximately `n=37`);
5. the permanent CI verifier must continue to pass against the committed audit evidence before PR #2 is merged.
