from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:120]!r}")
    if text.count(old) != 1:
        raise SystemExit(f"anchor not unique in {path}: count={text.count(old)}")
    p.write_text(text.replace(old, new, 1))

# -----------------------------------------------------------------------------
# harness/src/p6/af-baseline.ts
# -----------------------------------------------------------------------------
replace_once(
    "harness/src/p6/af-baseline.ts",
    'export const P6_2_AF_BASELINE_VERSION = "p6-2-af-baseline-v2-prelive-hardening";',
    'export const P6_2_AF_BASELINE_VERSION = "p6-2-af-baseline-v3-equivalence-freeze";'
)

replace_once(
    "harness/src/p6/af-baseline.ts",
    '''export const P6_2_MEASURED_TASK_IDS = [
  ...P6_2_PRIMARY_TASK_IDS,
  ...P6_2_ELIGIBLE_DIAGNOSTIC_TASK_IDS,
] as const;

export type P62TaskRole = "primary" | "diagnostic";''',
    '''export const P6_2_MEASURED_TASK_IDS = [
  ...P6_2_PRIMARY_TASK_IDS,
  ...P6_2_ELIGIBLE_DIAGNOSTIC_TASK_IDS,
] as const;

// P6-2 pre-live equivalence design. These values are frozen before any AF
// baseline/variance result is observed. One full primary task/probe (1/12) is
// the smallest difference that is considered substantively meaningful; the
// equivalence interval is therefore open at +/- 1/12.
export const P6_2_EQUIVALENCE_DESIGN_VERSION = "p6-2-equivalence-v1";
export const P6_2_RSEM_PRIMARY_PROBE_COUNT = 12;
export const P6_2_DELTA_M = 1 / P6_2_PRIMARY_TASK_IDS.length;
export const P6_2_DELTA_R = 1 / P6_2_RSEM_PRIMARY_PROBE_COUNT;
export const P6_2_EQUIVALENCE_ALPHA = 0.05;
export const P6_2_EQUIVALENCE_CI_LEVEL = 0.90;
export const P6_2_EQUIVALENCE_TARGET_POWER = 0.80;
export const P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS = 8;
export const P6_2_VARIANCE_SD_UCB_CONFIDENCE = 0.95;
export const P6_2_MIN_SCIENTIFIC_REPEATS = 8;
export const P6_2_MAX_SCIENTIFIC_REPEATS = 30;
// Remains null until the separate AF-vs-AF variance pilot is completed.
export const P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT: number | null = null;

export type P62TaskRole = "primary" | "diagnostic";'''
)

replace_once(
    "harness/src/p6/af-baseline.ts",
    '''export interface P62RoleSummary {
  taskCount: number;
  totalRepeats: number;
  scientificallyValidRepeats: number;
  infrastructureInvalidRepeats: number;
  passed: number;
  passRate: number | null;
}''',
    '''export interface P62RoleSummary {
  taskCount: number;
  totalRepeats: number;
  scientificallyValidRepeats: number;
  infrastructureInvalidRepeats: number;
  systemAuditRepeats: number;
  otherAuditRepeats: number;
  auditExcludedRepeats: number;
  passed: number;
  passRate: number | null;
}'''
)

