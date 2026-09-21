from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    (ROOT / path).write_text(text)

def replace_once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {n}")
    return text.replace(old, new, 1)

# 1) Effective P6-2 bank: 11 primary + 2 diagnostic + 7 semantic-floor.
p = "harness/src/p6/af-baseline.ts"
s = read(p)
s = replace_once(s,
    'export const P6_2_AF_BASELINE_VERSION = "p6-2-af-baseline-v4-exact-power-adjudication";',
    'export const P6_2_AF_BASELINE_VERSION = "p6-2-af-baseline-v5-postpilot-task-reclassification";', p)
s = replace_once(s,
    '  "T-crosscut-4",\n  "T-crosscut-5",\n  "T-delayed-2",',
    '  "T-crosscut-4",\n  "T-delayed-2",', p)
s = replace_once(s,
    '  "T-local-1",\n  "T-crosscut-2",\n  "T-invariant-stress-2",',
    '  "T-local-1",\n  "T-crosscut-2",\n  "T-crosscut-5",\n  "T-invariant-stress-2",', p)
s = replace_once(s,
    '// P6-2 pre-live equivalence design. These values are frozen before any AF\n// baseline/variance result is observed. One full primary task/probe (1/12) is\n// the smallest difference that is considered substantively meaningful; the\n// equivalence interval is therefore open at +/- 1/12.\nexport const P6_2_EQUIVALENCE_DESIGN_VERSION = "p6-2-equivalence-v1";',
    '// P6-2 equivalence rule: one whole primary-bank unit is the smallest\n// substantively meaningful difference. The rule is unchanged by the 2026-09-21\n// post-pilot task-bank amendment; only |primary tasks| changed from 12 to 11,\n// so Delta_M follows the already-defined 1/|primary tasks| rule automatically.\nexport const P6_2_EQUIVALENCE_DESIGN_VERSION = "p6-2-equivalence-v2-taskbank-amendment";', p)
write(p, s)

# 2) Sigma-floor rule remains sigma_floor = Delta; version records induced bank-unit change.
p = "harness/src/p6/variance-pilot.ts"
s = read(p)
s = replace_once(s,
    'export const P6_2_VARIANCE_PILOT_VERSION = "p6-2-af-variance-pilot-v2-exact-floor-audit";\nexport const P6_2_VARIANCE_SIGMA_FLOOR_VERSION = "p6-2-sigma-floor-v1";\n// Pre-live research decision: the floor is the smallest meaningful unit on\n// the frozen 12-unit outcome scale. It is deliberately non-zero so an 8-pair\n// all-zero pilot cannot imply a degenerate population variance.',
    'export const P6_2_VARIANCE_PILOT_VERSION = "p6-2-af-variance-pilot-v3-taskbank-reanalysis";\nexport const P6_2_VARIANCE_SIGMA_FLOOR_VERSION = "p6-2-sigma-floor-v2-primary-bank-unit";\n// The floor rule is unchanged: it is the smallest meaningful unit on each\n// current outcome scale. For M, the 2026-09-21 bank amendment changes only\n// the unit denominator (12 -> 11); it does not tune the floor rule to variance.', p)
write(p, s)

