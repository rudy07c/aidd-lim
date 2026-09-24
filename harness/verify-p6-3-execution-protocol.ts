import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  P6_3_CALIBRATION_REPEAT_COUNT,
  P6_3_EXECUTION_PROTOCOL_VERSION,
  P6_3_FORWARD_BASE_ORDER,
  P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL,
  P6_3_REVERSE_BASE_ORDER,
  assertP63CalibrationArm,
  buildP63CalibrationSchedule,
  decideP63AttemptTransition,
  dispatchP63Arm,
  type P63CalibrationArm,
  type P63ScheduleDirection,
} from "./src/p6/p6-3-execution-protocol";

const BASE_GIT_SHA = "feca4774a46a52bc2a7339ee85551a9f2678581b";
const STRUCTURAL_FREEZE_FINGERPRINT = "d23f1755e22de88f1a703cb46cf707a66035864c4c5b02d045a9e2b00a0bd77e";
const manifestPath = path.resolve(__dirname, "frozen/p6-3-execution-protocol.json");

assert.equal(P6_3_CALIBRATION_REPEAT_COUNT, 12);
assert.equal(P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL, 3);
assert.equal(P6_3_FORWARD_BASE_ORDER.length, 6);
assert.equal(P6_3_REVERSE_BASE_ORDER.length, 6);

const schedule = buildP63CalibrationSchedule();
assert.equal(schedule.length, P6_3_CALIBRATION_REPEAT_COUNT);
assert.deepEqual(schedule.map((entry) => entry.repeat), Array.from({ length: 12 }, (_, index) => index + 1));

const forwardLabels = ["B0", "B1", "B2", "B3", "B4", "AF"];
const reverseLabels = ["AF", "B4", "B3", "B2", "B1", "B0"];

for (const entry of schedule) {
  assert.equal(entry.arms.length, 6, `repeat ${entry.repeat} must contain exactly six arms`);
  assert.equal(entry.arms.filter((arm) => arm.kind === "EL").length, 5, `repeat ${entry.repeat} EL count`);
  assert.equal(entry.arms.filter((arm) => arm.kind === "AF").length, 1, `repeat ${entry.repeat} AF count`);
  for (const arm of entry.arms) assert.doesNotThrow(() => assertP63CalibrationArm(arm));

  const expectedBase = entry.direction === "forward" ? forwardLabels : reverseLabels;
  const expected = rotateLeft(expectedBase, entry.rotationOffset);
  assert.deepEqual(entry.arms.map((arm) => arm.label), expected, `repeat ${entry.repeat} cyclic schedule`);
}

for (const direction of ["forward", "reverse"] as const) {
  const half = schedule.filter((entry) => entry.direction === direction);
  assert.equal(half.length, 6, `${direction} half repeat count`);
  assertPositionBalance(direction, half.map((entry) => entry.arms));
}

// The typed dispatcher is the execution boundary. AF must never fall through the EL callback.
for (const arm of P6_3_FORWARD_BASE_ORDER) {
  let elCalls = 0;
  let afCalls = 0;
  const result = dispatchP63Arm(arm, {
    runEL: (elArm) => {
      elCalls += 1;
      assert.equal(elArm.kind, "EL");
      assert.notEqual(elArm.label, "AF");
      return `EL:${elArm.label}`;
    },
    runAF: (afArm) => {
      afCalls += 1;
      assert.equal(afArm.kind, "AF");
      assert.equal(afArm.label, "AF");
      assert.equal("contextBudget" in afArm, false, "AF arm must not carry an EL budget");
      return "AF:artifact-full";
    },
  });

  if (arm.kind === "AF") {
    assert.equal(result, "AF:artifact-full");
    assert.equal(afCalls, 1);
    assert.equal(elCalls, 0, "AF must never invoke EL execution callback");
  } else {
    assert.equal(result, `EL:${arm.label}`);
    assert.equal(elCalls, 1);
    assert.equal(afCalls, 0, "EL must never invoke AF execution callback");
  }
}

assert.throws(
  () => assertP63CalibrationArm({ kind: "EL", label: "AF" }),
  /invalid budget label/
);
assert.throws(
  () => assertP63CalibrationArm({ kind: "AF", label: "B4" }),
  /must have label AF/
);

for (const failureDomain of ["none", "semantic", "protocol", "system"] as const) {
  assert.equal(
    decideP63AttemptTransition({
      attempt: 1,
      failureDomain,
      infrastructureAdjudication: "not-applicable",
    }),
    "advance-next-arm",
    `${failureDomain} must be retained as a scientific observation without replacement`
  );
}

