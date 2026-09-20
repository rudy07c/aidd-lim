export const P6_2_EXACT_POWER_METHOD_VERSION = "paired-tost-central-t-exact-v1";

const LANCZOS_COEFFICIENTS = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
] as const;

function logGamma(z: number): number {
  if (!(z > 0)) throw new Error("logGamma requires z > 0");
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  let x = LANCZOS_COEFFICIENTS[0];
  const zm1 = z - 1;
  for (let i = 1; i < LANCZOS_COEFFICIENTS.length; i += 1) x += LANCZOS_COEFFICIENTS[i] / (zm1 + i);
  const t = zm1 + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (zm1 + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIterations = 300;
  const epsilon = 3e-14;
  const fpMin = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpMin) d = fpMin;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIterations; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    h *= d * c;
    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) <= epsilon) return h;
  }
  throw new Error("Incomplete beta continued fraction did not converge");
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const logBt = logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x);
  const bt = Math.exp(logBt);
  if (x < (a + 1) / (a + b + 2)) return (bt * betaContinuedFraction(a, b, x)) / a;
  return 1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b;
}

export function studentTCdf(t: number, degreesOfFreedom: number): number {
  if (!(degreesOfFreedom > 0)) throw new Error("degreesOfFreedom must be > 0");
  if (!Number.isFinite(t)) return t < 0 ? 0 : 1;
  if (t === 0) return 0.5;
  const x = degreesOfFreedom / (degreesOfFreedom + t * t);
  const ib = regularizedIncompleteBeta(x, degreesOfFreedom / 2, 0.5);
  return t > 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

export function studentTQuantile(probability: number, degreesOfFreedom: number): number {
  if (!(probability > 0 && probability < 1)) throw new Error("probability must be in (0,1)");
  if (!(degreesOfFreedom > 0)) throw new Error("degreesOfFreedom must be > 0");
  if (probability === 0.5) return 0;
  if (probability < 0.5) return -studentTQuantile(1 - probability, degreesOfFreedom);
  let low = 0;
  let high = 1;
  while (studentTCdf(high, degreesOfFreedom) < probability) {
    high *= 2;
    if (high > 1e6) throw new Error("studentTQuantile failed to bracket probability");
  }
  for (let i = 0; i < 120; i += 1) {
    const mid = (low + high) / 2;
    if (studentTCdf(mid, degreesOfFreedom) < probability) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export interface ExactPairedTostPowerInput {
  n: number;
  sigma: number;
  delta: number;
  alpha?: number;
}

export function exactPairedTostPowerAtZero(input: ExactPairedTostPowerInput): number {
  const { n, sigma, delta, alpha = 0.05 } = input;
  if (!Number.isInteger(n) || n < 2) throw new Error("n must be an integer >= 2");
  if (!(sigma >= 0) || !Number.isFinite(sigma)) throw new Error("sigma must be finite and >= 0");
  if (!(delta > 0) || !Number.isFinite(delta)) throw new Error("delta must be finite and > 0");
  if (!(alpha > 0 && alpha < 0.5)) throw new Error("alpha must be in (0,0.5)");
  if (sigma === 0) return 1;
  const df = n - 1;
  const tCrit = studentTQuantile(1 - alpha, df);
  const se = sigma / Math.sqrt(n);
  const lambda = delta / se;
  const lower = tCrit - lambda;
  const upper = lambda - tCrit;
  if (upper <= lower) return 0;
  return Math.max(0, Math.min(1, studentTCdf(upper, df) - studentTCdf(lower, df)));
}

export interface ExactPairedTostRepeatSearchInput {
  sigmaUpperBound: number;
  delta: number;
  targetPower: number;
  alpha?: number;
  minN: number;
  maxN: number;
}

export interface ExactPairedTostRepeatSearchResult {
  requiredN: number | null;
  powers: Array<{ n: number; power: number }>;
}

export function findMinimumExactPairedTostN(input: ExactPairedTostRepeatSearchInput): ExactPairedTostRepeatSearchResult {
  if (!(input.targetPower > 0 && input.targetPower < 1)) throw new Error("targetPower must be in (0,1)");
  if (!Number.isInteger(input.minN) || !Number.isInteger(input.maxN) || input.minN < 2 || input.maxN < input.minN) {
    throw new Error("invalid exact-power search bounds");
  }
  const powers: Array<{ n: number; power: number }> = [];
  for (let n = input.minN; n <= input.maxN; n += 1) {
    const power = exactPairedTostPowerAtZero({ n, sigma: input.sigmaUpperBound, delta: input.delta, alpha: input.alpha });
    powers.push({ n, power });
    if (power >= input.targetPower) return { requiredN: n, powers };
  }
  return { requiredN: null, powers };
}
