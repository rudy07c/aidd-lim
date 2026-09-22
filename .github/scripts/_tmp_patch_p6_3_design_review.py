from pathlib import Path

p = Path('docs/stage1_plan.md')
s = p.read_text()

def replace_once(old: str, new: str) -> None:
    global s
    n = s.count(old)
    if n != 1:
        raise SystemExit(f'expected exactly one match, got {n}: {old[:120]!r}')
    s = s.replace(old, new, 1)

replace_once(
'''AFをP6-3 dose-responseの上限anchorとして用いるため、**ELのfull static exposure時にworkerへ見えるartifact payloadがAFのartifact payloadと表現上同等であること**をstructural parity gateにする。file ordering / path framing / line metadata / raw content / separator等、意味以外のserialization差がbudgetと同時に変化しないようにする。exact parityを実装できない場合は、`EL-full` representation-controlを別に設けてAFとの差を先に診断し、parityが未解決のまま`AF`をEL dose-responseの同一continuum endpointとは扱わない。''',
'''AFをP6-3 dose-responseの上限anchorとして用いるため、**ELのfull static exposure時にworkerへ見えるartifact payloadがAFのartifact payloadと表現上同等であること**をstructural parity gateにする。file ordering / path framing / raw content / separator等、意味以外のserialization差がbudgetと同時に変化しないようにする。

ここで重要なのは、`B_expose`と`B_work`のtoken accountingを混同しないことである。既存`serializeArtifactUnitForWorkingSet()`はPR / ARのworking-set用に`{"path":...,"lines":[...]}` metadataを付ける。一方、P6-2 AF mutation promptは`buildOpenAIUserMessage()`が`--- path ---` framingで`contextFiles`を表示する。したがって、**P6-3の`B_expose`をworking-set用ArtifactUnit serializationのtoken数で課金してはならない。**

P6-3ではstatic exposure専用のfrozen serializer（実装時にversion / hashを付与）を用意し、`buildOpenAIUserMessage()`の`CURRENT REPOSITORY` sectionへ実際に渡るrepository payloadとbyte-for-byte対応する表現を`countCanonicalTokens()`で数える。`B_expose`へ含めるのはpath framing / selected raw content / separatorを含む**artifact payloadそのもの**であり、全arm共通のsystem prompt、task instruction、`CURRENT REPOSITORY:`見出し、output schema等のconstant overheadは含めず別途provider usageとして保存する。

ELのfinite exposureはselected ArtifactUnitを`contextFiles`へ再構成してから、AFと同じfrozen prompt builderへ渡す。これにより**token-count対象とmodel-visible static artifact payloadを一致**させる。exact parityを実装できない場合は、`EL-full` representation-controlを別に設けてAFとの差を先に診断し、parityが未解決のまま`AF`をEL dose-responseの同一continuum endpointとは扱わない。'''
)

replace_once(
'''- outcomeを見て`K_cal`を12より増減しない
- infrastructure-invalidのreplacement / audit規則だけはlive前に別途runner contractとして固定する
- `K_cal=12`をStage 1A confirmatory Nへ読み替えない
- P6-3 calibrationからformal equivalence / non-inferiorityを主張しない''',
'''- outcomeを見て`K_cal`を12より増減しない
- `K_cal=12`をStage 1A confirmatory Nへ読み替えない
- P6-3 calibrationからformal equivalence / non-inferiorityを主張しない

各planned logical cell（Mでは`task × repeat × budget`、Rsemでは`repeat × budget`）について、`semantic` / `protocol` / `system`はP6-2と同じscientific outcomeとして保存し、都合の悪い結果としてreplacementしない。`infrastructure`だけはscientific observationへ数えず`needs-audit`で停止する。明示adjudicationで`infrastructure-invalid`と確定した場合のみ、**同じlogical cellを同じfrozen条件でone-for-one replacement**してresumeする。logical cellあたり最大3 scientific attemptsとし、3 attemptsでもvalid observationを得られない場合はP6-3全体を`needs-audit`で停止する。attempt id / timestamp / provider status / usage / adjudicationをすべて保存し、replacementを追加repeatとして`K_cal`へ加算しない。'''
)

