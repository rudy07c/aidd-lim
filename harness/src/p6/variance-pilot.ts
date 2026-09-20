import {
  oneSidedSdUpperConfidenceBound,
  sampleSd,
  smallestExactPairedTostN,
} from "./exact-tost-power";
import {
  P6_2_DELTA_M,
  P6_2_DELTA_R,
  P6_2_EQUIVALENCE_ALPHA,
  P6_2_EQUIVALENCE_TARGET_POWER,
  P6_2_MAX_SCIENTIFIC_REPEATS,
  P6_2_MIN_SCIENTIFIC_REPEATS,
  P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,
  P6_2_VARIANCE_SD_UCB_CONFIDENCE,
} from "./af-baseline";

export const P6_2_VARIANCE_PILOT_VERSION = "p6-2-af-variance-pilot-v1";
export const P6_2_VARIANCE_PAIR_REPLACEMENT_LIMIT = 2;
export const P6_2_VARIANCE_MAX_ATTEMPTS_PER_PAIR = 1 + P6_2_VARIANCE_PAIR_REPLACEMENT_LIMIT;

export type P62VarianceArm = "A" | "B";
export type P62VariancePairDisposition = "accepted" | "replace-infrastructure" | "needs-audit";

export interface P62VarianceArmOutcome {
  arm: P62VarianceArm;
  mPrimaryScore: number;
  rsemSemanticAccuracy: number | null;
  rsemProtocolValid: boolean;
  infrastructureInvalid: boolean;
  protocolFailureCount: number;
  structuralFailureCount: number;
}

export function variancePairArmOrder(pairId: number): readonly [P62VarianceArm, P62VarianceArm] {
  if (!Number.isInteger(pairId) || pairId < 1 || pairId > P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS) {
    throw new Error(`pairId must be 1..${P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS}, got ${pairId}`);
  }
  return pairId % 2 === 1 ? ["A", "B"] : ["B", "A"];
}

export function classifyVariancePair(arms: P62VarianceArmOutcome[]): P62VariancePairDisposition {
  if (arms.length !== 2 || new Set(arms.map((arm) => arm.arm)).size !== 2) {
    throw new Error("variance pair requires exactly one A and one B arm");
  }
  if (arms.some((arm) => arm.infrastructureInvalid)) return "replace-infrastructure";
  if (arms.some((arm) => arm.structuralFailureCount > 0 || !arm.rsemProtocolValid)) return "needs-audit";
  return "accepted";
}

export function canReplaceVariancePair(attempt: number): boolean {
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error(`attempt must be positive integer, got ${attempt}`);
  return attempt < P6_2_VARIANCE_MAX_ATTEMPTS_PER_PAIR;
}

export interface P62VarianceSizingResult {
  sampleSize: number;
  sampleSd: number;
  sigmaUpper: number;
  requiredN: number | null;
  powerTrace: Array<{ n: number; power: number }>;
}

export function sizeFromPairedDifferences(differences: number[], delta: number): P62VarianceSizingResult {
  if (differences.length !== P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS) {
    throw new Error(`expected exactly ${P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS} accepted pair differences, got ${differences.length}`);
  }
  const sd = sampleSd(differences);
  const sigmaUpper = oneSidedSdUpperConfidenceBound({
    sampleSd: sd,
    sampleSize: differences.length,
    confidence: P6_2_VARIANCE_SD_UCB_CONFIDENCE,
  });
  if (sigmaUpper === 0) {
    return {
      sampleSize: differences.length,
      sampleSd: sd,
      sigmaUpper,
      requiredN: P6_2_MIN_SCIENTIFIC_REPEATS,
      powerTrace: [{ n: P6_2_MIN_SCIENTIFIC_REPEATS, power: 1 }],
    };
  }
  const exact = smallestExactPairedTostN({
    delta,
    sigmaUpper,
    alpha: P6_2_EQUIVALENCE_ALPHA,
    targetPower: P6_2_EQUIVALENCE_TARGET_POWER,
    minN: P6_2_MIN_SCIENTIFIC_REPEATS,
    maxN: P6_2_MAX_SCIENTIFIC_REPEATS,
  });
  return {
    sampleSize: differences.length,
    sampleSd: sd,
    sigmaUpper,
    requiredN: exact.n,
    powerTrace: exact.powers,
  };
}

export function sizeP62VariancePilot(args: {
  mDifferences: number[];
  rsemDifferences: number[];
}): {
  m: P62VarianceSizingResult;
  rsem: P62VarianceSizingResult;
  frozenScientificRepeatCount: number | null;
  needsAudit: boolean;
} {
  const m = sizeFromPairedDifferences(args.mDifferences, P6_2_DELTA_M);
  const rsem = sizeFromPairedDifferences(args.rsemDifferences, P6_2_DELTA_R);
  if (m.requiredN === null || rsem.requiredN === null) {
    return { m, rsem, frozenScientificRepeatCount: null, needsAudit: true };
  }
  return {
    m,
    rsem,
    frozenScientificRepeatCount: Math.max(P6_2_MIN_SCIENTIFIC_REPEATS, m.requiredN, rsem.requiredN),
    needsAudit: false,
  };
}
