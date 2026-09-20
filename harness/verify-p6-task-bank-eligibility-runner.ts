import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  assertResumeManifestEqual,
  commitRepeatArtifactsAtomic,
  planEligibilityPhase,
  reconcileRepeatJournal,
  REPEAT_ARTIFACT_FILES,
} from "./src/p6/task-bank-live-runtime";
import { P6_1_PILOT_TASK_IDS, selectRemainingEligibilityTasks } from "./src/p6/task-bank-eligibility";
import type { TaskRepeatLike } from "./src/p6/failure-classification";

const taskBankPath = path.resolve(__dirname, "../synthetic-world/heldout_tasks.json");
const tasks = JSON.parse(fs.readFileSync(taskBankPath, "utf8")) as Array<{ taskId: string; type?: string }>;
const remaining = selectRemainingEligibilityTasks(tasks);
assert.equal(remaining.length, 15);
assert.equal(P6_1_PILOT_TASK_IDS.length, 5);

const initial = planEligibilityPhase(remaining, [], "initial");
assert.equal(initial.length, 45, "initial phase must plan exactly 45 repeats");
assert(initial.every((item) => item.repeat >= 1 && item.repeat <= 3));

const manifest = {
  taskBankVersion: "v2",
  eligibilityRule: { semanticFloorMinFailures: 2, initialAttempts: 3, maxAttempts: 5 },
  maxOutputTokens: 7000,
};
assert.doesNotThrow(() => assertResumeManifestEqual(manifest, JSON.parse(JSON.stringify(manifest))));
assert.throws(
  () => assertResumeManifestEqual(manifest, { ...manifest, eligibilityRule: { ...manifest.eligibilityRule, semanticFloorMinFailures: 3 } }),
  /manifest changed/
);

const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "p6-runner-hardening-"));
const journalResult = repeat("T-artifact", "local", 1, true);
commitRepeatArtifactsAtomic(runDir, journalResult, {
  rawResponse: "raw",
  modifiedFiles: { "src/x.ts": "export const x = 1;" },
  modelProvenance: { actualModel: "gpt-5.6-luna" },
  testResults: { visible: { passed: true } },
  agentExecutionStatus: "ok",
  agentError: null,
  runnerError: null,
});
const artifactDir = path.join(runDir, "T-artifact", "repeat-1");
for (const fileName of REPEAT_ARTIFACT_FILES) {
  assert(fs.existsSync(path.join(artifactDir, fileName)), `missing artifact ${fileName}`);
}
assert.deepStrictEqual(
  fs.readdirSync(artifactDir).sort(),
  [...REPEAT_ARTIFACT_FILES].sort(),
  "repeat artifact bundle must contain exactly the five journal files"
);

const orphanRecovery = reconcileRepeatJournal(runDir, [] as ReturnType<typeof repeat>[]);
assert.equal(orphanRecovery.repeatResults.length, 1, "artifact-only committed repeat must be recovered without rerun");
assert.deepStrictEqual(orphanRecovery.recoveredArtifactKeys, ["T-artifact#1"]);

fs.rmSync(path.join(artifactDir, "test_results.json"));
const missingRecovery = reconcileRepeatJournal(runDir, [journalResult]);
assert.equal(missingRecovery.repeatResults.length, 0, "recorded repeat with incomplete artifacts must be removed for rerun");
assert.deepStrictEqual(missingRecovery.missingArtifactKeys, ["T-artifact#1"]);

const holdTasks = [
  { taskId: "T-pending", type: "local" },
  { taskId: "T-eligible", type: "local" },
];
const afterInitial: TaskRepeatLike[] = [
  repeat("T-pending", "local", 1, true),
  repeat("T-pending", "local", 2, false, "output-parse", "output-parse-failure", "parse"),
  repeat("T-pending", "local", 3, false, "test-failure", "ok", "visible:execution:tsc failed"),
  repeat("T-eligible", "local", 1, true),
  repeat("T-eligible", "local", 2, true),
  repeat("T-eligible", "local", 3, true),
];
assert.deepStrictEqual(
  planEligibilityPhase(holdTasks, afterInitial, "hold-continuation"),
  [{ taskId: "T-pending", repeat: 4 }],
  "hold continuation must schedule only pending tasks"
);
const afterFour = [
  ...afterInitial,
  repeat("T-pending", "local", 4, false, "output-parse", "output-parse-failure", "parse"),
];
assert.deepStrictEqual(
  planEligibilityPhase(holdTasks, afterFour, "hold-continuation"),
  [{ taskId: "T-pending", repeat: 5 }]
);

fs.rmSync(runDir, { recursive: true, force: true });
console.log("P6-1b runner hardening integration verified: exact initial 45, frozen resume manifest, atomic 5-file journal/recovery, and pending-only hold continuation.");

function repeat(
  taskId: string,
  taskType: string,
  repeatNo: number,
  passed: boolean,
  failureCategory: string | null = null,
  executionStatus = "ok",
  failureReason: string | null = null
) {
  return {
    taskId,
    taskType,
    repeat: repeatNo,
    passed,
    validity: "valid",
    failureCategory,
    executionStatus,
    failureReason,
  };
}