replace_once(
    "harness/src/p6/af-baseline.ts",
    '''export function summarizeP62M(results: P62MRepeatLike[]): P62MSummary {
  const summarizeRole = (role: P62TaskRole): P62RoleSummary => {
    const subset = results.filter((item) => item.role === role);
    const ids = new Set(subset.map((item) => item.taskId));
    const scientificallyValid = subset.filter((item) => item.failureDomain !== "infrastructure");
    const passed = scientificallyValid.filter((item) => item.passed).length;
    return {
      taskCount: ids.size,
      totalRepeats: subset.length,
      scientificallyValidRepeats: scientificallyValid.length,
      infrastructureInvalidRepeats: subset.length - scientificallyValid.length,
      passed,
      passRate: scientificallyValid.length ? passed / scientificallyValid.length : null,
    };
  };''',
    '''export type P62MOutcomeDisposition = "score" | "needs-audit";

export function p62MOutcomeDisposition(failureDomain: FailureDomain): P62MOutcomeDisposition {
  // M is an end-to-end modification outcome. Semantic and protocol failures
  // both mean the requested modification was not successfully completed and
  // therefore remain scientific failures (0) in the M denominator. System,
  // infrastructure, and unclassified failures are not silently converted into
  // capability failures; they require adjudication first.
  if (failureDomain === "none" || failureDomain === "semantic" || failureDomain === "protocol") return "score";
  return "needs-audit";
}

export function summarizeP62M(results: P62MRepeatLike[]): P62MSummary {
  const summarizeRole = (role: P62TaskRole): P62RoleSummary => {
    const subset = results.filter((item) => item.role === role);
    const ids = new Set(subset.map((item) => item.taskId));
    const scientificallyValid = subset.filter((item) => p62MOutcomeDisposition(item.failureDomain) === "score");
    const passed = scientificallyValid.filter((item) => item.passed).length;
    const infrastructureInvalidRepeats = subset.filter((item) => item.failureDomain === "infrastructure").length;
    const systemAuditRepeats = subset.filter((item) => item.failureDomain === "system").length;
    const otherAuditRepeats = subset.filter((item) => item.failureDomain === "other").length;
    return {
      taskCount: ids.size,
      totalRepeats: subset.length,
      scientificallyValidRepeats: scientificallyValid.length,
      infrastructureInvalidRepeats,
      systemAuditRepeats,
      otherAuditRepeats,
      auditExcludedRepeats: infrastructureInvalidRepeats + systemAuditRepeats + otherAuditRepeats,
      passed,
      passRate: scientificallyValid.length ? passed / scientificallyValid.length : null,
    };
  };'''
)

# -----------------------------------------------------------------------------
# harness/p6-af-baseline-live.ts
# -----------------------------------------------------------------------------
replace_once(
    "harness/p6-af-baseline-live.ts",
    '''  P6_2_AF_BASELINE_VERSION,
  P6_2_ELIGIBLE_DIAGNOSTIC_TASK_IDS,
  P6_2_FAILURE_CLASSIFICATION_VERSION,
  P6_2_PRIMARY_TASK_IDS,
  P6_2_SEMANTIC_FLOOR_TASK_IDS,
  P6_2_TASK_BANK_VERSION,
  classifyP62MRepeat,
  planP62MRepeats,
  planP62ProbeRepeats,
  selectP62TaskBank,
  summarizeP62M,
  validateP62RepeatCount,
  type P62MRepeatLike,
  type P62TaskRole,
} from "./src/p6/af-baseline";''',
    '''  P6_2_AF_BASELINE_VERSION,
  P6_2_DELTA_M,
  P6_2_DELTA_R,
  P6_2_ELIGIBLE_DIAGNOSTIC_TASK_IDS,
  P6_2_EQUIVALENCE_ALPHA,
  P6_2_EQUIVALENCE_CI_LEVEL,
  P6_2_EQUIVALENCE_DESIGN_VERSION,
  P6_2_EQUIVALENCE_TARGET_POWER,
  P6_2_FAILURE_CLASSIFICATION_VERSION,
  P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT,
  P6_2_MAX_SCIENTIFIC_REPEATS,
  P6_2_MIN_SCIENTIFIC_REPEATS,
  P6_2_PRIMARY_TASK_IDS,
  P6_2_SEMANTIC_FLOOR_TASK_IDS,
  P6_2_TASK_BANK_VERSION,
  P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,
  P6_2_VARIANCE_SD_UCB_CONFIDENCE,
  classifyP62MRepeat,
  p62MOutcomeDisposition,
  planP62MRepeats,
  planP62ProbeRepeats,
  selectP62TaskBank,
  summarizeP62M,
  validateP62RepeatCount,
  type P62MRepeatLike,
  type P62TaskRole,
} from "./src/p6/af-baseline";'''
)

