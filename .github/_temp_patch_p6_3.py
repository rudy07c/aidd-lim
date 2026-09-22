from pathlib import Path

p = Path("docs/stage1_plan.md")
s = p.read_text()
old = r'''### 10.3 P6-3：EL static exposure

複数static exposure budget：

\[
B_{expose} \in \{0,B_1,B_2,\ldots,AF\}
\]

でdose-response確認。

既存1K/2Kは候補であり、model/token-counter変更後に再freezeする。
'''
new = r'''### 10.3 P6-3：EL static exposure calibration predeclaration

P6-3は、Stage 1Aのconfirmatory contrastそのものではなく、**Exposure-Limited（EL）をnon-degenerateな科学的conditionとして成立させるためのbudget-selection calibration**とする。ここで観測したoutcomeを用いて`B_expose`を選ぶため、P6-3 dataは後続Stage 1Aのconfirmatory EL dataへpool / reuseしない。

P6-3 live開始前に、以下のdesignをoutcome非依存でfreezeし、manifest / verifierへ保存する。EL runtime実装はこのpredeclarationのレビュー完了後に別作業として行う。

#### 10.3.1 AF baselineとmutation/output protocolを固定する

P6-3のM measurementでは、P6-2 AF baselineで用いたmutation/output surfaceを比較条件間で固定する。

- mutation prompt semantics / prompt version / prompt hash
- mutation response schema semantics / schema version / schema hash
- structured-output parser semantics
- duplicate-path handling
- repository path validation / `workingNote` validation
- failure-domain classification semantics
- retry / repair opportunity

P6-2 baseline manifestの少なくとも `mutationPromptVersion=stage1-worker-v3-moi`、`mutationSchemaVersion=repository-mutation-v2` と対応hash、およびparser / validationを含むcritical-source fingerprintをP6-3 manifestへ継承して照合する。P6-2で観測されたprotocol failureを見た後にELだけparser / schema / prompt / validationを改善してはならない。

**protocol failure率を改善し得る変更を行う場合、その変更は新しいcomparison protocol versionとして扱い、AFを含む全比較条件を同一versionで再baselineする。** 既存`docs/findings/output_serialization_bottleneck.md`の改善を途中からELだけへ適用しない。

Rsemについても、primary 12-probe bank、forced boolean answer semantics、parse / failure-domain semanticsをP6-2から維持する。ELで必要なcontext wrapper差以外にanswer protocolを変更しない。

#### 10.3.2 calibration dataとStage 1A confirmatory dataを分離する

P6-3の目的は`B_expose`の選択であり、その選択に使ったdataを同じbudgetの効果推定へ再利用しない。

\[
P6\text{-}3\ calibration
\rightarrow B_{expose}\ selection
\rightarrow fresh\ Stage\ 1A
\]

とする。

- P6-3で取得したM / Rsem responseはcalibration-onlyとlabelする
- P6-3内の`B=0` / `AF` anchorもP6-2 baselineやStage 1A confirmatory sampleへpoolしない
- Stage 1Aではfresh agent / fresh API callで同じfreeze済み`B_expose`を再取得する
- Stage 1A開始時にP6-3 response ID / raw responseのreuseがないことをprovenance audit可能にする

budget selection後にP6-3 data自体からconfirmatory C3等を主張しない。

#### 10.3.3 calibration repeat countは`N=21`と独立に12へfreezeする

P6-2でfreezeした`N=21`はStage 1 primary scientific comparison用のplanning valueであり、P6-3 budget selectionへ自動流用しない。

P6-3 calibration repeat countは **`K_cal=12`** として別にfreezeする。これはpower / equivalence保証のためのNではない。後述する6つのbudget levelを、**6-positionの完全なcounterbalance cycleを順方向・逆方向で1回ずつ、合計2 cycle**実行できることを理由とする。

- outcomeを見て`K_cal`を12より増減しない
- infrastructure-invalidのreplacement / audit規則だけはlive前に別途runner contractとして固定する
- `K_cal=12`をStage 1A confirmatory Nへ読み替えない
- P6-3 calibrationからformal equivalence / non-inferiorityを主張しない

#### 10.3.4 budget gridとbudget-selection ruleを事前固定する

legacy Stage 0.5の`1K/2K` char-based treatmentをStage 1 ELの科学的budgetとしてそのまま再利用しない。P6-3ではcanonical model-visible ArtifactUnit serializationと`js-tiktoken:o200k_base:v1`でstatic exposureを数える。

EL用にfull repositoryを同じArtifactUnit serializerで表したcanonical token総量を`T_EL`とし、live前の候補gridを次の**6 level**へ固定する。

\[
\mathcal B_{cal}
=
\left\{
0,\
\frac{1}{8}T_{EL},\
\frac{1}{4}T_{EL},\
\frac{1}{2}T_{EL},\
\frac{3}{4}T_{EL},\
AF
\right\}
\]

内部4 levelのnominal capはinteger canonical tokenへ決定論的に丸め、actual exposed token数は別途記録する。`AF`はP6-2と同じArtifact-Full conditionをfresh calibration anchorとして実行し、EL full-prefixの別名にはしない。`T_EL`、丸め後の`B_1...B_4`、chunker / serializer / selector version / hashはlive前manifestでfreezeする。

budget選択は、12 calibration repeatのbank-level meanを用いる。fresh calibration anchorを

\[
\bar M_0,\ \bar M_{AF},\ \bar R_0,\ \bar R_{AF}
\]

とし、current frozen margin

\[
\Delta_M=1/11,\qquad \Delta_R=1/12
\]

を「固定bank上の1 unit丸ごとの差を無視しない」という既存operational ruleとして再利用する。ただしこれは`K_cal=12`でTOST equivalenceを行うという意味ではなく、**budget選択用のpoint-estimate guard**である。

内部budget `B`をnon-degenerate candidateとする条件は、MとRsemの**両方**について、

\[
\bar M_0 + \Delta_M
\le \bar M_B
\le \bar M_{AF} - \Delta_M
\]

かつ

\[
\bar R_0 + \Delta_R
\le \bar R_B
\le \bar R_{AF} - \Delta_R
\]

を満たすこととする。

M / Rsemはbudget選択では**conjunctive co-gate**とし、片方の高得点で他方のfloor / AF-near状態を補償しない。複数candidateが成立した場合は、**最小の`B_expose`**を選ぶ。これはnon-degenerate性を保ったまま、より強いstatic bottleneckを優先する事前tie-breakである。

以下では`B_expose`を選ばず`needs-design-audit`で停止する。

- MまたはRsemで`AF - B=0 < 2\Delta`となり、定義上non-degenerate interiorを確保できない
- 内部4 budgetのどれも両endpointの条件を同時に満たさない
- structural preflightでbudget / exposure orderingのfreezeが成立しない

この場合、観測curveを見て同じrunへ都合のよいbudgetを追加しない。必要なら**新しいversioned calibration designをpredeclareし、fresh runとしてやり直す**。`floor` / `AF-equivalent`という語を用いる場合も、このP6-3 point-estimate guardとformal TOST equivalence evidenceを混同しない。

#### 10.3.5 exposure setはdeterministic nested prefixとする

EL / PRのprivileged relevance policyは可能な限り同じranking semanticsを共有するが、ELではepisode開始前にstatic exposureを一度だけ確定し、その後未提示artifactへ再アクセスできない。

各M task `t`について、repository / task / frozen selectorから一つの決定論的ArtifactUnit列

\[
U_t=(u_1,u_2,\ldots,u_k)
\]

を作る。budget `B`のexposure set `E_t(B)`は、canonical model-visible token累積が`B`以下となる**最大のwhole-unit prefix**とする。

- remaining budgetへ入らないunitに達したらそこで停止し、後続の小さいunitをskip-inしてpackingしない
- 同一selector planではbudget増加により既存unitを入れ替えない
- nominal capとactual exposed canonical tokensを両方保存する
- ArtifactUnit id / path / line range / content hash / ordered selector plan hashを保存する

これによりfinite levelsでは構造的に、

\[
E_t(B_1)\subseteq E_t(B_2)\subseteq E_t(B_3)\subseteq E_t(B_4)
\]

を保証する。Rsemについても§10.3.8のbank-level ordered unit列に同じprefix ruleを用いる。

現在のPR controllerがfile/path rankingを生成し、model-visible evidenceがArtifactUnitである点を踏まえ、**file rankingからchunk / ArtifactUnit orderingへ写像する規則もEL runtime実装前にversion / hash付きでfreezeする**。legacy `simple-limited`へfallbackしない。

#### 10.3.6 budget execution orderを12-repeat counterbalanceする

6 levelを常に`0 → B1 → B2 → B3 → B4 → AF`の固定順で実行しない。base orderを

\[
L=(0,B_1,B_2,B_3,B_4,AF)
\]

とし、repeat 1〜6では`L`のcyclic rotationを1 positionずつ進める。repeat 7〜12ではreverse order

\[
L^{rev}=(AF,B_4,B_3,B_2,B_1,0)
\]

のcyclic rotationを同様に用いる。

これにより12 repeatで各budgetは各execution positionへ順方向・逆方向それぞれ1回ずつ現れる。scheduleはrepeat idだけから決定し、outcome / latency / prior successで変更しない。

Mでは可能な範囲で**同一task × repeatの6 budget armsを近接したblockとして実行**し、別taskのscientific callをarm間へ挟まない。Rsemも同一repeat内の6 budget armsを近接実行する。provider drift / cache /時間順序をbudgetと固定相関させないことが目的であり、execution order自体はscientific outcomeとして最適化しない。

#### 10.3.7 M semantic failure rateはsecondary diagnosticへ固定する

P6-3のprimary M endpointは、P6-2と同じfailure semanticsを用いたend-to-end bank-level Mのまま変更しない。P6-2でsemantic-evaluable primary repeatが217/217 passだった事実を受けても、P6-3 outcomeを見てsemantic failure rateをprimary endpointへ格上げしない。

secondary diagnosticとして、各budgetで少なくとも次を報告する。

- end-to-end M pass rate（primary）
- `semantic` failure count
- semantic-evaluable count = `failureDomain ∈ {none, semantic}`
- semantic failure rate = `semantic / semantic-evaluable`
- protocol failure count / rate
- system / infrastructure / other / audit exclusion

protocol-censored repeatをsemantic success / semantic failureのどちらにも変換しない。semantic failure diagnosticを統計的に比較する場合も、11 taskを独立sampleとして水増しせず、repeat内でbank-levelに集約した値をanalysis unitとする。

#### 10.3.8 Rsemは12-probe bank全体へ単一static exposure setを使う

ELのRsem measurementでは、probeごとにoracle context / probe-specific retrievalを作らない。各budgetについて、**12 primary probe全体に対して一つのstatic exposure set**を構成し、その同じsetを12問を含む1回のRsem callへ提示する。

- selector / rankingは個別probeのanswer outcomeを条件にしない
- repeat間でもrepository / bank / budgetが同じなら同じordered exposure planを再現する
- primary aggregateはP6-2と同じ12 probes / `Delta_R=1/12`を維持する
- P6-2後に`A-obfuscated-bool-r11`を除外しない
- aggregate Rsemに加えて**12 probeすべてのprobe-wise accuracyを必須diagnostic**として保存する
- 特にr11（AF 4/21）と、AFで21/21だった他11 probeへのerror出現を分離して報告する
- r11除外値を計算する場合はpost-P6-2 sensitivity analysisとしてのみ保存し、primary budget selection / primary Rsemを置換しない

P6-3のbudget-selection ruleにはaggregate 12-probe Rsemだけを用い、r11単独のscoreをselection criterionへ追加しない。

#### 10.3.9 P6-3 live gate

EL runtime実装後であっても、以下がすべてimmutable manifest / offline verifierで確認されるまでP6-3 live calibrationを拒否する。

- mutation prompt / schema / parser / validation semanticsがP6-2 AF baselineと一致
- primary task bank 11 / Rsem 12-probe bankがfreeze済み
- canonical tokenizer / ArtifactUnit serializer / chunkerがfreeze済み
- `T_EL`と6-level budget gridがfreeze済み
- task-specific EL selectorとRsem bank-level selectorのversion / hashがfreeze済み
- nested-prefix invariantが全primary task / Rsem planでoffline検証済み
- `K_cal=12`がfreeze済み
- 12-repeat counterbalance scheduleがfreeze済み
- budget-selection rule / tie-break / `needs-design-audit` ruleがfreeze済み
- P6-3 calibration outputがStage 1Aへpoolされないことをresult schema / provenanceで区別可能
- M semantic-failure secondary diagnosticとRsem probe-wise diagnosticがresult schemaへ保存可能
- Harness CIがgreen

**この§10.3 predeclarationのレビュー完了まではEL runtime実装へ着手しない。**
'''
assert s.count(old) == 1, f"old P6-3 block count={s.count(old)}"
p.write_text(s.replace(old, new))
