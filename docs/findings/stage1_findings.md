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