replace_once(
    "harness/p6-af-baseline-live.ts",
    'export const P6_2_RUN_SCHEMA_VERSION = "p6-2-af-baseline-result-v2";',
    'export const P6_2_RUN_SCHEMA_VERSION = "p6-2-af-baseline-result-v3-equivalence-freeze";'
)

replace_once(
    "harness/p6-af-baseline-live.ts",
    '''  artifactLayoutVersion: typeof P6_2_ARTIFACT_LAYOUT_VERSION;
  model: typeof P6_2_MODEL;''',
    '''  artifactLayoutVersion: typeof P6_2_ARTIFACT_LAYOUT_VERSION;
  equivalenceDesignVersion: typeof P6_2_EQUIVALENCE_DESIGN_VERSION;
  deltaM: number;
  deltaR: number;
  equivalenceAlpha: number;
  equivalenceCiLevel: number;
  equivalenceTargetPower: number;
  variancePilotPairedAfRepeats: number;
  varianceSdUcbConfidence: number;
  minScientificRepeats: number;
  maxScientificRepeats: number;
  frozenScientificRepeatCount: number | null;
  model: typeof P6_2_MODEL;'''
)

replace_once(
    "harness/p6-af-baseline-live.ts",
    '''    failureClassificationVersion: P6_2_FAILURE_CLASSIFICATION_VERSION,
    artifactLayoutVersion: P6_2_ARTIFACT_LAYOUT_VERSION,
    model: P6_2_MODEL,''',
    '''    failureClassificationVersion: P6_2_FAILURE_CLASSIFICATION_VERSION,
    artifactLayoutVersion: P6_2_ARTIFACT_LAYOUT_VERSION,
    equivalenceDesignVersion: P6_2_EQUIVALENCE_DESIGN_VERSION,
    deltaM: P6_2_DELTA_M,
    deltaR: P6_2_DELTA_R,
    equivalenceAlpha: P6_2_EQUIVALENCE_ALPHA,
    equivalenceCiLevel: P6_2_EQUIVALENCE_CI_LEVEL,
    equivalenceTargetPower: P6_2_EQUIVALENCE_TARGET_POWER,
    variancePilotPairedAfRepeats: P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,
    varianceSdUcbConfidence: P6_2_VARIANCE_SD_UCB_CONFIDENCE,
    minScientificRepeats: P6_2_MIN_SCIENTIFIC_REPEATS,
    maxScientificRepeats: P6_2_MAX_SCIENTIFIC_REPEATS,
    frozenScientificRepeatCount: P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT,
    model: P6_2_MODEL,'''
)

replace_once(
    "harness/p6-af-baseline-live.ts",
    '''function requiresAudit(failureDomain: string): boolean {
  return failureDomain === "infrastructure" || failureDomain === "system";
}
''',
    '''export function requiresP62MAudit(failureDomain: string): boolean {
  if (failureDomain === "none" || failureDomain === "semantic" || failureDomain === "protocol") return false;
  return true;
}

export function requiresP62RSemAudit(failureDomain: string): boolean {
  // R^sem is intended to isolate semantic reconstruction. A malformed response
  // cannot safely be converted into a semantic wrong-answer, so protocol,
  // system, and infrastructure failures all stop the measurement for audit.
  return failureDomain === "protocol" || failureDomain === "system" || failureDomain === "infrastructure";
}

export function assertP62LiveRepeatCountFrozen(repeatCount: number): void {
  if (P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT === null) {
    throw new Error("P6-2 live execution refused: scientific repeat count is not frozen; run the predeclared AF-vs-AF variance pilot first");
  }
  if (repeatCount !== P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT) {
    throw new Error(`P6-2 live execution refused: --repeats=${repeatCount} does not match frozen repeat count ${P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT}`);
  }
}
'''
)

