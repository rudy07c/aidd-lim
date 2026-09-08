# AIDDにおける有限コンテキストとsoftware artifact進化 ― 実験計画書

**版**: v2.1
**関連文書**: `docs/aidd_ilm_paper.md`（理論枠組み）、`deep-research-report.md`（先行研究レビュー）、`synthetic-world-v0/NOTES.md`（Synthetic World v0.3実装知見）、`docs/findings/stage0_findings.md`（Stage 0実行結果からの発見）
**作成方針**: 単一のフル実験を最初から回すのではなく、交絡を一つずつ剥がしながら「安い問い」から「高い問い」へ段階的に登る。各Stageは次のStageへ進むための**判定ゲート**として機能する。

**v2.1での変更点（Stage 1内部妥当性の精密化）**：
- Externalization Pressureを、非永続channel一般ではなく**永続software artifactへの外在化を要求する圧力**として精密化（Artifact-Externalization Pressure）
- 世代継承モデルを、task / tool environmentも含むepisode interactionを経由する因果図へ修正
- 五条件横断の評価量を単一budget添字 \(B\) ではなくevaluation environment / condition indexed notation \(R^{sem}(S;e), M(S;e), Q_c(S)\) へ更新
- ELのstatic exposure量を \(B_{expose}\)、PR/ARのsimultaneous working-set量を \(B_{work}\) と分離し、C3をcompound contrastとして明記
- PR/ARは各stepをstateless requestとして再構築し、provider-side conversation historyによるworking-set制約の迂回を禁止
- C1ではAF/PRのmodel-call・decision opportunityを可能な限り揃え、`best-case privileged bounded-observation effect`として解釈
- AF/MOIにOperational-Full feasibility invariantを追加し、context capacity超過時のsilent truncationを禁止
- MOI historyをsource-tagし、ephemeral informationとartifact re-exposureを後続ablationで分離可能にした
- semantic element traceをartifact-source / history-source awareへ拡張
- Stage 1Bにsham-history placebo diagnosticを追加（第6のlongitudinal conditionではない）
- Stage 2 common-environment evaluationに主要contrastごとのreciprocal evaluation候補を追加
- リポジトリ実ファイル名に合わせ、理論文書参照を `docs/aidd_ilm_paper.md` に統一

**v2.0での変更点（Maximal Observable Inheritance / 5条件化）**：
- `docs/aidd_ilm_paper.md` に同期し、世代間継承を \(K_g \rightarrow (S_{g+1}, \mathcal{I}^{obs}_g) \rightarrow C_{g+1} \rightarrow K_{g+1}\) として再整理
- **Maximal Observable Inheritance（MOI）** を追加。全条件でfresh agent原則は維持し、MOIのみ前世代のobservable interaction recordをartifactに加えて継承する
- 従来のArtifact-Fullを **Artifact-Full（AF）** に統一。AFをInheritance/Transmission軸とObservation/Retrieval軸を接続するhub conditionとする
- Context条件を5条件へ拡張：MOI / Artifact-Full / Exposure-Limited / Privileged-Retrieved Limited / Agent-Retrieved Limited
- 条件空間を一本の「制約強度」ではなく二軸として定義：
  - Inheritance / Transmission axis：MOI → AF → EL
  - Observation / Retrieval axis：AF → PR → AR
- primary contrastをC0〜C3へ拡張：
  - C0 MOI−AF：observable-history availability
  - C1 AF−PR：working-set / reconstruction pressure
  - C2 PR−AR：retrieval-policy effect
  - C3 PR−EL：recoverability / exposure effect
- **C0の短期差だけではExternalization Pressureを証明しない**ことを明記。Externalization Pressureは、MOI/AF lineageの長期trajectory差とcommon-environment evaluationを組み合わせて検証する
- Stage 1を3部構成へ変更：
  - Stage 1A：AF/EL/PR/ARによるFixed-S observation decomposition
  - Stage 1B：MOI vs AFによるone-step inheritance diagnostic
  - Stage 1C：5条件longitudinal integration run
- Stage 2へ**common-environment evaluation**を追加。異なる継承条件で育った最終artifactを同一fresh-agent / artifact-only環境で再評価し、lineage環境の効果とartifact自体の適応を分離する
- MOIでは全過去sessionを無制限累積せず、原則として**直前世代のobservable interaction recordのみ**を継承する
- 既存の hidden evaluator 記法 \(H(G)\) とpaperのhistory記号 \(H_g\) の衝突を避けるため、本実験計画ではobservable interaction recordを \(\mathcal{I}^{obs}_g\) と表記する

**v1.9での変更点（理論枠組みv5との同期）**：
- 「有限context」に混在していた二種類の制約を分離：前世代の内部理解がartifactへ完全には外在化されない **Externalization Bottleneck** と、artifact上の情報を次世代主体が一度に保持・処理できない **Observation / Cognitive Bottleneck**
- Artifact-Full条件を「完全な世界」ではなく、継承artifactとして定義した範囲に追加的制限を課さない **Artifact-Full / Operational Full** と再定義
- Stage 1のcontext条件を3条件から4条件へ更新：Artifact-Full / Exposure-Limited / Privileged-Retrieved Limited / Agent-Retrieved Limited
- Stage 1の主要contrastを、Working-set effect / Retrieval-policy effect / Recoverability・Transmission effect の3つに再定義
- `B`を単一の「総アクセスtoken量」ではなく、bounded conditionでは **working-set budget \(B_{work}\)** と **exploration resource \(E_{max}\)** に分離。PR/ARではartifact全体への再アクセス可能性を維持
- \(R^{sem}\) と \(M\) を一般的software qualityではなく、反復的継承に限定した **継承品質（inheritance quality）** の二軸として明確化し、`adaptation ≠ general quality improvement` を明記
- Synthetic Software Worldの位置づけを、「artifactが変わることの観察」ではなく「trajectoryを形成するselection pressureを条件操作によって分解するための人工世界」として明確化
- Stage 2以降のcrossover仮説を4条件に対応させ、Exposure-LimitedとWorking-set Limitedが異なるtrajectoryを示す可能性を明記

**v1.8での変更点（Stage 0 Phase 4再実行結果を受けた修正）**：
- 新設1.5.1節：invariant-stressing taskは「研究対象そのもの」ではなく「構造的変化を診断するための道具」であることを明確化。task bank構成A（暗黙ルールなし、主指標）と構成B（構成A+invariant-stressing task、診断用）の2構成を導入
- Stage 2に、構成A・構成Bを並行運用する設計を追記
- Stage 3の対立仮説に「task bank構成」を追加（構成Aだけでも現象が再現するかの頑健性チェック）。既存の「要求の質」の頑健性チェックと並列の位置づけ
- Stage 4に、構成Bの局所的失敗イベントと構成Aの構造的副次指標を突き合わせる分析方針を追記
- F5（visible testのカバレッジがArtifact-Full / bounded-contextの差を消してしまった発見）を`docs/findings/stage0_findings.md`に追加し、1.5.1節から参照
- 未決事項#7を「構成比」から「構成A/Bの並行運用」へ位置づけ変更、#14（構成Bのvisible testが答えを漏らしていないかの自動検証方法）を新規追加

**v1.7での変更点（Stage 0 Phase 4実行結果を受けた修正）**：
- 新設1.9節：「要求の質の統制」。本研究がcontext bottleneckとして操作するのは過去に継承されるartifactの情報量であり、各世代の新規要求（visibleInstruction）の詳細度は独立変数として操作しないことを明記。Stage 0 Phase 4でdistributed invariantの見落としが観測された際、この交絡因子の存在が明確になったことを踏まえる（`docs/findings/stage0_findings.md` F1, F2参照）
- Stage 3（対立仮説の排除）に、要求文の詳細度に関する頑健性チェックを追加変数として明記
- 理論的位置づけは`aidd_ilm_paper_v4.md`5.3節・8.5節にも対応する形で追記済み

**v1.6での変更点（Synthetic World v0.3実装から得た修正）**：
- 累積validatorの位置づけを「task順序による科学的現象の発見」から「単体検証では見つからない相互作用上の設計ミスを確認する品質保証」に修正。単体では両方安全なdeltaが組み合わせでのみ矛盾を生む例をSynthetic World v0.3で実際に構成・実証した（Stage 3節）
- GroundTruthDeltaが加算のみの現設計では「$G_g$が矛盾を持てば以降も矛盾を持ち続ける」（中間だけ一時的に壊れて後で直ることは原理的に起きない）ことを明記（Stage 3節）
- 「最終Gは順序不変」に、ID一意性・canonicalizationという前提条件を付記し、実際に正準化後の等価性検証で確認したことを記載（Stage 3節）
- 意味的局所性の算出式を「GroundTruthDeltaのみ」から「$(G_g + \Delta_g)$全体のグラフ構造」に修正し、実測した乖離度の例を記載（3.2節）

**v1.2での変更点**：
- \(M_B(S)\) を単一taskの0/1判定から、held-out task set \(\mathcal{T}_{\text{heldout}}\)（\(k=5\text{〜}10\)）に基づく成功率の推定値 \(\hat{M}_B(S)\) に修正
- 可視artifact（repository：継承媒体）と評価用hidden set \(H(G)\)（worker agentに非露出）を明確に分離（新設1.7節）。Stage 6の条件設計（Code / Code+Tests等）との整合を明示
- semantic element traceの `Present` を syntactic trace と behavioral preservation（micro-testによる判定）に分割し、5段階トレースに拡張
- 冒頭Stageゲート表のStage 2判定を、詳細節（4.1 Stage 2）の記述と同期
- 「次のアクション」①・③を、\(G\) から導出すべき5種の成果物（Repository / Semantic probes / Visible tests / Hidden tests / Held-out tasks）から逆算する設計方針として明確化

**v1.1での変更点**：
- Stage 0.5の \(M_B(S)\) 測定を、既存機能保持のテストのみから、held-out modification taskを用いた独立系統の測定に修正（設計矛盾の解消）
- \(G\) の実装schemaでOperationとTransitionRuleを分離
- 命名方式の目的を「prior除去」から「domain-semantic priorへの依存低減」に言い換え、保証できない主張を除去
- Invariant traceを \(I_7\) 専用からG全要素への semantic element trace（Present/Exposed/Reconstructed/Preserved）に一般化
- Stage 1のequivalence判定を \(M\) のみから \(M\) と \(R^{sem}\) の両方に拡張
- Stage 2の「フラットな結果」の解釈をnull result候補と測定失敗に分岐
- 次のアクションをStage順（① \(G\) schema → ② Stage 0 harness → ③ Synthetic World v0手書き → ④ probe pipeline → ⑤ Stage 0.5 → ⑥ generator化）に再整理

---

