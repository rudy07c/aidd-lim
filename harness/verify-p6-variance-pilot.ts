import assert from "assert";
import * as childProcess from "child_process";
import * as path from "path";
import {
  exactPairedTostPowerAtZero,
  findMinimumExactPairedTostN,
} from "./src/p6/equivalence-power";
import {
  P6_2_DELTA_M,
  P6_2_EQUIVALENCE_ALPHA,
  P6_2_EQUIVALENCE_TARGET_POWER,
  P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR,
  p62VariancePilotArmOrder,
} from "./src/p6/af-baseline";
import {
  P6_2_VARIANCE_PILOT_VERSION,
  canReplaceP62VariancePair,
  chiSquareQuantile,
  classifyP62VariancePair,
  oneSidedSdUpperConfidenceBound,
} from "./src/p6/variance-pilot";

function approx(actual: number, expected: number, tolerance: number, label: string): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

function main(): void {
  assert.equal(P6_2_VARIANCE_PILOT_VERSION, "p6-2-af-variance-pilot-v1");
  const delta = P6_2_DELTA_M;
  const p9 = exactPairedTostPowerAtZero({ n: 9, sigma: delta, delta, alpha: P6_2_EQUIVALENCE_ALPHA });
  const p10 = exactPairedTostPowerAtZero({ n: 10, sigma: delta, delta, alpha: P6_2_EQUIVALENCE_ALPHA });
  const p11 = exactPairedTostPowerAtZero({ n: 11, sigma: delta, delta, alpha: P6_2_EQUIVALENCE_ALPHA });
  approx(p9, 0.7129123074, 1e-7, "n=9 exact power");
  assert.ok(p10 < P6_2_EQUIVALENCE_TARGET_POWER, `n=10 should be <0.80, got ${p10}`);
  assert.ok(p11 >= P6_2_EQUIVALENCE_TARGET_POWER, `n=11 should be >=0.80, got ${p11}`);
  const search = findMinimumExactPairedTostN({ sigmaUpperBound: delta, delta, targetPower: 0.80, alpha: 0.05, minN: 8, maxN: 30 });
  assert.equal(search.requiredN, 11);

  approx(chiSquareQuantile(0.05, 7), 2.1673499093, 1e-8, "chi-square df7 p=.05");
  const sigmaUpper = oneSidedSdUpperConfidenceBound({ sampleSd: 1, sampleSize: 8, confidence: 0.95 });
  approx(sigmaUpper, Math.sqrt(7 / 2.1673499093), 1e-8, "one-sided 95% SD upper bound");

  assert.deepEqual(p62VariancePilotArmOrder(1), ["A", "B"]);
  assert.deepEqual(p62VariancePilotArmOrder(2), ["B", "A"]);
  assert.equal(P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR, 3);
  assert.equal(canReplaceP62VariancePair(1), true);
  assert.equal(canReplaceP62VariancePair(2), true);
  assert.equal(canReplaceP62VariancePair(3), false);

  const base = { mPrimaryScore: 1, rsemSemanticAccuracy: 1, rsemProtocolValid: true, infrastructureInvalid: false, structuralFailure: false, mProtocolFailures: 0, rsemProtocolFailure: false };
  assert.equal(classifyP62VariancePair([{ ...base, arm: "A" }, { ...base, arm: "B" }]), "accepted");
  assert.equal(classifyP62VariancePair([{ ...base, arm: "A", infrastructureInvalid: true }, { ...base, arm: "B" }]), "replace-infrastructure");
  assert.equal(classifyP62VariancePair([{ ...base, arm: "A", mProtocolFailures: 1 }, { ...base, arm: "B" }]), "accepted", "M protocol failure is a scored M failure, not infrastructure replacement");
  assert.equal(classifyP62VariancePair([{ ...base, arm: "A", rsemProtocolValid: false, rsemProtocolFailure: true, rsemSemanticAccuracy: null }, { ...base, arm: "B" }]), "needs-audit");

  // The runner itself must be safe-by-default: without --live it exits before any provider call.
  const harnessDir = __dirname;
  const dry = childProcess.execFileSync(process.execPath, ["-r", "ts-node/register", path.join(harnessDir, "p6-af-variance-pilot-live.ts")], { cwd: harnessDir, encoding: "utf8" });
  assert.match(dry, /STOP: dry\/offline mode; live API calls: 0/);
  assert.doesNotMatch(dry, /RESULT .*runs\/_calibration/);

  console.log("P6-2 variance-pilot offline verification passed.");
  console.log(`  exact power sigma_U=Delta: n=9=${p9.toFixed(6)}, n=10=${p10.toFixed(6)}, n=11=${p11.toFixed(6)}; minimum n=${search.requiredN}`);
  console.log(`  chi-square df=7 p=.05=${chiSquareQuantile(0.05, 7).toFixed(10)}; replacement attempts=${P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR}`);
  console.log("  pair policy: odd=AB/even=BA, infrastructure whole-attempt replacement, Rsem protocol needs-audit");
  console.log("  dry runner verified; live API calls: 0");
}

main();
