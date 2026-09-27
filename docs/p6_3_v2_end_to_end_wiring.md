# P6-3 v2 end-to-end wiring

**Status:** offline integration implementation; paid/live execution remains blocked by the existing v2 CLI hard gate.

## Purpose

This change connects the already-frozen P6-3 v2 components without changing their scientific semantics:

1. P6-3 v2 unattended calibration runner;
2. M/Rsem v2 provider adapters;
3. AUTO-INFRA-001 adjudication;
4. secondary reliability attempt wrapping;
5. file-backed state / attempt persistence;
6. resume handling;
7. terminal secondary reliability analysis and final report persistence.

The change does not select `B_expose`, does not authorize Stage 1A, and does not enable paid/provider execution from the CLI.

## Integration invariant

The raw M/Rsem v2 executor returns `P63V2ReliabilityCellOutcome`. Before the unattended runner persists an attempt, `withP63V2SecondaryReliability()` wraps the scientific payload in the versioned reliability artifact.

The file persistence layer therefore stores the reliability artifact itself at the JSON file root. It deliberately does **not** reuse the historical v1 persistence framing:

```json
{
  "cell": "...",
  "attempt": 1,
  "payload": "..."
}
```

because the v2 secondary analyzer expects the versioned reliability artifact schema at the root. The new persistence layer validates the artifact identity against the logical cell and attempt before committing it.

## Resume / duplicate-call boundary

The unattended runner still persists `inFlight` before provider execution. On resume, an unresolved `inFlight` attempt is converted to an interrupted attempt and `needs-audit`; the provider call is not repeated automatically.

A terminal completed state can be loaded again and passed through the end-to-end runtime without another executor/provider call. The final report is immutable: an existing byte-identical report is accepted, while differing content at the same report path fails closed.

## Terminal report

A final report is persisted only when collection is terminal:

- `completed`, or
- `needs-design-audit` after one or more `censored-exhausted` cells.

The report binds:

- checkout SHA;
- frozen manifest hashes;
- calibration plan hash;
- execution policy;
- unattended-runner execution summary;
- complete secondary reliability summary.

The report checks that exhausted-cell counts and attempt counts agree across runner state and secondary analysis. `B_expose` selection eligibility is true only for `completed` with zero exhausted cells.

## Offline verification

The dedicated verifier covers:

- routing M/Rsem logical cells through the v2 provider adapter surface using injected fake provider implementations;
- clean 864-cell completion with 864 committed reliability artifacts;
- terminal resume with zero additional executor calls;
- one censored attempt followed by success;
- three consecutive max-output censored attempts producing `censored-exhausted` while collection continues;
- propagation of exhaustion to the final reliability report and `B_exposeSelectionEligible=false`;
- interrupted in-flight recovery without blind retry, explicit adjudication, and continuation at attempt 2;
- unknown/ambiguous infrastructure remaining `needs-audit` with no final report;
- direct-root reliability artifact persistence required by the secondary analyzer.

The CI also re-runs the execution-parameter, actual-v1 AUTO-INFRA regression, unattended-runner, secondary-reliability, provider-adapter, and dry CLI gates.

## Live boundary

The merged PR #26 CLI hard gate remains unchanged. Even if `OPENAI_API_KEY` and `P6_3_LIVE_EXECUTION_ALLOWED=1` are both present, `--live` still exits before any provider execution is allowed because the final v2 pre-live gate has not been frozen.

A later change must freeze the final v2 pre-live manifest/gate and explicitly review the transition from "runtime exists" to "CLI can reach runtime". This document does not authorize that transition.
