# Stage 1 Findings

## F14: P6-1b full task-bank eligibility完了と6-task floor recurrence

**日付**: 2026-09-20
**Phase**: Pre-Stage 1 P6-1b
**Model**: GPT-5.6 Luna / reasoning=`high` / Artifact-Full

P6-1 pilot済み5 taskを除く15 taskを3 repeatずつ評価し、initial 45 repeatを事前計画どおり完了した。実行健全性は infrastructure-invalid=0 / artifact missing=0 / `pending=[]`。hold-continuationは完了状態へ遷移するため明示起動したが、追加repeatは0だった。最終bankは primary 12 / eligible diagnostic 2 / semantic-floor 6 / AF-unstable 0 / invalid 0。

semantic-floorは以下の6 taskである。

- `T-local-1`
- `T-crosscut-2`
- `T-invariant-stress-2`
- `T-invariant-stress-4`
- `T-invariant-stress-5`
- `T-crosscut-6`

この集合はStage 0.5のClaude HaikuでFullを含む高budget域においてbudget-independent floorだった6 taskと完全一致した。よって、**floor task集合の再現性はmodelをまたいで観測された**。ただしこれはtask-set levelのrecurrenceであり、HaikuとLunaが各taskで同じ誤推論・同じguard欠落を起こしたことを意味しない。mechanism-levelの一致は未確認であり、個別のgenerated patch / failure reasonを比較するまで断定しない。

## F15: invariant-stressing task-specific testのdependency-isolation coverage gap

**日付**: 2026-09-20
**Phase**: P6-1b postflight task-bank audit

`T-invariant-stress-2`のground truthは`jumpFen`に `Osk=pex` と `Tal=pex` の両方を要求する。しかし旧task-specific suiteのnegative testは`Osk=nim`だけで、しかもreset直後を使うため`Tal`も同時に`nim`だった。hidden regressionのI6検査は既存`advanceFen2`経路を対象としており、新operation `jumpFen`のTal guard欠落を直接検査しない。そのため、`Osk`だけをguardし`Tal`依存を落とした`jumpFen`がtask-specific coverageをすり抜ける余地があった。

横断監査すると同型の非対称性が`T-invariant-stress-1/3/5`にもあり、`T-invariant-stress-4`ではdependencyそのものをisolatedに落とすnegative testがなかった。そこで、public `WorldProtocol`で到達可能な範囲について、他方のdependencyを満たしたまま片側だけ`nim`にするisolated negative casesを追加した。

- `T-invariant-stress-1`: Tal-only failure / Fen-only failureを分離
- `T-invariant-stress-2`: Osk-only failure / **Tal-only failure (`jumpFen: fails when Tal=nim (Osk=pex)`)** を分離
- `T-invariant-stress-3`: Tal-only failure / Osk-only failureを分離
- `T-invariant-stress-4`: Osk-only failureを追加。Tal-only failureは、base worldでは`Zef=pex`への到達自体が`advanceZef1`の`Tal=pex`を要求するため、public protocol上のreachable stateとして独立構成できない。このケースを「test欠落」と「到達不能な反例」を混同しない。
- `T-invariant-stress-5`: Tal-only failure / Osk-only failureを分離

さらに、oracle `jumpFen`からTal guardだけを除いたmock実装を構成し、新しい`T-invariant-stress-2` Tal-isolation testがその実装をfailさせることをoffline regressionで固定した。

この修正は**P6-1b既存resultを無効化しない**。P6-1bは当時freeze済みのtask bankに対する結果として保持し、本修正はP6-2以降のtask bank品質改善としてversion/provenance上区別して扱う。


## F16: T-crosscut-5 post-pilot再分類と11-task variance再解析

**日付**: 2026-09-21  
**Phase**: P6-2 AF-vs-AF variance pilot / statistical-design audit  
**Source evidence**: `docs/findings/evidence/p6-2-variance-pilot/result.json`（historical 12-task pilot。source manifest git SHA `6551d69309f84bc6646a1bbf50daa08928c423dc`）

P6-1bでは`T-crosscut-5`は3 repeat中 **semantic success 2 / semantic failure 1 / protocol failure 0** で`T_primary-eligible`となった。この判定自体は当時のfrozen ruleと3-repeat sampleに対して正しく、historical resultとして変更しない。ただし後続の16-observation AF calibration evidenceを踏まえた現在の解釈では、**P6-1bの3-repeatというサンプル不足により、実際にはAF semantic floor側にあるtaskをeligibleと誤判定した**ものと位置づける。

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
