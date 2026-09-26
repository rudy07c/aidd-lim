# P6-3 v1 live calibration diagnostic record

**Status:** diagnostic / exploratory only  
**Date:** 2026-09-26  
**Purpose:** preserve the factual state at the protocol-defined hard stop of the first P6-3 live calibration. This record is not confirmatory Stage 1A evidence and is not sufficient to select `B_expose`.

## 1. Frozen execution identity

The v1 live run executed from:

```text
checkoutGitSha = b60b3560a163dfcedf07ffd1dbacc29ed4cf3b7f
```

The PRELIVE manifest hashes recorded by the runner were:

```text
structuralFreeze  = 2f26b34f112b4b1ffcf9fd979cdafff20c146bc4236f4a26d5fa72f3ec5f5196
executionProtocol = ea72d6461a3ba1589a221864e8f9b9dc57174bbbf1bba9e87a77c26474c43408
mutationParity    = fb5c87779390204ad2555ee9390ef5ebe27884a01a983ba16833e00541e4a840
rsemParity        = 134e742db585ca3d196016567a61bb8d8cd3a6e0ca66918befd85be5f9aa1e96
```

Local run directory reported by the live runner:

```text
runs/_calibration/p6-3-el-calibration-luna__2026-09-26T09-49-02-071Z
```

The raw run directory is intentionally not reconstructed from this document. It must be preserved as primary evidence separately from the repository source tree.

## 2. Structural experimental variables remain frozen

The v1 budget grid was:

| arm | budget tokens |
|---|---:|
| B0 | 0 |
| B1 | 505 |
| B2 | 1011 |
| B3 | 2023 |
| B4 | 3034 |
| AF | 4046 |

`T_EL = 4046` and the interior budgets were outcome-blind structural choices. In particular, `B1=505` derives from the frozen grid rule and MUST NOT be changed because v1 later exposed reliability problems in a B1 cell.

Any P6-3 v2 revision is restricted to execution/reliability mechanics and explicitly preregistered secondary measurement. It must not use the observed v1 outcomes to retune the budget grid.

## 3. Protocol-defined stop

At the final recorded state:

```text
logicalCellsCompleted = 32
scientificAttempts     = 43
replacementAttempts    = 10
interruptedAttempts    = 0
estimatedCostUsd       = 0.23608009000000002
status                 = needs-audit
nextSequence           = 32
```

The terminal logical cell was:

```text
sequence       = 32
measurement    = M
taskId         = T-local-2
repeat         = 6
armLabel       = B1
armKind        = EL
budgetTokens   = 505
```

All three permitted scientific attempts ended as provider Responses `incomplete` with `incompleteReason=max_output_tokens` and provider-reported `outputTokens=7000`. Each was explicitly adjudicated `infrastructure-invalid` under the frozen v1 policy. After attempt 3, the runner emitted:

```text
auditFlag.kind = max-infrastructure-attempts-exhausted
reason = P6-3 logical cell exhausted 3 infrastructure-invalid scientific attempts.
```

This is a protocol-defined hard stop, not a harness crash and not a scientific task failure.

## 4. Interpretation boundary

This v1 run is a **protocol-diagnostic / exploratory run**.

It supports the narrow conclusion that the frozen v1 execution envelope did not guarantee a valid scientific observation for every planned logical cell before the three-attempt ceiling was exhausted.

It does **not** establish any of the following:

- that B1 is intrinsically harder than the other arms;
- that smaller context causes more reasoning tokens;
- that censoring is monotonically or non-monotonically related to budget;
- that the token-use distribution is bimodal;
- any confirmatory difference in M or Rsem;
- a valid `B_expose` selection.

The early token/censoring pattern is hypothesis-generating only. Any formal arm-level censoring or token-use analysis must be preregistered and evaluated on newly collected v2 data.

## 5. v2 design motivation

The v1 run revealed an operational weakness in the measurement procedure: known, deterministic infrastructure-classification cases required repeated human rubber-stamp adjudication, and a single cell exhausting three infrastructure-invalid attempts terminated the entire 864-cell collection.

P6-3 v2 may therefore revise **execution-environment mechanics** without revising the structural experimental grid. Candidate revisions include deterministic automatic infrastructure classification, automatic same-cell replacement, explicit exhausted-cell recording, and preregistered secondary reliability endpoints.

This distinction is mandatory:

> Budget-grid parameters are structural experimental variables and remain frozen from v1. V2 changes are restricted to execution/reliability mechanics and preregistered secondary measurement.

## 6. Mutation-parity boundary

Automation of adjudication is a procedural change in **who applies an already-frozen classification rule**. It is not, by itself, a change to the P6-2 mutation prompt/parser/scorer semantics or to the meaning of the existing failure domains.

Any v2 automatic classifier must therefore reproduce the existing mutation-protocol-parity classification semantics rather than silently redefining `infrastructure-invalid`.

## 7. Evidence preservation gate

Before any P6-3 v2 live execution, the local v1 run directory must be copied or archived outside its mutable working location and hashed. A suitable local procedure is:

```bash
V1_RUN="runs/_calibration/p6-3-el-calibration-luna__2026-09-26T09-49-02-071Z"
ARCHIVE="p6-3-v1-diagnostic-2026-09-26.tar.gz"

tar -czf "$ARCHIVE" "$V1_RUN"
shasum -a 256 "$ARCHIVE" > "$ARCHIVE.sha256"
cat "$ARCHIVE.sha256"
```

The resulting archive SHA-256 should be appended to this record before v2 live authorization. The repository must not pretend to contain the raw v1 artifacts unless those bytes are explicitly materialized and committed.