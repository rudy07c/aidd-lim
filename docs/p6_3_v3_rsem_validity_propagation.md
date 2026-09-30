# P6-3 v3 Rsem scientific-validity propagation

## Status

This document records Step 2 of `docs/p6_3_post_audit_execution_plan.md`.

The change is a pre-live correctness repair. It does not change the frozen P6-2/P6-3 Rsem failure-semantics table, the v3 treatment, the artifact budget grid, the selector, the M/Rsem co-gate, or any observed scientific result. No provider call is required by this change.

## Problem

The historical Rsem result carries two distinct classifications:

```text
validity
failureDomain
```

They are not aliases.

The frozen P6-2-compatible semantics intentionally include:

```text
probe-scoring-error:
  validity      = infrastructure-invalid
  failureDomain = system
  protocolValid = null
```

Before this repair, the v3 Rsem executor preserved the exact historical `RSemProbeRepeatResult` inside `artifactPayload.result`, but the common `P63CellOutcome` exposed only `failureDomain`. The v3 live controller therefore persisted and transitioned on the domain while dropping scientific validity.

For `probe-scoring-error`, that meant the controller could see only `system`. Because only `failureDomain=infrastructure` triggered replacement adjudication, an infrastructure-invalid scoring observation could advance as if it were a scientific observation.

## Repair boundary

The repair does **not** rewrite `probe-scoring-error` from `system` to `infrastructure`.

Instead, v3 now preserves the two axes independently:

```text
rawValidity / effectiveValidity
rawFailureDomain / effectiveFailureDomain
```

`requireP63V3ScientificValidity()` recovers the already-classified validity from the exact executor result persisted in `artifactPayload.result`. If a diagnostic copy is also present, both copies must agree.

Only two legacy combinations can be recovered without an explicit validity field because their meaning is unambiguous under the frozen protocol:

- `failureDomain=infrastructure` -> `infrastructure-invalid`;
- `executionStatus=ok` and `failureDomain=none` -> `valid`.

Ambiguous `semantic`, `protocol`, `system`, or `other` outcomes fail closed when explicit validity is missing.

## Controller semantics

A returned outcome now requires explicit adjudication before the logical cell can advance when either:

```text
validity == infrastructure-invalid
```

or:

```text
failureDomain == infrastructure
```

Therefore the frozen scoring-error case remains:

```text
rawValidity      = infrastructure-invalid
rawFailureDomain = system
```

but stops in `needs-audit` instead of advancing.

If it is adjudicated `infrastructure-invalid`, the existing P6-3 infrastructure-invalid retry ceiling is used while the historical raw/effective `system` failure-domain classification remains preserved. Validity, rather than a rewritten failure domain, explains why the attempt is excluded/replaced.

If a pending outcome is instead adjudicated as a genuine scientific/protocol failure, its `effectiveValidity` becomes `valid`, its effective scientific domain follows the adjudication, and the logical cell is consumed. M `protocol-failure` adjudication remains prohibited exactly as before.

## Persistence and resume

The v3 live state/controller schema is versioned forward for this repair. Every committed v3 attempt now persists:

```text
rawValidity
effectiveValidity
rawFailureDomain
effectiveFailureDomain
```

Resume refuses malformed attempt validity values.

No v3 paid/live calibration has yet run, so this schema correction does not rewrite or reinterpret existing v3 scientific evidence.

## Offline regression gate

`harness/verify-p6-3-v3-validity-propagation.ts` verifies without provider calls that:

1. frozen `probe-scoring-error` remains `infrastructure-invalid + system`;
2. validity and failure domain remain independent;
3. diagnostic/artifact validity disagreement fails closed;
4. ambiguous missing validity fails closed;
5. `system + infrastructure-invalid` pauses before scientific advance;
6. explicit infrastructure-invalid adjudication retries the same cell;
7. the raw/effective `system` domain remains preserved for that invalid attempt;
8. a valid protocol failure remains a scientific observation;
9. the unambiguous historical `none/ok` and `infrastructure` combinations remain compatible with older offline mocks.

Dedicated CI also runs the complete harness TypeScript typecheck.

## Scientific boundary

This step changes no observed data and authorizes no live execution.

The next canonical step remains Step 3: implement and freeze the P6-3 v3 result finalizer before any v3 outcome is collected.
