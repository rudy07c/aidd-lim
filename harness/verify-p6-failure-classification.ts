import assert from "assert";
import {
  classifyFailure,
  classifyTaskEligibility,
  DEFAULT_P6_1_ELIGIBILITY_RULE,
} from "./src/p6/failure-classification";

function repeat(
  taskId: string,
  repeatNo: number,
  passed: boolean,
  failureCategory: string | null = null,
  executionStatus = "ok",
  failureReason: string | null = null,
  validity = "valid",
  taskType?: string
) {
  return {
    taskId,
    taskType: taskType ?? (taskId.startsWith("T-crosscut") ? "cross_cutting" : taskId.startsWith("T-delayed") ? "delayed_dependency" : "local"),
    repeat: repeatNo,
    passed,
    validity,
    failureCategory,
    failureReason,
    executionStatus,
  };
}

assert.equal(classifyFailure(repeat("x", 1, false, "test-failure", "ok", "task-specific: invariant mismatch")).failureDomain, "semantic");
assert.equal(classifyFailure(repeat("x", 1, false, "output-parse", "output-parse-failure", "Duplicate modified file path")).failureDomain, "protocol");
assert.equal(classifyFailure(repeat("x", 1, false, "protocol-contract", "ok", "contract changed")).failureDomain, "protocol");
assert.equal(classifyFailure(repeat("x", 1, false, "test-failure", "ok", "visible:execution:tsc failed")).failureDomain, "system");
assert.equal(classifyFailure(repeat("x", 1, false, "provider", "provider-error", "timeout", "infrastructure-invalid")).failureDomain, "infrastructure");

for (const status of ["response-incomplete", "response-failed", "response-refusal", "response-not-completed"]) {
  const classified = classifyFailure(repeat("x", 1, false, "response", status, status, "valid"));
  assert.equal(classified.failureDomain, "infrastructure", `${status} must be infrastructure`);
  assert.equal(classified.infrastructureFailure, true, `${status} must set infrastructureFailure`);
}

const historicalP61 = [
  repeat("T-local-2", 1, true),
  repeat("T-local-2", 2, false, "output-parse", "output-parse-failure", "Duplicate modified file path: src/vok/rules.ts"),
  repeat("T-local-2", 3, true),

  repeat("T-crosscut-1", 1, true),
  repeat("T-crosscut-1", 2, true),
  repeat("T-crosscut-1", 3, true),

  repeat("T-delayed-1", 1, true),
  repeat("T-delayed-1", 2, true),
  repeat("T-delayed-1", 3, true),

  repeat("T-crosscut-2", 1, false, "test-failure", "ok", "task-specific: invariant guard failure"),
  repeat("T-crosscut-2", 2, false, "test-failure", "ok", "task-specific: state transition failure"),
  repeat("T-crosscut-2", 3, false, "output-parse", "output-parse-failure", "Duplicate modified file path: src/vok/rules.ts"),

  repeat("T-local-1", 1, false, "test-failure", "ok", "task-specific: invariant guard failure"),
  repeat("T-local-1", 2, false, "test-failure", "ok", "task-specific: invariant guard failure"),
  repeat("T-local-1", 3, false, "test-failure", "ok", "task-specific: invariant guard failure"),
];

const byTask = new Map<string, ReturnType<typeof classifyTaskEligibility>>();
for (const taskId of [...new Set(historicalP61.map((r) => r.taskId))]) {
  byTask.set(taskId, classifyTaskEligibility(historicalP61.filter((r) => r.taskId === taskId), DEFAULT_P6_1_ELIGIBILITY_RULE));
}

