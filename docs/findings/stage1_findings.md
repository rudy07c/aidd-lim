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

## F16: T-crosscut-5 post-pilot low-headroom判定とbank-wide監査

**日付**: 2026-09-21  
**Phase**: P6-2 AF-vs-AF variance pilot / statistical-design audit  
**Source evidence**: `docs/findings/evidence/p6-2-variance-pilot/result.json`（historical 12-task pilot。source manifest git SHA `6551d69309f84bc6646a1bbf50daa08928c423dc`）  
**Audit artifact**: `docs/findings/evidence/p6-2-variance-pilot/postpilot-task-audit.json`

P6-1bでは`T-crosscut-5`は3 repeat中 **semantic success 2 / semantic failure 1 / protocol failure 0** で`T_primary-eligible`となった。これは当時の実装済みabsolute-count rule（`semanticSuccesses >= 2 -> eligible`; `0 success && semanticFailures >= 2 -> semantic-floor`; `1 success && semanticFailures >= 2 -> AF-unstable`）に対して正しいhistorical classificationであり、後から書き換えない。

P6-2 AF-vs-AF variance pilotではaccepted 8 pair × 2 arm = **16 AF observations** が得られた。12 historical primary taskすべてを同一手順で機械監査した結果は次の通りだった。

| task | success | semantic failure | protocol failure | dominant semantic signature |
|---|---:|---:|---:|---|
| T-local-2 | 16 | 0 | 0 | — |
| T-crosscut-1 | 15 | 0 | 1 | — |
| T-delayed-1 | 16 | 0 | 0 | — |
| T-local-3 | 16 | 0 | 0 | — |
| T-local-4 | 15 | 0 | 1 | — |
| T-local-5 | 16 | 0 | 0 | — |
| T-local-6 | 16 | 0 | 0 | — |
| T-local-7 | 15 | 0 | 1 | — |
| T-crosscut-3 | 16 | 0 | 0 | — |
| T-crosscut-4 | 15 | 0 | 1 | — |
| **T-crosscut-5** | **4** | **11** | **1** | **`boostTalFen: fails when Osk=nim` ×11** |
| T-delayed-2 | 15 | 0 | 1 | — |

したがって、今回のAF-only calibration evidenceでpersistent semantic failureを示したhistorical primary taskは`T-crosscut-5`だけである。他11 taskにはsemantic failureが1件もない。

ただし、この判定を**P6-1b ruleの単純な率への一般化とは扱わない**。P6-1bはabsolute-count ruleであり、4 semantic successを持つ`T-crosscut-5`をhistorical `semantic-floor`へ遡及分類することは規則上も概念上も不適切である。そのためP6-2以降では新しいtask-selection label **`post-pilot-low-headroom`** を導入し、historical `semantic-floor` 6 taskとは別集合として保持する。`T-crosscut-5`はprimary Mから除外するが、`semantic-floor`へは移さない。

post-pilot low-headroom screenは、repeat freeze前かつprimary condition contrast観測前に限り、AF-only calibration sampleをbank-wideに一括適用する新しいprotocol amendmentである。最低12 accepted AF observations、最低12 semantic-evaluable observations、semantic success rate `<1/3`、semantic failure最低6件、dominant structural failure signatureがsemantic failuresの`>=2/3`を占めることを要求する。このscreenを12 historical primary task全部へ適用した結果、該当は`T-crosscut-5`のみだった。

### pilot以前から存在した独立証拠

`T-crosscut-5`のOsk依存自体はvariance pilotを見て作られた説明ではない。

1. `harness/fixtures/oracle-patches/T-crosscut-5.ts` はcommit `3fc9838d034c759c03bce2aaab1735723907543d`（2026-09-06）で追加され、ground-truth preconditionとして `Osk(E5)=q2(pex)` を明示し、「advanceFen1のE5=q2依存を複合operationでも引き継ぐ」と記録している。
2. `runs/stage0_5/.../system2/B1K/T-crosscut-5/task_specific_test_result.json` はcommit `f89b12a631defd883ff0bc14b67133ab3a72279e`（2026-09-07）で保存され、variance pilotより前に既に `boostTalFen: fails when Osk=nim` が失敗している。

よって、**failure signatureの意味論的根拠と同型failureの存在はpre-pilot evidenceで独立に確認できる**。一方で「GPT-5.6 LunaのAF条件でこのtaskがpersistent low-headroomである」という頻度情報そのものを確定したのは今回のvariance pilotである。この区別は維持する。

## F17: 11-task historical再集約はdiagnostic-only、formal sizingにはfresh pilotを要求

`T-crosscut-5`をprimaryから外すと、current M bankは11 taskとなり、既存の最小意味単位ルールにより `Delta_M = 1/11`、M sigma floorも`1/11`へ追従する。Rsemは12 probeのままなので `Delta_R = sigma_floor,R = 1/12` のままである。alpha=0.05、target power=0.80、片側95% SD-UCB、exact paired-TOST、failure semanticsは変更しない。

