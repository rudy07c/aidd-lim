const fs = require('fs');
const cp = require('child_process');
const crypto = require('crypto');

function read(p) { return fs.readFileSync(p, 'utf8'); }
function write(p, s) { fs.writeFileSync(p, s, 'utf8'); }
function mustReplace(text, oldText, newText, label) {
  if (!text.includes(oldText)) throw new Error(`missing replacement anchor: ${label}`);
  return text.replace(oldText, newText);
}
function mustReplaceRegex(text, regex, replacement, label) {
  if (!regex.test(text)) throw new Error(`missing regex anchor: ${label}`);
  return text.replace(regex, replacement);
}
function git(args) { cp.execFileSync('git', args, { stdio: 'inherit' }); }

// ---------------------------------------------------------------------------
// 1) PREDECLARE THE SCIENTIFIC RULES FIRST, IN A SEPARATE COMMIT.
// ---------------------------------------------------------------------------
let stage = read('docs/stage1_plan.md');
stage = mustReplace(
  stage,
  'このmarginは観測varianceやAF平均から逆算した値ではなく、現在のprimary measurement bankにおける1 semantic unitを実質差の境界とする事前定義である。',
  'このmarginは観測varianceやAF平均から逆算した値ではなく、**固定bank上の最小意味単位に基づくoperational equivalence margin**である。現在のprimary measurement bankにおける1 task / 1 probeを測定上の最小意味単位とし、その1 unit丸ごとの差をequivalentへ含めない。これはMの1 taskとR^{sem}の1 probeが実世界で同一の価値を持つという主張ではない。',
  'operational equivalence wording'
);
const oldVarianceBlock = String.raw`- 独立したfresh-agent **AF-vs-AF twin arm** を用いる
- pilot pair数：8
- 各pairで同じ12 primary M task / 12 boolean probeを両armへ割り当てる
- 各pairのbank-level差 \(d_j\) を作り、そのsample SD \(s_D\) を推定する
- SDの楽観的過小推定を避けるため、\(df=7\) のchi-squareに基づく**片側95% upper confidence bound** \(\sigma_U\) をrepeat sizingへ使う
- TOST \(\alpha=0.05\)、真の差0を仮定したtarget power=0.80で、

\[
n_{req}=\left\lceil
\left(
\frac{(z_{0.95}+z_{0.90})\sigma_U}{\Delta}
\right)^2
\right\rceil
\]

をM/Rそれぞれに計算する
- Stage 1 primary comparisonの共通repeat数は ` + '`max(8, n_M, n_R)`' + String.raw` とする
- ` + '`n_req > 30`' + String.raw`となる場合は30へ丸めて実行せず、measurement instability / feasibilityの` + '`needs-audit`' + String.raw`として停止する
- variance pilotの観測値をequivalence margin変更やtask reselectionには使用しない
- variance pilot dataはP6-2 baseline本取得へpoolしない
- repeat数freeze後はCIがwideでも追加repeatをpost-hocに足さず、equivalenceについては「判定不能」と報告する`;
const newVarianceBlock = String.raw`- 独立したfresh-agent **AF-vs-AF twin arm** を用いる
- pilot pair数：8（pair id 1〜8を事前固定）
- 各pairで同じ12 primary M task / 12 boolean probeを両armへ割り当てる
- pair単位でA/Bを近接実行し、同一task/probeのpaired call間へ別pairのscientific callを挟まない
- order effectを一方向へ固定しないため、奇数pairはA→B、偶数pairはB→AとしてAB/BAを交互にcounterbalanceする
- infrastructure-invalidがいずれかのarmに発生したpair attemptはscientific variance dataへ含めず、**同一pair idを最大3 attempt（初回+2 replacement）**まで再取得する。3 attemptすべてでinfrastructure-invalidなら` + '`needs-audit`' + String.raw`として停止する
- ` + '`system` / `other`' + String.raw`は自動replacementせず、その場で` + '`needs-audit`' + String.raw`とする
- protocol failureはinfrastructureと別に記録する。Mのprotocol failureは事前規則どおりend-to-end failure=0としてpair scoreへ含める。R^{sem}のprotocol failureはprotocol reliability=0として保存し、semantic-accuracy差には変換しない。R^{sem}でprotocol-valid paired observationが8 pair未満なら追加pairをpost-hocに足さず` + '`needs-audit`' + String.raw`とする
- 各pairのbank-level差 \(d_j\) を作り、そのsample SD \(s_D\) を推定する
- SDの楽観的過小推定を避けるため、\(df=7\) のchi-squareに基づく**片側95% upper confidence bound** \(\sigma_U\) をrepeat sizingへ使う
- repeat sizingは正規近似を用いない。M/Rそれぞれについてcandidate \(n=8,9,\dots,30\) を順に評価し、真の差0における**exact paired-TOST power**が0.80以上となる最小nを採用する
- candidate nごとに \(SE=\sigma_U/\sqrt{n}\)、\(\lambda=\Delta/SE\)、\(t_{crit}=t_{1-\alpha,n-1}\) とし、非心t分布ではなく中心t分布 \(T\sim t_{n-1}\) を用いて

\[
Power(n)=P(t_{crit}-\lambda<T<\lambda-t_{crit})
\]

\[
=F_{t_{n-1}}(\lambda-t_{crit})-F_{t_{n-1}}(t_{crit}-\lambda)
\]

を計算する。区間上端が下端以下ならpower=0とする
- Stage 1 primary comparisonの共通repeat数は ` + '`max(8, n_M, n_R)`' + String.raw` とする
- n=30でもtarget power=0.80へ到達しない場合は30へ丸めて実行せず、measurement instability / feasibilityの` + '`needs-audit`' + String.raw`として停止する
- variance pilotの観測値をequivalence margin変更やtask reselectionには使用しない
- variance pilot dataはP6-2 baseline本取得へpoolしない
- repeat数freeze後はCIがwideでも追加repeatをpost-hocに足さず、equivalenceについては「判定不能」と報告する`;
stage = mustReplace(stage, oldVarianceBlock, newVarianceBlock, 'variance pilot exact power block');
stage = mustReplace(
  stage,
  'を採用する。1 task / 1 probe丸ごとの差は実質同等に含めず、equivalence regionはopen interval \\((-1/12,+1/12)\\) とする。',
  'を、**固定bank上の最小意味単位に基づくoperational equivalence margin**として採用する。1 task / 1 probe丸ごとの差は実質同等に含めず、equivalence regionはopen interval \\((-1/12,+1/12)\\) とする。Mの1 taskとR^{sem}の1 probeの実世界上の価値が同一であることは仮定しない。',
  'section 11 operational wording'
);
write('docs/stage1_plan.md', stage);

