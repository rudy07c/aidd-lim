from pathlib import Path


def replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if text.count(old) < count:
        raise SystemExit(f'anchor missing in {path}: {old[:100]!r}')
    text = text.replace(old, new, count)
    p.write_text(text)

# --- docs/stage1_plan.md ---
replace('docs/stage1_plan.md',
'''を、**研究上どの程度の差以下なら実質的に同等と扱うか**というequivalence marginとして、P6-2 baseline結果を見る前にfreezeする。''',
'''を、**固定primary bank上の最小意味単位に基づくoperational equivalence margin**として、P6-2 baseline結果を見る前にfreezeする。これは実世界のutility差を直接表すpractical marginではなく、現在のmeasurement bank上で1 unit丸ごとの差を無視しないための操作的境界である。''')

replace('docs/stage1_plan.md',
'''のopen intervalとし、差がちょうど \\(1/12\\) に達する場合はequivalentとは判定しない。このmarginは観測varianceやAF平均から逆算した値ではなく、現在のprimary measurement bankにおける1 semantic unitを実質差の境界とする事前定義である。''',
'''のopen intervalとし、差がちょうど \\(1/12\\) に達する場合はequivalentとは判定しない。このmarginは観測varianceやAF平均から逆算した値ではなく、現在の固定primary measurement bankにおける1 task / 1 probeを最小意味単位とする**operational equivalence margin**である。Mの1 taskとRsemの1 probeが実世界のutility上で同じ重要度を持つ、という主張は行わない。''')

replace('docs/stage1_plan.md',
'''\\(R^{sem}\\)ではsemantic reconstructionとoutput protocolを混同しないため、structured-output parse / forced-choice format等の`protocol` failureは誤答0点へ変換せず`needs-audit`とする。`system` / `infrastructure`も同様であり、main accuracyは`failureDomain=none`のrepeatだけから計算する。ただしaudit未解決のままrunをcompleted扱いしない。''',
'''\\(R^{sem}\\)ではsemantic reconstructionとoutput protocolを混同しないため、structured-output parse / forced-choice format等の`protocol` failureは誤答0点へ変換せず`needs-audit`とする。`system` / `infrastructure`も同様であり、main accuracyは`failureDomain=none`のrepeatだけから計算する。ただしaudit未解決のままrunをcompleted扱いしない。加えて、semantic accuracyとは別に **Rsem protocol reliability** を必須diagnosticとして保存・報告する。protocol reliabilityの分母はsystem / infrastructureを除くprotocol-evaluable repeat、分子はstructured output / forced-choice contractを満たしたrepeatとする。''')

old = '''- 独立したfresh-agent **AF-vs-AF twin arm** を用いる
- pilot pair数：8
- 各pairで同じ12 primary M task / 12 boolean probeを両armへ割り当てる
- 各pairのbank-level差 \\(d_j\\) を作り、そのsample SD \\(s_D\\) を推定する
- SDの楽観的過小推定を避けるため、\\(df=7\\) のchi-squareに基づく**片側95% upper confidence bound** \\(\\sigma_U\\) をrepeat sizingへ使う
- TOST \\(\\alpha=0.05\\)、真の差0を仮定したtarget power=0.80で、

\\[
n_{req}=\\left\\lceil
\\left(
\\frac{(z_{0.95}+z_{0.90})\\sigma_U}{\\Delta}
\\right)^2
\\right\\rceil
\\]

をM/Rそれぞれに計算する
- Stage 1 primary comparisonの共通repeat数は `max(8, n_M, n_R)` とする
- `n_req > 30`となる場合は30へ丸めて実行せず、measurement instability / feasibilityの`needs-audit`として停止する
'''
new = '''- 独立したfresh-agent **AF-vs-AF twin arm** を用いる
- pilot pair数：8
- pair単位でA/Bを時間的に近接して実行し、奇数pairはAB、偶数pairはBAの順でcounterbalanceする
- 各pairで同じ12 primary M task / 12 boolean probeを両armへ割り当てる
- infrastructure-invalidが一方でも発生したpairは科学データへ含めず、同一pair idをreplacementする。replacement上限は**2回**、すなわち初回を含め最大3 attempt / pairとする。3 attemptすべてでaccepted pairを得られなければ`needs-audit`で停止する
- protocol failureはinfrastructure-invalidと混同せず別記録する。Mのprotocol failureは事前定義どおりend-to-end failureとしてM scoreへ残す。Rsemのprotocol-invalid armはsemantic variance estimateへ入れず`needs-audit`とする
- 各accepted pairのbank-level差 \\(d_j\\) を作り、そのsample SD \\(s_D\\) を推定する
- SDの楽観的過小推定を避けるため、\\(df=7\\) のchi-squareに基づく**片側95% upper confidence bound** \\(\\sigma_U\\) をrepeat sizingへ使う
- repeat sizingは正規近似を用いない。M/Rそれぞれについて \\(n=8,9,\\dots,30\\) を順に評価し、paired TOSTの真の差0におけるexact power

\\[
Power(n)=P\\left(t_{crit}-ncp < T < ncp-t_{crit}\\right),
\\quad T\\sim t_{n-1},
\\quad t_{crit}=t_{1-\\alpha,n-1},
\\quad ncp=\\frac{\\Delta}{\\sigma_U/\\sqrt n}
\\]

が0.80以上になる最小 \\(n\\) を採用する
- Stage 1 primary comparisonの共通repeat数は `max(8, n_M, n_R)` とする
- \\(n=30\\) でもexact powerが0.80未満なら30へ丸めて実行せず、measurement instability / feasibilityの`needs-audit`として停止する
- 回帰基準として \\(\\sigma_U=\\Delta\\) の場合、n=9のpowerは約0.713、n=10は約0.783、**最小nは11（power約0.837）**となることをoffline検証で固定する
'''
replace('docs/stage1_plan.md', old, new)

