import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  classifyTaskEligibility,
  type P61TaskClassification,
  type TaskRepeatLike,
} from "./src/p6/failure-classification";
import {
  buildCombinedEligibilityBank,
  missingRepeatPlan,
  nextEligibilityRepeatPlan,
  P6_1_EXPECTED_TASK_BANK_SIZE,
  P6_1_FROZEN_PILOT_PRIMARY,
  P6_1_FROZEN_PILOT_SEMANTIC_FLOOR,
  P6_1_INITIAL_REPEATS,
  P6_1_MAX_ATTEMPTS,
  P6_1_PILOT_TASK_IDS,
  plannedRepeats,
  selectRemainingEligibilityTasks,
} from "./src/p6/task-bank-eligibility";

const taskBankPath = path.resolve(__dirname, "../synthetic-world/heldout_tasks.json");
const tasks = JSON.parse(fs.readFileSync(taskBankPath, "utf8")) as Array<{ taskId: string; type?: string }>;

assert.strictEqual(tasks.length, P6_1_EXPECTED_TASK_BANK_SIZE);
assert.strictEqual(P6_1_INITIAL_REPEATS, 3);
assert.strictEqual(P6_1_MAX_ATTEMPTS, 5);
const remaining = selectRemainingEligibilityTasks(tasks);
assert.strictEqual(remaining.length, P6_1_EXPECTED_TASK_BANK_SIZE - P6_1_PILOT_TASK_IDS.length);
assert.strictEqual(remaining.length, 15);
assert.deepStrictEqual(
  remaining.filter((task) => P6_1_PILOT_TASK_IDS.includes(task.taskId as never)),
  []
);

const initialPlan = plannedRepeats(remaining);
assert.strictEqual(initialPlan.length, 15 * P6_1_INITIAL_REPEATS);
assert.strictEqual(initialPlan.length, 45);
assert.deepStrictEqual(initialPlan.slice(0, 3), [
  { taskId: remaining[0].taskId, repeat: 1 },
  { taskId: remaining[0].taskId, repeat: 2 },
  { taskId: remaining[0].taskId, repeat: 3 },
]);

const completed = [initialPlan[0], initialPlan[1], initialPlan[4]];
const missing = missingRepeatPlan(remaining, completed);
assert.strictEqual(missing.length, initialPlan.length - completed.length);
assert(!missing.some((item) => item.taskId === initialPlan[0].taskId && item.repeat === 1));
assert(missing.some((item) => item.taskId === initialPlan[0].taskId && item.repeat === 3));

const oneTask = [{ taskId: "T-extra", type: "local" }];
const threePending: TaskRepeatLike[] = [
  rr("T-extra", "local", 1, true),
  rr("T-extra", "local", 2, false, "output-parse", "output-parse-failure", "parse"),
  rr("T-extra", "local", 3, false, "test-failure", "ok", "visible:execution:tsc failed"),
];
assert.deepStrictEqual(nextEligibilityRepeatPlan(oneTask, threePending), [{ taskId: "T-extra", repeat: 4 }]);
const fourPending = [...threePending, rr("T-extra", "local", 4, false, "output-parse", "output-parse-failure", "parse")];
assert.deepStrictEqual(nextEligibilityRepeatPlan(oneTask, fourPending), [{ taskId: "T-extra", repeat: 5 }]);
const fiveTerminal = [...fourPending, rr("T-extra", "local", 5, false, "test-failure", "ok", "hidden:execution:tsc failed")];
assert.deepStrictEqual(nextEligibilityRepeatPlan(oneTask, fiveTerminal), []);
assert.equal(classifyTaskEligibility(fiveTerminal).capabilityClass, "AF-unstable");

