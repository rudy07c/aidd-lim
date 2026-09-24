# P6-3 EL structural freeze plan

**Status**: structural freeze complete (`frozen-pass`); live gates pending  
**Base**: `main@13934616b6c45148629f693bd2fc3343250ed6aa` (PR #5 merged)  
**Purpose**: freeze the structural EL dose design before any P6-3 live calibration call.

## 1. Scope

This phase performs **offline structural checks only**. It must not inspect P6-3 M/Rsem outcomes because no P6-3 live outcome may exist before this gate passes.

The structural freeze covers:

- canonical full static repository payload token count `T_EL`
- finite nominal budgets `B1..B4`
- scientific `staticExposureMaxTokensPerUnit`
- serializer / tokenizer / chunker / unit-mapping / selector versions and source fingerprints
- all 11 primary M task exposure plans
- the single 12-probe Rsem bank-level exposure plan
- dose distinctness, strict actual-token ordering, nesting, no-skip-in, and AF/full reconstruction parity
- P6-3 execution mode clarification

## 2. Frozen scientific chunk candidate

The first scientific structural-freeze candidate is:

```text
staticExposureMaxTokensPerUnit = 256
```

This is frozen **before P6-3 live outcome observation**. Its prior use in PR #5 was smoke/offline verification only and supplied no M/Rsem calibration outcome.

The structural preflight is not allowed to search multiple chunk sizes and select the one producing the most favorable dose curve. It tests `256` against the full structural gate below.

If any required plan fails distinctness or strict token ordering, this version stops as `needs-design-audit`. A different chunk size requires a new versioned structural predeclaration and a fresh offline gate before the first live call.

## 3. Canonical budget derivation

Let `T_EL` be the canonical token count of the complete repository artifact payload produced by the frozen static repository serializer and `js-tiktoken:o200k_base:v1`.

The six calibration arms are:

```text
0
B1 = floor(T_EL / 8)
B2 = floor(T_EL / 4)
B3 = floor(T_EL / 2)
B4 = floor(3 * T_EL / 4)
AF
```

`floor` means integer floor toward negative infinity; `T_EL` is positive, so this is equivalent to truncating the positive quotient. This explicitly records the rounding rule already used by the structural verifier and does not change the frozen numeric budgets.

The verifier must record the exact numeric values of `T_EL`, `B1`, `B2`, `B3`, and `B4` in the immutable freeze manifest before live execution.

`AF` remains a fresh Artifact-Full anchor and is not represented as an EL full-prefix arm in the live calibration schedule.

## 4. Primary M bank

The structural gate uses exactly the current frozen 11-task primary M bank:

- `T-local-2`
- `T-crosscut-1`
- `T-delayed-1`
- `T-local-3`
- `T-local-4`
- `T-local-5`
- `T-local-6`
- `T-local-7`
- `T-crosscut-3`
- `T-crosscut-4`
- `T-delayed-2`

Eligible diagnostic tasks and challenge/floor tasks do not participate in `B_expose` selection.

## 5. Rsem bank

Rsem uses the frozen 12 boolean probes from `stage1-neutral-relation-v2` as one bank-level selector input.

Exactly one ordered exposure plan is built from the union of the worker-visible prompt strings. The selector must not receive:

- `correctAnswer`
- `candidateSource`
- reachable-counterexample witness
- prior probe-wise accuracy
- prior P6-3 response/outcome

Probe order must not affect the selector plan.

## 6. Structural gate

For each of the 11 primary M task plans and the Rsem bank-level plan, all of the following must hold with the frozen chunk size `256`:

1. `B=0` exposes zero ArtifactUnits and zero static artifact tokens.
2. Each finite arm uses a whole-unit prefix only.
3. The first non-fitting unit stops the prefix; later units are never skipped in.
4. Larger finite budgets preserve every selected unit from the smaller-budget prefix.
5. Exposure-set hashes are pairwise distinct across `B1`, `B2`, `B3`, `B4`.
6. Actual canonical static-payload tokens satisfy:

```text
0 < actual(B1) < actual(B2) < actual(B3) < actual(B4) < T_EL
```

7. Prefix-addition token counts are non-decreasing at every unit boundary.
8. A full-prefix reconstruction reproduces the complete repository byte-for-byte and has canonical token count `T_EL`.
9. Static repository serialization remains byte-for-byte compatible with the AF `CURRENT REPOSITORY` payload framing.
10. Repeated construction from the same frozen inputs reproduces identical selector-plan, exposure-set, and static-payload hashes.

A failure in any one primary task or the Rsem plan blocks live calibration and yields `needs-design-audit`.

## 7. Freeze manifest

After the gate passes, commit an immutable machine-readable manifest containing at least:

- base git SHA
- repository snapshot hash
- primary task-bank version/hash and exact IDs
- Rsem bank version/hash and exact probe IDs
- `T_EL`
- `B1..B4`
- `staticExposureMaxTokensPerUnit = 256`
- canonical tokenizer method/version
- static serializer version/hash
- ArtifactUnit chunker version/hash
- file-ranking→ArtifactUnit mapping version/hash
- task selector version/hash
- Rsem bank selector version/hash
- per-plan ordered selector-plan hash
- per-budget exposure-set hash
- per-budget static-payload hash
- per-budget actual exposed token count
- per-budget category token/unit diagnostics
- structural-gate pass/fail status

The live runner must refuse to start if its current inputs do not match this manifest.

## 8. P6-3 execution mode

The older generic Stage-1 guidance lists static EL calibration as a Batch candidate. P6-3 §10.3 is more specific and requires six-arm forward/reverse cyclic counterbalancing plus temporal adjacency within each task/repeat block.

Therefore P6-3 live calibration uses **fresh stateless Sync calls**. Batch is not used for P6-3 live execution unless a future predeclared execution mode can demonstrably preserve the same frozen arm-order and adjacency semantics.

This P6-3-specific rule supersedes the older generic Batch recommendation for this phase only.

The detailed arm typing, schedule, block, and retry placement rules are frozen separately in `docs/p6_3_execution_protocol_freeze.md` and `harness/frozen/p6-3-execution-protocol.json`.

## 9. Live gate after structural freeze

Passing this structural phase is necessary but not sufficient for live execution. Before the first live API call, the calibration runner must additionally freeze and verify:

- `K_cal=12` — **frozen** in the P6-3 execution protocol
- the 12-repeat forward/reverse cyclic arm schedule — **frozen** in the P6-3 execution protocol
- fresh stateless call semantics for every arm — **frozen as an execution invariant**; runner integration remains pending
- AF/EL arm type separation, with live AF forbidden from the EL static-exposure path — **frozen as an execution invariant**; runner integration remains pending
- infrastructure-invalid adjudication and immediate same-cell one-for-one replacement, max 3 attempts/logical cell — **frozen as an execution invariant**; runner integration remains pending
- P6-2 mutation prompt/schema/parser/validation fingerprint parity
- M failure-domain diagnostics
- Rsem probe-wise diagnostics
- calibration-only provenance separation from Stage 1A
- predeclared conjunctive M/Rsem budget-selection rule
- current 864-call cost estimate — **recorded** in `docs/p6_3_cost_estimate.md` as a conservative **$2.35 USD** normal-run estimate using the 2026-09-23 GPT-5.6 Luna pricing snapshot

No live call is authorized by this document alone.