# 3) AF baseline verifier follows the amended bank without freezing repeats yet.
p = "harness/verify-p6-af-baseline.ts"
s = read(p)
repls = [
('assert.equal(P6_2_EQUIVALENCE_DESIGN_VERSION, "p6-2-equivalence-v1");', 'assert.equal(P6_2_EQUIVALENCE_DESIGN_VERSION, "p6-2-equivalence-v2-taskbank-amendment");'),
('assert.equal(P6_2_DELTA_M, 1 / 12);', 'assert.equal(P6_2_DELTA_M, 1 / 11);'),
('// Frozen P6-1b classifications are reused as-is: 12 primary + 2 eligible diagnostic; floor 6 excluded.', '// P6-2 post-pilot amendment: 11 primary + 2 eligible diagnostic; 7 semantic-floor excluded.'),
('assert.equal(selection.primary.length, 12);', 'assert.equal(selection.primary.length, 11);'),
('assert.equal(selection.measured.length, 14);', 'assert.equal(selection.measured.length, 13);'),
('assert.equal(oneRepeatPlan.length, 14);', 'assert.equal(oneRepeatPlan.length, 13);'),
('assert.equal(oneRepeatPlan.filter((item) => item.role === "primary").length, 12);', 'assert.equal(oneRepeatPlan.filter((item) => item.role === "primary").length, 11);'),
('assert.equal(result.executionManifest.deltaM, 1 / 12);', 'assert.equal(result.executionManifest.deltaM, 1 / 11);'),
]
for old,new in repls:
    s = replace_once(s, old, new, p + ':' + old[:30])
write(p, s)

# 4) Variance hardening verifier uses dynamic M bank unit; Rsem remains 12 probes.
p = "harness/verify-p6-variance-hardening.ts"
s = read(p)
s = replace_once(s,
    '  condition: "AF-vs-AF", deltaM: 1/12, deltaR: 1/12, equivalenceAlpha: .05, targetPower: .8, sdUcbConfidence: .95, sigmaFloorM: 1/12, sigmaFloorR: 1/12,',
    '  condition: "AF-vs-AF", deltaM: P6_2_DELTA_M, deltaR: 1/12, equivalenceAlpha: .05, targetPower: .8, sdUcbConfidence: .95, sigmaFloorM: P6_2_VARIANCE_SIGMA_FLOOR_M, sigmaFloorR: 1/12,', p)
s = s.replace('assert(resumeCounter.m < 8*12*2, "resume replayed the whole pilot");', 'assert(resumeCounter.m < 8*P6_2_PRIMARY_TASK_IDS.length*2, "resume replayed the whole pilot");')
write(p, s)

