import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL } from "./src/p6/p6-3-execution-protocol";
import { P6_3_MUTATION_PROVIDER_CONTRACT } from "./src/p6/p6-3-mutation-protocol-parity";
import { P6_3_RSEM_PROVIDER_CONTRACT } from "./src/p6/p6-3-rsem-protocol-parity";
import {
  classifyP63V2AutoInfrastructure,
  P6_3_V2_AUTO_INFRA_MAX_OUTPUT_RULE_ID,
} from "./src/p6/p6-3-v2-auto-infra";
import {
  P6_3_V2_AUTOMATIC_INFRASTRUCTURE_RULE_IDS,
  P6_3_V2_EXECUTION_PARAMETERS_VERSION,
  P6_3_V2_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL,
  P6_3_V2_MUTATION_PROVIDER_CONTRACT,
  P6_3_V2_RSEM_PROVIDER_CONTRACT,
  P6_3_V2_SECONDARY_ENDPOINT_IDS,
  P6_3_V2_SECONDARY_SUMMARY_IDS,
  P6_3_V2_SELECTION_RELIABILITY_GATE,
} from "./src/p6/p6-3-v2-execution-parameters";

const structuralPath = path.resolve(__dirname, "frozen/p6-3-el-structural-freeze.json");
const manifestPath = path.resolve(__dirname, "frozen/p6-3-v2-execution-parameters.json");
const structural = JSON.parse(fs.readFileSync(structuralPath, "utf8")) as any;
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as any;

const expectedBudgets = {
  B0: 0,
  B1: 505,
  B2: 1011,
  B3: 2023,
  B4: 3034,
  AF: 4046,
};

// Structural experiment variables remain exactly as frozen before v1.
assert.equal(structural.freezeCandidate?.T_EL, 4046);
assert.equal(structural.freezeCandidate?.staticExposureMaxTokensPerUnit, 256);
assert.deepEqual(structural.freezeCandidate?.budgets, expectedBudgets);
assert.equal(manifest.structuralVariables?.immutable, true);
assert.equal(manifest.structuralVariables?.T_EL, 4046);
assert.equal(manifest.structuralVariables?.staticExposureMaxTokensPerUnit, 256);
assert.deepEqual(manifest.structuralVariables?.budgets, expectedBudgets);

// Historical v1 contracts must remain intact.
assert.equal(P6_3_MUTATION_PROVIDER_CONTRACT.maxOutputTokens, 7000);
assert.equal(P6_3_RSEM_PROVIDER_CONTRACT.maxOutputTokens, 8000);
assert.equal(P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL, 3);
assert.equal(manifest.predecessor?.v1MutationMaxOutputTokens, 7000);
assert.equal(manifest.predecessor?.v1RSemMaxOutputTokens, 8000);
assert.equal(manifest.predecessor?.v1MaxScientificAttemptsPerLogicalCell, 3);
assert.equal(
  manifest.predecessor?.v1ArchiveSha256,
  "09c58838f2396ceeabe54f8843b922dee2849d57994843d9a714afcd08debb94"
);

// The sole v2 mutation-provider amendment is deterministic 2x output headroom.
assert.equal(P6_3_V2_EXECUTION_PARAMETERS_VERSION, "p6-3-v2-execution-parameters-v1");
assert.equal(P6_3_V2_MUTATION_PROVIDER_CONTRACT.maxOutputTokens, 14000);
assert.equal(
  P6_3_V2_MUTATION_PROVIDER_CONTRACT.maxOutputTokens,
  P6_3_MUTATION_PROVIDER_CONTRACT.maxOutputTokens * 2
);
for (const key of [
  "model",
  "reasoningEffort",
  "requestTimeoutMs",
  "providerMaxRetries",
  "serviceTier",
  "promptCacheMode",
  "storeResponses",
  "maxToolRounds",
] as const) {
  assert.deepEqual(
    P6_3_V2_MUTATION_PROVIDER_CONTRACT[key],
    P6_3_MUTATION_PROVIDER_CONTRACT[key],
    `unexpected v2 mutation-provider drift in ${key}`
  );
}
assert.deepEqual(manifest.mutationProvider, {
  ...P6_3_V2_MUTATION_PROVIDER_CONTRACT,
  amendment: {
    field: "maxOutputTokens",
    from: 7000,
    to: 14000,
    selectionRule: "deterministic-2x-v1-cap",
    rationaleClass: "execution-reliability-not-budget-retuning",
  },
});

