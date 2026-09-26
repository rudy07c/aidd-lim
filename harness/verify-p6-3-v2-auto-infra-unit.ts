import * as assert from "assert";
import {
  P6_3_V2_AUTO_INFRA_MAX_OUTPUT_RULE_ID,
  classifyP63V2AutoInfrastructure,
} from "./src/p6/p6-3-v2-auto-infra";

const exact = classifyP63V2AutoInfrastructure({
  executionStatus: "response-incomplete",
  incompleteReason: "max_output_tokens",
  outputTokens: 7000,
  configuredMaxOutputTokens: 7000,
  responseStatus: "incomplete",
  providerErrorCode: null,
  errorCategory: "response",
});
assert.equal(exact.disposition, "infrastructure-invalid");
assert.equal(exact.ruleId, P6_3_V2_AUTO_INFRA_MAX_OUTPUT_RULE_ID);

// Reasoning-token usage is intentionally not part of AUTO-INFRA-001. The v1
// examples varied widely while output usage reached the frozen cap.
for (const responseStatus of ["incomplete", null]) {
  const classification = classifyP63V2AutoInfrastructure({
    executionStatus: "response-incomplete",
    incompleteReason: "max_output_tokens",
    outputTokens: 7000,
    configuredMaxOutputTokens: 7000,
    responseStatus,
  });
  assert.equal(classification.disposition, "infrastructure-invalid");
}

assert.equal(
  classifyP63V2AutoInfrastructure({
    executionStatus: "response-incomplete",
    incompleteReason: "max_output_tokens",
    outputTokens: 6999,
    configuredMaxOutputTokens: 7000,
  }).disposition,
  "needs-audit"
);

assert.equal(
  classifyP63V2AutoInfrastructure({
    executionStatus: "response-incomplete",
    incompleteReason: "max_output_tokens",
    outputTokens: null,
    configuredMaxOutputTokens: 7000,
  }).disposition,
  "needs-audit"
);

assert.equal(
  classifyP63V2AutoInfrastructure({
    executionStatus: "response-incomplete",
    incompleteReason: "max_output_tokens",
    outputTokens: 7000,
    configuredMaxOutputTokens: null,
  }).disposition,
  "needs-audit"
);

assert.equal(
  classifyP63V2AutoInfrastructure({
    executionStatus: "response-incomplete",
    incompleteReason: "other_reason",
    outputTokens: 7000,
    configuredMaxOutputTokens: 7000,
  }).disposition,
  "needs-audit"
);

assert.equal(
  classifyP63V2AutoInfrastructure({
    executionStatus: "provider-error",
    incompleteReason: null,
    outputTokens: 0,
    configuredMaxOutputTokens: 7000,
  }).disposition,
  "needs-audit"
);

assert.equal(
  classifyP63V2AutoInfrastructure({
    executionStatus: "ok",
    incompleteReason: "max_output_tokens",
    outputTokens: 7000,
    configuredMaxOutputTokens: 7000,
  }).disposition,
  "needs-audit"
);

for (const status of ["ok", "output-parse-failure", "mutation-validation-failure", "tool-error"]) {
  const classification = classifyP63V2AutoInfrastructure({
    executionStatus: status,
    incompleteReason: null,
    outputTokens: 123,
    configuredMaxOutputTokens: 7000,
  });
  assert.equal(classification.disposition, "not-applicable", status);
  assert.equal(classification.ruleId, null, status);
}

console.log("P6-3 v2 AUTO-INFRA classifier unit verification passed");
