# P5.5 PR Luna live smoke findings

Date: 2026-09-15

This note preserves the scientifically useful outcome of the transient `runs/_smoke/` artifacts without keeping thousands of generated files under version control.

## What was exercised

- Condition: `PR`
- Backend/model: OpenAI Responses API / `gpt-5.6-luna`
- `reasoningEffort`: `high`
- Task: `T-crosscut-2`
- Research-stateless transport: `storeResponses=false`; no provider continuation state
- Shared retrieved runtime: `E_max -> BudgetedRepositoryGateway -> B_work -> fresh inference`

## Five live attempts

The five attempts covered the following operational outcomes:

1. E_max exhaustion before finalization.
2. E_max exhaustion before finalization.
3. Privileged retrieval-plan exhaustion before finalization.
4. Completed episode.
5. Completed episode.

These intermediate failures were useful for validating failure-aware episode logging and for discovering the need to distinguish scientific E_max exhaustion from provider/response failures.

## Representative successful run

The successful configuration committed as `harness/config/p5_5-pr-luna-live.json` used:

- `contextBudget` / `B_work`: 5000 tokens
- `maxRetrievalOperations`: 13
- `maxCumulativeRetrievedTokens`: 40000
- `maxModelCalls`: 13
- `maxDecisionRounds`: 13

Observed completion evidence from the successful smoke run:

- `completion.status = completed`
- 11 repository files retrieved
- 12 model calls
- `retrieved_episode_log` populated
- `storeResponses=false`
- `continuationState=none`
- B_work and E_max invariants satisfied
- `protocol_contract_violated=false`

These values are smoke/calibration observations only. They are **not** frozen scientific P6 values.

## Repository hygiene decision

Generated `runs/_smoke/` outputs are transient and are ignored by Git. Representative scientific/engineering findings should be summarized under `docs/findings/` (or intentionally promoted to a dedicated fixture/results directory) rather than committing entire smoke-run trees.
