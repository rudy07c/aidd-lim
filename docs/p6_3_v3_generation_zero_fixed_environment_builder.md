# P6-3 v3 — PR A: Generation-0 FixedEnvironment production builder

**Status:** implemented, offline-verified; not wired into `executeP63MCell`, `executeP63RSemCell`, or `orchestrator.ts`
**Depends on (unchanged by this PR):** `harness/src/context/fixed-environment-runtime.ts` (`FixedEnvironmentBinding`, PR #36/#37), `harness/src/context/fixed-world-protocol-spec.ts` (`FIXED_WORLD_PROTOCOL_SPEC`, PR #34/#35)
**Scope:** this PR adds exactly one new production function, `buildGenerationZeroFixedEnvironment()`, plus its offline verifier and CI workflow. It does not touch the M executor, the Rsem executor, or run orchestration.

## 1. Why this PR is scoped this narrowly

The upstream design already froze the *shape* of `E_fixed` (`FixedEnvironmentBinding`) and its *content* (`FIXED_WORLD_PROTOCOL_SPEC`). What was missing was the one function that turns a Generation-0 repository snapshot into a concrete binding — and nothing else. Building the M/Rsem wiring in the same PR would mix a narrow, easily-reviewed function with two separate, still-open design questions (v3 M executor shape, and a new Rsem wrapper that must not disturb historical `runRSemRepeat()` parity). Those are deliberately left to their own PRs (B and C).

## 2. Downstream interface contract (frozen by this PR)

> A run calls `buildGenerationZeroFixedEnvironment()` **exactly once**, at run start, from the Generation-0 repository snapshot. The resulting `Readonly<FixedEnvironmentBinding>` is then passed, byte-for-byte unchanged, into every generation/condition/arm/repeat of that run.

No M cell, no Rsem cell, and no per-arm code path may call this function (or `createFixedEnvironmentBinding` directly) itself — doing so would silently create a second, potentially-divergent `E_fixed` identity instead of reusing the one run-fixed binding. This is documented directly in the function's doc comment in `harness/src/context/generation-zero-fixed-environment.ts` and is checked by the offline verifier (§4, item 11): it inspects the source of `p6-3-live-executors.ts` and `orchestrator.ts` and fails if either references the new builder module or calls `createFixedEnvironmentBinding` directly.

Future PR B / PR C should thread a `fixedEnvironment: Readonly<FixedEnvironmentBinding>` parameter into `executeP63V3MCell` / `executeP63V3RSemCell` (new v3-only executors — the historical `executeP63MCell` / `executeP63RSemCell` are not modified), sourced from a single binding built once by the run's top-level orchestration.

## 3. Repository-hash canonicalization rule (frozen by this PR)

`sourceRepositorySha256` is computed as:

```text
sha256(serializeStaticRepositoryPayload(repositoryFiles))
```

reusing the **already-frozen** EL structural-freeze static repository serializer (`serializeStaticRepositoryPayload` / `STATIC_REPOSITORY_SERIALIZER_VERSION = "p6-3-static-repository-payload-v1"` in `harness/src/context/static-exposure.ts`): sorted file-path order, `"\n--- <path> ---\n<content>\n"` per file. This PR deliberately does **not** introduce a second, divergent canonicalization rule for the same repository content — it re-exports the existing version constant as `GENERATION_ZERO_REPOSITORY_SERIALIZER_VERSION` for provenance/logging clarity at the builder's call site.

`surfaceSpecSha256` is `sha256(FIXED_WORLD_PROTOCOL_SPEC)`; `surfaceSpecVersion` is `FIXED_WORLD_PROTOCOL_SPEC_VERSION`; `modelVisibleText` is `FIXED_WORLD_PROTOCOL_SPEC` verbatim (not re-derived or paraphrased).

## 4. Offline verifier (`harness/verify-p6-3-v3-generation-zero-fixed-environment.ts`, `npm run verify:p6-3-v3-generation-zero-fixed-environment`)

No provider call is made; no scientific outcome, ground truth, or hidden-evaluator data is read. Checks:

1. Build succeeds and the result passes `assertFixedEnvironmentBinding()`.
2. `sourceKind === "generation-zero"`.
3. `modelVisibleText` exactly equals `FIXED_WORLD_PROTOCOL_SPEC` (not paraphrased/truncated); `surfaceSpecVersion`/`surfaceSpecSha256` match.
4. `modelVisibleTokens` matches the existing canonical token counter (`countCanonicalTokens`) exactly.
5. `sourceRepositorySha256` matches `sha256(serializeStaticRepositoryPayload(repositoryFiles))` — the existing, frozen serializer.
6. Repository file **insertion order** does not affect the hash (same snapshot, reversed key order → identical `sourceRepositorySha256` and identity).
7. A one-byte content change anywhere in the snapshot changes the repository hash and the binding identity.
8. A spec-text change changes the surface hash and identity (exercised against the lower-level `createFixedEnvironmentBinding` primitive, since `FIXED_WORLD_PROTOCOL_SPEC` itself is a frozen constant this PR must not mutate).
9. Determinism: identical inputs reproduce an identical identity, and a full deep-equal binding, across repeated calls.
10. The builder's own source makes no provider call and reads no scientific-outcome data (denylist check against its import surface: no `agent-backend`, `openai`, `ground_truth`, `heldout_tasks`, etc.).
11. `executeP63MCell` / `executeP63RSemCell` (`p6-3-live-executors.ts`) and `orchestrator.ts` remain untouched by this PR (source-level check: neither references the new builder module or calls `createFixedEnvironmentBinding`/`buildGenerationZeroFixedEnvironment`).

All eleven checks pass as of this PR. CI: `.github/workflows/p6-3-v3-generation-zero-fixed-environment-ci.yml` (typecheck + this verifier, path-triggered on the builder, its dependencies, and the two executor/orchestrator files it must not touch).

## 5. What this PR does not do

- Does not wire `FixedEnvironmentBinding` into `executeP63MCell`, `executeP63RSemCell`, or `orchestrator.ts`'s run-start path. (Orchestrator already *accepts* an optional `fixedEnvironment` parameter from PR #36 — this PR adds the thing that could construct one, not a caller that does.)
- Does not add a v3 M executor or Rsem wrapper (PR B / PR C).
- Does not change `FixedEnvironmentBinding`'s shape or `FIXED_WORLD_PROTOCOL_SPEC`'s content.
- Does not touch the blended selector (`blended-static-exposure-selector.ts`) or any selector-freeze work.
- Does not authorize any paid/live P6-3 v3 execution.

## 6. Next steps

1. **PR B:** `executeP63V3MCell` — new v3-only M executor using `OpenAIV3FixedEnvironmentBackend`, taking a `fixedEnvironment` binding built once upstream by this PR's function.
2. **PR C:** `executeP63V3RSemCell` — new v3-only Rsem wrapper around historical `runRSemRepeat()` that adds the `E_fixed` channel without altering historical parity.
3. Offline parity/identity verification: same `fixedEnvironment` identity across all arms/conditions in a run; `B_work`/`B_expose` unaffected by `modelVisibleTokens`.
4. Candidate-selector re-audit and freeze (per `docs/p6_3_v3_contract_boundary_audit.md` §7–§8), budget grid/selection-margin predeclaration, pre-live gate — all before any live authorization.