let exp = read('docs/experiment_plan.md');
exp = mustReplace(
  exp,
  '\\(\\Delta_M=\\Delta_R=1/12\\approx0.08333\\)を事前marginとする。',
  '\\(\\Delta_M=\\Delta_R=1/12\\approx0.08333\\)を固定bank上の最小意味単位に基づくoperational equivalence marginとして事前freezeする。',
  'experiment operational wording'
);
exp = mustReplace(
  exp,
  'repeat数は8 pairのfresh AF-vs-AF variance pilot、SD片側95% upper bound、target power 0.80から事前式で決め、最低8 repeat、必要数が30を超える場合は丸めず設計監査へ戻す。',
  'repeat数は8 pairのfresh AF-vs-AF variance pilot（奇数AB/偶数BA、infrastructure-invalidは同一pair idを最大3 attemptまでreplacement）、SD片側95% upper boundを用い、n=8〜30の中心t分布によるexact paired-TOST powerを順に計算してtarget power 0.80を満たす最小nへfreezeする。n=30でも不足する場合は丸めず設計監査へ戻す。',
  'experiment exact power summary'
);
write('docs/experiment_plan.md', exp);

git(['add', 'docs/stage1_plan.md', 'docs/experiment_plan.md']);
git(['commit', '-m', 'docs: freeze P6-2 exact power and pair rules']);

// ---------------------------------------------------------------------------
// 2) IMPLEMENT THE PREDECLARED RULES.
// ---------------------------------------------------------------------------
const powerTs = String.raw`export const P6_2_EXACT_POWER_METHOD_VERSION = "paired-tost-central-t-exact-v1";

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
`;
fs.mkdirSync('harness/src/p6', { recursive: true });
write('harness/src/p6/equivalence-power.ts', powerTs);