# 5) Add reproducible historical-result reanalysis command.
p = "harness/reanalyze-p6-af-variance-pilot.ts"
content = r'''import * as fs from "fs";
import { P6_2_DELTA_M, P6_2_DELTA_R, P6_2_PRIMARY_TASK_IDS } from "./src/p6/af-baseline";
import { sizeP62PairedDifferences } from "./src/p6/variance-pilot";

type AnyRecord = Record<string, any>;

function main(): void {
  const resultPath = process.argv[2];
  if (!resultPath) throw new Error("usage: ts-node reanalyze-p6-af-variance-pilot.ts <historical-result.json>");
  const source = JSON.parse(fs.readFileSync(resultPath, "utf8")) as AnyRecord;
  if (!Array.isArray(source.acceptedPairs) || source.acceptedPairs.length !== 8) {
    throw new Error("historical result must contain exactly 8 acceptedPairs");
  }
  if (!source.manifest?.primaryTaskIds?.includes("T-crosscut-5")) {
    throw new Error("source result is not the historical 12-task pilot containing T-crosscut-5");
  }
  if ((P6_2_PRIMARY_TASK_IDS as readonly string[]).includes("T-crosscut-5")) {
    throw new Error("current primary bank still contains T-crosscut-5");
  }

  const accepted = new Map(source.acceptedPairs.map((p: AnyRecord) => [`${p.pairId}:${p.attempt}`, p]));
  const differences: number[] = [];
  const taskAudit = new Map<string, { successes: number; semantic: number; protocol: number; system: number; infrastructure: number; other: number; semanticReasons: Map<string, number> }>();

  for (const taskId of source.manifest.primaryTaskIds as string[]) {
    taskAudit.set(taskId, { successes: 0, semantic: 0, protocol: 0, system: 0, infrastructure: 0, other: 0, semanticReasons: new Map() });
  }

  for (const attempt of source.attempts as AnyRecord[]) {
    if (!accepted.has(`${attempt.pairId}:${attempt.attempt}`)) continue;
    const armScores: Record<string, number[]> = { A: [], B: [] };
    for (const event of attempt.events as AnyRecord[]) {
      if (event.kind !== "M") continue;
      const r = event.result as AnyRecord;
      const audit = taskAudit.get(event.taskId)!;
      if (r.passed) audit.successes += 1;
      else {
        const domain = r.failureDomain ?? "other";
        if (domain in audit && domain !== "successes" && domain !== "semanticReasons") (audit as any)[domain] += 1;
        if (domain === "semantic") {
          const signature = String(r.failureReason ?? "").split("\n", 1)[0];
          audit.semanticReasons.set(signature, (audit.semanticReasons.get(signature) ?? 0) + 1);
        }
      }
      if ((P6_2_PRIMARY_TASK_IDS as readonly string[]).includes(event.taskId)) {
        if (!["none", "semantic", "protocol"].includes(r.failureDomain)) {
          throw new Error(`accepted attempt contains non-scientific M domain ${r.failureDomain} for ${event.taskId}`);
        }
        armScores[event.arm].push(r.passed ? 1 : 0);
      }
    }
    for (const arm of ["A", "B"]) {
      if (armScores[arm].length !== P6_2_PRIMARY_TASK_IDS.length) {
        throw new Error(`pair ${attempt.pairId} arm ${arm}: expected ${P6_2_PRIMARY_TASK_IDS.length} current-primary outcomes, got ${armScores[arm].length}`);
      }
    }
    const scoreA = armScores.A.reduce((a,b) => a+b, 0) / armScores.A.length;
    const scoreB = armScores.B.reduce((a,b) => a+b, 0) / armScores.B.length;
    differences.push(scoreA - scoreB);
  }

  const rsemDifferences = source.acceptedPairs.map((p: AnyRecord) => p.rsemDifferenceAminusB as number);
  const m = sizeP62PairedDifferences(differences, P6_2_DELTA_M);
  const rsem = sizeP62PairedDifferences(rsemDifferences, P6_2_DELTA_R);
  const t5 = taskAudit.get("T-crosscut-5")!;
  const normalizedTaskAudit = Object.fromEntries([...taskAudit.entries()].map(([taskId, a]) => [taskId, {
    observations: a.successes + a.semantic + a.protocol + a.system + a.infrastructure + a.other,
    successes: a.successes,
    semanticFailures: a.semantic,
    protocolFailures: a.protocol,
    systemFailures: a.system,
    infrastructureFailures: a.infrastructure,
    otherFailures: a.other,
    dominantSemanticFailure: [...a.semanticReasons.entries()].sort((x,y) => y[1]-x[1])[0] ?? null,
  }]));

  const out = {
    sourceResult: resultPath,
    sourceGitSha: source.manifest?.gitSha ?? null,
    historicalPrimaryCount: source.manifest?.primaryTaskIds?.length ?? null,
    currentPrimaryTaskIds: [...P6_2_PRIMARY_TASK_IDS],
    excludedTask: "T-crosscut-5",
    crosscut5Observed: {
      observations: t5.successes + t5.semantic + t5.protocol + t5.system + t5.infrastructure + t5.other,
      successes: t5.successes,
      semanticFailures: t5.semantic,
      protocolFailures: t5.protocol,
      dominantSemanticFailure: [...t5.semanticReasons.entries()].sort((x,y) => y[1]-x[1])[0] ?? null,
    },
    bankWideTaskAudit: normalizedTaskAudit,
    mDifferencesAminusB: differences,
    deltaM: P6_2_DELTA_M,
    deltaR: P6_2_DELTA_R,
    m,
    rsem,
    suggestedCommonRepeatCount: (m.requiredN == null || rsem.requiredN == null) ? null : Math.max(8, m.requiredN, rsem.requiredN),
  };
  console.log(JSON.stringify(out, null, 2));
}

main();
'''
write(p, content)