replace_once(
    "harness/p6-af-baseline-live.ts",
    '''  console.log("P6-2 RSEM", JSON.stringify({ designVersion: STAGE1_BOOLEAN_DESIGN_VERSION, booleanProbes: probeMaterial.booleanProbes.length }));
  console.log("P6-2 REPEATS", repeatCount);

  if (!live) {
    console.log("STOP: dry/offline mode. Add --live only after Delta_M/Delta_R and scientific repeat count are frozen.");
    return;
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for P6-2 live execution");''',
    '''  console.log("P6-2 RSEM", JSON.stringify({ designVersion: STAGE1_BOOLEAN_DESIGN_VERSION, booleanProbes: probeMaterial.booleanProbes.length }));
  console.log("P6-2 EQUIVALENCE", JSON.stringify({
    version: P6_2_EQUIVALENCE_DESIGN_VERSION,
    deltaM: P6_2_DELTA_M,
    deltaR: P6_2_DELTA_R,
    alpha: P6_2_EQUIVALENCE_ALPHA,
    ciLevel: P6_2_EQUIVALENCE_CI_LEVEL,
    targetPower: P6_2_EQUIVALENCE_TARGET_POWER,
    variancePilotPairedAfRepeats: P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,
    varianceSdUcbConfidence: P6_2_VARIANCE_SD_UCB_CONFIDENCE,
    minScientificRepeats: P6_2_MIN_SCIENTIFIC_REPEATS,
    maxScientificRepeats: P6_2_MAX_SCIENTIFIC_REPEATS,
    frozenScientificRepeatCount: P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT,
  }));
  console.log("P6-2 REPEATS", repeatCount);

  if (!live) {
    console.log("STOP: dry/offline mode. Delta_M/Delta_R are frozen; live remains blocked until the variance pilot freezes scientific repeat count.");
    return;
  }
  assertP62LiveRepeatCountFrozen(repeatCount);
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for P6-2 live execution");'''
)

replace_once(
    "harness/p6-af-baseline-live.ts",
    '    if (requiresAudit(classified.failureDomain)) {',
    '    if (requiresP62MAudit(classified.failureDomain)) {'
)
replace_once(
    "harness/p6-af-baseline-live.ts",
    '    if (requiresAudit(probeResult.failureDomain)) {',
    '    if (requiresP62RSemAudit(probeResult.failureDomain)) {'
)

# -----------------------------------------------------------------------------
# harness/verify-p6-af-baseline.ts
# -----------------------------------------------------------------------------
replace_once(
    "harness/verify-p6-af-baseline.ts",
    '''  P6_2_ELIGIBLE_DIAGNOSTIC_TASK_IDS,
  P6_2_PRIMARY_TASK_IDS,
  P6_2_SEMANTIC_FLOOR_TASK_IDS,
  P6_2_TASK_BANK_VERSION,
  classifyP62MRepeat,
  planP62MRepeats,
  planP62ProbeRepeats,
  selectP62TaskBank,
  summarizeP62M,
} from "./src/p6/af-baseline";''',
    '''  P6_2_DELTA_M,
  P6_2_DELTA_R,
  P6_2_ELIGIBLE_DIAGNOSTIC_TASK_IDS,
  P6_2_EQUIVALENCE_ALPHA,
  P6_2_EQUIVALENCE_CI_LEVEL,
  P6_2_EQUIVALENCE_DESIGN_VERSION,
  P6_2_EQUIVALENCE_TARGET_POWER,
  P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT,
  P6_2_MAX_SCIENTIFIC_REPEATS,
  P6_2_MIN_SCIENTIFIC_REPEATS,
  P6_2_PRIMARY_TASK_IDS,
  P6_2_SEMANTIC_FLOOR_TASK_IDS,
  P6_2_TASK_BANK_VERSION,
  P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,
  P6_2_VARIANCE_SD_UCB_CONFIDENCE,
  classifyP62MRepeat,
  p62MOutcomeDisposition,
  planP62MRepeats,
  planP62ProbeRepeats,
  selectP62TaskBank,
  summarizeP62M,
} from "./src/p6/af-baseline";'''
)

replace_once(
    "harness/verify-p6-af-baseline.ts",
    '''  reconcileProbeJournal,
  runRSemRepeat,
  type P62AfBaselineResult,''',
    '''  reconcileProbeJournal,
  requiresP62MAudit,
  requiresP62RSemAudit,
  assertP62LiveRepeatCountFrozen,
  runRSemRepeat,
  type P62AfBaselineResult,'''
)

