import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  buildOpaqueHandleHGSource,
  P6_3_V3_M_CORRECTED_EVALUATOR_VERSION,
} from "./src/p6/p6-3-v3-m-evaluator-sensitivity";

const repoRoot = path.resolve(__dirname, "..");
const hgPath = path.join(
  repoRoot,
  "synthetic-world",
  "hidden_regression_tests",
  "H_G.test.ts"
);
const original = fs.readFileSync(hgPath, "utf8");
const corrected = buildOpaqueHandleHGSource(original);

assert.equal(
  P6_3_V3_M_CORRECTED_EVALUATOR_VERSION,
  "p6-3-v3-m-corrected-evaluator-opaque-handle-v1"
);
assert(original.includes('import { WorldState } from "../repository/src/world";'));
assert(!corrected.includes('import { WorldState } from "../repository/src/world";'));
assert(corrected.includes("type WorldStateHandle = ReturnType<typeof protocol.reset>;"));
assert(!/\bWorldState\b/.test(corrected));

const originalBody = original.slice(original.indexOf('describe("H(G)'));
const correctedBody = corrected.slice(corrected.indexOf('describe("H(G)'));
assert.equal(correctedBody, originalBody);

console.log("P6-3 v3 corrected H(G) transform verifier passed.");