const classifications: P61TaskClassification[] = [
  classification("T-synthetic-primary", "local", "eligible", "main"),
  classification("T-synthetic-diagnostic", "invariant_stressing", "eligible", "diagnostic"),
  classification("T-synthetic-floor", "cross_cutting", "semantic-floor", "main"),
  classification("T-synthetic-unstable", "local", "AF-unstable", "main"),
  classification("T-synthetic-pending", "local", "pending", "main"),
  classification("T-synthetic-invalid", "local", "invalid", "main"),
];
const bank = buildCombinedEligibilityBank(classifications);
assert.deepStrictEqual(bank.primary, [...P6_1_FROZEN_PILOT_PRIMARY, "T-synthetic-primary"]);
assert.deepStrictEqual(bank.eligibleDiagnostic, ["T-synthetic-diagnostic"]);
assert.deepStrictEqual(bank.diagnostic, ["T-synthetic-diagnostic"]);
assert.deepStrictEqual(bank.challengeSemanticFloor, [...P6_1_FROZEN_PILOT_SEMANTIC_FLOOR, "T-synthetic-floor"]);
assert.deepStrictEqual(bank.challengeAfUnstable, ["T-synthetic-unstable"]);
assert.deepStrictEqual(bank.pending, ["T-synthetic-pending"]);
assert.deepStrictEqual(bank.invalid, ["T-synthetic-invalid"]);
assert.strictEqual(bank.freezeReady, false);

const freezeReadyBank = buildCombinedEligibilityBank([
  classification("T-synthetic-primary", "local", "eligible", "main"),
  classification("T-synthetic-diagnostic", "invariant_stressing", "eligible", "diagnostic"),
  classification("T-synthetic-floor", "local", "semantic-floor", "main"),
  classification("T-synthetic-invalid", "local", "invalid", "main"),
]);
assert.strictEqual(freezeReadyBank.freezeReady, true);
assert(!freezeReadyBank.primary.includes("T-synthetic-diagnostic"));
assert(freezeReadyBank.diagnostic.includes("T-synthetic-diagnostic"));

assert.throws(
  () => selectRemainingEligibilityTasks([...tasks, tasks[0]]),
  /Duplicate taskId/
);
assert.throws(
  () => selectRemainingEligibilityTasks(tasks.filter((task) => task.taskId !== P6_1_PILOT_TASK_IDS[0])),
  /Frozen P6-1 pilot task\(s\) missing/
);

console.log("P6 full task-bank eligibility planning verified: 20 total, 5 frozen pilot, 15 remaining, 45 initial repeats, max 75 attempts, finite hold termination, role-separated banks.");

function rr(
  taskId: string,
  taskType: string,
  repeat: number,
  passed: boolean,
  failureCategory: string | null = null,
  executionStatus = "ok",
  failureReason: string | null = null
): TaskRepeatLike {
  return { taskId, taskType, repeat, passed, validity: "valid", failureCategory, executionStatus, failureReason };
}

function classification(
  taskId: string,
  taskType: string,
  capabilityClass: P61TaskClassification["capabilityClass"],
  analysisRole: P61TaskClassification["analysisRole"]
): P61TaskClassification {
  const classification = capabilityClass === "eligible"
    ? (analysisRole === "main" ? "T_primary-eligible" : "T_diagnostic-eligible")
    : capabilityClass === "semantic-floor"
      ? "T_challenge-semantic-floor"
      : capabilityClass === "AF-unstable"
        ? "T_challenge-AF-unstable"
        : capabilityClass === "invalid"
          ? "invalid-capability-classification"
          : "hold-more-semantic-repeats";
  return {
    taskId,
    taskType,
    attempts: 3,
    semanticSuccesses: capabilityClass === "eligible" ? 2 : 0,
    semanticFailures: capabilityClass === "semantic-floor" ? 2 : 0,
    semanticEvaluableRepeats: 2,
    protocolFailures: 0,
    systemFailures: 0,
    otherFailures: 0,
    infrastructureInvalidCount: capabilityClass === "invalid" ? 2 : 0,
    protocolReliabilitySuccesses: 3,
    protocolReliabilityTotal: 3,
    protocolReliability: 1,
    capabilityClass,
    analysisRole,
    needsAdditionalRepeat: capabilityClass === "pending",
    decisionReason: "test-fixture",
    classification,
  };
}