replace_once(
    "harness/verify-p6-af-baseline.ts",
    '''async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, "..");''',
    '''async function main(): Promise<void> {
  // Equivalence semantics are frozen independently of any live AF outcome.
  assert.equal(P6_2_EQUIVALENCE_DESIGN_VERSION, "p6-2-equivalence-v1");
  assert.equal(P6_2_DELTA_M, 1 / 12);
  assert.equal(P6_2_DELTA_R, 1 / 12);
  assert.equal(P6_2_EQUIVALENCE_ALPHA, 0.05);
  assert.equal(P6_2_EQUIVALENCE_CI_LEVEL, 0.90);
  assert.equal(P6_2_EQUIVALENCE_TARGET_POWER, 0.80);
  assert.equal(P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS, 8);
  assert.equal(P6_2_VARIANCE_SD_UCB_CONFIDENCE, 0.95);
  assert.equal(P6_2_MIN_SCIENTIFIC_REPEATS, 8);
  assert.equal(P6_2_MAX_SCIENTIFIC_REPEATS, 30);
  assert.equal(P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT, null);
  assert.equal(p62MOutcomeDisposition("semantic"), "score");
  assert.equal(p62MOutcomeDisposition("protocol"), "score");
  assert.equal(p62MOutcomeDisposition("system"), "needs-audit");
  assert.equal(p62MOutcomeDisposition("infrastructure"), "needs-audit");
  assert.equal(p62MOutcomeDisposition("other"), "needs-audit");
  assert.equal(requiresP62MAudit("protocol"), false);
  assert.equal(requiresP62MAudit("system"), true);
  assert.equal(requiresP62MAudit("infrastructure"), true);
  assert.equal(requiresP62MAudit("other"), true);
  assert.equal(requiresP62RSemAudit("protocol"), true);
  assert.equal(requiresP62RSemAudit("system"), true);
  assert.equal(requiresP62RSemAudit("infrastructure"), true);
  assertThrowsMessage(() => assertP62LiveRepeatCountFrozen(8), /scientific repeat count is not frozen/);

  const repoRoot = path.resolve(__dirname, "..");'''
)

replace_once(
    "harness/verify-p6-af-baseline.ts",
    '''  const denominatorSummary = summarizeP62M([passedMock, infrastructureMock]);
  assert.equal(denominatorSummary.primary.totalRepeats, 2);
  assert.equal(denominatorSummary.primary.scientificallyValidRepeats, 1);
  assert.equal(denominatorSummary.primary.infrastructureInvalidRepeats, 1);
  assert.equal(denominatorSummary.primary.passRate, 1);''',
    '''  const systemMock = classifyP62MRepeat({
    taskId: "T-local-2",
    taskType: "local",
    repeat: 4,
    passed: false,
    validity: "valid",
    failureCategory: "test-failure",
    failureReason: "visible:execution:mock runner failure",
    executionStatus: "ok",
  }, "primary");
  const otherMock = classifyP62MRepeat({
    taskId: "T-local-2",
    taskType: "local",
    repeat: 5,
    passed: false,
    validity: "valid",
    failureCategory: "unclassified-mock",
    failureReason: "mock unknown",
    executionStatus: "ok",
  }, "primary");
  const denominatorSummary = summarizeP62M([passedMock, protocolMock, infrastructureMock, systemMock, otherMock]);
  assert.equal(denominatorSummary.primary.totalRepeats, 5);
  assert.equal(denominatorSummary.primary.scientificallyValidRepeats, 2);
  assert.equal(denominatorSummary.primary.infrastructureInvalidRepeats, 1);
  assert.equal(denominatorSummary.primary.systemAuditRepeats, 1);
  assert.equal(denominatorSummary.primary.otherAuditRepeats, 1);
  assert.equal(denominatorSummary.primary.auditExcludedRepeats, 3);
  assert.equal(denominatorSummary.primary.passRate, 0.5);'''
)

