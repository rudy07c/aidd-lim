# P6-3 v3 Rsem reliability audit finding

## Status

The predeclared P6-3 v3 Rsem reliability audit completed successfully at the first candidate cap.

This audit is **execution-reliability evidence only**. It is not a scientific Rsem observation family, is not pooled into the P6-3 primary estimate, and does not select `B_expose`.

## 1. Run identity

- run class: `reliability-audit`
- source run directory: `runs/p6-3-v3-rsem-reliability-audit-2026-10-03T00-35-14-051Z`
- checkout git SHA: `e5c9f5b0700d83146d4e31085594bc25d03f48a9`
- candidate caps: `[32000, 64000]`
- first candidate: `32000`
- hard audit cap: `64000`
- qualification target: 60 valid balanced trials
- paid/provider calls before the v2 hardening amendment: 0

The exact-main dry preflight passed before the paid run with:

```text
exactCleanCheckoutVerified = true
liveAuthorized             = false
providerCallsMade          = false
```

Paid execution then required a separate explicit live flag, environment authorization, and API credential.

## 2. Result

The 32,000-token candidate qualified without escalation:

```text
status                              = completed
selectedMaxOutputTokens             = 32000
providerVisibleCommittedAttempts    = 60
validTrialCount                     = 60
capCensoringCount                   = 0
nonCapInfrastructureAttemptCount    = 0
protocolInvalidAttemptCount         = 0
interruptedAttempts                 = 0
reservedUnknownCostUsd              = 0
auditFlag                           = null
```

The 64,000-token candidate was not entered. Its `incomplete` status in the summary means **not evaluated**, not rejected.

## 3. Headroom diagnostics

The predeclared non-selective headroom diagnostics for the qualified 32k candidate were:

```text
maxOutputUtilizationRatio       = 0.452625
p95OutputUtilizationRatio       = 0.39275
maxReasoningUtilizationRatio    = 0.4483125
```

These diagnostics did not participate in the qualification rule. The candidate qualified solely because the predeclared 60 valid balanced trials completed with zero provider-declared `max_output_tokens` censoring.

The observed utilization values nevertheless show that the qualification was not produced by repeated near-cap completions.

## 4. Operational cost

The controller summary reported:

```text
accumulatedEstimatedCostUsd = 0.29743553000000006
reservedUnknownCostUsd      = 0
costControlTotalUsd         = 0.29743553000000006
operationalCostCeilingUsd   = 22
```

No interrupted or usage-less attempt required conservative cost reservation.

## 5. External raw evidence preservation

The original local run remains outside git.

A local tar archive was created after completion:

```text
p6-3-v3-rsem-reliability-audit-2026-10-03T00-35-14-051Z.tar.gz
SHA-256 = 15871172b675d6079909cee15ea2e226759a6a9ba7950a123dbbea44f5dc4817
```

The archive contains the completed run directory, including the controller state and 60 attempt artifacts.

This checksum is an external raw-evidence fingerprint. The raw tar itself is not committed to the repository.

## 6. Scientific implication

The reliability audit supplies a mechanically selected execution-envelope value for a **new** scientific Rsem collection:

```text
Rsem maxOutputTokens = 32000
```

It does not authorize changing or resuming the stopped P6-3 v3 state.

The stopped scientific run remains frozen:

- M: 792 / 792 completed;
- Rsem: incomplete;
- terminal status: diagnostic fail-close.

The next scientific collection must therefore use a new provenance boundary. The selected path is to preserve the already completed v3 M family as inherited frozen evidence and recollect a fresh 72-cell Rsem family under the qualified 32k execution envelope.

## 7. Non-pooling boundary

The following are explicitly prohibited:

- counting any of the 60 reliability-audit calls as scientific Rsem observations;
- carrying the single valid Rsem observation from the stopped v3 run into the new 72-cell family;
- resuming sequence 793 of the stopped run;
- using the headroom diagnostics as a scientific endpoint;
- automatically escalating the scientific cap to 64k.

The reliability audit answers an execution question only: 32k passed the predeclared qualification rule.