## 0. 研究の中心命題と全体構成

### 0.1 中心命題

反復的AIDDを自然に観察するだけでも、software artifactが世代とともに変化すること自体は観測できる。しかし、その変化はmodel、初期architecture、task sequence、要求文、tests、継承条件、観測条件、偶然など、多数の要因が同時に作用した結果であり、**何がtrajectoryを形成したのか**を識別できない。

したがって本研究の基本目的は、単に「AIDDを続けるとartifactがどう変わるか」を記述することではない。

> **反復的AIDDにおいて、software artifactのtrajectoryを形成するselection pressureを実験的に分解すること。**

そのため本研究では、AIDDにおける「有限context」を単一のtoken budgetとして扱わず、少なくとも次の二つの研究軸へ分解する。

1. **Inheritance / Transmission**  
   何が世代間に残るか。前世代のobservable interaction contextまで次世代へ渡るのか、artifactだけが残るのか、artifactの一部しか伝達されないのか。

2. **Observation / Retrieval**  
   残されたartifactを次世代主体がどれだけ同時に観測でき、どのように探索できるか。

世代 \(g\) の主体が持つ内部的理解・設計意図・mental modelを \(K_g\)、永続artifactを \(S_g\)、visible taskを \(T_g\)、observable tool / feedback environmentを \(E_g\)、実験系が観測・保存可能だが通常はrepositoryに含まれないinteraction recordを \(\mathcal{I}^{obs}_g\)、次世代主体が実際に保持・処理するcontextを \(C_g\) とする。\(\mathcal{I}^{obs}_g\) の全てが \(K_g\) から外在化されたものではないため、継承過程は概念的に

\[
(K_g,S_g,T_g,E_g)
\xrightarrow{\mathrm{episode\ interaction}}
(S_{g+1}, \mathcal{I}^{obs}_g)
\xrightarrow{\mathrm{inheritance\ condition}}
C_{g+1}
\longrightarrow
K_{g+1}
\]

と捉える。

ここで \(\mathcal{I}^{obs}_g\) はpaperの \(H_g\) に対応する。ただし本実験計画では、既存のhidden evaluator \(H(G)\) と記号が衝突するため別記号を用いる。

本研究が特に区別するselection pressureは二つである。

### Artifact-Externalization Pressure（以下、Externalization Pressure）

\[
\text{Observable Ephemeral Context Loss}
\rightarrow
\text{Externalization Pressure}
\]

前世代の会話・判断・tool interaction等が次世代へ自動的に残らないなら、後世に必要な意味はcode・test・type・Spec・ADR・comment等の永続artifactへ外在化されなければ生き残れない。

すなわち、

> **後世に必要な意味をartifactへ外に出せ**

という圧力である。

### Reconstruction Pressure

\[
\text{Bounded Artifact Observation}
\rightarrow
\text{Reconstruction Pressure}
\]

artifactへ情報が外在化されていても、次世代主体が一度に全artifactを保持・処理できないなら、その情報は有限な観測から再構成可能な形で存在する必要がある。

すなわち、

> **しかも少量の観測から分かる形で外に出せ**

という圧力である。

したがって本研究の中心命題は、

> **何を世代間に残せるかというinheritance constraintと、残されたartifactをどれだけ同時に観測・探索できるかというcognitive constraintは、それぞれ異なるselection pressureとしてsoftware artifactへ作用し、その構造的trajectory、および後続主体による意味的再構成可能性 \(R^{sem}\) と機能的継続可能性 \(M\) を系統的に変化させるか。**

である。

ただし、

\[
\text{adaptation} \neq \text{general quality improvement}
\]

である。特定の継承・観測条件へ適応することでsemantic localityやmodularityが高まる一方、redundancy・duplication・local optimization等が増える可能性もある。したがって本研究は「有限contextがsoftwareを良くするか」ではなく、**どの種類の有限性がどの構造的形質を選択し、その結果として \(R^{sem}\) と \(M\) をどう変えるか**を問う。


### 0.2 Stage構成の全体像

| Stage | 問い | 位置づけ |
|---|---|---|
| 0 | 世代継承ループを安定して回せるか | フィージビリティ |
| 0.5 | \(R^{sem}\), \(M\) は測定器として機能するか | 測定較正（ゲート） |
| 1 | observable history loss・exposure loss・finite working set・retrievalを機構的に分離できるか | 条件設計の診断（ゲート） |
| 2 | 5つの継承・観測条件でtrajectory差とcommon-environment差の兆候はあるか | 探索的pilot |
| 3 | 現象はprior・初期構造・task順序・model family等で説明できないか | 対立仮説の排除 |
| 4 | どのartifact構造が \(R^{sem}\), \(M\) を媒介しているか | 機序の探索 |
| 5 | 現象は統計的に再現するか | 確証的検証（事前登録） |
| 6 | 継承媒体・観測条件を操作して因果を確認できるか | 機序の因果検証 |

哲学：**What changes? → What causes the change? → Through what mechanism? → Can we control it?** の順で進む。「良いAIDDとは何か」を先に設計せず、まずtrajectoryに差があるかを確認し、その原因と機序を条件操作によって分解してから制御へ戻る。

### 0.3 各Stageのゲート判定（進行/停止条件）

| Stage | 進行条件 | 停止/差し戻し条件 |
|---|---|---|
| 0 | 世代ループが再現性をもって完走し、ログが完全取得できる | クラッシュ率が高い、ログ欠損がある場合はハーネスを修正 |
| 0.5 | dose-response curveが感度をもつ（後述4.3の判定基準） | 天井/床効果が出る場合はprobe/domainを再設計 |
| 1 | MOI / AF / EL / PR / ARの5条件が機構的に成立し、C0〜C3を対応する診断系で推定できる。MOIはfresh-agent原則を維持し、observable historyのみを追加継承できる | 条件間でシステムエラー率に極端な差がある、またはinheritance・access・working-set・retrievalが独立に操作できていない場合は条件定義を見直す |
| 2 | trajectoryに何らかの形状（単調/非単調/交差）が観察できる。フラットな場合でもStage 0.5で測定感度が確認済みならnull result候補として進行条件を満たすとみなす | 測定感度がStage 0.5で確認できていない場合のみStage 0.5へ差し戻す |
| 3 | 対立仮説（prior/architecture/sequence）で現象が消えないことを確認 | 対立仮説で説明できてしまう場合は現象の主張を修正 |
| 4 | \(R^{sem}, M\) と相関する構造的形質の候補が絞り込める | 相関が弱すぎる場合はraw dataの再分析に留める |
| 5 | 事前登録した主仮説が検証可能な検定力を持つ | 検定力不足なら条件数を絞り再設計 |
| 6 | 媒体操作によって \(R^{sem}, M\) に予測通りの変化が出る | 出ない場合は機序仮説を修正しStage 4に戻る |

---

## 1. Synthetic Software World（合成世界）の設計

### 1.1 位置づけ

ILM研究が人工言語を使うのと同じ理由で、実在GitHubリポジトリではなく、**意味のground truthが完全に既知の人工software world**を用いる。自然なAIDDを観察するだけでは、artifactが変化したことは分かっても、そのtrajectoryを形成した原因を分離できないためである。人工世界では、model・初期artifact・task・task sequence・requirements・evaluator等を可能な限り固定し、context bottleneckだけを操作できる。これにより：

- \(R^{sem}_B(S)\) を機械採点可能な形で自動生成できる
- hidden testsを ground truth から自動生成できる
- pretraining priorの混入を統制・測定できる
- 「何が変わったか」ではなく「何を変えると何が変わるか」を条件差として比較できる

Stage 0.5とStage 3で同一のgeneratorを共用する。

### 1.2 Ground truthのスキーマ

理論上の表記としては、

\[
G = (E, Q, O, D, I)
\]

- \(E\)：entities/components の集合
- \(Q\)：各entityの状態集合
- \(O\)：operations
- \(D\)：cross-entity dependencies
- \(I\)：invariants（複数entityにまたがる制約）

とするが、**実装schemaでは operation と transition rule を分離する**。理由は、semantic probeが「operationの存在」「precondition」「state transition」「invariant」「dependency」をそれぞれ独立に問う必要があり、\(O\) を分けずに持つとprobe generatorの実装が複雑化するため。実装上は次の要素とする（理論的な5要素表記との対応は取れる）。

```ts
Operation {
  id: string
  parameters: Parameter[]
}

Effect {
  entity: EntityId
  fromState: StateId
  toState: StateId
}

TransitionRule {
  operationId: string
  effects: Effect[]        // 1つ以上。複数なら複合operation（1 operationが複数entityへ同時作用）
  preconditions: Condition[]
}

Invariant {
  id: string
  encoding: "explicit" | "distributed"  // 単一guardで直接強制されるか、複数preconditionの合成で結果的に成立するか
  condition: Condition
  requires: Condition
}
```

`effects: Effect[]`とすることで、1 operationが複数entityの状態を同時に変更する複合operationを正確に表現できる（Synthetic World v0.1構築時に、単一entity限定のスキーマでは正確に表現できないtaskが発見され、v0.2でこの形式へ拡張した）。

すなわち実装schema：\(G_{\mathrm{impl}} = (E, Q, O, T, D, I)\)（\(T\) = TransitionRuleの集合）。

最小構成（Stage 0.5用）：

```yaml
language: TypeScript
entities: 5
states_per_entity: 3
operations: 8
cross_entity_dependencies: 5
invariants: 6
repository:
  loc: 500-1000
  files: 8-15
task_bank: 20
semantic_probes: 30-50
seed_architectures: 2
generated_worlds: 3
```

### 1.3 命名方式（Stage 0.5で確定済み）

Stage 0.5ではA: 完全難読化とB: 虚構語彙を比較したが、B-fictionalはrepository実装語彙とprobe語彙が断絶しており、Fullでも測定不能になることが判明した。したがって**A-obfuscatedを現行標準として確定済み**である（`docs/findings/stage0_5_findings.md` F1）。

なお、「訓練データに存在しない」ことを原理的に保証することはできないため、目的は**prior除去**ではなく、**domain-semantic priorへの依存を低減すること**と位置づける。B-fictionalはhistorical failed alternativeとして表中に残す。

| 方式 | 内容 | 想定リスク |
|---|---|---|
| A: 完全難読化 | `vok`, `zef`, `tal` 等の無意味シンボル | domain-semantic priorへの依存は強く下がるが、記憶負荷増大とcontext不足の効果を混同しうる |
| B: 虚構語彙 | ランダムまたは手続き的に生成された、既存ドメインとの対応を意図的に持たない語彙（意味の内部一貫性はある） | domain priorへの依存低減効果がAより弱い可能性 |

現行採用：**A-obfuscated**。将来別worldを生成する場合も、probe語彙とrepository実装語彙のalignment checkを必須とする。