replace_once(
    "harness/verify-p6-af-baseline.ts",
    '''  assert.equal(result.measurements.Rsem.designVersion, "stage1-neutral-relation-v2");
  assert.equal(result.measurements.Rsem.booleanProbeIds.length, 12);
  assert.notStrictEqual(result.measurements.M, result.measurements.Rsem);''',
    '''  assert.equal(result.measurements.Rsem.designVersion, "stage1-neutral-relation-v2");
  assert.equal(result.measurements.Rsem.booleanProbeIds.length, 12);
  assert.equal(result.executionManifest.equivalenceDesignVersion, P6_2_EQUIVALENCE_DESIGN_VERSION);
  assert.equal(result.executionManifest.deltaM, 1 / 12);
  assert.equal(result.executionManifest.deltaR, 1 / 12);
  assert.equal(result.executionManifest.equivalenceCiLevel, 0.90);
  assert.equal(result.executionManifest.frozenScientificRepeatCount, null);
  assert.notStrictEqual(result.measurements.M, result.measurements.Rsem);'''
)

replace_once(
    "harness/verify-p6-af-baseline.ts",
    '''  console.log("P6-2 AF baseline offline verification passed.");''',
    '''  console.log("P6-2 AF baseline offline verification passed.");
  console.log(`  equivalence: Delta_M=Delta_R=${P6_2_DELTA_M.toFixed(6)}, 90% CI / alpha=0.05, target power=0.80`);
  console.log(`  variance pilot: paired AF-vs-AF repeats=${P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS}, scientific repeat count still unfrozen/live-blocked`);'''
)

# -----------------------------------------------------------------------------
# docs/stage1_plan.md
# -----------------------------------------------------------------------------
replace_once(
    "docs/stage1_plan.md",
    '''観測されたAF平均やSDに合わせてequivalence margin自体を変更しない。

#### 10.2.6 post-hoc task reselection禁止 / abnormal baseline handling''',
    '''観測されたAF平均やSDに合わせてequivalence margin自体を変更しない。

#### 10.2.5a 2026-09-20 equivalence / repeat-design freeze（live前）

P6-2 live baseline結果を一切観測する前に、primary outcome scale上のequivalence marginを次でfreezeする。

\[
\Delta_M=\Delta_R=\frac{1}{12}\approx0.08333
\]

理由は、primary \(M\) bankが12 task、primary \(R^{sem}\) bankが12 balanced boolean probeで構成されているためである。**1 task / 1 probe丸ごとの差は研究上無視しない**。したがってequivalence regionは

\[
(-1/12,+1/12)
\]

のopen intervalとし、差がちょうど \(1/12\) に達する場合はequivalentとは判定しない。このmarginは観測varianceやAF平均から逆算した値ではなく、現在のprimary measurement bankにおける1 semantic unitを実質差の境界とする事前定義である。

Equivalence判定はTOSTと整合する \(\alpha=0.05\) の **90% CI** を用い、paired differenceの90% CI全体が事前margin内に入った場合にのみequivalence evidenceありとする。CIがmarginをまたぐ場合は、通常の差の検定が非有意であっても「同等」とせず**判定不能**とする。

paired analysis unitは、Stage 1Aで同一task/probe・同一repeat id・同一model settingsを共有するbank-level repeatとする。各repeatについて12 task / 12 probeをまず固定bank内で集約し、そのrepeat-level paired differenceをuncertainty推定の基本単位とする。これにより、同一API応答内のprobe相関や固定task bank内の依存を独立sampleとして過大計上しない。

\(M\)のscientific denominatorは次でfreezeする。

- `none`：success=1として分母へ含める
- `semantic`：end-to-end modification failure=0として分母へ含める
- `protocol`：有効なmutation/output contractを満たせず変更を完了できなかったend-to-end failure=0として分母へ含める。ただしprotocol reliabilityは別diagnosticでも必ず報告する
- `system`：自動的に0へ落とさず`needs-audit`。生成artifact起因のcompile/runtime failureと確認できた場合のみscientific task failureへ再分類して0として含め、harness/evaluator起因なら`infrastructure-invalid`へ再分類して除外する
- `infrastructure`：scientific denominatorから除外し`needs-audit`
- `other`：原因未分類のままscientific denominatorへ入れず`needs-audit`

\(R^{sem}\)ではsemantic reconstructionとoutput protocolを混同しないため、structured-output parse / forced-choice format等の`protocol` failureは誤答0点へ変換せず`needs-audit`とする。`system` / `infrastructure`も同様であり、main accuracyは`failureDomain=none`のrepeatだけから計算する。ただしaudit未解決のままrunをcompleted扱いしない。

repeat数決定用variance pilotも同時に次でfreezeする。

- 独立したfresh-agent **AF-vs-AF twin arm** を用いる
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
- Stage 1 primary comparisonの共通repeat数は `max(8, n_M, n_R)` とする
- `n_req > 30`となる場合は30へ丸めて実行せず、measurement instability / feasibilityの`needs-audit`として停止する
- variance pilotの観測値をequivalence margin変更やtask reselectionには使用しない
- variance pilot dataはP6-2 baseline本取得へpoolしない
- repeat数freeze後はCIがwideでも追加repeatをpost-hocに足さず、equivalenceについては「判定不能」と報告する

この時点ではvariance pilot自体はまだlive実行しない。scientific repeat countは`null`のままとし、P6-2 baseline runnerはrepeat数がfreezeされるまで`--live`を拒否する。

#### 10.2.6 post-hoc task reselection禁止 / abnormal baseline handling'''
)

