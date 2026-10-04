# P6-3 v3 M evaluator-boundary sensitivity evidence

This directory is the durable repository evidence boundary for the post-hoc P6-3 v3 M evaluator-boundary design audit.

## Scientific status

All contents here are:

```text
analysisClass = post-hoc-design-audit-sensitivity
primaryResultReplaced = false
confirmatoryClaim = false
stage1AEffectClaim = false
```

They do not replace the frozen primary P6-3 v3 result and do not authorize provider/live execution.

## Files to promote from the completed local analysis

Promote exact copies of:

```text
runs/p6-3-v3-m-evaluator-boundary-audit.json
runs/p6-3-v3-m-evaluator-sensitivity-proof.json
runs/p6-3-v3-m-evaluator-sensitivity-full.json
runs/p6-3-v3-corrected-m-cogate-sensitivity.json
```

under this directory using the same basenames.

The fresh Rsem split-provenance source remains a separate calibration-completion artifact and must not be rewritten or merged into these files.

## Integrity manifest

After copying the four files, create `SHA256SUMS` from the repository root:

```bash
shasum -a 256 \
  docs/findings/evidence/p6-3-v3-m-evaluator-boundary-sensitivity/p6-3-v3-m-evaluator-boundary-audit.json \
  docs/findings/evidence/p6-3-v3-m-evaluator-boundary-sensitivity/p6-3-v3-m-evaluator-sensitivity-proof.json \
  docs/findings/evidence/p6-3-v3-m-evaluator-boundary-sensitivity/p6-3-v3-m-evaluator-sensitivity-full.json \
  docs/findings/evidence/p6-3-v3-m-evaluator-boundary-sensitivity/p6-3-v3-corrected-m-cogate-sensitivity.json \
  > docs/findings/evidence/p6-3-v3-m-evaluator-boundary-sensitivity/SHA256SUMS
```

Do not regenerate the analysis merely to obtain different formatting. The promoted JSON should be byte-for-byte copies of the outputs already produced by the completed audit commands.

## Expected durable headline quantities

The full corrected-evaluator sensitivity should report:

```text
total           = 792
originalPasses  = 273
correctedPasses = 464
changedToPass   = 191
changedToFail   = 0
```

The corrected-M co-gate sensitivity should report:

```text
status                  = selected
qualifyingInteriorArms  = [B2]
selectedArm             = B2
selectedBExpose         = 1011
reason                  = CONJUNCTIVE_INTERIOR_BUDGET_SELECTED
```

These values are checks for accidental file-selection mistakes during promotion, not a replacement for the SHA-256 integrity manifest.