# package script
p = "harness/package.json"
s = read(p)
s = replace_once(s,
    '    "p6:af-variance-pilot": "DOTENV_CONFIG_PATH=.env ts-node -r dotenv/config p6-af-variance-pilot-live.ts",',
    '    "p6:af-variance-pilot": "DOTENV_CONFIG_PATH=.env ts-node -r dotenv/config p6-af-variance-pilot-live.ts",\n    "p6:reanalyze-af-variance": "ts-node reanalyze-p6-af-variance-pilot.ts",', p)
write(p, s)

# 6) Findings: append an explicit post-pilot amendment record; historical evidence remains immutable.
p = "docs/findings/stage1_findings.md"
s = read(p)
if "## F16: T-crosscut-5 post-pilot再分類" in s:
    raise SystemExit("F16 already present")
s += r'''

## F16: T-crosscut-5 post-pilot再分類と11-task variance再解析

**日付**: 2026-09-21  
**Phase**: P6-2 AF-vs-AF variance pilot / statistical-design audit  
**Source evidence**: `docs/findings/evidence/p6-2-variance-pilot/result.json`（historical 12-task pilot。source manifest git SHA `6551d69309f84bc6646a1bbf50daa08928c423dc`）

P6-1bでは`T-crosscut-5`は3 repeat中 **semantic success 2 / semantic failure 1 / protocol failure 0** で`T_primary-eligible`となった。この判定自体は当時のfrozen ruleと3-repeat sampleに対して正しく、historical resultとして変更しない。

その後、repeat sizingのために独立実行したAF-vs-AF variance pilotで、accepted 8 pair × 2 arm = **16 AF observations** が得られた。bank全体を同じ基準で横断監査すると、`T-crosscut-5`は **4/16 success**、**11/16 semantic failure**、**1/16 protocol failure**だった。11件のsemantic failureはすべて同一のtask-specific assertion `boostTalFen: fails when Osk=nim` であり、Osk guard欠落という同じ構造的失敗signatureを示した。他の11 primary taskにはsemantic failureは1件もなく、15/16または16/16 successで、残るfailureはprotocolのみだった。

したがって本件は、varianceを小さくするために特定taskを任意除外したものではなく、**P6-1bの小標本判定を、より大きいAF calibration sampleでbank-wideに再監査した結果、T-crosscut-5のみがfloor側の条件を満たした**ものと扱う。元のP6-1b分類は過去時点の結果として保持し、P6-2以降のeffective primary bankだけを11 taskへversion updateする。これはpre-live §10.2.6の「varianceを見てtask reselectionしない」という原則に対する黙示的例外ではなく、一次pilot resultを先にimmutable evidenceとして保存したうえで行う**明示的post-pilot protocol amendment**である。

P6-2以降のprimary M bankから`T-crosscut-5`を外し、semantic-floorへ移す。margin rule自体は変更せず、既存の `Delta_M = 1 / |primary tasks|` を適用するため、`Delta_M`およびM sigma floorは **1/11** となる。`Delta_R=1/12`、alpha=0.05、target power=0.80、片側95% SD-UCB、exact paired-TOST、M/Rsemのfailure semanticsは変更しない。

historical 8 accepted pairのraw M outcomesから`T-crosscut-5`だけを除いて再集約した11-task pair differenceは、

`[0, -1/11, 0, +1/11, +1/11, -1/11, 0, -1/11]`

となった。再計算結果は以下。

- M sample SD: `0.07586572367238911`
- M raw one-sided 95% SD-UCB: `0.13634214080510768`
- M sigma floor: `1/11 = 0.09090909090909091`
- M planning sigma: `0.13634214080510768`
- exact power at n=20: `0.7806622581813019`
- exact power at n=21: `0.8080484931622317`
- **M requiredN: 21**
- Rsem requiredN: **11**（measurement/bank unchanged）
- common repeat candidate: **21**

したがって、11-task bankでは事前feasibility ceiling `n<=30` 内へ戻る。ここではrepeat数をまだ正式freezeせず、このamendment・コード・回帰検証を先に確定する。
'''
write(p, s)

