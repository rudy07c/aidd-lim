import {
  P6_2_DELTA_M,
  P6_2_DELTA_R,
  P6_2_EQUIVALENCE_ALPHA,
  P6_2_EQUIVALENCE_TARGET_POWER,
  P6_2_MAX_SCIENTIFIC_REPEATS,
  P6_2_MIN_SCIENTIFIC_REPEATS,
  P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR,
  P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,
  P6_2_VARIANCE_SD_UCB_CONFIDENCE,
  p62VariancePilotArmOrder,
  type P62VariancePilotArm,
} from "./af-baseline";
import { findMinimumExactPairedTostN } from "./equivalence-power";

export const P6_2_VARIANCE_PILOT_VERSION = "p6-2-af-variance-pilot-v1";

function logGamma(z: number): number {
  const p = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012,
    9.984369578019571e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = 0.9999999999998099;
  for (let i = 0; i < p.length; i += 1) x += p[i] / (z + i + 1);
  const t = z + p.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function regularizedGammaP(a: number, x: number): number {
  if (!(a > 0)) throw new Error(`regularizedGammaP requires a>0, got ${a}`);
  if (x <= 0) return 0;
  const eps = 3e-14;
  const fpMin = 1e-300;
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n <= 500; n += 1) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * eps) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  let b = x + 1 - a;
  let c = 1 / fpMin;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 500; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = b + an / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

export function chiSquareCdf(x: number, df: number): number {
  if (!(df > 0)) throw new Error(`chiSquareCdf requires df>0, got ${df}`);
  return x <= 0 ? 0 : regularizedGammaP(df / 2, x / 2);
}

export function chiSquareQuantile(p: number, df: number): number {
  if (!(p > 0 && p < 1)) throw new Error(`chiSquareQuantile requires 0<p<1, got ${p}`);
  if (!(df > 0)) throw new Error(`chiSquareQuantile requires df>0, got ${df}`);
  let lo = 0;
  let hi = Math.max(1, df);
  while (chiSquareCdf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 140; i += 1) {
    const mid = (lo + hi) / 2;
    if (chiSquareCdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function sampleSd(values: number[]): number {
  if (values.length < 2) throw new Error("sampleSd requires at least two values");
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

export function oneSidedSdUpperConfidenceBound(args: {
  sampleSd: number;
  sampleSize: number;
  confidence?: number;
}): number {
  const confidence = args.confidence ?? P6_2_VARIANCE_SD_UCB_CONFIDENCE;
  if (!(args.sampleSd >= 0)) throw new Error("sampleSd must be >=0");
  if (!Number.isInteger(args.sampleSize) || args.sampleSize < 2) throw new Error("sampleSize must be integer >=2");
  if (!(confidence > 0 && confidence < 1)) throw new Error("confidence must be in (0,1)");
  if (args.sampleSd === 0) return 0;
  const df = args.sampleSize - 1;
  const lowerChiSquare = chiSquareQuantile(1 - confidence, df);
  return Math.sqrt((df * args.sampleSd ** 2) / lowerChiSquare);
}

export interface P62VarianceArmOutcome {
  arm: P62VariancePilotArm;
  mPrimaryScore: number;
  rsemSemanticAccuracy: number | null;
  rsemProtocolValid: boolean;
  infrastructureInvalid: boolean;
  structuralFailure: boolean;
  mProtocolFailures: number;
  rsemProtocolFailure: boolean;
}

export type P62VariancePairDisposition = "accepted" | "replace-infrastructure" | "needs-audit";

export function classifyP62VariancePair(arms: P62VarianceArmOutcome[]): P62VariancePairDisposition {
  if (arms.length !== 2 || new Set(arms.map((arm) => arm.arm)).size !== 2) {
    throw new Error("variance pair requires exactly one A and one B arm");
  }
  if (arms.some((arm) => arm.infrastructureInvalid)) return "replace-infrastructure";
  if (arms.some((arm) => arm.structuralFailure || !arm.rsemProtocolValid)) return "needs-audit";
  return "accepted";
}

export function canReplaceP62VariancePair(attempt: number): boolean {
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error("attempt must be a positive integer");
  return attempt < P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR;
}

export interface P62VarianceSizingResult {
  sampleSize: number;
  sampleSd: number;
  sigmaUpper: number;
  requiredN: number | null;
  powers: Array<{ n: number; power: number }>;
}

export function sizeP62PairedDifferences(differences: number[], delta: number): P62VarianceSizingResult {
  if (differences.length !== P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS) {
    throw new Error(`expected ${P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS} accepted pair differences, got ${differences.length}`);
  }
  const sd = sampleSd(differences);
  const sigmaUpper = oneSidedSdUpperConfidenceBound({ sampleSd: sd, sampleSize: differences.length });
  if (sigmaUpper === 0) {
    return { sampleSize: differences.length, sampleSd: sd, sigmaUpper, requiredN: P6_2_MIN_SCIENTIFIC_REPEATS, powers: [{ n: P6_2_MIN_SCIENTIFIC_REPEATS, power: 1 }] };
  }
  const exact = findMinimumExactPairedTostN({
    sigmaUpperBound: sigmaUpper,
    delta,
    targetPower: P6_2_EQUIVALENCE_TARGET_POWER,
    alpha: P6_2_EQUIVALENCE_ALPHA,
    minN: P6_2_MIN_SCIENTIFIC_REPEATS,
    maxN: P6_2_MAX_SCIENTIFIC_REPEATS,
  });
  return { sampleSize: differences.length, sampleSd: sd, sigmaUpper, requiredN: exact.requiredN, powers: exact.powers };
}

export function sizeP62VariancePilot(args: { mDifferences: number[]; rsemDifferences: number[] }) {
  const m = sizeP62PairedDifferences(args.mDifferences, P6_2_DELTA_M);
  const rsem = sizeP62PairedDifferences(args.rsemDifferences, P6_2_DELTA_R);
  const needsAudit = m.requiredN === null || rsem.requiredN === null;
  return {
    m,
    rsem,
    frozenScientificRepeatCount: needsAudit ? null : Math.max(P6_2_MIN_SCIENTIFIC_REPEATS, m.requiredN!, rsem.requiredN!),
    needsAudit,
  };
}

export function expectedP62VariancePairOrder(pairId: number) {
  return p62VariancePilotArmOrder(pairId);
}
