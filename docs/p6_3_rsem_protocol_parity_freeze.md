# P6-3 Rsem protocol parity freeze

**Status**: pre-live parity freeze; no live API execution

## Purpose

P6-3 Rsem calibration must vary only the static artifact exposure while preserving the P6-2 AF Rsem measurement protocol. This freeze makes the 12-probe bank, prompt, response schema, completed-response parser/scorer, failure semantics, and provider settings machine-checkable before live-runner integration.

## Historical root of trust

The committed P6-2 AF baseline evidence at `docs/findings/evidence/p6-2-af-baseline/result.json` is authoritative for the historical Rsem protocol. P6-3 inherits and verifies:

- `stage1-neutral-relation-v2`
- the 12 opaque boolean probe IDs `A-obfuscated-bool-r01` through `r12`
- boolean probe-bank hash
- ground-truth / naming-scheme hashes
- `p6-2-af-probe-prompt-v1` and its template hash
- `p6-2-af-boolean-answers-v1` and its schema hash
- `gpt-5.6-luna`, reasoning=`high`, probe max output 8000
- timeout 180000 ms, provider retries 2, `serviceTier=default`, `promptCacheMode=implicit`
- P6-2 Rsem parse and failure-domain semantics

The dedicated CI also runs the exact P6-2 critical-source fingerprint verifier added with the M parity freeze. Therefore the historical runner, Stage 1 probe generator/scorer, OpenAI shared request helpers, and other P6-2 critical sources must still match the P6-2 evidence fingerprint.

## Allowed difference

Across P6-3 arms, the intended scientific treatment is the repository evidence supplied to the prompt.

- EL arms receive the already-frozen static exposure `contextFiles`.
- AF receives the actual Artifact-Full repository context through the AF path.
- The question bank, answer instructions, structured schema, provider settings, parser/scorer, and failure semantics do not change with the arm.

The parity prompt builder reads only each probe's `probeId` and public `prompt`. `correctAnswer`, candidate-source provenance, matched invariant IDs, reachable-counterexample metadata, and observed outcomes are forbidden from affecting prompt or schema construction. The verifier poisons those fields and requires prompt/schema equality.

## Forced-choice semantics

The P6-2 prompt asks for exact `true` / `false` strings. The historical scorer additionally normalizes the existing aliases implemented in `probe-scorer.ts` (`yes/no`, `1/0`, `はい/いいえ`). This freeze preserves the actual P6-2 parser/scorer behavior rather than silently tightening or relaxing it only for P6-3.

Invalid JSON and malformed/missing forced-choice answers remain protocol failures. Provider errors, refusals, and non-completed responses remain infrastructure-invalid. A scoring exception remains a system-domain infrastructure-invalid observation requiring audit. These semantics are frozen independently from the P6-3 scientific-cell replacement rule.

## Retry distinction

OpenAI client `maxRetries=2` is provider/SDK retry behavior. P6-3 scientific replacement is separate: after explicit `infrastructure-invalid` adjudication, the same logical cell is retried immediately, up to 3 scientific attempts, according to `p6-3-execution-protocol-v1`.

## Verification

`verify:p6-3-rsem-protocol-parity`:

1. verifies immutable P6-2 AF evidence;
2. regenerates the balanced 12 boolean probes using the unchanged P6-2 generator;
3. checks bank, ground-truth, naming-scheme, prompt-template, and schema hashes against historical evidence;
4. checks exact probe IDs and provider contract;
5. checks deterministic repository framing;
6. injects poisoned correct-answer/provenance fields and requires prompt/schema invariance;
7. replays P6-2-compatible parser behavior cases;
8. freezes runner-level Rsem failure semantics;
9. fingerprints the current P6-3 Rsem parity surface; and
10. requires exact equality with the committed machine-readable manifest.

This freeze still does not make paid API calls and does not implement the P6-3 live runner itself.
