# P6-3 v3 live diagnostic-stop evidence archive

This directory is the promoted repository evidence archive for the incomplete
P6-3 v3 live calibration that stopped fail-closed at logical sequence 793.

## Scientific status

This archive is diagnostic evidence only.

It is **not** a completed P6-3 v3 calibration, must not be used to select or
freeze `B_expose`, and must not be interpreted as a completed M/Rsem co-gate.

## Source run

- local source run: `runs/p6-3-v3-live-2026-10-02T01-05-47-094Z/`
- checkout git SHA: `c6b078dae6a9f8536b9dd283e06ccb4384850d47`
- planned logical cells: 864
- completed logical cells: 793
- scientific attempts recorded: 796
- M: 792 / 792 logical cells completed
- Rsem: 1 / 72 logical cells completed
- exhausted logical sequence: 793
- exhausted attempts: 3
- terminal state: `needs-audit / max-infrastructure-attempts-exhausted`

The original `runs/` directory remains local and is not committed.

## Payload boundary

The promoted payload contains 804 files:

- 796 attempt artifacts
- 3 adjudication-request artifacts for sequence 793
- `adjudications.json`
- `fixed-environment-run.json`
- `p6-3-v3-final-prelive-receipt.json`
- `state.json`
- `treatment-provenance.json`

`README.md`, `RAW_SHA256SUMS`, and `SHA256SUMS` are archive metadata and are
not members of the 804-file payload.

## Sanitization

Before repository promotion, machine-local paths were sanitized in 94 text
files. Sanitization was restricted to path normalization:

- repository-local absolute path -> `<REPO_ROOT>`
- ephemeral scorer working directory -> `<SCORING_TMP>`

No scientific observation, score, treatment assignment, provider result,
adjudication, or experimental state was intentionally changed.

## Integrity manifests

`RAW_SHA256SUMS` records SHA-256 fingerprints of the same 804 payload files
before sanitization.

`SHA256SUMS` records SHA-256 fingerprints of the 804 repository copies after
sanitization and is the integrity manifest for the files stored here.

Because 94 payload files were path-sanitized, their repository bytes are
expected not to match their entries in `RAW_SHA256SUMS`.

The path membership of `RAW_SHA256SUMS` and `SHA256SUMS` is identical.
