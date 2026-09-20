export interface ExactPairedTostPowerInput {
  n: number;
  delta: number;
  sigma: number;
  alpha: number;
}

function logGamma(z: number): number {
  const p = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019571e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = 0.9999999999998099;
  for (let i = 0; i < p.length; i++) x += p[i] / (z + i + 1);
  const t = z + p.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
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
  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) <= epsilon) break;
  }
  return h;
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betaContinuedFraction(a, b, x)) / a;
  return 1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b;
}

export function studentTCdf(t: number, df: number): number {
  if (!(df > 0)) throw new Error(`studentTCdf requires df>0, got ${df}`);
  if (!Number.isFinite(t)) return t < 0 ? 0 : 1;
  if (t === 0) return 0.5;
  const x = df / (df + t * t);
  const ib = regularizedIncompleteBeta(x, df / 2, 0.5);
  return t > 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

export function studentTQuantile(p: number, df: number): number {
  if (!(p > 0 && p < 1)) throw new Error(`studentTQuantile requires 0<p<1, got ${p}`);
  if (!(df > 0)) throw new Error(`studentTQuantile requires df>0, got ${df}`);
  if (p === 0.5) return 0;
  if (p < 0.5) return -studentTQuantile(1 - p, df);
  let lo = 0;
  let hi = 1;
  while (studentTCdf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2;
    if (studentTCdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function exactPairedTostPower(input: ExactPairedTostPowerInput): number {
  const { n, delta, sigma, alpha } = input;
  if (!Number.isInteger(n) || n < 2) throw new Error(`exactPairedTostPower requires integer n>=2, got ${n}`);
  if (!(delta > 0)) throw new Error(`delta must be >0, got ${delta}`);
  if (!(sigma > 0)) throw new Error(`sigma must be >0, got ${sigma}`);
  if (!(alpha > 0 && alpha < 0.5)) throw new Error(`alpha must be in (0,0.5), got ${alpha}`);
  const df = n - 1;
  const tCrit = studentTQuantile(1 - alpha, df);
  const se = sigma / Math.sqrt(n);
  const ncp = delta / se;
  const lower = tCrit - ncp;
  const upper = ncp - tCrit;
  if (upper <= lower) return 0;
  return Math.max(0, Math.min(1, studentTCdf(upper, df) - studentTCdf(lower, df)));
}

export function smallestExactPairedTostN(args: {
  delta: number;
  sigmaUpper: number;
  alpha: number;
  targetPower: number;
  minN: number;
  maxN: number;
}): { n: number | null; powers: Array<{ n: number; power: number }> } {
  const powers: Array<{ n: number; power: number }> = [];
  for (let n = args.minN; n <= args.maxN; n++) {
    const power = exactPairedTostPower({ n, delta: args.delta, sigma: args.sigmaUpper, alpha: args.alpha });
    powers.push({ n, power });
    if (power >= args.targetPower) return { n, powers };
  }
  return { n: null, powers };
}