historical 8 accepted pairを11-taskで再集約した診断値は、M pair difference

`[0, -1/11, 0, +1/11, +1/11, -1/11, 0, -1/11]`

で、M sample SD=`0.07586572367238914`、raw 95% SD-UCB=`0.13634214080510768`、diagnostic requiredN_M=21、Rsem requiredN=11、common candidate=21となる。

しかし、**この21をscientific repeat countのfreezeには使わない**。同じhistorical 8 pairが、(a) `T-crosscut-5`をprimaryから外すtask-selection evidenceと、(b) 除外後varianceの再推定の両方へ寄与しており、post-selection optimismを否定できないためである。特に12-task designではn<=30でtarget powerへ到達せず`statistical-design-needs-audit`となったのに対し、同じdataのpost-selection reaggregationでは21へ下がる。この変化自体を透明に残す。

したがってtask-selectionをここでfreezeし、**これ以後、fresh variance pilotとrepeat freezeが完了するまでtask membershipを変更しない**。formal repeat sizingには、旧16 AF observationsを一切再利用しないfreshな11-task AF-vs-AF 8 pairを新規取得し、そのfresh dataだけから`requiredN_M` / `requiredN_R`を計算する。

12-task historical designと11-task current designは最終報告で必ず併記する。historical 12-task designではM sample SD=`0.09383263553830025`、95% SD-UCB=`0.16863138961044855`、n=30 power=`0.6816437585696477`で、predeclared ceiling内requiredNは`null`（同一exact式をceiling外へ延長したdiagnostic最小nは37相当）。11-taskのhistorical再集約21はselection後diagnosticにすぎず、fresh pilot後のformal Nと混同しない。

## F18: P6-2 AF baseline本取得完了 — aggregate high-but-nonsaturated / M semantic channel observed ceiling / Rsem residual concentrated

**日付**: 2026-09-22  
**Phase**: Pre-Stage 1 P6-2  
**Model**: GPT-5.6 Luna / reasoning=`high` / Artifact-Full  
**Evidence**: `docs/findings/evidence/p6-2-af-baseline/result.json`  
**Completion record**: `docs/findings/p6_2_af_baseline.md`

fresh 11-task variance pilotとM-side independence auditを経てfreezeした`N=21`をそのまま用い、P6-2 AF baseline本取得を完了した。primary Mは11 task × 21 repeat = **231/231がscientifically valid**で、end-to-endでは217 pass / 14 protocol failure、`passRate=0.9393939394`。ただし、この231件をそのまま「semantic correctnessが231件すべて観測された」と読んではならない。**231件中217件だけがsemantic-evaluableであり、その217件は217/217 passだった。残る14件はmutation/output protocol failureのため、semantic correctnessは未観測（semantic-censored）である。** primary側にsemantic failureとして観測されたrepeatは0だが、これは「0/231 semantic failure」ではなく「evaluable subsetで217/217 pass」と条件付きで記述する。

eligible diagnostic 2 taskは42 repeat中41がscientifically validで36 pass、valid-repeat pass rateは`0.8780487805`。`T-invariant-stress-3` repeat 19でAPI credit exhaustionによるHTTP 429が発生したが、`actualModel=null`かつusage=0のprovider-side実行不能だったため`infrastructure-invalid`として明示adjudicateした。同じrunをresumeして完走し、最終resultのunresolved audit flagは0である。

Rsemは`stage1-neutral-relation-v2`の12 balanced boolean probeを21 repeat実行し、**235/252 = 0.9325396825**。21/21 repeatがprotocol-validで、protocol reliability=`1.0`。aggregateでは1.0へ張り付いておらず後続比較用のheadroomを残す一方、probe-wiseには残差17誤答がすべて単一probe `A-obfuscated-bool-r11`へ集中している（詳細はF20）。したがって、**AFはaggregateではhigh-but-nonsaturatedだが、Mのsemantic channelは観測可能だったevaluable subsetの範囲ではceiling、Rsemの非飽和性は単一probe由来**という非対称なbaselineである。

このため、後続EL / PR / ARでMが低下した場合は、その低下を自動的にsemantic reconstruction lossとは解釈せず、semantic / protocol / system / infrastructureのdomain分解を必ず併記する。またRsemのaggregate差だけでなくprobe-wise差も保存し、単一probeの変化がaggregateを支配していないかを確認する。

P6-2のresultを見た後にtask membership、`Delta_M=1/11`、`Delta_R=1/12`、N=21を再調整しない。次phaseはP6-3 EL static dose-responseとする。

## F19: AF M residual failureはsemanticではなくmutation-output protocolに集中

