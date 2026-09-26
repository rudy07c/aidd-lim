# P6-3 v1 live calibration diagnostic stop

## Status

P6-3 v1 live calibration stopped by the predeclared protocol-defined hard stop after one logical cell exhausted all three allowed scientific attempts as `infrastructure-invalid`.

This run is diagnostic / exploratory evidence only. It must not be used as a completed P6-3 calibration, must not select or freeze `B_expose`, and must not be reinterpreted as Stage 1A confirmatory evidence.

## Run identity

- run directory: `runs/_calibration/p6-3-el-calibration-luna__2026-09-26T09-49-02-071Z`
- checkout git SHA: `b60b3560a163dfcedf07ffd1dbacc29ed4cf3b7f`
- structural freeze manifest hash: `2f26b34f112b4b1ffcf9fd979cdafff20c146bc4236f4a26d5fa72f3ec5f5196`
- execution protocol manifest hash: `ea72d6461a3ba1589a221864e8f9b9dc57174bbbf1bba9e87a77c26474c43408`
- mutation parity manifest hash: `fb5c87779390204ad2555ee9390ef5ebe27884a01a983ba16833e00541e4a840`
- Rsem parity manifest hash: `134e742db585ca3d196016567a61bb8d8cd3a6e0ca66918befd85be5f9aa1e96`
- planned logical cells: `864`
- completed logical cells at stop: `32`
- scientific attempts at stop: `43`
- replacement attempts at stop: `10`
- interrupted attempts: `0`
- runner estimated cost at stop: `USD 0.23608009`

The raw run directory is transient operational evidence and should be archived outside the mutable `runs/` working location before v2 live execution. The archive SHA-256 should be recorded alongside the archive; this document intentionally does not invent a checksum before that archive exists.

## Protocol-defined stop

The exhausted logical cell was:

- sequence: `32`
- measurement: `M`
- task: `T-local-2`
- repeat: `6`
- arm: `B1`
- EL budget: `505`

All three scientific attempts were provider/infrastructure `response-incomplete` with `incompleteReason=max_output_tokens`, with reported output usage reaching the frozen `7000` token cap. Each attempt was explicitly adjudicated `infrastructure-invalid` under the v1 execution protocol. Attempt 3 therefore triggered `max-infrastructure-attempts-exhausted` and left the run at `needs-audit`.

No fourth attempt, cell skipping, output-cap change, or in-run protocol amendment was performed.

## Interpretation boundary

This stop is not evidence that `B1=505` is scientifically inferior, unusually difficult, or causally responsible for censoring. The v1 run is incomplete and was not designed to confirm arm-dependent censoring.

The observations that motivated the v2 reliability audit are exploratory only:

- repeated `max_output_tokens` censoring occurred before completion of the planned 864-cell calibration;
- one logical cell exhausted the frozen three-attempt replacement allowance;
- token/reasoning usage showed substantial within-arm variability in the partial run.

These observations may motivate a new preregistered secondary endpoint in v2, but they must not be presented as a confirmatory finding from v1.

## Structural variables that remain frozen

The EL budget grid is an experimental design variable and is not reopened by this diagnostic stop:

- `T_EL = 4046`
- `B0 = 0`
- `B1 = 505 = floor(T_EL/8)`
- `B2 = 1011 = floor(T_EL/4)`
- `B3 = 2023 = floor(T_EL/2)`
- `B4 = 3034 = floor(3*T_EL/4)`
- `AF = 4046`

The v2 audit is restricted to execution/reliability mechanics and newly preregistered secondary measurement. The observed v1 outcome must not be used to move, merge, delete, or retune these budget points.

## Mutation-parity boundary

P6-3 v1 inherited the P6-2 mutation protocol parity surface, including failure-domain classification semantics. A future v2 automation may change who or what executes an already-deterministic adjudication (manual human confirmation versus deterministic code), but it must not silently change the meaning of `infrastructure-invalid`, the forced-choice parser/scorer semantics, path validation, or other P6-2 mutation-protocol parity semantics.

## v2 regression requirement

Before any P6-3 v2 live call, the automatic infrastructure classifier must be tested against the preserved v1 attempt artifacts.

At minimum the verifier must demonstrate that every v1 attempt that received a human `infrastructure-invalid` adjudication is classified identically by the deterministic v2 rule, and that the exhausted-cell transition is reproduced for sequence 32 after the third such attempt.

Any mismatch is a pre-live gate failure. v2 live execution must not begin until the mismatch is explained and the design is re-frozen.

## Evidence preservation action

Before v2 live execution, create an immutable archive of the v1 run directory and record its SHA-256. Recommended local procedure:

```bash
cd /Users/imahoriitsuki/Documents/study/aidd_ilm/aidd-ilm
V1_RUN="runs/_calibration/p6-3-el-calibration-luna__2026-09-26T09-49-02-071Z"
ARCHIVE="p6-3-v1-diagnostic-2026-09-26.tar.gz"
tar -czf "$ARCHIVE" "$V1_RUN"
shasum -a 256 "$ARCHIVE" > "$ARCHIVE.sha256"
cat "$ARCHIVE.sha256"
```

The archive checksum should then be appended to this finding or to a small immutable evidence manifest before v2 live execution.
