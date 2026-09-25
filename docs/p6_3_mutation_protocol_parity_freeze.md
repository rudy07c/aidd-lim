# P6-3 mutation protocol parity freeze

**Status**: pre-live parity freeze; no live API execution

## Purpose

P6-3 M calibration must vary artifact exposure without changing the mutation/output protocol that produced the P6-2 AF baseline. This freeze makes that parity machine-checkable before the P6-3 live runner is integrated.

## Historical root of trust

The committed P6-2 AF evidence at `docs/findings/evidence/p6-2-af-baseline/result.json` is the historical source of truth. Its immutable evidence SHA, source git SHA, historical critical-source fingerprint, prompt/schema versions and hashes, failure-classification version, provider execution settings, and observed protocol-failure anchors are inherited into the P6-3 parity manifest.

The historical critical-source fingerprint is retained as provenance; it is not naively recomputed against the evolved repository. Current parity is instead checked through exact prompt/schema hashes, current parity-surface source hashes, and explicit behavior tests.

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

`verify:p6-3-mutation-protocol-parity`:

1. verifies the immutable P6-2 evidence SHA;
2. inherits the historical source git SHA and critical-source fingerprint;
3. checks current prompt/schema versions and hashes against the P6-2 execution manifest;
4. checks the P6-2 mutation-call provider settings;
5. replays normalized parser/path-validation/failure-classification behavior cases;
6. checks historical observed anchors: 18 duplicate-path output-parse failures and one repository-contract mutation-validation failure;
7. fingerprints current parity-surface source files; and
8. requires exact equality with the committed machine-readable manifest.

This PR freezes M mutation protocol parity only. Rsem prompt/parse parity and live runner integration remain separate pre-live gates.