### 1.4 Seed architecture（複数構造・同一挙動）

同一の \(G\) を、異なる構造で実装した複数バリアントを用意する。

- **Architecture A（entity-oriented）**：entityごとにディレクトリを分け、state/rules/operationsをまとめる
- **Architecture B（operation-oriented）**：operationとruleを横断的にまとめる
- **Architecture C（layered）**：domain/application/infrastructureに分割

制約：\(\text{Behavior}(A) = \text{Behavior}(B) = \text{Behavior}(C)\) だが \(\text{Structure}(A) \neq \text{Structure}(B) \neq \text{Structure}(C)\)。すべて同一のhidden testsを通過することを検証する。

### 1.5 Task bank の種類

ランダムなfeature要求ではなく、以下4種を意図的に含める。

| 種類 | 定義 | 目的 |
|---|---|---|
| Local task | 単一componentの理解のみで実装可能 | ベースライン難度 |
| Cross-cutting task | 複数component間の関係理解が必要 | dependency情報の伝達を試す |
| Delayed-dependency task | 世代 \(g\) で導入した制約が、世代 \(g+k\)（\(k\) は大きい、例：13世代後）で初めて再度必要になる | **文化的継承**そのものを試す中核task |
| Invariant-stressing task | 表面的には単純だが、過去のinvariantを知らないとregressionを起こす | 情報の選択的消失を検出する |

**Synthetic World v0.1の実装で判明した2点の追加事項：**

- **Invariantのencoding区別**：invariantは「守られているか否か」ではなく「どう符号化されているか」で少なくとも2種に分かれる。**explicit**（単一のtransition preconditionが直接この関係を強制する）と、**distributed**（どの単一preconditionも直接この関係を述べていないが、複数preconditionの合成と状態の単調性により結果として常に成立する）である。両者ともground truth自身の上で常に成立していなければならない（「破ってよいencoding」は存在しない。model checker等で事前に検証する）。ただし後者はLimited Contextの下でAIが復元困難と予想され、invariant-stressing taskの下位分類として、explicit-guard taskとdistributed-invariant taskを意図的に配分することを推奨する。
- **task typeの分類は表面的な要求と実際に必要な知識の広さが乖離しうる**：「見た目はlocal（単一entity操作の追加）だが、正解実装には他entityへの依存が必要」というtaskが実際に構築時に発生した（Synthetic World v0.1 NOTES「発見5」）。したがってtask typeのラベルは目安であり、実際の必要知識の広さは別途検証する必要がある。

#### 1.5.1 Invariant-stressing taskの位置づけ：診断のための道具であり、研究対象そのものではない（Stage 0 Phase 4を経て明確化）

Stage 0 Phase 4の実行観察から、invariant-stressing taskの位置づけを明確にしておく必要が生じた。本研究が最終的に検証したいのは、

> 世代を重ねた結果、artifactの**構造そのもの**（モジュール性、冗長性、変更の局所性、依存関係の広がり等、3.2節の副次指標）がcontext条件によってどう変化するか

であり、「特定の暗黙のルールを守れたか」という局所的な合否判定（invariant-stressing taskのtask-specific test）は、この構造的変化を**分かりやすく切り出すための診断的な道具**に過ぎない。暗黙ルールを一切含まない、ごく普通の機能追加taskだけを反復させても、ILM(Iterated Learning Model)の知見からは、冗長性の増加・命名の一貫性の崩れ・局所的で自己完結したコードへの偏り等の構造的変化が自然に観測されうると予想され、研究として十分に成立する。

一方で、invariant-stressing taskには「意味の再構成に失敗した瞬間」を明示的なイベントとして検出できるという実務的な利点がある。したがって、両者を排他的に選ぶのではなく、**目的の異なる2種類のtask bank構成**として並行運用する。

| 構成 | 内容 | 目的 |
|---|---|---|
| **構成A（primary）** | 暗黙ルールを含まない、通常の機能追加taskのみ | 3.2節の構造的副次指標の推移を、交絡なしで観察する。研究の本題 |
| **構成B（diagnostic）** | 構成Aに、explicit-guard task・distributed-invariant taskを混在させる（現行のheldout_tasks.json相当） | 「意味の再構成に失敗した」という局所的イベントを検出する。構成Aの結果を解釈する補助 |

構成Bを使う際の注意点として、**visible testの記述が、暗黙ルールの答えを直接漏らしていないかを事前に確認する必要がある**。Stage 0 Phase 4では、visible testが特定entityのinvariantを直接assertしていたため（例：`advanceZef2: fails if Tal is not 'pex'`）、AIがソースコードを読まずにテストの記述だけから正解を再構成できてしまい、Artifact-Full / bounded-context間の差が消失する事例が観測された（`docs/findings/stage0_findings.md` F5参照）。構成Bのtask bankを設計する際は、この種の「答えの漏洩」がないかをタスクごとに確認する。

Stage 2・Stage 3・Stage 4での両構成の使い分けは、それぞれの節を参照。

### 1.6 Semantic element traceの一般化（旧：Delayed-dependency taskの二重失敗モード）

\(T_3\) で invariant \(I_7\) を導入し、\(T_4 \ldots T_{15}\) では触れず、\(T_{16}\) で初めて必要になる設計を考えると、失敗には少なくとも2つの異なる原因がありうる。

- (a) \(I_7\) の情報はartifact上に残っているが、\(T_{16}\) 時点でworkerのworking contextへ入らなかった（**observation / retrievalの問題**）
- (b) 中間世代のどこかで、AIが「使われていないように見える」\(I_7\) 関連のtest/コメント/コードを削除してしまった（**媒体そのものの喪失**）

これを \(I_7\) 専用の特別扱いにせず、**ground truth \(G\) の全要素 \(x \in G\)（entity・operation・transition・dependency・invariantのいずれも）に対して一般化した semantic element trace** として追跡する。各世代 \(g\) について、可能な範囲で以下を記録する。

\(\text{Present}\) はさらに2種類に分ける。文字列/構造検索で機械的に検出できる**syntactic trace**（コメント・命名・明示的な条件分岐など、表層的に \(x\) に対応するmarkerが存在するか）と、\(x\) に対応する behavior が実際に維持されているかを**ground truthから生成したmicro-test**（\(H(G)\) の一部として保持する、極小粒度のbehavioral probe）で判定する**semantic preservation**である。両者を分けることで、「コメントとしての痕跡は消えたが挙動としては残っている」「testには残っているがcode behaviorからは失われた」といった状態を区別できる。これは Stage 4 で「情報がどの媒体（コード本体／コメント／テスト／型）へ移動したか」を分析する際の基礎データになる。

\[
\text{Present}^{\mathrm{syn}}(x, S_g) \quad \text{— } x \text{ に対応する明示的artifact marker（コード/コメント/型）が } S_g \text{ 上に存在するか}
\]
\[
\text{Present}^{\mathrm{beh}}(x, S_g) \quad \text{— } x \text{ に対応するbehavioral micro-testを } S_g \text{ が満たすか}
\]
\[
\text{Exposed}(x, C_g) \quad \text{— } x \text{ の痕跡が実際にworkerへ渡されたcontext } C_g \text{ に含まれていたか}
\]
\[
\text{Reconstructed}(x, A_g) \quad \text{— worker agentの応答 } A_g \text{（semantic probe回答等）が } x \text{ を正しく再構成できたか}
\]
\[
\text{Preserved}(x, S_{g+1}) \quad \text{— 次世代のartifact } S_{g+1} \text{ に } x \text{ の痕跡（syntactic/behavioralいずれか）が保存されたか}
\]

この段階を追跡することで、情報喪失がどの段階で起きたかを

\[
\text{artifactから消えた（syn・behとも喪失）} \;\to\; \text{artifactにはあるがcontextに入らなかった} \;\to\; \text{contextにはあったがAIが理解しなかった} \;\to\; \text{理解したが実装に反映できなかった}
\]

MOI導入後は、`Exposed(x,C_g)`だけでは \(x\) をartifactから見たのかhistoryから見たのか区別できない。そこで少なくとも、

\[
\text{Present}^{\mathrm{hist}}(x,\mathcal{I}^{obs}_{g-1})
\]
\[
\text{Exposed}^{\mathrm{artifact}}(x,C_g)
\]
\[
\text{Exposed}^{\mathrm{history}}(x,C_g)
\]

を追加し、source-aware traceとして記録する。これにより「historyには残っていたがartifactにはなく、MOIでは再構成できた」「その後artifactへ再外在化された」といった経路を追跡できる。

以上により、情報喪失・継承・再構成の経路を段階別かつsource別に特定する。3.1節のログスキーマに `semantic_element_trace` として反映する。

### 1.7 可視artifactと評価用hidden setの分離

paper本体の理論的立場（3節）では、testsもartifactの一部として世代を越えて継承される。一方、評価用のhidden regression testsをworker agentに見せてしまうと「hidden」ではなくなり、評価が汚染される。したがって両者を明確に分離する。

\[
S_g = \{\text{code},\ \text{visible tests},\ \text{types},\ \text{specs},\ \text{comments},\ \ldots\}
\]

を**継承媒体としてのrepository**（worker agentに見える、次世代へ継承されうる）とし、これとは別に評価環境側で

\[
H(G) = \{\text{hidden regression tests}\}
\]

を保持する。\(H(G)\) はrepository外部（評価ハーネス側）に固定的に保管し、worker agentには一切露出しない。ground truth \(G\) との behavioral fidelity を独立に検査するためだけに用いる。

この区別は測定の健全性だけでなく、**Stage 6の条件設計（Code only / Code + Tests / Code + Tests + Spec / Code + Tests + ADR）にも必須**である。Stage 6で言う「Tests」とは \(S_g\) に含まれる visible tests を指し、評価用の \(H(G)\) とは別物である。この2つを混同すると、Stage 6の「継承媒体としてのtests」の効果測定と、全条件で共通して使う評価基準としての hidden tests が区別できなくなる。

### 1.8 Task sequenceの生成方式

単純なLatin squareではなく、**依存関係付き順列（partial order + counterbalanced topological sort）** を用いる。

1. task間に必須の前提関係がある場合、partial order \(T_A \prec T_B\) を定義する
2. このpartial orderを満たす複数のtopological orderを生成する
3. 生成された合法なsequence間でcounterbalanceする

Stage 5では、task sequenceを独立変数として明示的にモデルへ含める（3.2節参照）。

### 1.9 要求の質の統制（本研究が操作しない変数）

本研究がcontext bottleneckとして操作するのは、**過去に継承されるartifact（コード・テスト・型・コメント等）に対するexposure・working-context・retrieval条件の強さと形**である。これに対し、各世代でAIへ提示される新規要求（held-out taskの`visibleInstruction`）そのものの詳細度・明確さは、本研究が操作する変数ではない。

