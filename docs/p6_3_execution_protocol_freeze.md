# P6-3 execution protocol freeze

**Status:** pre-live execution-protocol predeclaration  
**Date:** 2026-09-24  
**Base:** `main@feca4774a46a52bc2a7339ee85551a9f2678581b`  
**Dependency:** committed P6-3 structural freeze manifest `p6-3-el-structural-freeze-manifest-v3`  
**Purpose:** freeze the execution protocol before any P6-3 live calibration call.

No P6-3 live M/Rsem outcome exists or may be inspected by this work. This document does not authorize live execution by itself.

## 1. Calibration repeat count

Freeze:

```text
K_cal = 12
```

`K_cal=12` is calibration-only and must not be reinterpreted as the confirmatory Stage 1A sample size.

## 2. Arm types and AF/EL separation

The six scientific arms are represented as two different execution types, not six interchangeable string labels.

```text
ELArm = B0 | B1 | B2 | B3 | B4
AFArm = AF
CalibrationArm = ELArm | AFArm
```

The live AF arm is the real Artifact-Full condition. It MUST execute through the Artifact-Full code path and MUST NOT call `assembleELTaskStaticExposure`, use `condition="EL"`, or derive its repository context through the EL static-exposure runtime.

The structural-freeze verifier's historical `"AF"` exposure label means only an **EL full-prefix parity check at `B=T_EL`**. It is not an executable live AF arm and must not be reused as one.

The execution protocol must use a typed/discriminated dispatcher with separate EL and AF callbacks so that an AF arm cannot silently fall through the EL path.

## 3. Frozen 12-repeat schedule

Let the forward base order be:

```text
L = [B0, B1, B2, B3, B4, AF]
```

Repeats 1-6 are left cyclic rotations of `L` by offsets 0-5 respectively.

Let the reverse base order be:

```text
L_rev = [AF, B4, B3, B2, B1, B0]
```

Repeats 7-12 are left cyclic rotations of `L_rev` by offsets 0-5 respectively.

Therefore each arm occupies every execution position exactly once in the forward half and exactly once in the reverse half.

The schedule is deterministic and common to M and Rsem.

## 4. Temporal block rule

Execution is block-local:

- M block: one `task × repeat`, containing its six arms.
- Rsem block: one `repeat`, containing its six arms for the frozen 12-probe bank.

Within a block, arms execute sequentially in the frozen schedule order and are kept temporally adjacent. A replacement attempt for the current logical cell is not deferred until after later arms or later blocks.

Each arm execution is a fresh stateless Sync call. Provider continuation state and prior-arm conversation state are not inherited.

## 5. Infrastructure-invalid replacement placement

For each planned logical cell:

- `none`, `semantic`, `protocol`, and `system` outcomes are scientific observations and advance to the next arm. They are never replaced merely because the result is unfavorable.
- an infrastructure failure that has not yet been explicitly adjudicated `infrastructure-invalid` stops progression at the current logical cell as `needs-audit`.
- once explicitly adjudicated `infrastructure-invalid`, the runner retries the **same logical cell immediately**, under the same frozen condition, before advancing to the next arm.
- maximum scientific attempts per logical cell: **3**.
- after three infrastructure-invalid attempts without a valid scientific observation, P6-3 stops as `needs-audit`.
- replacement attempts do not increment `K_cal` and do not change arm order.

Thus the retry precedence is:

```text
current logical cell
  -> valid scientific observation: advance to next arm
  -> infrastructure failure: stop for adjudication
  -> adjudicated infrastructure-invalid and attempts < 3: retry same cell immediately
  -> third infrastructure-invalid: stop P6-3 needs-audit
```

## 6. Offline verification required before live

An offline verifier must prove at minimum:

1. `K_cal === 12`.
2. every repeat has exactly six arms: five typed EL arms and one typed AF arm.
3. repeats 1-6 equal the six forward cyclic rotations.
4. repeats 7-12 equal the six reverse cyclic rotations.
5. each arm occupies every position exactly once per direction.
6. typed dispatch routes all EL arms only to the EL callback and AF only to the AF callback.
7. AF dispatch cannot require an EL budget or EL static-exposure result.
8. scientific non-infrastructure outcomes never request replacement.
9. unadjudicated infrastructure failure never advances the arm schedule.
10. adjudicated infrastructure-invalid retries the same logical cell immediately when attempt < 3.
11. attempt 3 infrastructure-invalid stops as `needs-audit`.

## 7. Remaining gates

Even after this protocol freeze passes, live remains blocked until the remaining pre-live requirements are implemented and verified, including:

- P6-2 mutation prompt/schema/parser/validation fingerprint parity
- M failure-domain diagnostics
- Rsem probe-wise diagnostics
- calibration-only provenance separation from Stage 1A
- predeclared conjunctive M/Rsem budget-selection rule
- structural invariant coverage hardening identified in the 2026-09-24 self-review

The already-recorded 864-call cost estimate remains `docs/p6_3_cost_estimate.md`.