assert.deepStrictEqual(
  pick(byTask.get("T-local-2")!),
  { semanticSuccesses: 2, semanticFailures: 0, protocolFailures: 1, protocolReliability: 2 / 3, capabilityClass: "eligible", analysisRole: "main", classification: "T_primary-eligible" }
);
assert.deepStrictEqual(
  pick(byTask.get("T-crosscut-1")!),
  { semanticSuccesses: 3, semanticFailures: 0, protocolFailures: 0, protocolReliability: 1, capabilityClass: "eligible", analysisRole: "main", classification: "T_primary-eligible" }
);
assert.deepStrictEqual(
  pick(byTask.get("T-delayed-1")!),
  { semanticSuccesses: 3, semanticFailures: 0, protocolFailures: 0, protocolReliability: 1, capabilityClass: "eligible", analysisRole: "main", classification: "T_primary-eligible" }
);
assert.deepStrictEqual(
  pick(byTask.get("T-crosscut-2")!),
  { semanticSuccesses: 0, semanticFailures: 2, protocolFailures: 1, protocolReliability: 2 / 3, capabilityClass: "semantic-floor", analysisRole: "main", classification: "T_challenge-semantic-floor" }
);
assert.deepStrictEqual(
  pick(byTask.get("T-local-1")!),
  { semanticSuccesses: 0, semanticFailures: 3, protocolFailures: 0, protocolReliability: 1, capabilityClass: "semantic-floor", analysisRole: "main", classification: "T_challenge-semantic-floor" }
);

const unstable = classifyTaskEligibility([
  repeat("T-unstable", 1, true),
  repeat("T-unstable", 2, false, "test-failure", "ok", "task-specific: mismatch"),
  repeat("T-unstable", 3, false, "test-failure", "ok", "task-specific: mismatch"),
]);
assert.equal(unstable.capabilityClass, "AF-unstable");
assert.equal(unstable.needsAdditionalRepeat, false);

const pendingAtThree = classifyTaskEligibility([
  repeat("T-pending", 1, true),
  repeat("T-pending", 2, false, "output-parse", "output-parse-failure", "parse"),
  repeat("T-pending", 3, false, "test-failure", "ok", "visible:execution:tsc failed"),
]);
assert.equal(pendingAtThree.capabilityClass, "pending");
assert.equal(pendingAtThree.needsAdditionalRepeat, true);

const unstableAtMax = classifyTaskEligibility([
  repeat("T-pending", 1, true),
  repeat("T-pending", 2, false, "output-parse", "output-parse-failure", "parse"),
  repeat("T-pending", 3, false, "test-failure", "ok", "visible:execution:tsc failed"),
  repeat("T-pending", 4, false, "output-parse", "output-parse-failure", "parse"),
  repeat("T-pending", 5, false, "test-failure", "ok", "hidden:execution:tsc failed"),
]);
assert.equal(unstableAtMax.capabilityClass, "AF-unstable");
assert.equal(unstableAtMax.decisionReason, "max-attempts-one-semantic-success");

const invalidAtMax = classifyTaskEligibility([
  repeat("T-invalid", 1, false, "test-failure", "ok", "task-specific: mismatch"),
  repeat("T-invalid", 2, false, "output-parse", "output-parse-failure", "parse"),
  repeat("T-invalid", 3, false, "test-failure", "ok", "visible:execution:tsc failed"),
  repeat("T-invalid", 4, false, "output-parse", "output-parse-failure", "parse"),
  repeat("T-invalid", 5, false, "test-failure", "ok", "hidden:execution:tsc failed"),
]);
assert.equal(invalidAtMax.capabilityClass, "invalid");
assert.equal(invalidAtMax.decisionReason, "max-attempts-insufficient-semantic-evidence");

const invariantEligible = classifyTaskEligibility([
  repeat("T-invariant-stress-x", 1, true, null, "ok", null, "valid", "invariant_stressing"),
  repeat("T-invariant-stress-x", 2, true, null, "ok", null, "valid", "invariant_stressing"),
  repeat("T-invariant-stress-x", 3, false, "test-failure", "ok", "task-specific: mismatch", "valid", "invariant_stressing"),
]);
assert.equal(invariantEligible.capabilityClass, "eligible");
assert.equal(invariantEligible.analysisRole, "diagnostic");
assert.equal(invariantEligible.classification, "T_diagnostic-eligible");

console.log("P6 failure-domain/capability classification verified, including response censoring, finite hold rule, role split, and 2026-09-20 pilot reclassification.");

function pick(x: ReturnType<typeof classifyTaskEligibility>) {
  return {
    semanticSuccesses: x.semanticSuccesses,
    semanticFailures: x.semanticFailures,
    protocolFailures: x.protocolFailures,
    protocolReliability: x.protocolReliability,
    capabilityClass: x.capabilityClass,
    analysisRole: x.analysisRole,
    classification: x.classification,
  };
}
