from pathlib import Path
import re

stage = Path("docs/stage1_plan.md")
s = stage.read_text()

new_1025b = r'''#### 10.2.5b 2026-09-21 post-pilot task-selection amendment and freeze

2026-09-20のpre-live designはhistorical designとして保持する。その設計ではprimary M=12 task、`Delta_M=1/12`でAF-vs-AF variance pilotを実行し、raw resultを `docs/findings/evidence/p6-2-variance-pilot/result.json` として**設計変更より先にimmutable evidence化**した。結果はMのn=30 power=`0.6816437585696477`で、predeclared ceiling内ではrequiredN=`null`、`statistical-design-needs-audit`となった。同じexact式をceiling外へ診断的に延長すると最小nは37相当である。

その後のbank-wide auditで、historical primary 12 taskのうち`T-crosscut-5`だけが16 AF observations中4 success / 11 semantic failure / 1 protocol failureとなり、11 semantic failureはすべて同一の `boostTalFen: fails when Osk=nim` signatureへ収束した。他11 taskのsemantic failureは0だった。全taskの機械集計は `docs/findings/evidence/p6-2-variance-pilot/postpilot-task-audit.json` に保存する。

この判定を**P6-1b classification ruleの率への一般化とは扱わない**。P6-1bの実装済みruleはabsolute countであり、`semanticSuccesses >= 2 -> eligible`、`0 success && semanticFailures >= 2 -> semantic-floor`、`1 success && semanticFailures >= 2 -> AF-unstable`である。`T-crosscut-5`はhistorical 3 repeatで2 success / 1 semantic failureなので、その時点の`T_primary-eligible`は正しいhistorical classificationとして保持する。

P6-2以降では、repeat freeze前かつprimary condition contrast観測前に限る新しい**post-pilot low-headroom screen**を別規則として導入する。候補化には次をすべて要求する。

1. AF-only calibration evidenceであること。
2. accepted AF observations >=12、かつsemantic-evaluable observations（success + semantic failure）>=12。
3. semantic success rate `<1/3`。
4. semantic failure >=6。
5. dominant normalized semantic failure signatureがsemantic failuresの`>=2/3`を占め、かつ同一signatureが6件以上。
6. historical primary bank全taskへ同一規則を機械適用し、人間が特定taskだけを選ばない。
7. 元result・全task audit・旧/新classification・selectionによるsizingへの影響をprovenance付きで保存する。

このscreenを12 historical primary task全部へ適用すると該当は`T-crosscut-5`だけである。`T-crosscut-5`は4 semantic successを持つためhistorical `semantic-floor`へは移さず、P6-2+専用の **`post-pilot-low-headroom`** としてprimary Mから除外する。P6-1b historical semantic-floor 6 taskはそのまま維持する。

failure signatureの意味論的根拠はpost-pilotに作られたものではない。`harness/fixtures/oracle-patches/T-crosscut-5.ts`はcommit `3fc9838d034c759c03bce2aaab1735723907543d`（2026-09-06）で既に`Osk(E5)=q2(pex)`をground-truth preconditionとして明示しており、commit `f89b12a631defd883ff0bc14b67133ab3a72279e`（2026-09-07）で保存されたStage 0.5のB1K resultでも `boostTalFen: fails when Osk=nim` が実際にfailしている。したがってOsk依存と同型failureにはvariance-pilot以前の独立証拠がある。ただしGPT-5.6 Luna / AFでのpersistent low-headroom頻度を確定したのは今回のpilotであり、この点はpost-pilot selectionである。

current P6-2 task selectionは11 primary task + 2 eligible diagnostic + historical semantic-floor 6 + post-pilot-low-headroom 1として**ここでfreeze**する。selection versionは `p6-2-task-selection-v2-postpilot-low-headroom-frozen`。fresh variance pilotとscientific repeat freezeが完了するまでtask membershipを再変更しない。以後に見つかるtask問題は現行bankから除外せず、次versionまたはsensitivity analysisへ送る。

current margin ruleは固定bankの最小1 unitを無視しないという原則を維持し、Mは11 taskなので `Delta_M=sigma_floor,M=1/11`、Rsemは12 probeのままなので `Delta_R=sigma_floor,R=1/12` とする。alpha=0.05、target power=0.80、片側95% SD-UCB、true exact paired-TOST power、failure semanticsは変更しない。

historical 8 pairを11-taskへ再集約するとdiagnosticにM requiredN=21、Rsem requiredN=11となるが、**これはformal repeat freezeへ使用しない**。同じ8 pairがtask-selection evidenceとselection後varianceの双方へ使われるためpost-selection optimismを否定できない。formal sizingには、旧16 AF observationsを再利用しないfreshな11-task AF-vs-AF 8 pairを新規取得し、そのfresh dataのみからrequiredNを決める。fresh pilot開始後はtask membershipを一切変更しない。

'''
start = s.index("#### 10.2.5b ")
end = s.index("#### 10.2.6 ", start)
s = s[:start] + new_1025b + s[end:]

s = s.replace(
    "- primary 12 taskについて\\(M\\)のAF baseline分布が保存されている",
    "- primary 11 taskについて\\(M\\)のAF baseline分布が保存されている",
)
s = s.replace(
    "**本節はP6-2 live前のpredeclarationである。runner実装、\\((\\Delta_M,\\Delta_R)\\)の具体値確定、variance pilot、live API実行は別作業単位とし、本節の記述だけでは開始しない。**",
    "**2026-09-20のpre-live freezeはhistorical designとして保持し、2026-09-21の§10.2.5b amendmentがcurrent P6-2 task selection / margin / fresh-pilot手順をsupersedeする。**",
)