この区別は、Stage 0のPhase 4実行観察から必要性が明確になった。AIが新しいoperationを実装する際、既存のdistributed invariant（複数のtransitionにまたがる暗黙の制約）を壊さないという条件を、`visibleInstruction`が明示していない場合に見落とす事例が複数回観測された（`docs/findings/stage0_findings.md` F1, F2参照）。この観測結果は、有限context下での意味的再構成可能性を検証する上で重要な交絡因子を示唆する：観測される失敗が

> (a) 過去のartifactから間接的な制約を読み取れなかったことに起因するのか
> (b) 単に今回の要求文が、守るべき制約について何も述べていなかったことに起因するのか

を区別できなければ、本研究の中心的主張（有限context下でのartifact adaptation）を誤って強める、あるいは弱める可能性がある。

**方針**：

- 全held-out taskの`visibleInstruction`は、**統一されたスタイル**（簡潔な1〜2文、既存の制約への言及を含まない）に統制し、独立変数として操作しない。現在の`heldout_tasks.json`の記述は既にこのスタイルに従っているが、今後task bankを拡張する際もこのスタイルを維持する。
- ただし、この統制が本研究の主張を歪めていないかを確認するため、Stage 3（対立仮説の排除）に、要求文の詳細度に関する頑健性チェックを追加する（4節 Stage 3参照）。
- 要求文の詳細度そのものを独立変数として体系的に操作する研究（要求工学・prompt設計としての研究）は、本研究の範囲外とする。理論的位置づけは`docs/aidd_ilm_paper.md`5.3節・8.6節を参照。

---

## 2. Context / Inheritance条件の定義

### 2.1 五条件は一本の「Full→Limited」序列ではない

五条件は、単純に制約が弱い順から強い順へ並ぶ一つの軸ではない。

本研究では、二つの研究軸をArtifact-Fullで接続する。

#### Axis A：Inheritance / Transmission

\[
\text{MOI}
\rightarrow
\text{Artifact-Full}
\rightarrow
\text{Exposure-Limited}
\]

これは**何が世代間に残るか**を操作する。

#### Axis B：Observation / Retrieval

\[
\text{Artifact-Full}
\rightarrow
\text{Privileged-Retrieved}
\rightarrow
\text{Agent-Retrieved}
\]

これは**残されたartifactを次世代主体がどのように観測・探索できるか**を操作する。

Artifact-Fullは両軸を接続するhub conditionである。

### 2.2 五条件

| 条件 | 世代間に継承するもの | Artifact access | Working context | 情報選択 | 主に操作するもの |
|---|---|---|---|---|---|
| **Maximal Observable Inheritance（MOI）** | artifact + 直前世代のobservable interaction record \(\mathcal{I}^{obs}_g\) | 全体 | 追加的な人工制限なし | 不要 | observable ephemeral contextの継承 |
| **Artifact-Full（AF）** | artifactのみ | 全体 | 追加的な人工制限なし | 不要 | artifact-only inheritance baseline / hub |
| **Exposure-Limited（EL）** | artifactの選択subsetのみ | 提示subsetのみ | static exposure budget \(B_{expose}\) | privileged static selector | 不可逆なartifact exposure loss |
| **Privileged-Retrieved Limited（PR）** | artifactのみ | 全体へ再アクセス可能 | \(B_{work}\) | privileged retrieval controller | finite working cognition |
| **Agent-Retrieved Limited（AR）** | artifactのみ | 全体へ再アクセス可能 | \(B_{work}\) | worker agent自身 | retrieval / information selection |

**全条件でfresh agentを使用する。**  
MOIも同一sessionの継続ではない。世代 \(g+1\) では新しいagent instanceを開始し、そこへ \(S_{g+1}\) と \(\mathcal{I}^{obs}_g\) を入力として与える。

### 2.3 MOIで継承するobservable interaction record

\(\mathcal{I}^{obs}_g\) に含める候補は、実験系が実際に観測・保存できたものだけとする。

- generation \(g\) のvisible task instruction
- observable agent response
- tool calls / tool results
- agentが明示的に出力したworking note / scratch note
- applied diff
- agentへ実際に返されたfeedback

含めないもの：

- model hidden state
- 非出力の内部表象
- private chain-of-thought
- workerに見せていないGround Truth
- hidden evaluator output
- evaluator内部の診断情報

したがってMOIは「完全なcontext継承」ではない。

> **実験系が観測可能な情報についてのMaximal Observableな上限条件**

であり、古典ILMのFull-transmission controlへの操作的近似と位置づける。

また、主実験では全過去世代

\[
\mathcal{I}^{obs}_1+\cdots+\mathcal{I}^{obs}_g
\]

を無制限に累積しない。原則として**直前世代の \(\mathcal{I}^{obs}_g\)** のみを継承する。

理由：

- history量がgenerationに比例して増えることを避ける
- context-window saturationを別の独立変数にしない
- lost-in-the-middleをMOI固有の交絡にしない
- 世代間伝達というILM的単位を維持する

一世代の \(\mathcal{I}^{obs}_g\) は、agent output・tool count・feedback schema等の共通上限によりoperation上boundedに保つ。

また、MOI historyには非artifact的なrationaleだけでなく、tool resultとして取得したrepository断片やapplied diffのような**artifact-redundant information**も含まれうる。したがって各history itemにはsource categoryを付与し、少なくとも次を区別する。

- `ephemeral-rationale`：working note、設計理由等
- `task-feedback`：task instruction、visible feedback
- `artifact-redundant`：tool result中のrepository断片等
- `mutation-metadata`：diff / applied change metadata

これにより、MOI効果が非artifact文脈の継承によるものか、artifactの再提示・salienceによるものかをStage 3のhistory ablationで分離できるようにする。

### 2.4 Artifact-Full

Artifact-Fullでは、

- 前世代の \(\mathcal{I}^{obs}_g\) は継承しない
- repository内の永続artifactだけを継承する
- artifact自体には追加的なaccess制限やworking-set制限を課さない

したがって、

\[
fresh\ Agent_{g+1}
\leftarrow
S_{g+1}
\]

となる。

これは「完全な世界」ではない。前世代のobservable ephemeral contextも、非observableな内部状態も失われる。

Artifact-Full / MOIが操作的にFullであり続けるには、各世代で全repository（MOIでは加えて直前history）がmodel contextへ実際に収まらなければならない。したがって、

\[
tokens(S_g)
+ tokens(\mathcal{I}^{obs}_{g-1})_{\mathrm{MOI}}
+ fixed\ overhead
+ reserved\ output
< context\ capacity
\]

を**Operational-Full feasibility invariant**として全世代で監視する。超過時のsilent truncationは禁止し、事前に定めたstop / censoring / world-size redesign規則を適用する。

一方でAFは、

- MOIとの差からobservable-history availabilityを測る
- PRとの差からworking-set effectを測る

ための共通baselineであり、本研究のhub conditionとなる。

### 2.5 EL / PR / ARの観測制約

#### Exposure-Limited（EL）

episode開始時にprivileged static selectorが \(B_{work}\) 相当のartifact subsetを選択する。

workerは提示されなかったartifactへepisode中アクセスできない。

これは古典ILMのfinite-transmission conditionに最も近い人工的な不可逆exposure制限である。

#### Privileged-Retrieved Limited（PR）

artifact全体へのaccess可能性を保持したまま、ある時点のworking contextを

\[
|W_t| \le B_{work}
\]

に制限する。

次に何を見るかはprivileged retrieval controllerが決定する。

#### Agent-Retrieved Limited（AR）

artifact全体へのaccess可能性、\(B_{work}\)、exploration resourceはPRと同じ。

違いは、何を検索・読み取り・再取得するかをworker agent自身が決定する点だけである。

PR / ARでは、

- 新しい情報取得時に古い情報をevictできる
- evictされた情報を再取得できる
- explicit summary / working memoryも \(B_{work}\) に算入
- private chain-of-thoughtは保存・計数対象にしない

### 2.6 主要contrast

#### C0：Observable-history availability

\[
D_{history}
=
Outcome_{MOI}
-
Outcome_{AF}
\]

MOIとAFの違いは、直前世代のobservable interaction recordを次世代へ追加継承するかどうかである。

ただし、この**短期performance差だけをExternalization Pressureの証拠とはみなさない**。

C0の短期差が示すのは、

> observable historyがその次のtaskにどの程度直接役立つか

である。

Externalization Pressureの証拠には、Stage 2以降で

- MOI-grown lineageとAF-grown lineageのartifact trajectory差
- test/type/spec/interface等への情報外在化差
- common-environment evaluationでのartifact-only性能差

を組み合わせる必要がある。

#### C1：Working-set / Reconstruction effect

\[
D_{work}
=
Outcome_{AF}
-
Outcome_{PR}
\]

AFとPRはartifact-only inheritanceとfull repository availabilityを共有する。C1をworking-set effectへ寄せるため、**model-call上限、decision round、retry / repair opportunity、common prompt protocolを可能な限り同一にする**。PRではさらにprivileged controllerがrelevant evidenceを選択するため、残る差は厳密なpure working-set effectではなく、**best-case privileged bounded-observation effect**として解釈する。

#### C2：Retrieval-policy effect

\[
D_{retrieval}
=
Outcome_{PR}
-
Outcome_{AR}
\]

PRとARはartifact-only inheritance、full repository access、同一 \(B_{work}\)、同一exploration resourceを共有する。

#### C3：Recoverability / Exposure effect

\[
D_{recoverability}
=
Outcome_{PR}
-
Outcome_{EL}
\]

ELは提示されなかったartifactを後から取得できず、PRはartifact全体へ再アクセス可能である。なおELの \(B_{expose}\) はepisode全体で利用可能なartifact pool上限、PRの \(B_{work}\) は同時保持量であり同じ量ではない。PRはepisode全体では \(B_{work}\) を超えるunique artifactを観測できるため、C3はrecoverabilityに加えて**cumulative exposure possibility**も含むcompound contrastであり、pure one-factor contrastとは扱わない。

### 2.7 古典ILMとの対応

補助contrastとして、

\[
Outcome_{MOI}
-
Outcome_{EL}
\]

を保存する。

これは古典ILMにおける

\[
\text{Full transmission}
\quad vs \quad
\text{Bottlenecked transmission}
\]

への最も近い操作的比較である。

ただし、MOIはtrue full transmissionではなく、複数の機構差を同時に含むため、**C0〜C3のような因果分解contrastとしては扱わない**。ILMとの概念的対応を示すsecondary contrastとする。

### 2.8 Working-set budgetとExploration resource

