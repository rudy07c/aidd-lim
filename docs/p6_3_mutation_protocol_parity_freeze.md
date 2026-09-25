# P6-3 mutation protocol parity freeze

**Status**: pre-live parity freeze; no live API execution

## Purpose

P6-3 M calibration must vary artifact exposure without changing the mutation/output protocol that produced the P6-2 AF baseline. This freeze makes that parity machine-checkable before the P6-3 live runner is integrated.

## Historical root of trust

The committed P6-2 AF evidence at `docs/findings/evidence/p6-2-af-baseline/result.json` is the historical source of truth. Its immutable evidence SHA, source git SHA, historical critical-source fingerprint, prompt/schema versions and hashes, failure-classification version, provider execution settings, and observed protocol-failure anchors are inherited into the P6-3 parity manifest.

The current checkout is also re-hashed using the exact P6-2 critical-source fingerprint algorithm over the same 14-file list. Live preparation fails unless that combined fingerprint is byte-for-byte identical to the historical P6-2 value. The current `p6-af-baseline-live.ts` byte hash must likewise equal the historical `runnerSha256`. Normalized behavior fixtures and narrower current parity-surface hashes provide additional checks rather than substitutes for this exact historical-source parity.

## Frozen mutation surface

P6-3 M arms must preserve P6-2 semantics for:

- mutation system prompt version/hash
- mutation structured-output schema version/hash
- AF/EL user-message mutation framing apart from the intended `contextFiles` exposure difference
- structured-output parser behavior, including duplicate-path rejection and `workingNote` length enforcement
- repository write-path validation
- failure-domain classification
- model/reasoning/max-output/timeout/provider retry/service tier/cache/store/tool-round settings

`providerMaxRetries=2` is the OpenAI SDK/provider retry policy inherited from P6-2. It is distinct from the P6-3 scientific-cell replacement policy frozen in the execution protocol: explicitly adjudicated `infrastructure-invalid` cells may retry immediately up to 3 scientific attempts.

## Path validation

`validateP63MutationPathsP62Compatible()` is a P6-2-compatible shared contract for future P6-3 live integration. It permits normalized `src/` and `tests/` writes and rejects absolute paths, parent escapes, and paths outside that repository-write contract. P6-3 must not introduce a more permissive or more forgiving EL-only validator.

## Verification

The dedicated parity CI runs two complementary offline verifiers:

1. `verify-p6-3-p62-critical-source-fingerprint.ts` recomputes the historical 14-file combined critical-source fingerprint and the AF runner byte hash, requiring exact equality with the P6-2 evidence.
2. `verify:p6-3-mutation-protocol-parity` verifies the immutable P6-2 evidence SHA, checks current prompt/schema versions and hashes and provider settings, replays normalized parser/path-validation/failure-classification behavior cases, checks the historical 18 duplicate-path + one mutation-validation anchors, fingerprints the narrower current parity surface, and requires exact equality with the committed machine-readable manifest.

This PR freezes M mutation protocol parity only. Rsem prompt/parse parity and live runner integration remain separate pre-live gates.
