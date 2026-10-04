import assert from "assert";
import {
  classifyMArtifactForBoundaryAudit,
} from "./analyze-p6-3-v3-m-evaluator-boundary";

function row(passed: boolean) {
  return {
    sequence: 7,
    taskId: "T-local-2",
    repeat: 2,
    armLabel: "B2",
    budgetTokens: 1011,
    passed,
    effectiveFailureDomain: passed ? "none" : "semantic",
  };
}

function baseArtifact(): { result: Record<string, any>; agent: Record<string, any> } {
  return {
    result: {
      passed: false,
      validity: "valid",
      failureCategory: "test-failure",
      failureReason: null,
      executionStatus: "ok",
      protocolContractViolated: false,
      visible: {
        passed: true,
        numPassed: 13,
        numFailed: 0,
        executionError: null,
        failedCases: [],
      },
      hidden: {
        passed: true,
        numPassed: 22,
        numFailed: 0,
        executionError: null,
        failedCases: [],
      },
      taskSpecific: {
        passed: true,
        numPassed: 3,
        numFailed: 0,
        executionError: null,
        failedCases: [],
      },
    },
    agent: {
      modifiedFiles: {},
    },
  };
}

// PASS remains PASS.
{
  const artifact = baseArtifact();
  artifact.result.passed = true;
  artifact.result.failureCategory = null as any;
  const classified = classifyMArtifactForBoundaryAudit({
    row: row(true),
    artifact,
    artifactPath: "fixture.json",
  });
  assert.equal(classified.classification, "PASS");
}

// C: visible + task-specific pass, hidden H(G) compile-only failure caused by
// unknown ↔ concrete WorldState coupling. Generic omission is recorded as
// mechanism evidence but is not required to define C.
{
  const artifact = baseArtifact();
  const error =
    "● Test suite failed to run\n" +
    "hidden_regression_tests/H_G.test.ts:20:3 - error TS2322: " +
    "Type 'unknown' is not assignable to type 'WorldState'.\n" +
    "hidden_regression_tests/H_G.test.ts:31:22 - error TS2345: " +
    "Argument of type 'unknown' is not assignable to parameter of type 'WorldState'.";
  artifact.result.failureReason = `hidden:[suite] undefined:  ${error}`;
  artifact.result.hidden = {
    passed: false,
    numPassed: 0,
    numFailed: 1,
    executionError: null,
    failedCases: [{ testName: "[suite] H_G.test.ts", error }],
  };
  artifact.agent.modifiedFiles = {
    "src/protocol_adapter.ts":
      "export const protocol: WorldProtocol = { applyOperation(state, op): OperationResult { throw new Error(); } };",
  };
  const classified = classifyMArtifactForBoundaryAudit({
    row: row(false),
    artifact,
    artifactPath: "fixture.json",
  });
  assert.equal(classified.classification, "C_EVALUATOR_INTERNAL_TYPE_COUPLING");
  assert.equal(classified.evidence.protocolAdapterGenericOmissionEvidence, true);
}

// B: explicit frozen scorer protocol violation.
{
  const artifact = baseArtifact();
  artifact.result.protocolContractViolated = true;
  artifact.result.failureCategory = "protocol-contract";
  artifact.result.hidden = {
    passed: false,
    numPassed: 0,
    numFailed: 1,
    executionError: null,
    failedCases: [{ testName: "[suite] protocol_adapter.ts", error: "has no exported member" }],
  };
  const classified = classifyMArtifactForBoundaryAudit({
    row: row(false),
    artifact,
    artifactPath: "fixture.json",
  });
  assert.equal(classified.classification, "B_FIXED_PROTOCOL_VIOLATION");
}

// A: candidate-side scoring failure evidenced by task-specific assertion.
{
  const artifact = baseArtifact();
  artifact.result.taskSpecific = {
    passed: false,
    numPassed: 2,
    numFailed: 1,
    executionError: null,
    failedCases: [{ testName: "resetVok semantics", error: "Expected true, received false" }],
  };
  const classified = classifyMArtifactForBoundaryAudit({
    row: row(false),
    artifact,
    artifactPath: "fixture.json",
  });
  assert.equal(classified.classification, "A_CANDIDATE_FAILURE_EVIDENCE");
}

// OTHER: structured-output failure must not be mislabeled fixed-protocol B.
{
  const artifact = baseArtifact();
  artifact.result.executionStatus = "output-parse-failure";
  artifact.result.failureCategory = "output-parse";
  artifact.result.visible = null as any;
  artifact.result.hidden = null as any;
  artifact.result.taskSpecific = null as any;
  const classified = classifyMArtifactForBoundaryAudit({
    row: row(false),
    artifact,
    artifactPath: "fixture.json",
  });
  assert.equal(classified.classification, "OTHER_OR_UNRESOLVED");
}

console.log("P6-3 v3 M evaluator-boundary audit verifier passed.");
