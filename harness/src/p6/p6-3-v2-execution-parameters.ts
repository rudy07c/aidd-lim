import { P6_3_V2_AUTO_INFRA_MAX_OUTPUT_RULE_ID } from "./p6-3-v2-auto-infra";

export const P6_3_V2_EXECUTION_PARAMETERS_VERSION =
  "p6-3-v2-execution-parameters-v1" as const;

/**
 * P6-3 v2 execution/reliability contract.
 *
 * IMPORTANT: these are execution-environment parameters, not EL budget-grid
 * variables. The structural B0/B1/B2/B3/B4/AF grid remains frozen elsewhere
 * and is deliberately not configurable from this contract.
 */
export const P6_3_V2_MUTATION_PROVIDER_CONTRACT = Object.freeze({
  model: "gpt-5.6-luna",
  reasoningEffort: "high",
  maxOutputTokens: 14000,
  requestTimeoutMs: 180000,
  providerMaxRetries: 2,
  serviceTier: "default",
  promptCacheMode: "implicit",
  storeResponses: false,
  maxToolRounds: 0,
} as const);

/**
 * Rsem is unchanged from P6-3 v1/P6-2 parity because the v1 live run stopped
 * during M collection and therefore supplied no new Rsem reliability evidence.
 */
export const P6_3_V2_RSEM_PROVIDER_CONTRACT = Object.freeze({
  model: "gpt-5.6-luna",
  reasoningEffort: "high",
  maxOutputTokens: 8000,
  requestTimeoutMs: 180000,
  providerMaxRetries: 2,
  serviceTier: "default",
  promptCacheMode: "implicit",
  storeResponses: false,
  executionMode: "sync",
} as const);

export const P6_3_V2_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL = 3 as const;

export const P6_3_V2_AUTOMATIC_INFRASTRUCTURE_RULE_IDS = Object.freeze([
  P6_3_V2_AUTO_INFRA_MAX_OUTPUT_RULE_ID,
] as const);

export const P6_3_V2_SECONDARY_ENDPOINT_IDS = Object.freeze([
  "attempt-max-output-censoring-indicator",
  "logical-cell-any-censoring-indicator",
  "attempts-to-valid-scientific-observation",
  "censored-exhausted-indicator",
  "provider-output-tokens",
  "provider-reasoning-output-tokens",
  "raw-execution-status",
  "raw-incomplete-reason",
  "attempt-identity-arm-task-repeat-measurement",
] as const);

export const P6_3_V2_SECONDARY_SUMMARY_IDS = Object.freeze([
  "arm-censoring-count-and-rate",
  "m-task-by-arm-censoring-count-and-rate",
  "arm-attempt-count-distribution",
  "arm-token-usage-raw-range-and-quantiles",
  "exhausted-cell-locations",
] as const);

export const P6_3_V2_SELECTION_RELIABILITY_GATE = Object.freeze({
  exhaustedLogicalCellsAllowedForBExposeSelection: 0,
  exhaustedStatus: "censored-exhausted",
  blockedFinalStatus: "needs-design-audit",
} as const);
