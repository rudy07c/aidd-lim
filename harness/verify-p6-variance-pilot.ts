import assert from "assert";
import {
  exactPairedTostPower,
  smallestExactPairedTostN,
  studentTQuantile,
  chiSquareQuantile,
} from "./src/p6/exact-tost-power";
import {
  P6_2_VARIANCE_MAX_ATTEMPTS_PER_PAIR,
  P6_2_VARIANCE_PAIR_REPLACEMENT_LIMIT,
  canReplaceVariancePair,
  classifyVariancePair,
  variancePairArmOrder,
} from "./src/p6/variance-pilot";
import {
  P6_2_DELTA_M,
  P6_2_EQUIVALENCE_ALPHA,
  P6_2_EQUIVALENCE_TARGET_POWER,
} from "./src/p6/af-baseline";

function approx(actual: number, expected: number, tolerance: number, label: string): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

function main(): void {
  approx(studentTQuantile(0.95, 8), 1.8595480375, 1e-8, "t(8) q.95");
  approx(chiSquareQuantile(0.05, 7), 2.1673499093, 1e-8, "chi-square(7) q.05");

  const delta = P6_2_DELTA_M;
  const p9 = exactPairedTostPower({ n: 9, delta, sigma: delta, alpha: P6_2_EQUIVALENCE_ALPHA });
  const p10 = exactPairedTostPower({ n: 10, delta, sigma: delta, alpha: P6_2_EQUIVALENCE_ALPHA });
  const p11 = exactPairedTostPower({ n: 11, delta, sigma: delta, alpha: P6_2_EQUIVALENCE_ALPHA });
  approx(p9, 0.71291230736, 1e-8, "exact paired TOST power n=9 sigma=Delta");
  approx(p10, 0.78349876508, 1e-8, "exact paired TOST power n=10 sigma=Delta");
  approx(p11, 0.83655097696, 1e-8, "exact paired TOST power n=11 sigma=Delta");
  assert.ok(p9 < P6_2_EQUIVALENCE_TARGET_POWER);
  assert.ok(p10 < P6_2_EQUIVALENCE_TARGET_POWER);
  assert.ok(p11 >= P6_2_EQUIVALENCE_TARGET_POWER);

  const sizing = smallestExactPairedTostN({
    delta,
    sigmaUpper: delta,
    alpha: P6_2_EQUIVALENCE_ALPHA,
    targetPower: P6_2_EQUIVALENCE_TARGET_POWER,
    minN: 8,
    maxN: 30,
  });
  assert.equal(sizing.n, 11, "sigma_U=Delta must require minimum n=11");

  assert.deepEqual(variancePairArmOrder(1), ["A", "B"]);
  assert.deepEqual(variancePairArmOrder(2), ["B", "A"]);
  assert.deepEqual(variancePairArmOrder(7), ["A", "B"]);
  assert.deepEqual(variancePairArmOrder(8), ["B", "A"]);
  assert.equal(P6_2_VARIANCE_PAIR_REPLACEMENT_LIMIT, 2);
  assert.equal(P6_2_VARIANCE_MAX_ATTEMPTS_PER_PAIR, 3);
  assert.equal(canReplaceVariancePair(1), true);
  assert.equal(canReplaceVariancePair(2), true);
  assert.equal(canReplaceVariancePair(3), false);

  const base = {
    mPrimaryScore: 1,
    rsemSemanticAccuracy: 1,
    rsemProtocolValid: true,
    infrastructureInvalid: false,
    protocolFailureCount: 0,
    structuralFailureCount: 0,
  };
  assert.equal(classifyVariancePair([{ ...base, arm: "A" }, { ...base, arm: "B" }]), "accepted");
  assert.equal(classifyVariancePair([
    { ...base, arm: "A", infrastructureInvalid: true },
    { ...base, arm: "B" },
  ]), "replace-infrastructure");
  assert.equal(classifyVariancePair([
    { ...base, arm: "A", protocolFailureCount: 1 },
    { ...base, arm: "B" },
  ]), "accepted", "M-style protocol failure is recorded separately but is not infrastructure replacement");
  assert.equal(classifyVariancePair([
    { ...base, arm: "A", rsemProtocolValid: false },
    { ...base, arm: "B" },
  ]), "needs-audit", "Rsem protocol-invalid arm cannot enter semantic variance estimate");

  console.log("P6-2 variance-pilot verification passed.");
  console.log(`  exact power sigma_U=Delta: n=9 ${p9.toFixed(6)}, n=10 ${p10.toFixed(6)}, n=11 ${p11.toFixed(6)}; minimum n=${sizing.n}`);
  console.log("  pair policy: 8 pairs, odd=AB/even=BA, 2 replacements (3 attempts max), infrastructure replacement only");
  console.log("  live API calls: 0");
}

main();