bounded observation条件では、単一のtoken budget \(B\) に異なる資源を混ぜない。

\[
B_{work}
\]

：ある時点で保持できるartifact-derived evidence + explicit persistent memoryの上限。

\[
E_{max}
\]

：episodeあたりの探索・計算資源上限。

候補：

- max retrieval turns
- max tool calls
- max API calls
- max wall time

PR / ARで \(E_{max}\) を揃える。

さらに、PR / ARでworking-setからevictしたartifact evidenceがprovider側の会話履歴に残ると、実際のmodelはそれを参照できてしまう。したがって各reasoning stepは**stateless request**として、current \(W_t\) + bounded explicit memory + current taskから入力を再構築する。provider thread、`previous_response_id`、暗黙のmessage history等によってevicted artifact evidenceを保持してはならない。

ELはstatic subsetのためretrieval \(E\) は使用しないが、agent generation側の出力・時間上限は他条件と合わせる。

### 2.9 Privileged Selector / Controller

Privileged条件は現実的retrieverではなくdiagnostic upper boundとして扱う。

利用可能なevaluator-side signal：

- GroundTruthDeltaが触れるentity
- current \(G_g\) のsemantic locality
- dependency graph distance
- type definitions
- fixed WorldProtocol
- leakage検査済みvisible tests
- source-level reference relation
- Stage 1C以降では直近変更履歴

Ground Truthそのものをworkerへ露出してはならない。

ELとPRのrelevance policyは可能な限り共通化し、C3の差をrecoverabilityへ寄せる。

### 2.10 世代の定義

すべてのgeneration・すべての条件で**新規session・新規agent instance**を開始する。

主体の連続性を独立変数にしない。

条件差は、fresh agentへ何を入力として継承するか、artifactをどのように観測できるかのみで作る。

**固定されるもの**：

- WorldProtocol
- model / model settings
- task instruction style
- context / inheritance conditionのルール
- evaluator
- hidden情報の境界
- logging schema

**世代ごとに変わるもの**：

- task \(T_g\)
- correct world \(G_g\)
- hidden evaluator \(H(G_g)\)
- artifact \(S_g\)
- observable interaction record \(\mathcal{I}^{obs}_g\)

実験は引き続き、

\[
G_g \xrightarrow{T_g} G_{g+1}
\]

\[
S_g \xrightarrow{AI(T_g)} S_{g+1}
\]

の二trajectoryを並走させ、各世代で

\[
S_{g+1} \models G_{g+1}
\]

を外部評価する。

---

## 3. ログ・測定設計

### 3.1 Raw trajectory ログスキーマ（Stage 0から全世代で保存）

```text
experiment_id
lineage_id
generation
condition                  # MOI / Artifact-Full / Exposure-Limited / Privileged-Retrieved / Agent-Retrieved
model
seed_architecture
task_sequence_id
task_id

repository_before           # 完全snapshot
repository_after             # 完全snapshot
git_diff

inheritance_mode             # maximal-observable / artifact-only / exposure-limited
observable_history_inherited   # MOIのみ。実際に継承した I^obs_{g-1}
observable_history_tokens
observable_history_schema_version
observable_history_source_breakdown # ephemeral/task-feedback/artifact-redundant/mutation-metadata
operational_full_feasible       # AF/MOIが全入力を無truncateで収容できたか
exposure_budget                 # ELの B_expose
working_set_budget            # bounded observation条件の B_work
exploration_budget              # bounded条件の E_max
working_set_peak_tokens         # 実際の最大同時保持量
context_contents               # workerに実際に提示された内容
retrieval_queries              # PR/AR
retrieved_artifact_units
evicted_artifact_units
explicit_working_memory
unique_observed_tokens
total_retrieved_tokens
retrieval_count
eviction_count
context_churn

agent_prompt
agent_response
tool_calls
observable_interaction_record   # generation g が次世代へ継承可能な I^obs_g
explicit_working_note

semantic_probe_results          # R^{sem}(S;e) / R_c^{sem}(S) 算出用
hidden_test_results               # M(S;e) / M_c(S) 算出用。H(G) はworker agentへ非露出、評価ハーネス側でのみ実行・記録する（1.7節）
functional_task_result

semantic_element_trace           # 1.6節：Present^syn/Present^beh/Present^hist/Exposed^artifact/Exposed^history/Reconstructed/Preserved のsource-aware trace

latency
token_usage
cost
```

原則：「許可されたcontext量」ではなく「AIが実際に何を見たか」を完全に残す。副次指標（構造的形質）はStage 4まで分析を後回しにしてよいが、**データ自体は最初から失わず保存する**。

### 3.2 主要指標・副次指標

以降、五条件を横断する評価量はevaluation environment \(e\) またはcondition \(c\) でindexする。\(M(S;e)\) / \(M_c(S)\) は潜在的な真の成功確率（\(P(\text{future modification succeeds} \mid S,e)\)）、\(\hat{M}(S;e)\) / \(\hat M_c(S)\) はheld-out task set \(\mathcal{T}_{\text{heldout}}\) から得る経験的推定量（4.1節 Stage 0.5の式）として区別する。同様に \(R^{sem}(S;e)\) / \(R_c^{sem}(S)\) は理論量、実際にsemantic probeから得る値は \(\hat{R}^{sem}(S;e)\) / \(\hat R_c^{sem}(S)\) と表記する。以下の指標定義は理論量で記すが、実測はすべて推定量（\(\hat M_c, \hat R^{sem}_c\)）であることに注意する。統計モデル（4.1節 Stage 5）でも観測値は常に推定量として扱う。

本研究では \(R^{sem}\) と \(M\) を一般的なsoftware quality全体とはみなさない。反復的に継承されるartifactとしての**継承品質（inheritance quality）**を、

\[
Q(S;e)
=
\left(
R^{sem}(S;e),
M(S;e)
\right)
\]

または簡潔に \(Q_c(S)=(R_c^{sem}(S),M_c(S))\) とする。

この二次元量を単一スコアへ潰さず、両軸の組み合わせを解釈する。

例えば、

- \(R^{sem}\uparrow,\ M\uparrow\)：意味を再構成しやすく、変更も成功しやすい
- \(R^{sem}\uparrow,\ M\rightarrow\)：理解しやすさは上がったが、変更成功にはまだ反映されていない
- \(R^{sem}\downarrow,\ M\uparrow\)：全体意味の明示的再構成が弱くても、type/test/local pattern等によって変更しやすくなった可能性

を区別できる。

**主要指標（primary outcome）**
- \(M(S;e)\) / \(M_c(S)\)：指定inheritance / observation環境のもとでの機能的継続可能性（隠しテストを回帰なく通す確率）。実測は \(\hat M_c(S)\)
- \(R^{sem}(S;e)\) / \(R_c^{sem}(S)\)：意味的再構成可能性（semantic probeの正答率。変更タスクの成否とは独立に測定）
- 累積的な隠しテスト保持率
- 目標成功確率に到達するための最小working-context量、または必要観測量

**副次指標（secondary outcome・構造的形質の候補、Stage 4で分析）**
- 構造的劣化・複雑性の集中度
- 冗長性・重複度
- 変更の局所性（change locality）
- 依存関係の広がり（dependency breadth）
- Spec・テスト・型への情報外在化率
- successful modificationに必要なretrieval量・working-set churn・最小 \(B_{work}\)
- **表面的局所性と意味的局所性の乖離度**：\(\text{Local}_{\text{surface}}(T)\)（visibleInstructionおよびGroundTruthDelta \(\Delta\) が直接言及するentityの集合）と \(\text{Local}_{\text{semantic}}(T)\)（正しく変更するために実際にどこまでsystemを理解する必要があるか）の乖離。**\(\text{Local}_{\text{semantic}}\) は \(\Delta\) 単体からではなく、\((G_g + \Delta_g)\) 全体のdependency/invariantグラフをsurface localityの起点entityからBFSで辿ることで機械的に算出する**（\(\Delta\) 自体には現れない既存のdistributed invariantやdependency連鎖まで理解が必要な場合があるため）。task typeラベル（local/cross_cutting等）は表面的な分類であり、実際に必要な知識の広さと乖離しうることがSynthetic World v0.1〜v0.3の構築過程で確認された（見た目はlocalなtaskの正解実装に他entityへの依存が必要だったケース。v0.3で乖離度を実測：\(\text{divergence} = |\text{semantic}| - |\text{surface}|\) が1〜2の範囲で複数taskに実在することを確認）。この乖離度と \(R^{sem}_c, M_c\) の関係を見ることで、Limited Context下で特に困難になるtaskの性質を特定できる可能性がある。

### 3.3 Semantic probeの形式（機械採点可能）

ground truth \(G\) から自動生成する。LLM Judgeに依存しない形式を優先する。

```text
multiple choice        （例：ある状態である entity に許可される operation はどれか）
boolean                （例：この変更は invariant I_k を破るか）
set selection           （例：影響を受ける entity をすべて選べ）
graph edge prediction     （例：この operation が依存する entity を選べ）
state transition prediction （例：この operation 実行後の状態はどれか）
```

---

## 4. Stage別詳細計画

### Stage 0：Harness Feasibility

- 目的：世代継承ループ（fresh session → artifact読込 → 変更 → テスト → 保存）を安定して回せるか
- 条件：Full vs 単純Limited（3条件の区別はまだしない）
- 規模：5〜10世代、1モデル、1 toy repo（合成domainである必要はまだない）
- 判定：クラッシュなく完走し、3.1節のログが欠損なく取得できること。研究上の結論は出さない。

**ゲート達成（2026-09-05）**：Full・simple-limited 両条件とも5世代クラッシュなく完走し、verify-logs --all で全83世代のログが欠損なくOKを確認。visible 7/7・hidden 10/10が全世代で維持。task_specific_test_resultも正常（T-local-1は2/3、他3taskは3/3。T-local-1の2/3は後続世代で修正されたわけではなく、2/3のまま）。参照ログ: `stage0-real-001__2026-09-05_06-25-28`（full）、`stage0-real-limited-001__2026-09-05_06-27-32`（simple-limited）。

### Stage 0.5：Measurement Calibration

