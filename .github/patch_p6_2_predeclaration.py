from pathlib import Path

p = Path('docs/stage1_plan.md')
s = p.read_text(encoding='utf-8')

old = '''### 10.2 P6-2：AF baseline

selected primary modelで、

- balanced \\(R^{sem}\\)
- \\(M\\)

のAF baselineを再取得。
'''

new = '''### 10.2 P6-2：AF baseline predeclaration

P6-2の目的は、P6-1bでcapability / analysis roleをfreezeした後の改善版task bankとselected primary modelを用い、**Artifact-Full（AF）条件における2つの独立した測定量のbaseline分布**を取得することである。

- \\(R^{sem}\\)：artifactから意味・関係・invariantを再構成できるかを測る**意味的再構成能力**
- \\(M\\)：与えられた変更要求をartifactへ正しく反映し、既存behaviorを壊さず変更タスクを完了できるかを測る**機能的継続可能性**

\\(M\\)はhidden testsの合否そのものではない。visible / hidden / task-specific tests等は変更結果を評価するための観測手段であり、\\(M\\)が測る対象は**変更タスクの成功可否**である。したがって、固定artifactにhidden testsを実行して既存機能が保持されていることだけを確認する測定とは区別する。\\(R^{sem}\\)と\\(M\\)は同じAF conditionで取得するが、互いに代替しない独立したmeasurement pathとして保存する。

#### 10.2.1 task bank / historical result separation

P6-2では、P6-1b postflightでcoverage gapを修正した

`p6-1-full-task-bank-v3-postflight-coverage`

を使用する。

P6-1bの45 initial repeatおよびhold追加0で得たresultは、当時freezeされていたv2 task bankに対するhistorical calibrationとして保持する。P6-2のv3 resultとv2 historical resultを同一bankのrepeatとして結合・上書き・再解釈しない。

#### 10.2.2 model / AF condition freeze

model条件はP6-1bから次を引き継いで固定する。

- model：`gpt-5.6-luna`
- reasoning：`high`
- generation / repeatごとにfresh agent
- condition：Artifact-Full（artifact全体を追加的な人工context制限なしで提示）

P6-2 live開始時には、少なくとも次をrun provenance / frozen manifestへ保存する。

- requested model IDとAPI response上のactual model identifier
- prompt version / prompt hash
- response schema version / schema hash
- OpenAI SDK version
- Node version
- git SHA
- baseline repository SHA
- task-bank version / task-bank SHA

resumeを実装する場合、これらfrozen provenanceの不一致を同一runへ混入させない。

#### 10.2.3 \\(M\\) baselineの対象task

P6-1bでfreeze済みの`capabilityClass`と`analysisRole`をそのまま再利用し、P6-2の結果を見てtaskを再選別しない。

primary baselineは、

\\[
\\mathcal T_{primary}
=\\{t\\mid capabilityClass(t)=eligible \\land analysisRole(t)=main\\}
\\]

の**12 task**とする。

- `T-local-2`
- `T-crosscut-1`
- `T-delayed-1`
- `T-local-3`
- `T-local-4`
- `T-local-5`
- `T-local-6`
- `T-local-7`
- `T-crosscut-3`
- `T-crosscut-4`
- `T-crosscut-5`
- `T-delayed-2`

`eligible ∩ diagnostic`の2 task、

- `T-invariant-stress-1`
- `T-invariant-stress-3`

はAFで実行可能なdiagnosticとして**primary \\(M\\) baselineとは別集計**する。

P6-1bでsemantic-floorに分類済みの6 task、

- `T-local-1`
- `T-crosscut-2`
- `T-invariant-stress-2`
- `T-invariant-stress-4`
- `T-invariant-stress-5`
- `T-crosscut-6`

はchallenge / floor diagnosticとして分類を保持し、primary \\(M\\) baselineへ混入させない。P6-2はtask eligibilityを再判定するphaseではない。

#### 10.2.4 \\(R^{sem}\\) AF baseline

\\(R^{sem}\\)はP6-0でmeasurement-validityを確認した`stage1-neutral-relation-v2`を用いる。

- boolean primary：12問
- ground-truth true relation：6
- reachable counterexampleを持つfalse relation：6
- model-visible probe ID：opaque ID
- true / falseで同一surface形式
- constant-answer baseline：0.50

AF artifactを提示した条件でbalanced boolean primaryを測定し、constant-answer 0.50に対して後続のEL / PR / ARとの差を測定できる十分なheadroomが存在することを確認する。mc/stp等のreference diagnosticを併記する場合も、boolean primaryの\\(R^{sem}\\)とは混合しない。

「十分なheadroom」の最終的な数値基準をP6-2の観測結果からpost-hocに選ばない。必要な数値gate / equivalence interpretationはlive開始前のfreeze事項として扱う。

#### 10.2.5 equivalence margin → variance pilot → repeat数

P6-1bの3 repeatはtask eligibility判定のための設計であり、P6-2以降のbaseline / condition comparisonのrepeat数として自動的に流用しない。

まず、

\\[
\\Delta_M, \\Delta_R
\\]

を、**研究上どの程度の差以下なら実質的に同等と扱うか**というequivalence marginとして、P6-2 baseline結果を見る前にfreezeする。

その後、独立したvariance pilotでAFにおける\\(M\\) / \\(R^{sem}\\)のrepeat間変動を見積もり、そのvarianceと事前freezeした\\((\\Delta_M,\\Delta_R)\\)に基づいて、後続比較に必要なrepeat数を決める。

したがって順序は、

1. \\((\\Delta_M,\\Delta_R)\\)の研究上の意味と値をfreeze
2. variance pilot
3. repeat数をfreeze
4. P6-2 AF baseline本取得

とする。観測されたAF平均やSDに合わせてequivalence margin自体を変更しない。

#### 10.2.6 post-hoc task reselection禁止 / abnormal baseline handling

P6-2でAF baselineが想定外に低い、分散が異常に大きい、protocol / infrastructure failureが多い、または測定不能な挙動を示した場合、その結果を理由にprimary taskを除外したり、diagnostic / semantic-floorとの分類を入れ替えたりしない。

異常時は、

- measurement path
- model behavior / model provenance
- runner / scoring implementation
- provider / infrastructure
- task-bank version / repository provenance

の異常候補としてrunを停止・監査する。task bankのcapability / analysis-role classificationはP6-1bで完了済みであり、P6-2 resultを用いたpost-hoc reselectionは禁止する。

#### 10.2.7 completion condition

P6-2の成功条件は、**AFが単に高得点であることではない**。

必要なのは、primary measurementについて概念的に、

\\[
\\text{floor} < Outcome_{AF} < \\text{non-informative saturation}
\\]

となり、後続の有限context条件（EL / PR / AR）がAFからどの程度変化するかを観測できるmeasurement headroomがあることである。

P6-2完了には少なくとも、

- primary 12 taskについて\\(M\\)のAF baseline分布が保存されている
- eligible diagnostic 2 taskがprimaryと分離して保存されている
- balanced `stage1-neutral-relation-v2`による\\(R^{sem}\\)のAF baseline分布が保存されている
- semantic / protocol / system / infrastructure等のfailure domainを混同せず記録できる
- model / prompt / schema / SDK / Node / git / repository / task-bank provenanceが保存されている
- repeat間varianceが保存され、事前freezeしたequivalence設計と接続できる
- AFがfloorにも測定不能な飽和にも張り付かず、後続conditionとの差を測定できる

ことを要求する。

**本節はP6-2 live前のpredeclarationである。runner実装、\\((\\Delta_M,\\Delta_R)\\)の具体値確定、variance pilot、live API実行は別作業単位とし、本節の記述だけでは開始しない。**
'''

if old not in s:
    raise SystemExit('current P6-2 section did not match expected text')

p.write_text(s.replace(old, new, 1), encoding='utf-8')
print('P6-2 predeclaration section expanded')