replace_once(
'''legacy Stage 0.5の`1K/2K` char-based treatmentをStage 1 ELの科学的budgetとしてそのまま再利用しない。P6-3ではcanonical model-visible ArtifactUnit serializationと`js-tiktoken:o200k_base:v1`でstatic exposureを数える。

EL用にfull repositoryを同じArtifactUnit serializerで表したcanonical token総量を`T_EL`とし、live前の候補gridを次の**6 level**へ固定する。''',
'''legacy Stage 0.5の`1K/2K` char-based treatmentをStage 1 ELの科学的budgetとしてそのまま再利用しない。P6-3では§10.3.1の**exact static repository payload serializer**と`js-tiktoken:o200k_base:v1`でstatic exposureを数える。working-set用ArtifactUnit token countは`B_expose`の課金値に使わない。

EL用full repositoryをAFと同じstatic repository serializerで表したartifact-payload canonical token総量を`T_EL`とし、live前の候補gridを次の**6 level**へ固定する。`T_EL`はchunking前のfull repository payloadから決まり、ArtifactUnit chunk sizeに依存させない。'''
)

replace_once(
'''内部4 levelのnominal capはinteger canonical tokenへ決定論的に丸め、actual exposed token数は別途記録する。`AF`はP6-2と同じArtifact-Full conditionをfresh calibration anchorとして実行し、EL full-prefixの別名にはしない。`T_EL`、丸め後の`B_1...B_4`、chunker / serializer / selector version / hashはlive前manifestでfreezeする。''',
'''内部4 levelのnominal capはinteger canonical tokenへ決定論的に丸め、actual exposed token数は別途記録する。`B=0`は**task / probe instruction、system prompt、output schema等は他armと同一のまま、repository ArtifactUnitを1つも提示しないzero-artifact exposure**とする。`AF`はP6-2と同じArtifact-Full conditionをfresh calibration anchorとして実行し、EL full-prefixの別名にはしない。

`T_EL`、丸め後の`B_1...B_4`、static repository serializer version / hash、chunker version / hash、**`maxTokensPerUnit`の数値**、selector version / hashをlive前manifestでfreezeする。`maxTokensPerUnit`はP6-3 outcomeを一切使わずstructural preflightだけで決め、live開始後に変更しない。

Mのbudget-selection gateへ使うのは**current primary 11 taskだけ**であり、eligible diagnostic 2 taskは実行する場合も別diagnosticとして保存し、`\\bar M_B`やbudget選択へ混ぜない。したがって`Delta_M=1/11`とのmeasurement-bank対応を維持する。'''
)

replace_once(
'''各M task `t`について、repository / task / frozen selectorから一つの決定論的ArtifactUnit列

\\[
U_t=(u_1,u_2,\\ldots,u_k)
\\]

を作る。budget `B`のexposure set `E_t(B)`は、canonical model-visible token累積が`B`以下となる**最大のwhole-unit prefix**とする。

- remaining budgetへ入らないunitに達したらそこで停止し、後続の小さいunitをskip-inしてpackingしない
- 同一selector planではbudget増加により既存unitを入れ替えない
- nominal capとactual exposed canonical tokensを両方保存する
- ArtifactUnit id / path / line range / content hash / ordered selector plan hashを保存する''',
'''各M task `t`について、repository / task / frozen selectorから一つの決定論的ArtifactUnit列

\\[
U_t=(u_1,u_2,\\ldots,u_k)
\\]

を作る。PR controllerがfile/path rankingを返す場合、ELではそのfile順を保ち、各file内のArtifactUnitはsource-orderで並べる。budget候補prefixごとに、selected unitsをpath別・source-orderで連結して`contextFiles`へ再構成し、§10.3.1の**exact static repository serializerで再serializeしたartifact payload**をcanonical token countする。budget `B`のexposure set `E_t(B)`は、そのactual serialized payloadが`B`以下となる最大のwhole-unit prefixとする。working-set用`unit.tokenCount`の単純和で判定しない。

- prefix追加ごとのactual serialized token countがnon-decreasingであることをoffline verifierで確認する
- remaining budgetへ入らないprefixの先へ進んで後続unitだけをskip-inしない
- 同一selector planではbudget増加により既存unitを入れ替えない
- nominal capとactual exposed static-payload tokensを両方保存する
- ArtifactUnit id / path / line range / content hash / ordered selector plan hashを保存する
- `B_1...B_4`で得るexposure-set hashは、**全primary M taskおよびRsem bank-level planで隣接level間すべてdistinct**でなければならない
- actual exposed tokensも各planで`0 < tokens(B_1) < tokens(B_2) < tokens(B_3) < tokens(B_4) < T_EL`を満たすことをstructural preflightで要求する

nominal budgetが違っても同じprefixになるdose collapseが1つでもあればliveへ進まない。これはoutcomeを見た再較正ではなくstructural design failureなので、`maxTokensPerUnit` / chunk mappingを新しいversionとしてofflineで修正し、manifestを再freezeしてから初回liveを開始する。'''
)