- 目的：\(R^{sem}_B\) と \(M_B\) が測定器として機能するかを確認する
- **v2.0での位置づけ**：Stage 0.5で較正済みのstatic budget条件は、現在の用語では主としてExposure-Limited / static transmission型の較正に相当する。既存結果はhistorical calibrationとして保持するが、PR/ARのbounded working-set条件やMOIへそのまま転用しない。Stage 1事前準備でmodel移行後の再較正、balanced boolean probe、working-set dose-response、MOI history serialization preflightを追加する。
- **設計上の注意**：固定完成系に対してそのままhidden testsを実行しても、それは既存機能の保持を確認しているに過ぎず、\(M_B(S)\)（機能的継続可能性＝*変更タスク*の成功確率）を測ったことにはならない。\(R^{sem}_B\) と \(M_B\) は独立した2系統の測定として設計する。
- **前提条件（必須）**：\(S\) の元となる ground truth \(G\) 自体が自己無矛盾であること（\(S \models G\) が原理的に成立可能であること）を、held-out taskの \(\text{GroundTruthDelta}\) を含めて事前に機械検証する。具体的には、初期状態からの到達可能な全状態でinvariantが成立するかをBFS等で確認するmodel checkerを用い、\(G\) 本体だけでなく各held-out taskの \(G_g \to G_{g+1}\) delta適用後の世界についても検証する。Synthetic World v0の構築時、この検証によってground truth設計自体のバグ（明示的guardのないinvariantが実際に破られる到達可能状態、およびtask deltaがinvariantを壊すケース）が実際に検出された。この手順を経ずに次段階へ進まない。
- 手順：
  1. 合成世界を1 world・1 architectureのみでまず構築（generatorを最初から汎用化しない）
  2. 世代進化はさせず、**固定完成系** \(S\) に対してcontext budgetを段階的に変化させる：\(B \in \{0, 1K, 2K, 4K, 8K, \text{Full}\}\)
  3. **系統1（意味的再構成）**：fresh agentへ \(S\) をbudget \(B\) で提示し、semantic probeを実施して \(R_B^{sem}(S)\) を測定、dose-response curveを描く
  4. **系統2（機能的継続）**：\(M_B(S)\) は成功確率であり、単一taskの1試行では \(0/1\) しか得られず確率の推定にならない。したがって held-out modification **task set** \(\mathcal{T}_{\text{heldout}} = \{T_1, \ldots, T_k\}\)（Stage 0.5では \(k=5\text{〜}10\) 程度で十分）を用意し、各 \(T_i\) について別のfresh agentへ \(S\) をbudget \(B\) で提示して実施する。task-specific testと既存のhidden regression testsを実行し、

     \[
     \hat{M}_B(S) = \frac{\sum_{T \in \mathcal{T}_{\text{heldout}}} \mathbf{1}[\text{success}(S, T, B)]}{|\mathcal{T}_{\text{heldout}}|}
     \]

     として推定する。sampling varianceも見たい場合は同一taskを複数回試行する選択肢もある。系統1と系統2は同一世代内では独立したfresh agentで実施し、系統1の応答が系統2に影響しないようにする
  5. 命名方式A/B（1.3節）を両系統で並行実施し比較する
  6. \(R^{sem}_B(S)\) と \(M_B(S)\) の相関を見る。「理解できたが変更できなかった」（\(R^{sem}\uparrow, M\downarrow\)）、「理解できなかったが偶然テストを通した」（\(R^{sem}\downarrow, M\uparrow\)）のパターンが出るかを確認する

#### 4.3 dose-response curveの判定基準

| パターン | 解釈 | 対応 |
|---|---|---|
| \(B=0\) でも高得点 | LLM priorのみで解けている | domain/probeを再設計（命名方式Aへ、またはより難読化） |
| 少量budgetで即100% | probeが簡単すぎる（天井効果） | probeを高難度化 |
| Fullでも低得点 | probe/domainが難しすぎる、または測定方法に不備 | 較正パラメータを見直し |
| budgetに応じ滑らかに改善 | 測定器として使用可能 | Stage 1へ進行 |

成功基準は「高得点」ではなく**測定感度**があること。

**ゲート達成（2026-09-07）**：全20タスク・6段階budget（B∈{0, 1K, 2K, 4K, 8K, Full}）の較正ラン完了。
System1（R^sem_B、boolean主指標）: 0.50 → 0.58 → 1.00 の単調増加（B≥2Kで飽和）。
System2（M̂_B、20タスク）: 0.00 → 0.05 → 0.70（B≥2Kでプラトー）。
dose-response curveは「budgetに応じ滑らかに改善」パターンを満たし、測定器として機能することを確認。
参照ログ: `runs/stage0_5/stage0_5-alltask-anthropic-claude-haiku-4-5-20251001__2026-09-07T08-25-10/`
参照文書: `docs/stage0_5_plan.md`、`docs/findings/stage0_5_findings.md`（F1〜F10）

### Stage 1：Inheritance / Context Decomposition

**目的**：5条件をlongitudinalに走らせる前に、各条件が意図したmechanismだけを操作できていることを診断する。

重要：MOIは「固定artifactに対するcontext量」の条件ではなく、**世代間に何を継承するかというinheritance condition**である。したがってAF/EL/PR/ARと全く同じFixed-\(S_0\) experimentへ形式的に並べない。

Stage 1は三つに分ける。

#### Stage 1A：Fixed-S Observation Decomposition

同一の完成artifact \(S_0\) に対して、次の4条件を比較する。

- Artifact-Full（AF）
- Exposure-Limited（EL）
- Privileged-Retrieved Limited（PR）
- Agent-Retrieved Limited（AR）

同一probe set・held-out task set・model settingsを使い、

\[
\hat R^{sem}_c(S_0),
\qquad
\hat M_c(S_0)
\]

を測定する。

primary contrast：

\[
D_{work}=Outcome_{AF}-Outcome_{PR}
\]

\[
D_{retrieval}=Outcome_{PR}-Outcome_{AR}
\]

\[
D_{recoverability}=Outcome_{PR}-Outcome_{EL}
\]

目的はC1〜C3をmechanistically cleanに較正することであり、trajectoryの結論は出さない。

#### Stage 1B：One-Step Inheritance Diagnostic（MOI vs AF）

MOIを診断するため、標準化されたpredecessor episodeを用意する。

1. 共通の \(S_{pre}\) と task \(T_{pre}\) からgeneration \(g\) を一度実行する
2. その結果として、同一の
   - artifact \(S_{g+1}\)
   - observable interaction record \(\mathcal{I}^{obs}_g\)
   を固定する
3. 次task \(T_{next}\) に対してfresh agentを2群用意する
4. MOI群には
   \[
   (S_{g+1},\mathcal{I}^{obs}_g)
   \]
   を渡す
5. AF群には
   \[
   S_{g+1}
   \]
   のみを渡す
6. repository access、model、task、output budget等は同一にする

これにより、

\[
D_{history}^{immediate}
=
Outcome_{MOI}
-
Outcome_{AF}
\]

を測定する。

ここで測るのは**observable historyの直接的有用性**であり、Externalization Pressureそのものではない。

Externalization Pressureはlongitudinal selection effectなので、Stage 2以降でMOI/AFのartifact trajectoryとcommon-environment evaluationを使って判断する。

Stage 1Bでは複数のpredecessor episode / next-task pairを用意し、特定の1 historyに依存しないことを確認する。

さらに、入力token増加やsection配置だけの効果を診断するため、longitudinal conditionとは別の**Stage 1B限定sham-history control**を置く。MOIと同程度のtoken量を持つがnext taskには無関係な別episodeのhistoryを渡し、

\[
MOI_{real},\quad MOI_{sham},\quad AF
\]

を比較する。これは第6のlineage条件ではなく、C0の解釈を補助するplacebo diagnosticである。

#### Stage 1C：Five-Condition Iterated Integration Run

5条件それぞれ10〜15世代を実行する。

- MOI
- AF
- EL
- PR
- AR

目的は科学的trajectory結論ではなく、次を同一longitudinal harness上で安定動作させること。

- fresh agent原則
- \(\mathcal{I}^{obs}_g\) の生成・serialization・次世代継承
- artifact-only inheritance
- EL static exposure
- PR/AR working-set paging
- cumulative \(G_g/H(G_g)\)
- repository snapshot / diff
- retrieval / eviction raw logs
- history inheritance logs
- provider/model/cost provenance

Stage 1Cでは10〜15世代の形状からartifact adaptationを主張しない。

#### Stage 1事前準備で必要な修正

Stage 0 / 0.5の既存成果は破棄しない。以下をPre-Stage 1として追加する。

1. **理論・文書同期**
   - `docs/aidd_ilm_paper.md`
   - `docs/experiment_plan.md`
   - `docs/stage1_plan.md`
   - methodology findings

2. **Model/API migration**
   - Stage 0/0.5の既存model runはhistorical baselineとして保持
   - Stage 1 primary modelをfreeze
   - tool use / structured output / usage logging
   - independent-request batch path
   - model変更後に測定器を再較正

3. **Observable Interaction Record**
   - \(\mathcal{I}^{obs}_g\) schema
   - serialization
   - history token accounting
   - visible/hidden境界
   - 直前世代のみ継承するルール
   - MOI prompt assembly
   - history leakage audit

4. **測定器修正**
   - balanced boolean probes
   - constant-answer baseline
   - canonical token counter
   - ArtifactUnit / chunk retrieval

5. **Working-set runtime**
   - ELの \(B_{expose}\) はepisode全体のstatic exposure pool
   - PR/ARの \(B_{work}\) は同時保持量
   - evict / re-read
   - bounded explicit memory
   - deterministic eviction
   - stateless per-step request reconstruction（provider-side historyでevictionを迂回しない）
   - AF/PR/ARのdecision opportunityを可能な限り揃える
   - \(E_{max}\) 分離

6. **Repository access / isolation**
   - provider-neutral RepositoryAccessor
   - `list_files`, `search`, `read_file_chunk`
   - Ground Truth / hidden evaluator / logsへのaccess禁止
   - path traversal / symlink / write escape防止

7. **Longitudinal evaluator**
   - current taskだけでなく過去task-specific semanticsを累積評価
   - 最低限 \(H(G_0)\) + \(T_1...T_g\) のtask-specific tests
   - 将来はcurrent \(G_g\) からdynamic hidden evaluator生成

8. **ログ拡張**
   - inherited history
   - generated interaction record
   - working-set before/after
   - retrieved / evicted units
   - explicit memory
   - unique / total observed tokens
   - retrieval / eviction count
   - API usage / actual cost

#### Stage 1のゲート

- 5条件すべてがfresh-agent原則を保って動く
- MOIで同一session continuationが混入していない
- \(\mathcal{I}^{obs}\) にhidden情報が混入していない
- Stage 1AでC1〜C3を推定可能
- Stage 1BでC0のimmediate history utilityを推定可能
- PR/ARでfull artifactへ再アクセス可能
- PR/ARのevicted evidenceがprovider-side historyから再参照不能
- AF/PR/ARのmodel-call / decision opportunity差が事前規則内
- ELの \(B_{expose}\) とPR/ARの \(B_{work}\) を別resourceとしてlog
- AF/MOIでOperational-Full feasibility invariant成立
- \(B_{work}\), \(E_{max}\), MOI history schemaがfreeze
- equivalence / uncertainty methodがfreeze
- Stage 1Cの5条件longitudinal harnessが安定