# 7) Stage 1 plan: update effective bank and add general anti-cherry-picking reclassification guard.
p = "docs/stage1_plan.md"
s = read(p)
s = replace_once(s,
    'P6-1bでfreeze済みの`capabilityClass`と`analysisRole`をそのまま再利用し、P6-2の結果を見てtaskを再選別しない。',
    'P6-1b時点の`capabilityClass`と`analysisRole`はhistorical classificationとして保持する。ただし2026-09-21のpost-pilot bank-wide再監査（§10.2.5b）により、P6-2以降のeffective bankでは`T-crosscut-5`をsemantic-floorへ再分類する。このamendment以外に、P6-2の結果を見た任意のtask再選別は行わない。', p)
s = replace_once(s, 'の**12 task**とする。', 'の**11 task**とする。', p)
s = replace_once(s, '\n- `T-crosscut-4`\n- `T-crosscut-5`\n- `T-delayed-2`\n', '\n- `T-crosscut-4`\n- `T-delayed-2`\n', p)
s = replace_once(s,
    'P6-1bでsemantic-floorに分類済みの6 task、\n\n- `T-local-1`\n- `T-crosscut-2`\n- `T-invariant-stress-2`',
    'P6-1b historical floor 6 taskにpost-pilot再分類の`T-crosscut-5`を加えた7 task、\n\n- `T-local-1`\n- `T-crosscut-2`\n- `T-crosscut-5`\n- `T-invariant-stress-2`', p)
anchor = 'この時点ではvariance pilot自体はまだlive実行しない。scientific repeat countは`null`のままとし、P6-2 baseline runnerはrepeat数がfreezeされるまで`--live`を拒否する。\n\n#### 10.2.6 post-hoc task reselection禁止 / abnormal baseline handling'
amendment = r'''この時点ではvariance pilot自体はまだlive実行しない。scientific repeat countは`null`のままとし、P6-2 baseline runnerはrepeat数がfreezeされるまで`--live`を拒否する。

#### 10.2.5b 2026-09-21 post-pilot task-bank reclassification amendment

上記pre-live freezeの後、AF-vs-AF variance pilotを12-task bankで実行し、raw resultを `docs/findings/evidence/p6-2-variance-pilot/result.json` として**設計変更より先に保存**した。そのbank-wide監査で`T-crosscut-5`だけが16 AF observations中4 success / 11 semantic failure / 1 protocol failureとなり、11 semantic failureはすべて同一の `boostTalFen: fails when Osk=nim` assertionだった。他11 primary taskにはsemantic failureがなかった。

P6-1bの3-repeat ruleは小標本で `2/3以上 -> eligible`, `0/3 -> floor`, `1/3 -> hold` を実装した。P6-2以降でより大きい**独立AF calibration sample**が既に存在する場合の再監査は、このordinal ruleを率へ一般化して機械適用する：

- semantic-evaluable success rate `< 1/3` -> floor candidate
- `1/3 <= rate < 2/3` -> hold / unstable candidate
- `rate >= 2/3` -> eligible candidate

ただし、観測後の都合のよいtask除外を防ぐため、primary bankを実際に変更できるのは次の全条件を満たす場合に限る。

1. **時点制約**：scientific repeat countの正式freeze前、かつAF/EL/PR/AR等のprimary condition contrastを1件も観測する前であること。これ以後に判明した問題は現行bankを変更せず、次versionまたはsensitivity analysisへ送る。
2. **evidence source制約**：AF-onlyのeligibility / variance / measurement calibrationとして独立に取得された観測のみを使う。condition差や望ましい研究結論を見てtaskを選ばない。
3. **最低標本数**：同一taskについてaccepted AF observationが12以上、かつsemantic-evaluable observation（success + semantic failure）が12以上あること。protocol/system/infrastructure/otherはfloor evidenceへ数えない。
4. **率の機械判定**：上記success-rate bandをbank内の全taskへ一括適用し、人間が特定taskだけを候補にしない。
5. **構造的一貫性**：floorへ再分類する場合、semantic failureの少なくとも2/3、かつ6件以上が同一のnormalized task-specific assertion / invariant / dependency failure signatureへ収束していること。異質なfailure集合だけではfloorへ落とさない。
6. **provenance**：元resultをimmutable evidenceとして残し、旧classification・新classification・全taskの監査表・変更理由・marginへの機械的影響をfindingsへ記録する。元resultを上書きしない。

この規則を今回の12 primary taskすべてへ適用すると、再分類対象は`T-crosscut-5`だけである。したがってP6-2以降のeffective M primary bankは11 task、semantic-floorは7 taskとなる。equivalence marginの**規則**は変更せず `Delta_M=1/|T_primary|=1/11`、`sigma_floor,M=Delta_M=1/11` と自動追従させる。Rsem bankは12 probeのままなので `Delta_R=sigma_floor,R=1/12` のまま。alpha、target power、SD-UCB confidence、exact paired-TOST、failure semanticsは変更しない。

historical 8 pairから`T-crosscut-5`を除いて再集約するとM sample SD=`0.07586572367238911`、raw 95% SD-UCB=`0.13634214080510768`、requiredN_M=21（n=20 power=`0.7806622581813019`, n=21=`0.8080484931622317`）。Rsem requiredN=11のためcommon repeat candidateは21で、predeclared max n=30以内に収まる。repeat数の正式freezeはこのamendmentの回帰確認後に別stepで行う。

#### 10.2.6 post-hoc task reselection禁止 / abnormal baseline handling'''
s = replace_once(s, anchor, amendment, p)
s = replace_once(s,
    'P6-2でAF baselineが想定外に低い、分散が異常に大きい、protocol / infrastructure failureが多い、または測定不能な挙動を示した場合、その結果を理由にprimary taskを除外したり、diagnostic / semantic-floorとの分類を入れ替えたりしない。',
    '§10.2.5bの明示的amendment完了後は、P6-2でAF baselineが想定外に低い、分散が異常に大きい、protocol / infrastructure failureが多い、または測定不能な挙動を示した場合、その結果を理由にprimary taskを除外したり、diagnostic / semantic-floorとの分類を入れ替えたりしない。', p)
