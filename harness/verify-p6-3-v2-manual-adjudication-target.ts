import * as assert from "assert";
import { buildP63CalibrationPlan } from "./src/p6/p6-3-live-calibration-runner";
import {
  applyP63V2ManualAdjudication,
  createP63V2CalibrationState,
} from "./src/p6/p6-3-v2-live-calibration-runner";

const plan = buildP63CalibrationPlan({
  B0: 0,
  B1: 505,
  B2: 1011,
  B3: 2023,
  B4: 3034,
  AF: 4046,
});

const state = createP63V2CalibrationState({
  checkoutGitSha: "offline-v2-manual-target-test-sha",
  frozenManifestHashes: { design: "offline-test" },
  plan,
  executionPolicy: { maxScientificAttemptsPerLogicalCell: 3 },
});

state.status = "needs-audit";
state.auditFlag = {
  kind: "unrecognized-infrastructure-state",
  sequence: 0,
  attempt: 2,
  reason: "active audit is specifically attempt 2",
  createdAt: new Date().toISOString(),
};

assert.throws(
  () => applyP63V2ManualAdjudication(state, plan, {
    sequence: 0,
    attempt: 1,
    reviewer: "offline-human",
    reason: "must not adjudicate a stale attempt from the same logical cell",
    finalDisposition: "infrastructure-invalid",
  }),
  /active audit sequence\/attempt/
);

assert.equal(state.status, "needs-audit");
assert.equal(state.auditFlag?.sequence, 0);
assert.equal(state.auditFlag?.attempt, 2);
assert.equal(state.cursorCellIndex, 0);
assert.equal(state.nextAttempt, 1);

console.log("P6-3 v2 manual adjudication target binding verification passed");