Stage 1の結果だけを理由に、短期差が小さい条件を安易にStage 2から削除しない。主仮説はlongitudinal selection effectであり、短期performance equivalenceはtrajectory equivalenceを意味しない。

---


### Stage 2：Longitudinal Pilot

**目的**：5つのinheritance / observation conditionが、反復を通じてartifact trajectoryへ異なるselection pressureを与える兆候があるかを探索する。

原則としてStage 2 pilotでは5条件を保持する。

- MOI
- Artifact-Full
- Exposure-Limited
- Privileged-Retrieved
- Agent-Retrieved

Stage 1で短期差がなかったという理由だけでは条件を落とさない。artifact adaptationは反復によって初めて現れる可能性があるためである。

- 規模：30〜50世代、各条件2〜3 lineageを基本とする
- 統計的確証は行わず、trajectory形状・effect sign・測定可能性を探索する
- task bank構成A（通常task）をprimary、構成B（invariant-stressing含む）をdiagnosticとして並行運用する
- \(R^{sem}\), \(M\), cumulative hidden preservationに加え、構造的副次指標を保存する
- MOIでは各世代の \(\mathcal{I}^{obs}_g\) を保存し、次世代へ直前一世代分のみ継承する

#### Stage 2A：Selection trajectory

特に次を比較する。

##### Artifact-Externalization Pressure

MOI vs AFで、

- testへの意味移動
- typeへの制約移動
- interface contractの明示
- namingの説明性
- Spec / ADR / commentへの理由の外在化
- artifact-onlyでのsemantic reconstructability

のtrajectoryに系統差が生じるかを見る。

Stage 2開始前に、semantic elementごとのencoding medium（code/test/type/spec/comment/interface等）と媒体別externalization coverageの算出規則をfreezeし、post-hocな印象評価だけに依存しない。

MOIではhistoryが補助記憶として残るため、artifactへ情報を刻む圧力が弱まる可能性がある。

AFではhistoryが失われるため、次世代に必要な意味をartifactへ残す圧力が強まる可能性がある。

##### Reconstruction Pressure

AF vs PR / ARで、

- semantic locality
- dependency breadth
- local self-containment
- interface discoverability
- minimal \(B_{work}\) required for success
- retrieval / context churn

のtrajectoryに差が生じるかを見る。

##### Irrecoverable Exposure

EL vs PRで、不可逆なstatic exposure poolと、再取得可能なfinite working setという異なる情報環境がtrajectoryを変えるかを見る。C3はrecoverabilityだけでなくcumulative exposure possibilityも含むcompound contrastとして解釈する。

#### Stage 2B：Common-Environment Evaluation

各lineageを育てた環境と、最終artifact自体の性質を分離するため、定期checkpointまたは最終世代でcommon-environment evaluationを行う。

例：

\[
S^{MOI}_g,\;
S^{AF}_g,\;
S^{EL}_g,\;
S^{PR}_g,\;
S^{AR}_g
\]

をすべて同じ

\[
fresh\ agent
+
artifact\ only
+
fixed\ evaluation\ observation\ condition
\]

へ投入する。

少なくとも一つの共通環境は**Artifact-Full evaluation**とする。

必要に応じて、共通のfinite \(B_{work}\) 環境でも再評価する。

さらにcondition-specific adaptationを検査するため、Stage 2では主要contrastごとに**reciprocal evaluation**を行う。全5×5を必須とはしないが、少なくとも以下を候補とする。

- MOI-grown / AF-grown artifact → 共通AF environment
- AF-grown / PR-grown artifact → AF environment + PR environment
- PR-grown / EL-grown artifact → PR environment + EL environment
- PR-grown / AR-grown artifact → PR environment + AR environment

これにより「一般に良いartifact」と「特定の継承・観測環境へ適応したartifact」を分離する。

これにより、

> lineageが自分の育った条件でその場だけ有利なのか

と、

> その履歴によってartifactそのものが別条件でも継承しやすい構造へ変化したのか

を区別する。

特にMOI lineageについて、historyを除去したcommon environmentで性能が低下し、AF lineageが相対的に優位になるなら、

> AFの履歴がartifact自体へのexternalizationを促した

という仮説を支持する候補証拠になる。

#### Crossover

初期にはAFやMOIがbounded条件より有利でも、generationとともにPR/AR/EL lineageがその制約へ適応し、

\[
M_c(S_g) > M_{AF}(S_g)
\]

または

\[
R^{sem}_c(S_g) > R^{sem}_{AF}(S_g)
\]

となるcrossoverを探索する。

ただし、adaptationを一般的品質向上と同一視せず、secondary structural costも併記する。

#### Stage 2の判定

- trajectoryに単調・非単調・交差・条件固有の形状があればStage 3へ
- common-environment差があればartifact-level adaptation候補としてStage 3へ
- 完全にフラットでも、Stage 1でmechanismと測定感度が確認済みならnull result候補としてStage 3へ
- 測定器またはcondition implementationに問題がある場合のみStage 1 / 0.5へ差し戻す


### Stage 3：Alternative Explanations

- 目的：observed trajectoryがinheritance / observation条件以外の要因で説明できないかを確認する
- 追加する変数：
  - model family（複数）
  - seed architecture（1.4節の複数構造）
  - prior baseline（Zhu & Griffiths型のiterated in-context elicitationによるゼロ世代測定）
  - **task sequence**（1.8節のcounterbalanced topological order、複数パターン）
  - **要求の質（requirement wording）**：1.9節で述べた通り、本研究は`visibleInstruction`の詳細度を独立変数として操作しないが、この統制が結果を歪めていないかを確認する頑健性チェックを行う。具体的には、observed trajectoryに現れた主要な現象（例：Stage 0のPhase 4で観測されたdistributed invariantの見落とし）に関与したtaskのうち1〜2件について、既存制約への明示的な言及を含む**詳細版のvisibleInstruction**を用意し、同一条件下で結果の方向性が反転しないか（見落としが解消される、または頻度が大きく変わるか）を確認する。反転する場合、observed trajectoryの解釈を「有限context下での意味的再構成の困難さ」ではなく「要求文の曖昧さ」に修正する必要がある。反転しない場合、要求の質は交絡要因として排除でき、有限context自体の効果として主張を維持できる。
  - **MOI history schema robustness**：MOIで継承するobservable interaction recordの構成（例：tool result全文 vs structured summary、feedback有無）が結果を支配していないかを限定的に確認する。ただしhidden stateやprivate chain-of-thoughtは対象にしない。
  - **task bank構成**（1.5.1節の構成A/B）：Stage 2で観察された現象（構造的副次指標の推移）が、invariant-stressing taskを含まない構成Aだけでも同様に観察できるかを確認する。構成Bでのみ現れる現象は、「暗黙ルールという道具立てが引き起こした artifact」である可能性があり、構成Aで再現する現象こそが、より頑健な主張の根拠になる
- **前提条件（必須、v1.6で位置づけ修正）**：使用するtask sequenceの各順列について、\(G_0 \xrightarrow{\Delta_1} G_1 \xrightarrow{\Delta_2} \cdots\) を累積的に適用しながら各世代でmodel checkerを通す（**累積validator**）。この検証の位置づけは「task順序による科学的現象の発見」ではなく、**「task同士を組み合わせたときに、単体検証（各taskを独立に\(G_0 + \Delta_i\)として検証）では見つからない相互作用上の設計ミスがないかを確認する品質保証」**である。単体では両方安全なdeltaが組み合わせでのみ矛盾を生むケースが実際にSynthetic World v0.3で構成・実証されている（`demo_interaction_only_bug.ts`：単体では両方OKの2 taskが、両方適用すると矛盾を生む）。

  なお、GroundTruthDeltaが加算のみ（既存ruleの変更・削除を含まない）で構成される現在の設計では、ある世代\(G_g\)が一度矛盾を持てば、以降の世代\(G_{g+1}, G_{g+2}, \ldots\)も加算だけでは矛盾を解消できず、矛盾を持ち続ける。したがって「中間世代だけ一時的に壊れて後で直る」という現象は原理的に起こらない。将来GroundTruthDeltaに既存ruleの変更・削除を含める場合は、この限りではない。

  また「task集合全体を適用し終えた最終的な\(G\)は適用順序に依存しない」という主張は、集合の合併が可換であることによる理論的な帰結だが、実装上の配列連結ではJSON表現の配列順が順序によって異なりうる。これは entity/operation/transition/dependency/invariantのID一意性を保証した上で、比較時にIDで正準化（canonicalize）することで検証できる。Synthetic World v0.3では、この検証を実際に行い（`groundTruthsEquivalent()`による正準化後の等価性比較）、同一task集合を2つの順序で適用した最終\(G\)が正準化後に一致することを確認した。
- 判定：現象がこれらの対立仮説で消えないことを確認する。消える場合は、現象の主張自体を修正する。

### Stage 4：Mechanism Discovery

- 目的：\(R^{sem}, M\) を左右している構造的形質の候補を探索する
- 手順：Stage 0〜3で保存済みのraw trajectoryから、副次指標（3.2節）を事後的に抽出する
- 分析の枠組みは \(\text{StructuralTrait} \rightarrow R^{sem}, M\) の関係を探索することであり、「Limitedだからmodularになるはずだ」という規範を先に埋め込まない
- **構成Bとの突き合わせ**：構成B（invariant-stressing taskを含む）で観測された局所的な失敗イベント（特定世代でのdistributed invariant見落とし等）が、同時期の構造的副次指標（冗長性、局所化の進行等、構成Aの結果）と相関しているかを確認する。局所的な意味理解の失敗が、より広い構造的劣化の**予兆**として機能するのであれば、両者を橋渡しする形質（例：コメント密度、依存関係の可視性）を機序候補として優先的に検討する
- **二種類の機序候補を分離**：
  - Externalization mechanism：history lossがどの媒体への情報外在化を促したか
  - Reconstruction mechanism：finite observationがどの構造的形質（semantic locality、dependency locality、discoverability等）を促したか
- 出力：Stage 6で操作対象とする有力な媒体・構造候補（例：Spec、test、type、ADR、comment、module boundary）のリスト

### Stage 5：Confirmatory Experiment

- 目的：現象を十分な検定力で統計的に検証する
- 事前登録：主仮説を確定してから実施。例えば

\[
Y_{i,g}
=
f(
\text{Condition}_i,\,
\text{Generation}_g,\,
\text{Condition}_i \times \text{Generation}_g,\,
\text{Model}_i,\,
\text{Seed}_i,\,
\text{Sequence}_i
)
+
u_i
+
\epsilon_{i,g}
\]