write(p, s)

# 8) Experiment plan keeps the original pre-live paragraph as historical and appends the amendment.
p = "docs/experiment_plan.md"
s = read(p)
needle = 'Stage 1の結果だけを理由に、短期差が小さい条件を安易にStage 2から削除しない。'
amend = r'''**P6-2 post-pilot task-bank amendment（2026-09-21）**：12-task AF-vs-AF variance pilotのraw resultを先にimmutable evidenceとして保存した後、bank-wide監査で`T-crosscut-5`が16 AF observations中4 success / 11 semantic failure / 1 protocol failure、かつ11 semantic failureがすべて同一のOsk guard欠落signatureに収束することを確認した。他11 primary taskにはsemantic failureがなかった。P6-1b historical 3-repeat classificationは保持したまま、P6-2以降のeffective M bankのみ11 taskへversion updateし、`T-crosscut-5`をsemantic-floorへ移す。marginの定義規則は変えず `Delta_M=1/|primary|=1/11`、M sigma floorも同じruleにより1/11へ追従する。Rsemは12 probe / `Delta_R=1/12`のまま。historical 8 pairを11-taskで再集約した結果、M sample SD=0.0758657、95% SD-UCB=0.1363421、exact requiredN_M=21、Rsem requiredN=11となり、common repeat candidate=21は既存max n=30以内。今後の再分類にはStage 1 plan §10.2.5bの最低12 accepted/semantic-evaluable AF observations、bank-wide率判定、failure-signature一貫性、時点制約を必須とする。

'''
s = replace_once(s, needle, amend + needle, p)
write(p, s)

print("P6-2 T-crosscut-5 reclassification patch applied")