replace_once(
    "docs/stage1_plan.md",
    '''### 11.1 \(\Delta_M,\Delta_R\)

観測後のSDからequivalence marginを逆算しない。

まず、

> 研究上どの差以下なら実質同等とするか

を定義する。

その後variance pilotでrepeat数を決める。''',
    '''### 11.1 \(\Delta_M,\Delta_R\)（freeze済み）

P6-2 pre-live freezeとして、

\[
\Delta_M=\Delta_R=1/12\approx0.08333
\]

を採用する。1 task / 1 probe丸ごとの差は実質同等に含めず、equivalence regionはopen interval \((-1/12,+1/12)\) とする。

Equivalenceは \(\alpha=0.05\) のTOSTと整合する90% CIで評価し、paired differenceのCI全体がmargin内へ入った場合のみ主張する。marginは観測後のSDや平均から変更しない。repeat数は10.2.5aでfreezeしたAF-vs-AF variance pilot規則から決定する。'''
)

# -----------------------------------------------------------------------------
# docs/experiment_plan.md
# -----------------------------------------------------------------------------
replace_once(
    "docs/experiment_plan.md",
    '''- equivalence / uncertainty methodがfreeze
- Stage 1Cの5条件longitudinal harnessが安定

Stage 1の結果だけを理由に、短期差が小さい条件を安易にStage 2から削除しない。''',
    '''- equivalence / uncertainty methodがfreeze
- Stage 1Cの5条件longitudinal harnessが安定

**P6-2 pre-live equivalence freeze（2026-09-20）**：primary \(M\) 12 task / \(R^{sem}\) 12 boolean probeについて、\(\Delta_M=\Delta_R=1/12\approx0.08333\)を事前marginとする。1 task / 1 probe丸ごとの差はequivalentに含めない。\(\alpha=0.05\)のTOSTと整合する90% CI全体がmargin内に入る場合だけequivalence evidenceとする。Mではsemantic/protocol failureをend-to-end failureとして0点・分母内、system/infrastructure/otherは監査前に能力failureへ変換せず`needs-audit`とする。Rsemのprotocol/system/infrastructureもsemantic誤答へ変換せずaudit対象とする。repeat数は8 pairのfresh AF-vs-AF variance pilot、SD片側95% upper bound、target power 0.80から事前式で決め、最低8 repeat、必要数が30を超える場合は丸めず設計監査へ戻す。pilot dataはbaseline本取得へpoolしない。

Stage 1の結果だけを理由に、短期差が小さい条件を安易にStage 2から削除しない。'''
)

print("P6-2 equivalence freeze patch applied")