- モデル形式はoutcomeに合わせる：hidden testの成功/失敗なら binomial GLMM、連続的なsemantic scoreなら LMM
- lineageごとにrandom interceptに加え、Stage 2で観察された形状に応じて **random slope for generation** も検討する
- 交互作用項 \(\beta_{\text{Condition} \times \text{Generation}}\) が主要検定対象。confirmatory hypothesisではC0〜C3のうちStage 2/3で支持されたcontrastを事前指定する
- 設計：5 Condition × Model × Seed Architecture × Task Sequence の全数実施は組合せ爆発するため、Stage 2/3で主要contrastを絞り、部分計画またはcovariate化で予算を管理する。ILM-coreとしてMOI/AF/EL、AIDD-extensionとしてAF/PR/ARという分析単位も保持する

### Stage 6：Mechanism Control

- 目的：Stage 4で発見したexternalization / reconstructionの機序候補を実験的に操作し、因果を確認する
- 媒体介入例：Code only / Code + Tests / Code + Tests + Spec / Code + Tests + ADR
- 観測介入例：同一artifactに対してsemantic localityを人工的に高める/低める表現変更、retrieval-friendly indexの追加等
- history介入例：MOI historyから特定情報種（理由・feedback等）のみを除去し、externalization trajectoryへの影響を確認する
- 位置づけ：Stage 4が観察研究（相関）であるのに対し、Stage 6はその媒体を実際に操作する介入実験
- この結果は、paperのExternalization Pressure / Reconstruction Pressureという二段階selection modelを実験的に検証する最終ピースとなる

---

## 5. 未決事項・要確定リスト

実装着手前に確定すべき事項を優先度順に列挙する。

| # | 事項 | 関連節 | ステータス |
|---|---|---|---|
| 1 | Ground truth \(G\) の形式スキーマ（TypeScript/JSON定義、実装schemaでの \(O/T\) 分離を含む） | 1.2 | 次アクション①で確定 |
| 2 | ~~命名方式A（難読化）とB（虚構語彙）のどちらを採用するか~~ | 1.3 | **解決済み（Stage 0.5）**：A-obfuscatedを採用。詳細は`docs/findings/stage0_5_findings.md` F1 |
| 3 | Privileged Selector / Controllerのヒューリスティック仕様 | 2.9 | 未定 |
| 4 | Semantic probeの自動生成テンプレートと採点方式 | 3.3 | 次アクション④で確定 |
| 5 | equivalence testing用の \(\Delta_M, \Delta_R\) | 4.1(Stage1) | 未定 |
| 6 | Delayed-dependency taskの遅延世代数 \(k\) の具体値 | 1.5 | 仮置き：13〜16世代 |
| 7 | ~~Task bankにおけるLocal/Cross-cutting/Delayed/Invariant-stressingの構成比~~ | 1.5 | **v1.7で位置づけ変更**。「構成比」ではなく、1.5.1節の構成A（暗黙ルールなし、主指標）と構成B（構成A+invariant-stressing、診断用）という2系統のtask bankを並行運用する方針に変更 |
| 8 | Stage 5でのtask sequence設計（Latin square vs covariate化）の最終選択 | 4.1(Stage5) | Stage 3の結果を見て決定 |
| 9 | held-out modification task set \(\mathcal{T}_{\text{heldout}}\) の規模（\(k\)）と、同一taskの反復試行回数 | 4.1(Stage0.5) | 仮置き：\(k=5\text{〜}10\) |
| 10 | Present の syntactic/behavioral判定に使う micro-test（\(H(G)\) の一部）をどう自動生成するか | 1.6 | 未定。GroundTruthDeltaが新invariantのcondition節に触れるentityへの書き込みを含む場合、対応するrequires節を検査するmicro-testを自動追加する、というルールが候補（Synthetic World v0.1で手動実装は確認済み） |
| 11 | task typeの分類（local/cross_cutting/...）と実際に必要な知識の広さの乖離をどう扱うか（ラベルの再定義かtask bank設計への反映か） | 1.5 | 未定 |
| 12 | ~~複合operation（1 operationが複数entityの状態を同時に変更する）をTransitionRule schemaでどう表現するか~~ | 1.2 | **解決済み（v1.5）**。`TransitionRule`を`effects: Effect[]`形式に拡張し、1 operationが複数entityへ同時に作用するケースを正確に表現できるようになった |
| 13 | task sequenceの累積検証（`validate_sequence`相当）を、本番のtask bank生成パイプラインへどう組み込むか（自動実行のタイミング・失敗時のtask再設計フロー） | 4節 Stage 3 | 未定 |
| 14 | 構成B（invariant-stressing task）のvisible testが、暗黙ルールの答えを漏らしていないかを、生成パイプラインでどう自動検証するか（F5参照） | 1.5.1, 4節 Stage 2/3/4 | 未定。task delta（GroundTruthDelta）と既存visible testの静的解析で、該当entityへの直接的なassertion有無をチェックする仕組みが候補 |
| 15 | MOIのobservable interaction record \(\mathcal{I}^{obs}_g\) の確定schema | 2.3, Stage 1B/1C | **Stage 1着手前にfreeze**。task/response/tool/explicit note/diff/visible feedbackを候補とし、hidden情報は除外 |
| 16 | MOI historyの最大サイズとoverflow時の扱い | 2.3 | 未定。全過去累積は禁止。一世代episodeの共通tool/output上限でbounded化し、overflowはinvalid run扱いまたは事前規則でtruncate |
| 17 | Common-environment evaluationの標準条件 | Stage 2B | **Artifact-Full evaluationを必須候補**。finite-\(B_{work}\)共通環境を追加するかはStage 1較正後に確定 |
| 18 | Artifact-Externalization Pressureの主要structural outcomeをどこまで事前指定するか | Stage 2/4 | **Stage 2開始前にmeasurement ruleをfreeze**。semantic elementのencoding mediumと媒体別externalization coverageを中心とし、どの方向へ変化するか自体は事前規範化しない |
| 19 | AF/MOIがmodel context capacityを超えた場合の扱い | 2.4, Stage 1C/2 | Stage 1着手前にstop / censoring / world-size redesign規則をfreeze。silent truncationは禁止 |
| 20 | Stage 1B sham-historyのfixture選定・token matching | Stage 1B | Stage 1B前にfreeze。第6のlongitudinal conditionにはしない |
| 21 | C1でAF/PRのmodel-call・decision opportunityをどこまで一致させるか | 2.6, Stage 1A | Stage 1A前にfreeze。差が残る場合はbest-case bounded-observation effectとして解釈 |


---

## 6. 次のアクション

**v2.0時点の現在地**：Stage 0 / 0.5は完了済みであり、次の実装対象はStage 1である。以下の旧来の①〜⑥は研究装置を構築した履歴として保持するが、現在の実行順序は `docs/stage1_plan.md` のPre-Stage 1 → Stage 1A → 1B → 1Cを優先する。

**Stage 1着手前の最優先追加事項**：

1. MOI用 \(\mathcal{I}^{obs}_g\) schema、source tagging、hidden-information boundaryをfreeze
2. five-condition型・logging schemaを実装
3. AF/EL/PR/AR用exposure / working-set / retrieval runtimeを完成し、stateless per-step requestとOperational-Full feasibility checkを実装
4. Stage 1AでC1〜C3を較正
5. Stage 1BでMOI vs AF + sham-historyのone-step inheritance diagnosticを実施
6. Stage 1Cで5条件10〜15世代integration
7. Stage 2 common-environment evaluation用runnerを設計


**方針**：generatorを最初から汎用化しない。1つの世界でprobe設計・測定パイプラインが失敗した場合、generatorごと作り直すコストを避けるため、まず手書きの最小構成（**Synthetic World v0**）で測定パイプライン全体を通してから、generator化に進む。

着手順序は次の通り。これは本文のStage順（0 → 0.5）と対応しており、generatorをStage 0.5より前倒しで作り込まない点が前版からの変更点である。

1. **① \(G\) スキーマの確定**：1.2節の実装schema（\(E, Q, O, T, D, I\)）をTypeScript/JSON schemaとして定義する。generatorはまだ書かない。設計は型を先に決めるのではなく、**\(G\) から何を機械的に導出できなければならないかから逆算する**：少なくとも \(G \to \{\text{Repository},\ \text{Semantic probes},\ \text{Visible tests},\ \text{Hidden tests } H(G),\ \text{Held-out tasks}\}\) の5種を生成できる必要がある（1.7節のvisible/hidden分離を参照）。したがって `ground_truth.json` の具体例を1つ手で作りながらschemaを往復的に確定させるのがよい。
2. **② Stage 0：最小harnessをtoy repoで通す**：合成世界を使わない簡単なtoy repoで、世代継承ループ（fresh session → artifact読込 → 変更 → テスト → 3.1節ログ保存）が安定して完走することを確認する。
3. **③ Synthetic World v0を手書きする**：①のschemaに従い、1 world・1 architectureのみを手作業で構築する。成果物は次の4ファイル＋評価ハーネス側の1セット。

   ```text
   ground_truth.json       // 真の意味世界 G（E, Q, O, T, D, I）
   repository/              // G の一つの表現 S_g（1.7節：code + visible tests + types + specs、worker agentに見える）
   semantic_probes.json     // G から作った問題と正解（R^sem_B 測定用）
   heldout_tasks.json       // M_B を測る変更要求のtask set（k=5〜10）＋task-specific tests

   （評価ハーネス側・非露出）
   hidden_regression_tests/ // H(G)：ground truthとのbehavioral fidelity検査用。worker agentには一切見せない
   ```

4. **④ Semantic probe pipelineを作る**：`semantic_probes.json` を用いた機械採点パイプライン（3.3節の形式：multiple choice / boolean / set selection / graph edge prediction / state transition prediction）を実装する。
5. **⑤ Stage 0.5を通す**：Synthetic World v0に対し、②のharnessと④のpipelineを組み合わせ、\(B \in \{0, 1K, 2K, 4K, 8K, \text{Full}\}\) で \(R^{sem}_B(S)\)（系統1）と \(M_B(S)\)（系統2、`heldout_tasks.json` の task-specific tests および `hidden_regression_tests/`（\(H(G)\)）を使用）を測定し、dose-response curveの感度を確認する。（historical Stage 0.5では命名方式A/B比較も実施済み。現行標準はA-obfuscated。）
6. **⑥ Generator化**：⑤が通った時点で初めて、Synthetic World v0の構造を一般化したgeneratorを実装し、複数world・複数seed architectureへ展開する。

この順序により、①〜⑤の間に発見される設計上の欠陥（probe形式の不備、\(G\) スキーマの不足、命名方式の問題など）を、generator全体への影響なしに手書きレベルで修正できる。