replace('docs/stage1_plan.md',
'''を採用する。1 task / 1 probe丸ごとの差は実質同等に含めず、equivalence regionはopen interval \\((-1/12,+1/12)\\) とする。''',
'''を、**固定bank上の最小意味単位に基づくoperational equivalence margin**として採用する。1 task / 1 probe丸ごとの差はequivalentに含めず、equivalence regionはopen interval \\((-1/12,+1/12)\\) とする。これは実世界utilityに対するpractical marginの同値性を主張しない。''')

# --- docs/experiment_plan.md ---
replace('docs/experiment_plan.md',
'''**P6-2 pre-live equivalence freeze（2026-09-20）**：primary \\(M\\) 12 task / \\(R^{sem}\\) 12 boolean probeについて、\\(\\Delta_M=\\Delta_R=1/12\\approx0.08333\\)を事前marginとする。1 task / 1 probe丸ごとの差はequivalentに含めない。\\(\\alpha=0.05\\)のTOSTと整合する90% CI全体がmargin内に入る場合だけequivalence evidenceとする。Mではsemantic/protocol failureをend-to-end failureとして0点・分母内、system/infrastructure/otherは監査前に能力failureへ変換せず`needs-audit`とする。Rsemのprotocol/system/infrastructureもsemantic誤答へ変換せずaudit対象とする。repeat数は8 pairのfresh AF-vs-AF variance pilot、SD片側95% upper bound、target power 0.80から事前式で決め、最低8 repeat、必要数が30を超える場合は丸めず設計監査へ戻す。pilot dataはbaseline本取得へpoolしない。''',
'''**P6-2 pre-live equivalence freeze（2026-09-20）**：primary \\(M\\) 12 task / \\(R^{sem}\\) 12 boolean probeについて、\\(\\Delta_M=\\Delta_R=1/12\\approx0.08333\\)を**固定bank上の最小意味単位に基づくoperational equivalence margin**とする。1 task / 1 probe丸ごとの差はequivalentに含めない。\\(\\alpha=0.05\\)のTOSTと整合する90% CI全体がmargin内に入る場合だけequivalence evidenceとする。Mではsemantic/protocol failureをend-to-end failureとして0点・分母内、system/infrastructure/otherは監査前に能力failureへ変換せず`needs-audit`とする。Rsemのprotocol/system/infrastructureもsemantic誤答へ変換せずaudit対象とし、protocol reliabilityを別diagnosticで保存する。repeat数は8 pairのfresh AF-vs-AF variance pilot（pair内近接実行、奇数AB/偶数BA、infrastructure pairは最大2 replacement）からSD片側95% upper boundを得た後、n=8..30のexact paired-TOST powerを走査してtarget power 0.80を満たす最小nを決める。30でも不足なら設計監査へ戻す。pilot dataはbaseline本取得へpoolしない。''')

# --- harness/src/p6/af-baseline.ts ---
replace('harness/src/p6/af-baseline.ts',
'''export const P6_2_AF_BASELINE_VERSION = "p6-2-af-baseline-v3-equivalence-freeze";''',
'''export const P6_2_AF_BASELINE_VERSION = "p6-2-af-baseline-v4-prevariance-hardening";''')