assert.equal(
  decideP63AttemptTransition({
    attempt: 1,
    failureDomain: "infrastructure",
    infrastructureAdjudication: "pending",
  }),
  "stop-needs-audit",
  "unadjudicated infrastructure failure must not advance or auto-retry"
);
for (const attempt of [1, 2]) {
  assert.equal(
    decideP63AttemptTransition({
      attempt,
      failureDomain: "infrastructure",
      infrastructureAdjudication: "infrastructure-invalid",
    }),
    "retry-same-cell",
    `attempt ${attempt} infrastructure-invalid must retry the same logical cell before the next arm`
  );
}
assert.equal(
  decideP63AttemptTransition({
    attempt: 3,
    failureDomain: "infrastructure",
    infrastructureAdjudication: "infrastructure-invalid",
  }),
  "stop-needs-audit",
  "third infrastructure-invalid attempt must stop P6-3"
);
assert.throws(
  () => decideP63AttemptTransition({
    attempt: 4,
    failureDomain: "infrastructure",
    infrastructureAdjudication: "infrastructure-invalid",
  }),
  /attempt must be an integer from 1 to 3/
);
assert.throws(
  () => decideP63AttemptTransition({
    attempt: 1,
    failureDomain: "protocol",
    infrastructureAdjudication: "pending",
  }),
  /must not carry infrastructure adjudication/
);

const expectedManifest = {
  schemaVersion: "p6-3-execution-protocol-manifest-v1",
  protocolVersion: P6_3_EXECUTION_PROTOCOL_VERSION,
  baseGitSha: BASE_GIT_SHA,
  structuralFreezeCandidateFingerprintSha256: STRUCTURAL_FREEZE_FINGERPRINT,
  status: "frozen-pre-live",
  kCal: P6_3_CALIBRATION_REPEAT_COUNT,
  executionMode: "sync",
  freshStatelessPerArm: true,
  arms: {
    EL: {
      labels: ["B0", "B1", "B2", "B3", "B4"],
      condition: "EL",
      executionPath: "el-static-exposure",
    },
    AF: {
      labels: ["AF"],
      condition: "AF",
      executionPath: "artifact-full",
      forbiddenExecutionPath: "el-static-exposure",
      forbiddenFunction: "assembleELTaskStaticExposure",
    },
  },
  schedule: schedule.map((entry) => ({
    repeat: entry.repeat,
    direction: entry.direction,
    rotationOffset: entry.rotationOffset,
    arms: entry.arms.map((arm) => arm.label),
  })),
  temporalBlockRule: {
    M: "task-repeat-six-arm-block",
    Rsem: "repeat-six-arm-bank-block",
    replacementPlacement: "immediate-same-cell-before-next-arm",
  },
  retryPolicy: {
    maxScientificAttemptsPerLogicalCell: P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL,
    scientificOutcomeDomains: ["none", "semantic", "protocol", "system"],
    scientificOutcomeAction: "advance-next-arm-no-replacement",
    unadjudicatedInfrastructureAction: "stop-needs-audit",
    adjudicatedInfrastructureInvalidBeforeMaxAction: "retry-same-cell-immediately",
    thirdInfrastructureInvalidAction: "stop-needs-audit",
    replacementIncrementsKCal: false,
  },
};

assert(fs.existsSync(manifestPath), `missing P6-3 execution protocol manifest: ${manifestPath}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert.deepStrictEqual(
  manifest,
  expectedManifest,
  "committed P6-3 execution protocol manifest differs from the offline-derived protocol; live must remain blocked"
);

console.log(JSON.stringify({
  status: "ok",
  protocolVersion: P6_3_EXECUTION_PROTOCOL_VERSION,
  kCal: P6_3_CALIBRATION_REPEAT_COUNT,
  schedule: expectedManifest.schedule,
  afExecutionPath: expectedManifest.arms.AF.executionPath,
  afForbiddenFunction: expectedManifest.arms.AF.forbiddenFunction,
  retryPolicy: expectedManifest.retryPolicy,
}, null, 2));

function assertPositionBalance(
  direction: P63ScheduleDirection,
  repeats: readonly (readonly P63CalibrationArm[])[]
): void {
  const labels = ["B0", "B1", "B2", "B3", "B4", "AF"];
  for (let position = 0; position < 6; position += 1) {
    const seen = repeats.map((arms) => arms[position].label);
    assert.deepEqual(
      [...seen].sort(),
      [...labels].sort(),
      `${direction} position ${position + 1} must contain every arm exactly once`
    );
  }
}

function rotateLeft<T>(items: readonly T[], offset: number): T[] {
  const normalized = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}
