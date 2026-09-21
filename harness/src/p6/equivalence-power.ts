export const P6_2_EXACT_POWER_METHOD_VERSION = "paired-tost-chi-integrated-exact-v2";

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

function regularizedGammaP(a: number, x: number): number {
  if (!(a > 0)) throw new Error("regularizedGammaP requires a > 0");
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
    return Math.max(0, Math.min(1, sum * Math.exp(-x + a * Math.log(x) - logGamma(a))));
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
  return Math.max(0, Math.min(1, 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h));
}

function standardNormalCdf(z: number): number {
  if (!Number.isFinite(z)) return z < 0 ? 0 : 1;
  if (z === 0) return 0.5;
  const p = regularizedGammaP(0.5, (z * z) / 2);
  return z > 0 ? 0.5 * (1 + p) : 0.5 * (1 - p);
}

function chiScaledDensity(r: number, df: number): number {
  if (r < 0) return 0;
  if (r === 0) {
    if (df === 1) {
      const logCoefficient = (1 - df / 2) * Math.log(2) + (df / 2) * Math.log(df) - logGamma(df / 2);
      return Math.exp(logCoefficient);
    }
    return 0;
  }
  const logCoefficient = (1 - df / 2) * Math.log(2) + (df / 2) * Math.log(df) - logGamma(df / 2);
  const logDensity = logCoefficient + (df - 1) * Math.log(r) - (df * r * r) / 2;
  return logDensity < -745 ? 0 : Math.exp(logDensity);
}

function simpson(f: (x: number) => number, a: number, b: number): number {
  const c = (a + b) / 2;
  return ((b - a) / 6) * (f(a) + 4 * f(c) + f(b));
}

function adaptiveSimpson(
  f: (x: number) => number,
  a: number,
  b: number,
  epsilon: number,
  whole: number = simpson(f, a, b),
  depth: number = 0
): number {
  const c = (a + b) / 2;
  const left = simpson(f, a, c);
  const right = simpson(f, c, b);
  const delta = left + right - whole;
  if (depth >= 24 || Math.abs(delta) <= 15 * epsilon) return left + right + delta / 15;
  return adaptiveSimpson(f, a, c, epsilon / 2, left, depth + 1) +
    adaptiveSimpson(f, c, b, epsilon / 2, right, depth + 1);
}

function integrateSegmented(f: (x: number) => number, a: number, b: number, epsilon = 2e-11): number {
  if (!(b > a)) return 0;
  const segments = Math.max(1, Math.ceil((b - a) / 0.05));
  let total = 0;
  for (let i = 0; i < segments; i += 1) {
    const lo = a + ((b - a) * i) / segments;
    const hi = a + ((b - a) * (i + 1)) / segments;
    total += adaptiveSimpson(f, lo, hi, epsilon / segments);
  }
  return total;
}

export interface ExactPairedTostPowerInput {
  n: number;
  sigma: number;
  delta: number;
  alpha?: number;
}

/**
 * Exact paired-TOST power at true mean difference zero under normal paired
 * differences. Unlike the former shifted-central-t approximation, this
 * integrates over the sampling distribution of the sample SD:
 *
 *   S / sigma ~ chi(df) / sqrt(df), df=n-1.
 *
 * Conditional on S=s, the sample mean remains N(0, sigma^2/n), so the TOST
 * acceptance probability is integrated over that chi distribution. This is
 * numerically equivalent to the classical Owen-Q exact formulation.
 */
export function exactPairedTostPowerAtZero(input: ExactPairedTostPowerInput): number {
  const { n, sigma, delta, alpha = 0.05 } = input;
  if (!Number.isInteger(n) || n < 2) throw new Error("n must be an integer >= 2");
  if (!(sigma >= 0) || !Number.isFinite(sigma)) throw new Error("sigma must be finite and >= 0");
  if (!(delta > 0) || !Number.isFinite(delta)) throw new Error("delta must be finite and > 0");
  if (!(alpha > 0 && alpha < 0.5)) throw new Error("alpha must be in (0,0.5)");
  if (sigma === 0) return 1;

  const df = n - 1;
  const tCrit = studentTQuantile(1 - alpha, df);
  const lambda = (delta * Math.sqrt(n)) / sigma;
  const rMax = lambda / tCrit;
  if (!(rMax > 0)) return 0;

  // Transform r=S/sigma in [0,rMax] to x=r/(1+r). This keeps the numerical
  // integration stable even when sigma is very small and rMax is large.
  const xMax = rMax / (1 + rMax);
  const integrand = (x: number): number => {
    if (x < 0 || x > xMax || x >= 1) return 0;
    const oneMinus = 1 - x;
    const r = x / oneMinus;
    const z = lambda - tCrit * r;
    if (z <= 0) return 0;
    const conditionalPower = 2 * standardNormalCdf(z) - 1;
    const jacobian = 1 / (oneMinus * oneMinus);
    return Math.max(0, conditionalPower) * chiScaledDensity(r, df) * jacobian;
  };

  return Math.max(0, Math.min(1, integrateSegmented(integrand, 0, xMax)));
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
