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
  validity = "valid"
) {
  return {
    taskId,
    taskType: taskId.startsWith("T-crosscut") ? "cross_cutting" : taskId.startsWith("T-delayed") ? "delayed_dependency" : "local",
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
  { semanticSuccesses: 2, semanticFailures: 0, protocolFailures: 1, protocolReliability: 2 / 3, classification: "T_primary-eligible" }
);
assert.deepStrictEqual(
  pick(byTask.get("T-crosscut-1")!),
  { semanticSuccesses: 3, semanticFailures: 0, protocolFailures: 0, protocolReliability: 1, classification: "T_primary-eligible" }
);
assert.deepStrictEqual(
  pick(byTask.get("T-delayed-1")!),
  { semanticSuccesses: 3, semanticFailures: 0, protocolFailures: 0, protocolReliability: 1, classification: "T_primary-eligible" }
);
assert.deepStrictEqual(
  pick(byTask.get("T-crosscut-2")!),
  { semanticSuccesses: 0, semanticFailures: 2, protocolFailures: 1, protocolReliability: 2 / 3, classification: "T_challenge-semantic-floor" }
);
assert.deepStrictEqual(
  pick(byTask.get("T-local-1")!),
  { semanticSuccesses: 0, semanticFailures: 3, protocolFailures: 0, protocolReliability: 1, classification: "T_challenge-semantic-floor" }
);

console.log("P6 failure-domain classification verified, including 2026-09-20 5-task reclassification.");

function pick(x: ReturnType<typeof classifyTaskEligibility>) {
  return {
    semanticSuccesses: x.semanticSuccesses,
    semanticFailures: x.semanticFailures,
    protocolFailures: x.protocolFailures,
    protocolReliability: x.protocolReliability,
    classification: x.classification,
  };
}