const adjudicationTs = String.raw`export const P6_2_ADJUDICATION_VERSION = "p6-2-adjudication-v1";

export type P62AdjudicationFinalDisposition =
  | "scientific-failure"
  | "protocol-failure"
  | "infrastructure-invalid";

export interface P62AdjudicationRecord {
  reviewer: string;
  reason: string;
  finalDisposition: P62AdjudicationFinalDisposition;
  adjudicatedAt: string;
  toolVersion: string;
  toolSha256: string;
}

export interface P62AdjudicationRequest {
  measurement: "M" | "Rsem";
  taskId?: string | null;
  repeat: number;
  reviewer: string;
  reason: string;
  finalDisposition: P62AdjudicationFinalDisposition;
  adjudicatedAt?: string;
}

function requireText(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${name} must be non-empty`);
  return trimmed;
}

export function applyP62Adjudication(
  result: any,
  request: P62AdjudicationRequest,
  toolSha256: string
): any {
  if (!result || !result.measurements || !Array.isArray(result.auditFlags)) throw new Error("Not a P6-2 AF baseline result");
  if (!Number.isInteger(request.repeat) || request.repeat <= 0) throw new Error("repeat must be a positive integer");
  const reviewer = requireText(request.reviewer, "reviewer");
  const reason = requireText(request.reason, "reason");
  const adjudication: P62AdjudicationRecord = {
    reviewer,
    reason,
    finalDisposition: request.finalDisposition,
    adjudicatedAt: request.adjudicatedAt ?? new Date().toISOString(),
    toolVersion: P6_2_ADJUDICATION_VERSION,
    toolSha256,
  };

  let target: any;
  if (request.measurement === "M") {
    const taskId = requireText(request.taskId ?? "", "taskId");
    target = result.measurements.M.repeatResults.find((item: any) => item.taskId === taskId && item.repeat === request.repeat);
    if (!target) throw new Error(`M repeat not found: ${taskId}#${request.repeat}`);
    const raw = target.rawFailureDomain ?? target.failureDomain;
    if (!["system", "infrastructure", "other"].includes(raw)) throw new Error(`M raw failure domain is not adjudicable: ${raw}`);
    if (request.finalDisposition === "protocol-failure") throw new Error("M adjudication does not use protocol-failure final disposition");
    target.rawFailureDomain = raw;
    target.adjudication = adjudication;
    target.passed = false;
    if (request.finalDisposition === "scientific-failure") {
      target.failureDomain = "semantic";
      target.validity = "valid";
    } else {
      target.failureDomain = "infrastructure";
      target.validity = "infrastructure-invalid";
    }
  } else {
    target = result.measurements.Rsem.repeatResults.find((item: any) => item.repeat === request.repeat);
    if (!target) throw new Error(`Rsem repeat not found: ${request.repeat}`);
    const raw = target.rawFailureDomain ?? target.failureDomain;
    if (!["protocol", "system", "infrastructure"].includes(raw)) throw new Error(`Rsem raw failure domain is not adjudicable: ${raw}`);
    target.rawFailureDomain = raw;
    target.adjudication = adjudication;
    if (request.finalDisposition === "scientific-failure") {
      target.failureDomain = "semantic";
      target.validity = "valid";
      target.booleanCorrect = 0;
      target.booleanAccuracy = 0;
      target.protocolValid = true;
    } else if (request.finalDisposition === "protocol-failure") {
      target.failureDomain = "protocol";
      target.validity = "valid";
      target.booleanCorrect = null;
      target.booleanAccuracy = null;
      target.protocolValid = false;
    } else {
      target.failureDomain = "infrastructure";
      target.validity = "infrastructure-invalid";
      target.booleanCorrect = null;
      target.booleanAccuracy = null;
      target.protocolValid = null;
    }
  }

  const flag = result.auditFlags.find((item: any) =>
    item.measurement === request.measurement &&
    item.repeat === request.repeat &&
    (request.measurement === "Rsem" || item.taskId === request.taskId) &&
    !item.resolvedAt
  );
  if (!flag) throw new Error("Matching unresolved audit flag not found");
  flag.resolvedAt = adjudication.adjudicatedAt;
  flag.adjudication = adjudication;
  const unresolved = result.auditFlags.some((item: any) => !item.resolvedAt);
  result.status = unresolved ? "needs-audit" : "running";
  if (!unresolved) result.completedAt = null;
  result.updatedAt = adjudication.adjudicatedAt;
  return result;
}
`;
write('harness/src/p6/adjudication.ts', adjudicationTs);

let af = read('harness/src/p6/af-baseline.ts');
af = mustReplace(af, 'p6-2-af-baseline-v3-equivalence-freeze', 'p6-2-af-baseline-v4-exact-power-adjudication', 'baseline version');
af = mustReplace(
  af,
  'export const P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS = 8;\nexport const P6_2_VARIANCE_SD_UCB_CONFIDENCE = 0.95;\nexport const P6_2_MIN_SCIENTIFIC_REPEATS = 8;\nexport const P6_2_MAX_SCIENTIFIC_REPEATS = 30;\n// Remains null until the separate AF-vs-AF variance pilot is completed.\nexport const P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT: number | null = null;',
  'export const P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS = 8;\nexport const P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR = 3;\nexport const P6_2_VARIANCE_SD_UCB_CONFIDENCE = 0.95;\nexport const P6_2_MIN_SCIENTIFIC_REPEATS = 8;\nexport const P6_2_MAX_SCIENTIFIC_REPEATS = 30;\n// Remains null until the separate AF-vs-AF variance pilot is completed.\nexport const P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT: number | null = null;\n\nexport type P62RepeatCountSource = "runtime-argument-pre-freeze" | "frozen-scientific-repeat-count";\n\nexport function resolveP62RepeatCountSource(\n  repeatCount: number,\n  frozenCount: number | null = P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT\n): P62RepeatCountSource {\n  validateP62RepeatCount(repeatCount);\n  if (frozenCount === null) return "runtime-argument-pre-freeze";\n  if (repeatCount !== frozenCount) {\n    throw new Error(`P6-2 repeat count ${repeatCount} does not match frozen scientific repeat count ${frozenCount}`);\n  }\n  return "frozen-scientific-repeat-count";\n}\n\nexport type P62VariancePilotArm = "A" | "B";\nexport function p62VariancePilotArmOrder(pairId: number): readonly [P62VariancePilotArm, P62VariancePilotArm] {\n  if (!Number.isInteger(pairId) || pairId < 1 || pairId > P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS) {\n    throw new Error(`Invalid P6-2 variance-pilot pair id: ${pairId}`);\n  }\n  return pairId % 2 === 1 ? ["A", "B"] : ["B", "A"];\n}',
  'pilot constants and repeat source'
);
af = mustReplace(
  af,
  'export interface P62MRepeatLike extends TaskRepeatLike, FailureClassification {\n  role: P62TaskRole;\n}',
  'export interface P62MRepeatLike extends TaskRepeatLike, FailureClassification {\n  role: P62TaskRole;\n  rawFailureDomain?: FailureDomain;\n  adjudication?: import("./adjudication").P62AdjudicationRecord | null;\n}',
  'M adjudication fields'
);
af = mustReplace(
  af,
  'export function classifyP62MRepeat<T extends TaskRepeatLike>(\n  result: T,\n  role = roleForP62Task(result.taskId)\n): T & FailureClassification & { role: P62TaskRole } {\n  return { ...result, ...classifyFailure(result), role };\n}',
  'export function classifyP62MRepeat<T extends TaskRepeatLike>(\n  result: T,\n  role = roleForP62Task(result.taskId)\n): T & FailureClassification & { role: P62TaskRole; rawFailureDomain: FailureDomain; adjudication: null } {\n  const failure = classifyFailure(result);\n  return { ...result, ...failure, rawFailureDomain: failure.failureDomain, adjudication: null, role };\n}',
  'classify raw domain'
);
write('harness/src/p6/af-baseline.ts', af);

let runner = read('harness/p6-af-baseline-live.ts');
runner = mustReplace(runner, 'p6-2-af-baseline-result-v3-equivalence-freeze', 'p6-2-af-baseline-result-v4-exact-power-adjudication', 'run schema version');
runner = mustReplace(
  runner,
  '  P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,\n  P6_2_VARIANCE_SD_UCB_CONFIDENCE,',
  '  P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,\n  P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR,\n  P6_2_VARIANCE_SD_UCB_CONFIDENCE,\n  resolveP62RepeatCountSource,',
  'runner imports pilot constants'
);
runner = mustReplace(
  runner,
  '  "harness/src/p6/af-baseline.ts",\n  "harness/src/p6/task-bank-live-runtime.ts",',
  '  "harness/src/p6/af-baseline.ts",\n  "harness/src/p6/equivalence-power.ts",\n  "harness/src/p6/adjudication.ts",\n  "harness/src/p6/task-bank-live-runtime.ts",',
  'critical source list'
);
runner = mustReplace(
  runner,
  '  failureDomain: P62RSemFailureDomain;\n  failureReason: string | null;',
  '  failureDomain: P62RSemFailureDomain;\n  rawFailureDomain: P62RSemFailureDomain;\n  adjudication: import("./src/p6/adjudication").P62AdjudicationRecord | null;\n  protocolValid: boolean | null;\n  failureReason: string | null;',
  'Rsem adjudication fields'
);
runner = mustReplace(
  runner,
  '  variancePilotPairedAfRepeats: number;\n  varianceSdUcbConfidence: number;',
  '  variancePilotPairedAfRepeats: number;\n  variancePilotMaxAttemptsPerPair: number;\n  varianceSdUcbConfidence: number;',
  'manifest pilot attempts'
);
runner = mustReplace(
  runner,
  '  repeatCountSource: "runtime-argument-pre-freeze";',
  '  repeatCountSource: "runtime-argument-pre-freeze" | "frozen-scientific-repeat-count";',
  'manifest repeat count source union'
);
runner = mustReplace(
  runner,
  '    reason: string | null;\n  }>;',
  '    reason: string | null;\n    resolvedAt?: string | null;\n    adjudication?: import("./src/p6/adjudication").P62AdjudicationRecord | null;\n  }>;',
  'audit flag resolution fields'
);
runner = mustReplace(
  runner,
  '      repeatResults: RSemProbeRepeatResult[];\n      meanBooleanAccuracy: number | null;',
  '      repeatResults: RSemProbeRepeatResult[];\n      meanBooleanAccuracy: number | null;\n      semanticAccuracyProtocolValid: number | null;\n      protocolEvaluableRepeats: number;\n      protocolValidRepeats: number;\n      protocolFailureRepeats: number;\n      protocolReliability: number | null;',
  'Rsem diagnostics result fields'
);
runner = mustReplace(
  runner,
  '    variancePilotPairedAfRepeats: P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,\n    varianceSdUcbConfidence: P6_2_VARIANCE_SD_UCB_CONFIDENCE,',
  '    variancePilotPairedAfRepeats: P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,\n    variancePilotMaxAttemptsPerPair: P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR,\n    varianceSdUcbConfidence: P6_2_VARIANCE_SD_UCB_CONFIDENCE,',
  'manifest pilot attempt value'
);
runner = mustReplace(
  runner,
  '    repeatCount,\n    repeatCountSource: "runtime-argument-pre-freeze",',
  '    repeatCount,\n    repeatCountSource: resolveP62RepeatCountSource(repeatCount),',
  'manifest repeat source logic'
);
runner = mustReplace(
  runner,
  '        repeatResults: [],\n        meanBooleanAccuracy: null,',
  '        repeatResults: [],\n        meanBooleanAccuracy: null,\n        semanticAccuracyProtocolValid: null,\n        protocolEvaluableRepeats: 0,\n        protocolValidRepeats: 0,\n        protocolFailureRepeats: 0,\n        protocolReliability: null,',
  'initial Rsem diagnostics'
);
runner = mustReplace(
  runner,
  'function recomputeResult(result: P62AfBaselineResult): void {\n  result.measurements.M.summary = summarizeP62M(result.measurements.M.repeatResults);\n  const r = result.measurements.Rsem.repeatResults;\n  const validR = r.filter((item) =>\n    item.validity === "valid" && item.failureDomain === "none" && item.booleanAccuracy !== null\n  );\n  result.measurements.Rsem.meanBooleanAccuracy = validR.length\n    ? validR.reduce((sum, item) => sum + (item.booleanAccuracy ?? 0), 0) / validR.length\n    : null;',
  'export function recomputeP62Result(result: P62AfBaselineResult): void {\n  result.measurements.M.summary = summarizeP62M(result.measurements.M.repeatResults);\n  const r = result.measurements.Rsem.repeatResults;\n  const validR = r.filter((item) =>\n    item.validity === "valid" && (item.failureDomain === "none" || item.failureDomain === "semantic") &&\n    item.protocolValid === true && item.booleanAccuracy !== null\n  );\n  const semanticAccuracy = validR.length\n    ? validR.reduce((sum, item) => sum + (item.booleanAccuracy ?? 0), 0) / validR.length\n    : null;\n  result.measurements.Rsem.meanBooleanAccuracy = semanticAccuracy;\n  result.measurements.Rsem.semanticAccuracyProtocolValid = semanticAccuracy;\n  const protocolEvaluable = r.filter((item) => item.protocolValid !== null);\n  const protocolValid = protocolEvaluable.filter((item) => item.protocolValid === true);\n  const protocolFailure = protocolEvaluable.filter((item) => item.protocolValid === false);\n  result.measurements.Rsem.protocolEvaluableRepeats = protocolEvaluable.length;\n  result.measurements.Rsem.protocolValidRepeats = protocolValid.length;\n  result.measurements.Rsem.protocolFailureRepeats = protocolFailure.length;\n  result.measurements.Rsem.protocolReliability = protocolEvaluable.length ? protocolValid.length / protocolEvaluable.length : null;',
  'recompute Rsem diagnostics'
);
runner = runner.replaceAll('recomputeResult(result);', 'recomputeP62Result(result);');
runner = mustReplace(
  runner,
  '    failureDomain: args.failureDomain,\n    failureReason: args.failureReason,',
  '    failureDomain: args.failureDomain,\n    rawFailureDomain: args.failureDomain,\n    adjudication: null,\n    protocolValid: args.failureDomain === "protocol" ? false : null,\n    failureReason: args.failureReason,',
  'probe failure raw/protocol fields'
);
runner = mustReplace(
  runner,
  '    failureDomain: "none",\n    failureReason: null,',
  '    failureDomain: "none",\n    rawFailureDomain: "none",\n    adjudication: null,\n    protocolValid: true,\n    failureReason: null,',
  'probe success raw/protocol fields'
);
runner = mustReplace(
  runner,
  '    variancePilotPairedAfRepeats: P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,\n    varianceSdUcbConfidence: P6_2_VARIANCE_SD_UCB_CONFIDENCE,',
  '    variancePilotPairedAfRepeats: P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,\n    variancePilotMaxAttemptsPerPair: P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR,\n    varianceSdUcbConfidence: P6_2_VARIANCE_SD_UCB_CONFIDENCE,',
  'console equivalence pair attempts'
);
runner = mustReplace(
  runner,
  '  console.log("P6-2 RSEM SUMMARY", JSON.stringify({ meanBooleanAccuracy: result.measurements.Rsem.meanBooleanAccuracy }));',
  '  console.log("P6-2 RSEM SUMMARY", JSON.stringify({\n    semanticAccuracyProtocolValid: result.measurements.Rsem.semanticAccuracyProtocolValid,\n    protocolReliability: result.measurements.Rsem.protocolReliability,\n    protocolEvaluableRepeats: result.measurements.Rsem.protocolEvaluableRepeats,\n  }));',
  'Rsem console summary'
);
write('harness/p6-af-baseline-live.ts', runner);

const cliTs = String.raw`import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { applyP62Adjudication, type P62AdjudicationFinalDisposition } from "./src/p6/adjudication";
import { recomputeP62Result, type P62AfBaselineResult } from "./p6-af-baseline-live";

