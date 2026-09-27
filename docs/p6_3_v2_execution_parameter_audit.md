# P6-3 v2 execution-parameter audit

**Status:** execution-parameter freeze; paid/live P6-3 v2 execution is still not authorized by this document  
**Parent design boundary:** `docs/p6_3_v2_design_audit.md`  
**Frozen machine-readable contract:** `harness/frozen/p6-3-v2-execution-parameters.json`

## 1. Decision boundary

This audit changes execution/reliability mechanics only. It does **not** reopen the structural EL exposure design.

The following remain immutable:

```text
T_EL = 4046
maxTokensPerUnit = 256
B0 = 0
B1 = 505
B2 = 1011
B3 = 2023
B4 = 3034
AF = 4046
```

The v1 hard stop occurred at a B1 cell, but that observation is not used to move, merge, delete, or otherwise tune any budget point.

## 2. v1 reliability evidence used for this audit

The preserved v1 diagnostic run stopped after 32 completed logical cells and 43 scientific attempts. It contained 11 human-adjudicated `infrastructure-invalid` attempts, all reproduced by `AUTO-INFRA-001` from raw provider evidence. The terminal logical cell reached three consecutive `response-incomplete / max_output_tokens` outcomes at the frozen 7000-token mutation cap.

This evidence establishes that the v1 execution envelope was not sufficiently reliable to complete the planned calibration under its own hard-stop rule. It does **not** establish an arm effect, monotonicity, bimodality, or a special B1 phenomenon.

The v1 data are used here only to motivate an execution-reliability amendment. They are not pooled into v2 primary M/Rsem estimates.

## 3. Mutation output cap amendment: 7000 -> 14000

P6-3 v2 changes one mutation-provider parameter:

```text
maxOutputTokens: 7000 -> 14000
```

The need to revisit the cap is informed by the v1 hard stop. The numerical amendment itself is fixed **after v1 and before any v2 live data** by the mechanical rule `deterministic-2x-v1-cap`; it is not fitted to an arm, task, score, or successful v1 completion length. This rule was not preregistered before v1 and is therefore described as a v2 design amendment, not as a v1-preregistered decision.

The purpose is to provide additional completion headroom after v1 demonstrated repeated exact-cap censoring. This amendment does not assert that 14000 eliminates censoring. If max-output censoring remains, it is recorded as a preregistered v2 secondary reliability endpoint; repeated deterministic infrastructure failures may become `censored-exhausted`, and any exhausted logical cell blocks `B_expose` selection.

The historical v1 mutation-parity contract remains unchanged at 7000. v2 uses a new versioned execution contract rather than rewriting v1 provenance.

## 4. Parameters preserved

The following mutation settings remain unchanged from v1:

- model: `gpt-5.6-luna`
- reasoning effort: `high`
- request timeout: `180000 ms`
- provider SDK retries: `2`
- service tier: `default`
- prompt cache: `implicit`
- response storage: `false`
- maximum tool rounds: `0`

Reasoning effort is deliberately preserved because changing it would alter model behavior more materially than increasing the completion envelope. The v1 hard stop was caused by exact output-cap exhaustion, not a timeout, so the timeout is not amended.

## 5. Rsem provider envelope preserved

The Rsem provider contract remains unchanged, including `maxOutputTokens = 8000`.

The v1 run stopped during M collection before it generated new P6-3 Rsem live observations. There is therefore no v1 P6-3 reliability evidence supporting a post-v1 Rsem parameter amendment.

## 6. Scientific attempt ceiling preserved at three

P6-3 v2 keeps:

```text
maxScientificAttemptsPerLogicalCell = 3
```

The source of v1 operational brittleness was not merely the numeric ceiling; it was that exhausting one logical cell terminated collection of all remaining cells. v2 addresses that problem structurally by recording `censored-exhausted` and continuing collection, while conservatively blocking `B_expose` selection if any exhaustion occurs.

Increasing the retry ceiling is therefore not needed to make collection robust and would increase repeated-call exposure without new evidence for a specific alternative ceiling.

Provider SDK `maxRetries = 2` remains a separate transport-level setting and is not counted as scientific replacement attempts.

## 7. Automatic infrastructure rules

Only `AUTO-INFRA-001` is authorized for unattended adjudication in this freeze:

```text
executionStatus == response-incomplete
AND incompleteReason == max_output_tokens
AND provider-reported outputTokens == configured maxOutputTokens
=> infrastructure-invalid
```

No new automatic rule is added for timeout, 429, 5xx, refusal, or other provider states in this amendment. Such states remain fail-closed `needs-audit` unless a later rule is separately specified and regression-tested before live use.

## 8. Secondary reliability endpoints frozen before v2 data

The v2 contract preregisters the following per-attempt/per-cell information:

- max-output censoring indicator;
- logical-cell any-censoring indicator;
- attempts to valid scientific observation;
- `censored-exhausted` indicator;
- provider-reported output tokens;
- provider-reported reasoning-output tokens where available;
- raw execution status;
- raw incomplete reason;
- arm / task / repeat / measurement identity.

Predeclared summaries are:

- arm-level censoring count and rate;
- M task x arm censoring count and rate;
- attempt-count distribution by arm;
- raw token-use distributions by arm with ranges and quantiles rather than means alone;
- exhausted-cell locations without post-hoc removal.

These endpoints are reliability diagnostics. They do not replace primary M/Rsem calibration criteria.

## 9. Selection gate remains conservative

Collection and selection remain separate:

```text
exhausted logical cells == 0
  -> primary preregistered B_expose selection rule may be evaluated

exhausted logical cells > 0
  -> collection may finish
  -> status = needs-design-audit
  -> B_expose selection is prohibited
```

No complete-case deletion or post-hoc missing-data rule is authorized.

## 10. What is still required before live v2

This audit does not authorize paid/live calls. Before P6-3 v2 live execution, the repository still needs:

1. all-attempt persistence of the frozen secondary token/censoring endpoints;
2. a deterministic secondary-summary analyzer/verifier;
3. live executor/CLI wiring to the v2 unattended runner;
4. machine verification that the v1 structural grid is unchanged;
5. machine verification of this execution-parameter manifest;
6. a final v2 pre-live manifest/gate binding the exact checkout SHA and relevant file/manifests hashes;
7. explicit paid/live authorization at invocation time.