replace_once(
'''これにより12 repeatで各budgetは各execution positionへ順方向・逆方向それぞれ1回ずつ現れる。scheduleはrepeat idだけから決定し、outcome / latency / prior successで変更しない。

Mでは可能な範囲で**同一task × repeatの6 budget armsを近接したblockとして実行**し、別taskのscientific callをarm間へ挟まない。Rsemも同一repeat内の6 budget armsを近接実行する。provider drift / cache /時間順序をbudgetと固定相関させないことが目的であり、execution order自体はscientific outcomeとして最適化しない。''',
'''これにより12 repeatで各budgetは各execution positionへ順方向・逆方向それぞれ1回ずつ現れる。scheduleはrepeat idだけから決定し、outcome / latency / prior successで変更しない。

**各budget armは必ずfresh stateless model callとして実行し、同一task / repeatの直前armのassistant response、working note、tool result、session stateを次armへ継承しない。** block化は時間的近接のためだけであり、情報共有を意味しない。

Mでは可能な範囲で**同一task × repeatの6 budget armsを近接したblockとして実行**し、別taskのscientific callをarm間へ挟まない。Rsemも同一repeat内の6 budget armsを近接実行する。provider drift / cache /時間順序をbudgetと固定相関させないことが目的であり、execution order自体はscientific outcomeとして最適化しない。'''
)

replace_once(
'''ELのRsem measurementでは、probeごとにoracle context / probe-specific retrievalを作らない。各budgetについて、**12 primary probe全体に対して一つのstatic exposure set**を構成し、その同じsetを12問を含む1回のRsem callへ提示する。

- selector / rankingは個別probeのanswer outcomeを条件にしない''',
'''ELのRsem measurementでは、probeごとにoracle context / probe-specific retrievalを作らない。各budgetについて、**12 primary probe全体に対して一つのstatic exposure set**を構成し、その同じsetを12問を含む1回のRsem callへ提示する。

Rsem bank-level selectorは、live前にfrozen repositoryと12-probe bank全体から一度だけordered planを構成する。privileged relevance計算でground-truth entity / relation mappingを使う場合も、**12 probeを等しくunionしたrelevance集合**として扱い、probeごとの重み付け・budget別再rankingを行わない。selector inputから少なくとも`correctAnswer`、`candidateSource`、reachable-counterexample witness、P6-2 probe-wise accuracy（r11=4/21を含む）、P6-3中の過去responseを禁止する。これらはranking provenanceへ混入していないことをoffline verifierで確認する。

現行PR policyが`type_definition → fixed_contract → test → implementation`を優先し、P6-0でvisible-tests-only Rsemが高かった事実は既知である。しかし**dose-responseを作る目的でtestsを事後的にdemoteしない**。各budgetでcategory別exposed token / unit数をstructural diagnosticとして保存し、tests優先の結果としてRsem interior candidateが存在しなければ、§10.3.4の事前停止規則どおり`needs-design-audit`とする。

- selector / rankingは個別probeのanswer outcomeを条件にしない'''
)

replace_once(
'''- canonical tokenizer / ArtifactUnit serializer / chunkerがfreeze済み
- `T_EL`と6-level budget gridがfreeze済み
- task-specific EL selectorとRsem bank-level selectorのversion / hashがfreeze済み
- nested-prefix invariantが全primary task / Rsem planでoffline検証済み
- `K_cal=12`がfreeze済み
- 12-repeat counterbalance scheduleがfreeze済み''',
'''- canonical tokenizer / static repository serializer / ArtifactUnit selector granularity / chunkerがfreeze済み
- static serializerのcount対象がactual model-visible AF/EL repository payloadと一致することをoffline検証済み
- `T_EL`と6-level budget grid、`maxTokensPerUnit`がfreeze済み
- task-specific EL selectorとRsem bank-level selectorのversion / hashがfreeze済み
- Rsem selectorのforbidden inputs（correct answer / counterexample witness / prior outcome等）が混入していないことを検証済み
- nested-prefix invariantとserialized-prefix token countのnon-decreasing性が全primary task / Rsem planでoffline検証済み
- `B_1...B_4`のexposure hash distinctnessとstrict actual-token orderingが全primary task / Rsem planでoffline検証済み
- `K_cal=12`がfreeze済み
- infrastructure-invalidのadjudication / one-for-one replacement / max-3-attempt ruleがfreeze済み
- 各budget armがfresh stateless callであることをoffline test済み
- 12-repeat counterbalance scheduleがfreeze済み'''
)

p.write_text(s)
print('patched docs/stage1_plan.md')