// Rsem and scientific attempt ceiling are preserved.
assert.deepEqual(P6_3_V2_RSEM_PROVIDER_CONTRACT, P6_3_RSEM_PROVIDER_CONTRACT);
assert.deepEqual(manifest.rsemProvider, {
  ...P6_3_V2_RSEM_PROVIDER_CONTRACT,
  amendedFromV1: false,
});
assert.equal(P6_3_V2_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL, 3);
assert.equal(
  P6_3_V2_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL,
  P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL
);
assert.deepEqual(manifest.executionPolicy, {
  maxScientificAttemptsPerLogicalCell: 3,
  exhaustedCellCollectionDisposition: "censored-exhausted-and-continue",
  anyExhaustedCellBlocksBExposeSelection: true,
});

// Only the actual-v1-regressed AUTO-INFRA rule is authorized unattended.
assert.deepEqual([...P6_3_V2_AUTOMATIC_INFRASTRUCTURE_RULE_IDS], [P6_3_V2_AUTO_INFRA_MAX_OUTPUT_RULE_ID]);
assert.deepEqual(manifest.automaticInfrastructureRuleIds, [P6_3_V2_AUTO_INFRA_MAX_OUTPUT_RULE_ID]);
const v2CapClassification = classifyP63V2AutoInfrastructure({
  executionStatus: "response-incomplete",
  incompleteReason: "max_output_tokens",
  outputTokens: P6_3_V2_MUTATION_PROVIDER_CONTRACT.maxOutputTokens,
  configuredMaxOutputTokens: P6_3_V2_MUTATION_PROVIDER_CONTRACT.maxOutputTokens,
  responseStatus: "incomplete",
  providerErrorCode: null,
  errorCategory: "response",
});
assert.equal(v2CapClassification.disposition, "infrastructure-invalid");
assert.equal(v2CapClassification.ruleId, P6_3_V2_AUTO_INFRA_MAX_OUTPUT_RULE_ID);

// Secondary reliability endpoints/summaries are frozen before v2 live data.
assert.deepEqual(manifest.secondaryEndpointIds, [...P6_3_V2_SECONDARY_ENDPOINT_IDS]);
assert.deepEqual(manifest.secondarySummaryIds, [...P6_3_V2_SECONDARY_SUMMARY_IDS]);
assert.deepEqual(P6_3_V2_SELECTION_RELIABILITY_GATE, {
  exhaustedLogicalCellsAllowedForBExposeSelection: 0,
  exhaustedStatus: "censored-exhausted",
  blockedFinalStatus: "needs-design-audit",
});
assert.equal(manifest.liveExecutionAuthorized, false);
assert.equal(manifest.status, "execution-parameter-freeze");

console.log(JSON.stringify({
  ok: true,
  structuralBudgetsUnchanged: true,
  v1MutationMaxOutputTokens: P6_3_MUTATION_PROVIDER_CONTRACT.maxOutputTokens,
  v2MutationMaxOutputTokens: P6_3_V2_MUTATION_PROVIDER_CONTRACT.maxOutputTokens,
  v2CapAutoInfraRuleVerified: v2CapClassification.ruleId,
  rsemMaxOutputTokens: P6_3_V2_RSEM_PROVIDER_CONTRACT.maxOutputTokens,
  maxScientificAttemptsPerLogicalCell: P6_3_V2_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL,
  automaticInfrastructureRuleIds: P6_3_V2_AUTOMATIC_INFRASTRUCTURE_RULE_IDS,
  secondaryEndpointCount: P6_3_V2_SECONDARY_ENDPOINT_IDS.length,
  liveExecutionAuthorized: manifest.liveExecutionAuthorized,
}));
