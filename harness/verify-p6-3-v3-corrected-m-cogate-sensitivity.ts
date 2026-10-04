import assert from "assert";
import {
  P6_3_V3_DELTA_M,
  P6_3_V3_DELTA_R,
  selectP63V3ArtifactBudget,
} from "./src/p6/p6-3-v3-calibration-predeclaration";

const aggregates = [
  { label: "B0" as const, mRate: 0 / 132, rsemRate: 76 / 144 },
  { label: "B1" as const, mRate: 74 / 132, rsemRate: 86 / 144 },
  { label: "B2" as const, mRate: 97 / 132, rsemRate: 98 / 144 },
  { label: "B3" as const, mRate: 82 / 132, rsemRate: 131 / 144 },
  { label: "B4" as const, mRate: 95 / 132, rsemRate: 134 / 144 },
  { label: "AF" as const, mRate: 116 / 132, rsemRate: 134 / 144 },
];

assert.equal(P6_3_V3_DELTA_M, 1 / 11);
assert.equal(P6_3_V3_DELTA_R, 1 / 12);

const result = selectP63V3ArtifactBudget(aggregates);
assert.equal(result.status, "selected");
assert.deepEqual([...result.qualifyingInteriorArms], ["B2"]);
assert.equal(result.selectedArm, "B2");
assert.equal(result.selectedBExpose, 1011);
assert.equal(result.reason, "CONJUNCTIVE_INTERIOR_BUDGET_SELECTED");

console.log("P6-3 v3 corrected-M co-gate sensitivity verifier passed.");