# --- harness/p6-af-baseline-live.ts ---
replace('harness/p6-af-baseline-live.ts',
'''export const P6_2_RUN_SCHEMA_VERSION = "p6-2-af-baseline-result-v3-equivalence-freeze";''',
'''export const P6_2_RUN_SCHEMA_VERSION = "p6-2-af-baseline-result-v4-prevariance-hardening";''')
replace('harness/p6-af-baseline-live.ts',
'''  "harness/src/p6/task-bank-eligibility.ts",
  "harness/src/agent-backend/openai.ts",''',
'''  "harness/src/p6/task-bank-eligibility.ts",
  "harness/src/p6/exact-tost-power.ts",
  "harness/src/p6/variance-pilot.ts",
  "harness/src/agent-backend/openai.ts",''')
replace('harness/p6-af-baseline-live.ts', 'interface HeldOutTask {', 'export interface HeldOutTask {')
replace('harness/p6-af-baseline-live.ts', 'interface ProbeMaterial {', 'export interface ProbeMaterial {')
replace('harness/p6-af-baseline-live.ts', 'function loadDirRecursive(', 'export function loadDirRecursive(')
replace('harness/p6-af-baseline-live.ts', 'function hashRepository(', 'export function hashRepository(')
replace('harness/p6-af-baseline-live.ts', 'function loadProbeMaterial(', 'export function loadProbeMaterial(')
replace('harness/p6-af-baseline-live.ts', 'async function runMRepeat(', 'export async function runMRepeat(')
replace('harness/p6-af-baseline-live.ts',
'''  repeatCountSource: "runtime-argument-pre-freeze";''',
'''  repeatCountSource: "runtime-argument-pre-freeze" | "frozen-scientific-repeat-count";''')
replace('harness/p6-af-baseline-live.ts',
'''    repeatCountSource: "runtime-argument-pre-freeze",''',
'''    repeatCountSource: P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT === null
      ? "runtime-argument-pre-freeze"
      : "frozen-scientific-repeat-count",''')
replace('harness/p6-af-baseline-live.ts',
'''      repeatResults: RSemProbeRepeatResult[];
      meanBooleanAccuracy: number | null;
''',
'''      repeatResults: RSemProbeRepeatResult[];
      meanBooleanAccuracy: number | null;
      protocolValidRepeats: number;
      protocolEvaluableRepeats: number;
      protocolReliability: number | null;
''')
replace('harness/p6-af-baseline-live.ts',
'''        repeatResults: [],
        meanBooleanAccuracy: null,
''',
'''        repeatResults: [],
        meanBooleanAccuracy: null,
        protocolValidRepeats: 0,
        protocolEvaluableRepeats: 0,
        protocolReliability: null,
''')
replace('harness/p6-af-baseline-live.ts',
'''  result.measurements.Rsem.meanBooleanAccuracy = validR.length
    ? validR.reduce((sum, item) => sum + (item.booleanAccuracy ?? 0), 0) / validR.length
    : null;
''',
'''  result.measurements.Rsem.meanBooleanAccuracy = validR.length
    ? validR.reduce((sum, item) => sum + (item.booleanAccuracy ?? 0), 0) / validR.length
    : null;
  const protocolEvaluableR = r.filter((item) => item.failureDomain !== "system" && item.failureDomain !== "infrastructure");
  const protocolValidR = protocolEvaluableR.filter((item) => item.failureDomain !== "protocol");
  result.measurements.Rsem.protocolEvaluableRepeats = protocolEvaluableR.length;
  result.measurements.Rsem.protocolValidRepeats = protocolValidR.length;
  result.measurements.Rsem.protocolReliability = protocolEvaluableR.length
    ? protocolValidR.length / protocolEvaluableR.length
    : null;
''')
replace('harness/p6-af-baseline-live.ts',
'''  console.log("P6-2 RSEM SUMMARY", JSON.stringify({ meanBooleanAccuracy: result.measurements.Rsem.meanBooleanAccuracy }));''',
'''  console.log("P6-2 RSEM SUMMARY", JSON.stringify({
    meanBooleanAccuracy: result.measurements.Rsem.meanBooleanAccuracy,
    protocolValidRepeats: result.measurements.Rsem.protocolValidRepeats,
    protocolEvaluableRepeats: result.measurements.Rsem.protocolEvaluableRepeats,
    protocolReliability: result.measurements.Rsem.protocolReliability,
  }));''')

# --- CI ---
replace('.github/workflows/harness-ci.yml',
'''      - name: Verify P6-2 AF baseline runner offline
        working-directory: harness
        run: npm run verify:p6-af-baseline
      - name: Verify installed SDK version provenance
''',
'''      - name: Verify P6-2 AF baseline runner offline
        working-directory: harness
        run: npm run verify:p6-af-baseline
      - name: Verify P6-2 exact power and variance-pilot policy
        working-directory: harness
        run: npm run verify:p6-variance-pilot
      - name: Verify installed SDK version provenance
''')

print('P6 pre-variance hardening patch applied')
