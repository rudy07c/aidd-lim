import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import type { P61TaskClassification } from "./src/p6/failure-classification";
import {
  buildCombinedEligibilityBank,
  missingRepeatPlan,
  P6_1_EXPECTED_TASK_BANK_SIZE,
  P6_1_FROZEN_PILOT_CHALLENGE,
  P6_1_FROZEN_PILOT_PRIMARY,
  P6_1_PILOT_TASK_IDS,
  P6_1_REPEATS,
  plannedRepeats,
  selectRemainingEligibilityTasks,
} from "./src/p6/task-bank-eligibility";

const taskBankPath = path.resolve(__dirname, "../synthetic-world/heldout_tasks.json");
const tasks = JSON.parse(fs.readFileSync(taskBankPath, "utf8")) as Array<{ taskId: string; type?: string }>;

assert.strictEqual(tasks.length, P6_1_EXPECTED_TASK_BANK_SIZE);
const remaining = selectRemainingEligibilityTasks(tasks);
assert.strictEqual(remaining.length, P6_1_EXPECTED_TASK_BANK_SIZE - P6_1_PILOT_TASK_IDS.length);
assert.strictEqual(remaining.length, 15);
assert.deepStrictEqual(
  remaining.filter((task) => P6_1_PILOT_TASK_IDS.includes(task.taskId as never)),
  []
);

const plan = plannedRepeats(remaining);
assert.strictEqual(plan.length, 15 * P6_1_REPEATS);
assert.strictEqual(plan.length, 45);
assert.deepStrictEqual(plan.slice(0, 3), [
  { taskId: remaining[0].taskId, repeat: 1 },
  { taskId: remaining[0].taskId, repeat: 2 },
  { taskId: remaining[0].taskId, repeat: 3 },
]);

const completed = [plan[0], plan[1], plan[4]];
const missing = missingRepeatPlan(remaining, completed);
assert.strictEqual(missing.length, plan.length - completed.length);
assert(!missing.some((item) => item.taskId === plan[0].taskId && item.repeat === 1));
assert(missing.some((item) => item.taskId === plan[0].taskId && item.repeat === 3));

const classifications: P61TaskClassification[] = [
  classification("T-synthetic-primary", "T_primary-eligible"),
  classification("T-synthetic-challenge", "T_challenge-semantic-floor"),
  classification("T-synthetic-hold", "hold-more-semantic-repeats"),
  classification("T-synthetic-invalid", "invalid-capability-classification"),
];
const bank = buildCombinedEligibilityBank(classifications);
assert.deepStrictEqual(bank.primary, [...P6_1_FROZEN_PILOT_PRIMARY, "T-synthetic-primary"]);
assert.deepStrictEqual(bank.challenge, [...P6_1_FROZEN_PILOT_CHALLENGE, "T-synthetic-challenge"]);
assert.deepStrictEqual(bank.hold, ["T-synthetic-hold"]);
assert.deepStrictEqual(bank.invalid, ["T-synthetic-invalid"]);
assert.strictEqual(bank.freezeReady, false);

const freezeReadyBank = buildCombinedEligibilityBank([
  classification("T-synthetic-primary", "T_primary-eligible"),
  classification("T-synthetic-challenge", "T_challenge-semantic-floor"),
]);
assert.strictEqual(freezeReadyBank.freezeReady, true);

assert.throws(
  () => selectRemainingEligibilityTasks([...tasks, tasks[0]]),
  /Duplicate taskId/
);
assert.throws(
  () => selectRemainingEligibilityTasks(tasks.filter((task) => task.taskId !== P6_1_PILOT_TASK_IDS[0])),
  /Frozen P6-1 pilot task\(s\) missing/
);

console.log("P6 full task-bank eligibility planning verified: 20 total, 5 frozen pilot, 15 remaining, 45 planned repeats.");

function classification(taskId: string, value: string): P61TaskClassification {
  return {
    taskId,
    taskType: null,
    semanticSuccesses: value === "T_primary-eligible" ? 2 : 0,
    semanticFailures: value === "T_challenge-semantic-floor" ? 2 : 0,
    semanticEvaluableRepeats: 2,
    protocolFailures: 0,
    systemFailures: 0,
    otherFailures: 0,
    infrastructureInvalidCount: value === "invalid-capability-classification" ? 2 : 0,
    protocolReliabilitySuccesses: 3,
    protocolReliabilityTotal: 3,
    protocolReliability: 1,
    classification: value,
  };
}