**日付**: 2026-09-22  
**Phase**: P6-2 post-completion mechanism audit  
**Evidence**: `docs/findings/evidence/p6-2-af-baseline/result.json`

AF baselineのM stream全273 repeat（primary 231 + eligible diagnostic 42）には、`protocol` failureが**19件**あった。内訳は、**18件がstructured mutation output内のDuplicate modified file path、1件が`write-outside-repository-contract:workingNote`**である。primary Mのend-to-end pass rateが`217/231 = 0.9393939394`で1.0に達しなかった14件もすべてprotocol failureであり、semantic-evaluable primary repeatは217/217 passだった。

19件のtask / failure reason内訳は次の通り。

| task | protocol failure内訳 | count |
|---|---|---:|
| `T-crosscut-1` | Duplicate `src/protocol_adapter.ts` | 1 |
| `T-crosscut-3` | Duplicate `src/osk/rules.ts` | 1 |
| `T-crosscut-4` | Duplicate `src/fen/rules.ts` | 2 |
| `T-delayed-2` | Duplicate `src/tal/rules.ts` | 3 |
| `T-invariant-stress-3` | Duplicate `src/rush/rules.ts` ×3 / `src/rushZefFen.ts` ×1 / `src/zef/rules.ts` ×1 | 5 |
| `T-local-2` | `write-outside-repository-contract:workingNote` | 1 |
| `T-local-3` | Duplicate `src/fen/rules.ts` | 1 |
| `T-local-4` | Duplicate `src/vok/rules.ts` | 3 |
| `T-local-5` | Duplicate `src/zef/rules.ts` | 1 |
| `T-local-7` | Duplicate `src/vok/rules.ts` | 1 |

Duplicate modified file path 18件をpath別に再集計すると、`src/protocol_adapter.ts`=1、`src/fen/rules.ts`=3、`src/tal/rules.ts`=3、`src/vok/rules.ts`=4、`src/zef/rules.ts`=2、`src/osk/rules.ts`=1、`src/rush/rules.ts`=3、`src/rushZefFen.ts`=1で、合計18件となる。

したがって、**少なくとも今回のAF baselineでprimary M=0.9394が1.0にならなかった主要因はsemantic task理解の観測失敗ではなく、mutation-output protocol、特にserialization / duplicate-path handlingである。** これは既存finding `docs/findings/output_serialization_bottleneck.md` の **Output Serialization Bottleneck** と直接整合する。P6-3以降でprotocol failure率だけを改善するparser/schema/prompt変更を行うとAF baselineとの比較可能性を壊すため、同findingの改善を取り込む場合はAFを含む全比較条件を同一versionで再baselineする必要がある。

なお、このfindingは「semantic能力が完全である」とは主張しない。protocol failure 19件ではsemantic correctnessそのものが観測されておらず、primaryについて言えるのはsemantic-evaluableだった217件が217/217 passだった、という条件付きの事実までである。

## F20: Rsem AF residual errorはr11へ集中し、probe-specific root causeは未同定

**日付**: 2026-09-22  
**Phase**: P6-2 post-completion probe-wise audit  
**Evidence**: `docs/findings/evidence/p6-2-af-baseline/result.json`  
**Probe bank**: `calibration/fixtures/probe-bank-stage1.json`

`stage1-neutral-relation-v2`の12 probeをprobe-wiseに再集計すると、**`A-obfuscated-bool-r11`だけが4/21 correctで、残る11 probeはすべて21/21 correct**だった。aggregateの235/252=`0.9325396825`という非飽和性は、17誤答すべてがr11に集中した結果である。

probe bank上でr11は`correctAnswer=false`、`candidateSource="reachable-counterexample"`として定義されている。しかし、同じ`reachable-counterexample`型のfalse probeである `r03`, `r05`, `r08`, `r09`, `r12` はすべて21/21 correctだった。したがって、**「反例発見型だから難しい」というprobe classだけではr11の低正答率を説明できない。**

r11固有の難しさについては、少なくともentity chainの長さ、obfuscation naming、matched invariantの構造、必要なreachable-state推論の段数などを候補として、別途root-cause investigationを行う必要がある。現時点ではどの要因が支配的かを特定できていないため、r11を一般的な「counterexample difficulty」の代表として扱わない。

また、**r11はcurrent primary Rsem bank 12 probeから除外しない。** P6-2 outcomeを観測した後に低正答probeだけを除外するとpost-hoc probe selectionになるためである。r11除外結果を確認する場合は、P6-2後の明示的なsensitivity analysisとしてのみ併記し、primary Rsem outcomeや既存`Delta_R=1/12`を置き換えない。

P6-3以降はaggregate Rsemに加えてprobe-wise accuracyを必須diagnosticとして保存し、特にr11がbudget dose-responseを単独で支配するか、他probeにも誤答が拡散するかを区別して報告する。