header = "### 11.1 \\(\\Delta_M,\\Delta_R\\)（freeze済み）"
if header not in s:
    raise SystemExit(f"stage1_plan missing exact 11.1 header: {header!r}")
start = s.index(header)
end = s.index("### 11.2 ", start)
new_111 = r'''### 11.1 \(\Delta_M,\Delta_R\)（historical freeze + current amendment）

2026-09-20 historical 12-task designでは、

\[
\Delta_M=\Delta_R=1/12
\]

をpre-live freezeしてvariance pilotを実行した。このhistorical design/resultは改変せず保存する。

2026-09-21のtask-selection amendment後に有効なcurrent designは、固定bank上の最小1 unitを無視しない同じoperational ruleを維持し、

\[
\Delta_M=1/11,\qquad \Delta_R=1/12
\]

とする。Mの1 taskとR^{sem}の1 probeの実世界上の価値が同一であることは仮定しない。M bank membership変更後の`Delta_M`変更は観測SDへ合わせたmargin tuningではなく、事前定義済み `1/|primary task|` ruleの機械的帰結としてversioned amendmentに記録する。

Equivalenceは \(\alpha=0.05\) のTOSTと整合する90% CIで評価し、paired differenceのCI全体が各measurement固有のmargin内へ入った場合のみ主張する。repeat数はfresh 11-task AF-vs-AF variance pilotから決定し、historical 8 pairのpost-selection再集約値は正式freezeへ使用しない。

'''
s = s[:start] + new_111 + s[end:]
stage.write_text(s)

exp = Path("docs/experiment_plan.md")
e = exp.read_text()
e = e.replace(
    "repeat数は8 pairのfresh AF-vs-AF variance pilot（奇数AB/偶数BA、infrastructure-invalidは同一pair idを最大3 attemptまでreplacement）、SD片側95% upper boundを用い、n=8〜30の中心t分布によるexact paired-TOST powerを順に計算してtarget power 0.80を満たす最小nへfreezeする。",
    "repeat数は8 pairのfresh AF-vs-AF variance pilot（奇数AB/偶数BA、infrastructure-invalidは同一pair idを最大3 attemptまでreplacement）、SD片側95% upper boundを用い、paired normal differenceのsample SDの不確実性をchi分布で積分したtrue exact paired-TOST powerをn=8〜30で順に計算してtarget power 0.80を満たす最小nへfreezeする。",
)
old = "**P6-2 post-pilot task-bank amendment（2026-09-21）**：12-task AF-vs-AF variance pilotのraw resultを先にimmutable evidenceとして保存した後、bank-wide監査で`T-crosscut-5`が16 AF observations中4 success / 11 semantic failure / 1 protocol failure、かつ11 semantic failureがすべて同一のOsk guard欠落signatureに収束することを確認した。他11 primary taskにはsemantic failureがなかった。P6-1b historical 3-repeat classificationは保持したまま、P6-2以降のeffective M bankのみ11 taskへversion updateし、`T-crosscut-5`をsemantic-floorへ移す。marginの定義規則は変えず `Delta_M=1/|primary|=1/11`、M sigma floorも同じruleにより1/11へ追従する。Rsemは12 probe / `Delta_R=1/12`のまま。historical 8 pairを11-taskで再集約した結果、M sample SD=0.0758657、95% SD-UCB=0.1363421、exact requiredN_M=21、Rsem requiredN=11となり、common repeat candidate=21は既存max n=30以内。今後の再分類にはStage 1 plan §10.2.5bの最低12 accepted/semantic-evaluable AF observations、bank-wide率判定、failure-signature一貫性、時点制約を必須とする。"
new = "**P6-2 post-pilot task-selection amendment（2026-09-21）**：historical 12-task AF-vs-AF variance pilotのraw resultを先にimmutable evidenceとして保存した後、bank-wide監査で`T-crosscut-5`だけが16 AF observations中4 success / 11 semantic failure / 1 protocol failure、かつ11 semantic failureが同一Osk guard欠落signatureへ収束することを確認した。これはhistorical P6-1b `semantic-floor`へ遡及分類せず、P6-2+専用の`post-pilot-low-headroom`としてprimary Mから除外する。Osk依存は2026-09-06のoracle fixture、同型failureは2026-09-07のStage 0.5 resultにpre-pilot evidenceがある。一方、AFでのlow-headroom頻度はpost-pilotに確定したため、historical 8 pairを11-taskで再集約したrequiredN_M=21 / Rsem=11はdiagnostic-onlyでformal freezeへ使わない。current task selectionを11 primaryへfreezeし、`Delta_M=1/11`, `Delta_R=1/12`としたうえで、旧16 observationsを再利用しないfresh 11-task AF-vs-AF 8 pairから正式repeat数を決める。historical 12-task結果（n<=30ではpower不足、ceiling外診断ではn=37相当）とfresh 11-task結果は最終報告で併記する。"
if old not in e:
    raise SystemExit("experiment_plan amendment paragraph not found")
e = e.replace(old, new, 1)
exp.write_text(e)
