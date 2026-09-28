# P6-3 v2 Live Calibration Evidence

This directory preserves the completed P6-3 v2 paid/live calibration evidence
before scientific outcome analysis and B_expose selection.

## Run identity

- run class: scientific-calibration
- calibration only: true
- confirmatory Stage 1A eligible: false
- source checkout SHA: `62110faebc0fa748effa90cb0f44f7c05f479c10`
- model: `gpt-5.6-luna`
- reasoning effort: `high`
- planned logical cells: 864
- completed logical cells: 864
- terminal status: `completed`
- exhausted logical cells: 0
- unresolved audit flag: none
- estimated stored cost: `$4.26978993`

Original local run:

`runs/p6-3-v2-live-2026-09-28T02-32-19-758Z/`

## Interruption / adjudication

The host PC rebooted while sequence 199 / attempt 1 was provider-visible but
before a committed result was persisted.

The frozen recovery protocol converted this uncertain in-flight attempt to
`needs-audit`. It was manually adjudicated as `infrastructure-invalid`, after
which the same logical cell resumed at attempt 2.

The adjudication is preserved in `adjudications.json` and `state.json`.

## Preserved files

- `state.json` — terminal calibration state and scientific attempt journal
- `final-report.json` — terminal execution and secondary reliability report
- `p6-3-v2-final-prelive-receipt.json` — frozen pre-live safety evidence
- `p6-3-v2-paid-live-wiring-receipt.json` — paid/live wiring safety evidence
- `adjudications.json` — explicit manual adjudication for the interrupted attempt

## Analysis boundary

These files were promoted to repository evidence before calculating the
P6-3 M/Rsem budget-selection result.

No B_expose selection or scientific interpretation is asserted by this
evidence snapshot itself.