function argValue(name: string): string | null {
  const token = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return token ? token.slice(name.length + 3) : null;
}

const positional = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--"));
if (!positional) {
  throw new Error("Usage: npm run p6:adjudicate-af-baseline -- <result.json> --measurement=M|Rsem --repeat=N [--task=T-...] --reviewer=... --disposition=scientific-failure|protocol-failure|infrastructure-invalid --reason=... [--write]");
}
const resultPath = path.resolve(positional);
const measurement = argValue("measurement");
if (measurement !== "M" && measurement !== "Rsem") throw new Error("--measurement must be M or Rsem");
const repeat = Number(argValue("repeat"));
const reviewer = argValue("reviewer") ?? "";
const reason = argValue("reason") ?? "";
const disposition = argValue("disposition") as P62AdjudicationFinalDisposition | null;
if (!disposition || !["scientific-failure", "protocol-failure", "infrastructure-invalid"].includes(disposition)) {
  throw new Error("invalid --disposition");
}
const scriptSha = crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex");
const result = JSON.parse(fs.readFileSync(resultPath, "utf8")) as P62AfBaselineResult;
applyP62Adjudication(result, {
  measurement,
  taskId: argValue("task"),
  repeat,
  reviewer,
  reason,
  finalDisposition: disposition,
}, scriptSha);
recomputeP62Result(result);
const rendered = JSON.stringify(result, null, 2) + "\n";
if (process.argv.includes("--write")) {
  const tmp = `${resultPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, rendered, "utf8");
  fs.renameSync(tmp, resultPath);
  console.error(`Adjudicated P6-2 result in place: ${resultPath}`);
} else {
  process.stdout.write(rendered);
}
`;
write('harness/adjudicate-p6-af-baseline.ts', cliTs);

let pkg = JSON.parse(read('harness/package.json'));
pkg.scripts['p6:adjudicate-af-baseline'] = 'ts-node adjudicate-p6-af-baseline.ts';
write('harness/package.json', JSON.stringify(pkg, null, 2) + '\n');

let verify = read('harness/verify-p6-af-baseline.ts');
verify = mustReplace(verify, '  P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,\n  P6_2_VARIANCE_SD_UCB_CONFIDENCE,', '  P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,\n  P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR,\n  P6_2_VARIANCE_SD_UCB_CONFIDENCE,\n  p62VariancePilotArmOrder,\n  resolveP62RepeatCountSource,', 'verify imports pair rules');
verify = mustReplace(verify, '} from "./src/p6/af-baseline";\nimport {', '} from "./src/p6/af-baseline";\nimport { exactPairedTostPowerAtZero, findMinimumExactPairedTostN } from "./src/p6/equivalence-power";\nimport { applyP62Adjudication } from "./src/p6/adjudication";\nimport {', 'verify imports power/adjudication');
verify = mustReplace(verify, '  assert.equal(P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS, 8);\n  assert.equal(P6_2_VARIANCE_SD_UCB_CONFIDENCE, 0.95);', '  assert.equal(P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS, 8);\n  assert.equal(P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR, 3);\n  assert.deepEqual(p62VariancePilotArmOrder(1), ["A", "B"]);\n  assert.deepEqual(p62VariancePilotArmOrder(2), ["B", "A"]);\n  assert.equal(resolveP62RepeatCountSource(8), "runtime-argument-pre-freeze");\n  assert.equal(resolveP62RepeatCountSource(11, 11), "frozen-scientific-repeat-count");\n  assertThrowsMessage(() => resolveP62RepeatCountSource(10, 11), /does not match frozen scientific repeat count/);\n  assert.equal(P6_2_VARIANCE_SD_UCB_CONFIDENCE, 0.95);', 'verify pair/repeat source');
verify = mustReplace(verify, '  assertThrowsMessage(() => assertP62LiveRepeatCountFrozen(8), /scientific repeat count is not frozen/);', '  assertThrowsMessage(() => assertP62LiveRepeatCountFrozen(8), /scientific repeat count is not frozen/);\n\n  // Exact paired-TOST power regression: sigma_U=Delta must not use the old normal approximation.\n  const sigmaEqualsDeltaPower9 = exactPairedTostPowerAtZero({ n: 9, sigma: P6_2_DELTA_M, delta: P6_2_DELTA_M, alpha: 0.05 });\n  assert(Math.abs(sigmaEqualsDeltaPower9 - 0.7129123074) < 1e-6, `unexpected n=9 exact power: ${sigmaEqualsDeltaPower9}`);\n  const exactSearch = findMinimumExactPairedTostN({\n    sigmaUpperBound: P6_2_DELTA_M, delta: P6_2_DELTA_M, targetPower: 0.80, alpha: 0.05, minN: 8, maxN: 30,\n  });\n  assert.equal(exactSearch.requiredN, 11);\n  assert((exactSearch.powers.find((x) => x.n === 10)?.power ?? 1) < 0.80);\n  assert((exactSearch.powers.find((x) => x.n === 11)?.power ?? 0) >= 0.80);', 'verify exact power');
verify = mustReplace(verify, 'path.join(repositoryDir, "tests/visible.test.ts")', 'path.join(repositoryDir, "tests/rules.visible.test.ts")', 'visible test path');
verify = mustReplace(
  verify,
  '    failureDomain: "none",\n    failureReason: null,',
  '    failureDomain: "none",\n    rawFailureDomain: "none",\n    adjudication: null,\n    protocolValid: true,\n    failureReason: null,',
  'mock Rsem new fields'
);
verify = mustReplace(
  verify,
  '  assert.notStrictEqual(result.measurements.M, result.measurements.Rsem);',
  '  assert.notStrictEqual(result.measurements.M, result.measurements.Rsem);\n  assert.equal(result.measurements.Rsem.protocolReliability, null);',
  'initial protocol reliability'
);
// Add adjudication + Rsem diagnostic verification after denominator summary.
verify = mustReplace(
  verify,
  '  assert.equal(denominatorSummary.primary.passRate, 0.5);',
  '  assert.equal(denominatorSummary.primary.passRate, 0.5);\n\n  // needs-audit has a provenance-preserving adjudication exit.\n  const adjudicationFixture: any = createP62Result({\n    taskBankPath, taskBankRaw, tasks, repositoryPath: repositoryDir, repository, repeatCount: 1, manifest, booleanProbeIds: booleanProbes.map((probe) => probe.probeId),\n  });\n  const adjudicableSystem = { ...systemMock, role: "primary", modifiedPaths: [], workingNote: null, actualModel: "mock", usage: null, estimatedCostUsd: 0, visible: null, hidden: null, taskSpecific: null, protocolContractViolated: null };\n  adjudicationFixture.measurements.M.repeatResults.push(adjudicableSystem);\n  adjudicationFixture.status = "needs-audit";\n  adjudicationFixture.auditFlags.push({ measurement: "M", taskId: adjudicableSystem.taskId, repeat: adjudicableSystem.repeat, failureDomain: "system", executionStatus: adjudicableSystem.executionStatus, reason: adjudicableSystem.failureReason });\n  applyP62Adjudication(adjudicationFixture, { measurement: "M", taskId: adjudicableSystem.taskId, repeat: adjudicableSystem.repeat, reviewer: "offline-verifier", reason: "artifact-caused compile/runtime failure", finalDisposition: "scientific-failure", adjudicatedAt: "2026-09-20T00:00:00.000Z" }, "mock-tool-sha");\n  const adjudicatedM = adjudicationFixture.measurements.M.repeatResults[0];\n  assert.equal(adjudicatedM.rawFailureDomain, "system");\n  assert.equal(adjudicatedM.failureDomain, "semantic");\n  assert.equal(adjudicatedM.adjudication.finalDisposition, "scientific-failure");\n  assert.equal(adjudicationFixture.status, "running");\n  assert.equal(adjudicationFixture.auditFlags[0].resolvedAt, "2026-09-20T00:00:00.000Z");',
  'adjudication verification'
);
// Add protocol fields assertions to injected Rsem outcomes.
verify = mustReplace(verify, '    assert.equal(success.failureDomain, "none");\n    assert.equal(success.booleanAccuracy, 1);', '    assert.equal(success.failureDomain, "none");\n    assert.equal(success.rawFailureDomain, "none");\n    assert.equal(success.protocolValid, true);\n    assert.equal(success.booleanAccuracy, 1);', 'success protocol flag');
verify = mustReplace(verify, '    assert.equal(refusal.validity, "infrastructure-invalid");', '    assert.equal(refusal.validity, "infrastructure-invalid");\n    assert.equal(refusal.protocolValid, null);', 'refusal protocol flag');
verify = mustReplace(verify, '    assert.equal(parseFailure.validity, "valid");', '    assert.equal(parseFailure.validity, "valid");\n    assert.equal(parseFailure.protocolValid, false);', 'parse protocol flag');
verify = mustReplace(verify, '  console.log(`  variance pilot: paired AF-vs-AF repeats=${P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS}, scientific repeat count still unfrozen/live-blocked`);', '  console.log(`  exact power: sigma_U=Delta gives n=9 power=${sigmaEqualsDeltaPower9.toFixed(6)}, minimum n for power>=0.80 is ${exactSearch.requiredN}`);\n  console.log(`  variance pilot: paired AF-vs-AF repeats=${P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS}, max attempts/pair=${P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR}, AB/BA counterbalanced, scientific repeat count still unfrozen/live-blocked`);', 'verify output');
write('harness/verify-p6-af-baseline.ts', verify);

git(['add', 'harness/src/p6/equivalence-power.ts', 'harness/src/p6/adjudication.ts', 'harness/src/p6/af-baseline.ts', 'harness/p6-af-baseline-live.ts', 'harness/adjudicate-p6-af-baseline.ts', 'harness/verify-p6-af-baseline.ts', 'harness/package.json']);
git(['commit', '-m', 'fix: harden P6-2 exact power and adjudication']);
