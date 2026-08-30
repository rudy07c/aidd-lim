# AIDDにおける有限コンテキストとsoftware artifact進化 ― 実験計画書

**版**: v1.8
**関連文書**: `aidd_ilm_paper_v4.md`（理論枠組み）、`deep-research-report.md`（先行研究レビュー）、`synthetic-world-v0/NOTES.md`（Synthetic World v0.3実装知見）、`docs/findings/stage0_findings.md`（Stage 0実行結果からの発見）
**作成方針**: 単一のフル実験を最初から回すのではなく、交絡を一つずつ剥がしながら「安い問い」から「高い問い」へ段階的に登る。各Stageは次のStageへ進むための**判定ゲート**として機能する。

**v1.8での変更点（Stage 0 Phase 4再実行結果を受けた修正）**：
- 新設1.5.1節：invariant-stressing taskは「研究対象そのもの」ではなく「構造的変化を診断するための道具」であることを明確化。task bank構成A（暗黙ルールなし、主指標）と構成B（構成A+invariant-stressing task、診断用）の2構成を導入
- Stage 2に、構成A・構成Bを並行運用する設計を追記
- Stage 3の対立仮説に「task bank構成」を追加（構成Aだけでも現象が再現するかの頑健性チェック）。既存の「要求の質」の頑健性チェックと並列の位置づけ
- Stage 4に、構成Bの局所的失敗イベントと構成Aの構造的副次指標を突き合わせる分析方針を追記
- F5（visible testのカバレッジがFull/Limitedの差を消してしまった発見）を`docs/findings/stage0_findings.md`に追加し、1.5.1節から参照
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

> 有限コンテキストという伝達条件の違いが、反復的に継承されるsoftware artifactの構造的trajectory、および後続AIによる意味的再構成可能性 \(R^{sem}_B(S)\) ・機能的継続可能性 \(M_B(S)\) に、系統的な差を生じさせるか。

### 0.2 Stage構成の全体像

| Stage | 問い | 位置づけ |
|---|---|---|
| 0 | 世代継承ループを安定して回せるか | フィージビリティ |
| 0.5 | \(R^{sem}\), \(M\) は測定器として機能するか | 測定較正（ゲート） |
| 1 | 情報量の効果とretrievalの効果を分離できるか | 条件設計の診断（ゲート） |
| 2 | trajectoryに現象（特にcrossover）の兆候はあるか | 探索的pilot |
| 3 | 現象はprior・初期構造・task順序で説明できないか | 対立仮説の排除 |
| 4 | 何がreconstructabilityを媒介しているか | 機序の探索 |
| 5 | 現象は統計的に再現するか | 確証的検証（事前登録） |
| 6 | 継承媒体そのものを操作して因果を確認できるか | 機序の因果検証 |

哲学：**存在 → 原因 → 機序 → 制御**の順で進む。「良いAIDDとは何か」を先に設計せず、まず何が自然に起きるかを観察してから、その現象をどう制御するかへ戻る。

### 0.3 各Stageのゲート判定（進行/停止条件）

| Stage | 進行条件 | 停止/差し戻し条件 |
|---|---|---|
| 0 | 世代ループが再現性をもって完走し、ログが完全取得できる | クラッシュ率が高い、ログ欠損がある場合はハーネスを修正 |
| 0.5 | dose-response curveが感度をもつ（後述4.3の判定基準） | 天井/床効果が出る場合はprobe/domainを再設計 |
| 1 | Full/Privileged/Agentの3条件が安定して実行でき、equivalence判定ができるだけのデータが取れる | 条件間でシステムエラー率に極端な差がある場合は条件定義を見直す |
| 2 | trajectoryに何らかの形状（単調/非単調/交差）が観察できる。フラットな場合でもStage 0.5で測定感度が確認済みならnull result候補として進行条件を満たすとみなす | 測定感度がStage 0.5で確認できていない場合のみStage 0.5へ差し戻す |
| 3 | 対立仮説（prior/architecture/sequence）で現象が消えないことを確認 | 対立仮説で説明できてしまう場合は現象の主張を修正 |
| 4 | \(R^{sem}, M\) と相関する構造的形質の候補が絞り込める | 相関が弱すぎる場合はraw dataの再分析に留める |
| 5 | 事前登録した主仮説が検証可能な検定力を持つ | 検定力不足なら条件数を絞り再設計 |
| 6 | 媒体操作によって \(R^{sem}, M\) に予測通りの変化が出る | 出ない場合は機序仮説を修正しStage 4に戻る |

---

## 1. Synthetic Software World（合成世界）の設計

### 1.1 位置づけ

ILM研究が人工言語を使うのと同じ理由で、実在GitHubリポジトリではなく、**意味のground truthが完全に既知の人工software world**を用いる。これにより：

- \(R^{sem}_B(S)\) を機械採点可能な形で自動生成できる
- hidden testsを ground truth から自動生成できる
- pretraining priorの混入を統制・測定できる

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

### 1.3 命名方式（要決定事項・優先度高）

以下の2方式を **Stage 0.5で並行比較** し、感度の高い方を以降の標準とする。

なお、いずれの方式についても「訓練データに存在しない」ことを原理的に保証することはできない（paper本体8.3節の限界と同様）。したがって目的は**prior除去**ではなく、**domain-semantic priorへの依存を低減すること**と位置づける。

| 方式 | 内容 | 想定リスク |
|---|---|---|
| A: 完全難読化 | `vok`, `zef`, `tal` 等の無意味シンボル | domain-semantic priorへの依存は強く下がるが、記憶負荷増大とcontext不足の効果を混同しうる |
| B: 虚構語彙 | ランダムまたは手続き的に生成された、既存ドメインとの対応を意図的に持たない語彙（意味の内部一貫性はある） | domain priorへの依存低減効果がAより弱い可能性 |

判定基準：両方式でdose-response curveを取り、形状（4.3節）が大きく異ならない方、あるいはより感度の高い方を採用する。

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

構成Bを使う際の注意点として、**visible testの記述が、暗黙ルールの答えを直接漏らしていないかを事前に確認する必要がある**。Stage 0 Phase 4では、visible testが特定entityのinvariantを直接assertしていたため（例：`advanceZef2: fails if Tal is not 'pex'`）、AIがソースコードを読まずにテストの記述だけから正解を再構成できてしまい、Full/Limited間の差が消失する事例が観測された（`docs/findings/stage0_findings.md` F5参照）。構成Bのtask bankを設計する際は、この種の「答えの漏洩」がないかをタスクごとに確認する。

Stage 2・Stage 3・Stage 4での両構成の使い分けは、それぞれの節を参照。

### 1.6 Semantic element traceの一般化（旧：Delayed-dependency taskの二重失敗モード）

\(T_3\) で invariant \(I_7\) を導入し、\(T_4 \ldots T_{15}\) では触れず、\(T_{16}\) で初めて必要になる設計を考えると、失敗には少なくとも2つの異なる原因がありうる。

- (a) \(I_7\) の情報はartifact上に残っているが、\(T_{16}\) 時点のcontext budgetで提示されなかった（**伝達帯域の問題**）
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

という経路として特定できる。3.1節のログスキーマに `semantic_element_trace`（要素ID・上記5フラグの配列）として反映する。

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

本研究がcontext bottleneckとして操作するのは、**過去に継承されるartifact（コード・テスト・型・コメント等）をどれだけ渡すか**である。これに対し、各世代でAIへ提示される新規要求（held-out taskの`visibleInstruction`）そのものの詳細度・明確さは、本研究が操作する変数ではない。

この区別は、Stage 0のPhase 4実行観察から必要性が明確になった。AIが新しいoperationを実装する際、既存のdistributed invariant（複数のtransitionにまたがる暗黙の制約）を壊さないという条件を、`visibleInstruction`が明示していない場合に見落とす事例が複数回観測された（`docs/findings/stage0_findings.md` F1, F2参照）。この観測結果は、有限context下での意味的再構成可能性を検証する上で重要な交絡因子を示唆する：観測される失敗が

> (a) 過去のartifactから間接的な制約を読み取れなかったことに起因するのか
> (b) 単に今回の要求文が、守るべき制約について何も述べていなかったことに起因するのか

を区別できなければ、本研究の中心的主張（有限context下でのartifact adaptation）を誤って強める、あるいは弱める可能性がある。

**方針**：

- 全held-out taskの`visibleInstruction`は、**統一されたスタイル**（簡潔な1〜2文、既存の制約への言及を含まない）に統制し、独立変数として操作しない。現在の`heldout_tasks.json`の記述は既にこのスタイルに従っているが、今後task bankを拡張する際もこのスタイルを維持する。
- ただし、この統制が本研究の主張を歪めていないかを確認するため、Stage 3（対立仮説の排除）に、要求文の詳細度に関する頑健性チェックを追加する（4節 Stage 3参照）。
- 要求文の詳細度そのものを独立変数として体系的に操作する研究（要求工学・prompt設計としての研究）は、本研究の範囲外とする。理論的位置づけは`aidd_ilm_paper_v4.md`5.3節・8.5節を参照。

---

## 2. Context条件の定義

### 2.1 三条件

- **Full Context**：リポジトリ全体（実質的に全情報）を利用可能にする
- **Privileged-Selection Limited**（旧称 Oracle Limited）：フルcontextを見られる privileged selector が、token budget \(B\) の範囲でworker agentへcontextを渡す
- **Agent-Retrieved Limited**：同じbudget \(B\) の中で、worker agent自身が検索/読み取りツールを用いて情報を取得する

```text
Full Repository
       ↓
Privileged Context Selector（ヒューリスティックベース）
       ↓ B tokens
Worker Agent

Worker Agent
   ↕ search/read tools
Repository（budget B 内で自由に探索）
```

### 2.2 Privileged Selectorの実装方針（要決定・Stage 1着手前に確定）

Selector自体をLLMにすると、selectorの判断にmodel priorが混入し、「情報量そのものの効果」の測定が汚染される。したがって初版では**固定ヒューリスティック**（依存グラフ距離、直近の変更履歴、対象ファイルからの参照関係など）で実装し、selector自身のprior混入は既知の限界として明示する。Stage 1の診断結果次第で再設計を検討する。

呼称は理論的な"oracle"（正解の完全な選択）を意味しないため、以降 **Privileged-Selection Limited** と呼ぶ。

### 2.3 世代の定義

各generationで**新規セッション・新規agentインスタンス**を開始する。前世代の対話履歴・chain-of-thought・agent内部メモリは一切継承しない。継承されるのはrepository内に固定された永続的artifact（コード・テスト・型・Spec・ADR・コメント）のみ。

**固定される層と、世代ごとに進化する層（v1.5で修正）**：継承される要素（artifact＝\(S_g\)）と継承されない要素（agentの対話履歴・メモリ）という二分法だけでは不十分であることが、GroundTruthDelta（4.1節）の導入によって判明した。正しくは次のように整理する。

**固定されるもの**：WorldProtocol（hidden evaluator \(H(G)\) がrepositoryの内部実装を一切知らずに呼び出すための固定契約。例：`reset` / `applyOperation` / `getEntityState` 等の最小インターフェース。Generation 0で確定した公開API表面を指し、以降の世代はこの契約さえ保てば内部構造を自由にリファクタしてよい）／context条件のルール／評価方法そのもの／agentに何を継承させるかという実験規則。

**世代ごとに変わるもの**：要求 \(T_g\)／**正解世界 \(G_g\) 自体**／hidden evaluatorの具体的内容 \(H(G_g)\)／artifact \(S_g\)。

すなわち実験は次の**2本のtrajectory**を並走させる。

\[
G_g \xrightarrow{T_g} G_{g+1} \qquad (\text{worker agentには非公開。GroundTruthDeltaで進む})
\]
\[
S_g \xrightarrow{AI(T_g)} S_{g+1} \qquad (\text{worker agentが実際に変更するartifact})
\]

そして各世代で \(S_{g+1} \models G_{g+1}\) を外部評価する。「\(S_g\)のみが進化し\(G\)は固定」という単純化ではなく、要求ごとに正解世界そのものも進化する点が本質である。

WorldProtocol自体にinvariant等のsemantic knowledgeを含めてはならない（含めると実験が汚染される）。この設計により、\(H(G_g)\) は世代を経たrepositoryのリファクタリングに対して頑健になる（Synthetic World v0の初期実装ではこの分離ができておらず、内部関数への直接importが世代間リファクタで壊れる問題があった。v0.1で `protocol_adapter.ts` として分離・解消）。

---

## 3. ログ・測定設計

### 3.1 Raw trajectory ログスキーマ（Stage 0から全世代で保存）

```text
experiment_id
lineage_id
generation
condition                  # Full / Privileged-Selection Limited / Agent-Retrieved Limited
model
seed_architecture
task_sequence_id
task_id

repository_before           # 完全snapshot
repository_after             # 完全snapshot
git_diff

context_budget                # 割当トークン数
actual_context_tokens          # 実際に使用されたトークン数
context_contents               # workerに実際に渡された内容そのもの
retrieval_queries               # Agent-Retrieved条件のみ
retrieved_files

agent_prompt
agent_response
tool_calls

semantic_probe_results          # R^sem_B(S) 算出用
hidden_test_results               # M_B(S) 算出用。H(G) はworker agentへ非露出、評価ハーネス側でのみ実行・記録する（1.7節）
functional_task_result

semantic_element_trace           # 1.6節：G の各要素xについて Present^syn/Present^beh/Exposed/Reconstructed/Preserved の5段階フラグ

latency
token_usage
cost
```

原則：「許可されたcontext量」ではなく「AIが実際に何を見たか」を完全に残す。副次指標（構造的形質）はStage 4まで分析を後回しにしてよいが、**データ自体は最初から失わず保存する**。

### 3.2 主要指標・副次指標

以降、\(M_B(S)\) は潜在的な真の成功確率（\(P(\text{future modification succeeds} \mid S, B)\)）、\(\hat{M}_B(S)\) はheld-out task set \(\mathcal{T}_{\text{heldout}}\) から得る経験的推定量（4.1節 Stage 0.5の式）として区別する。同様に \(R^{sem}_B(S)\) は理論量、実際にsemantic probeから得る値は \(\hat{R}^{sem}_B(S)\) と表記する。以下の指標定義は理論量で記すが、実測はすべて推定量（\(\hat{M}_B, \hat{R}^{sem}_B\)）であることに注意する。統計モデル（4.1節 Stage 5）でも観測値は常に推定量として扱う。

**主要指標（primary outcome）**
- \(M_B(S)\)：固定context budgetのもとでの機能的継続可能性（隠しテストを回帰なく通す確率）。実測は \(\hat{M}_B(S)\)
- \(R^{sem}_B(S)\)：意味的再構成可能性（semantic probeの正答率。変更タスクの成否とは独立に測定）
- 累積的な隠しテスト保持率
- 目標成功確率に到達するための最小context量

**副次指標（secondary outcome・構造的形質の候補、Stage 4で分析）**
- 構造的劣化・複雑性の集中度
- 冗長性・重複度
- 変更の局所性（change locality）
- 依存関係の広がり（dependency breadth）
- Spec・テスト・型への情報外在化率
- **表面的局所性と意味的局所性の乖離度**：\(\text{Local}_{\text{surface}}(T)\)（visibleInstructionおよびGroundTruthDelta \(\Delta\) が直接言及するentityの集合）と \(\text{Local}_{\text{semantic}}(T)\)（正しく変更するために実際にどこまでsystemを理解する必要があるか）の乖離。**\(\text{Local}_{\text{semantic}}\) は \(\Delta\) 単体からではなく、\((G_g + \Delta_g)\) 全体のdependency/invariantグラフをsurface localityの起点entityからBFSで辿ることで機械的に算出する**（\(\Delta\) 自体には現れない既存のdistributed invariantやdependency連鎖まで理解が必要な場合があるため）。task typeラベル（local/cross_cutting等）は表面的な分類であり、実際に必要な知識の広さと乖離しうることがSynthetic World v0.1〜v0.3の構築過程で確認された（見た目はlocalなtaskの正解実装に他entityへの依存が必要だったケース。v0.3で乖離度を実測：\(\text{divergence} = |\text{semantic}| - |\text{surface}|\) が1〜2の範囲で複数taskに実在することを確認）。この乖離度と \(R^{sem}_B, M_B\) の関係を見ることで、Limited Context下で特に困難になるtaskの性質を特定できる可能性がある。

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

### Stage 0.5：Measurement Calibration

- 目的：\(R^{sem}_B\) と \(M_B\) が測定器として機能するかを確認する
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

### Stage 1：Context Decomposition（診断実験）

- 目的：性能差のうち「情報量」と「retrieval」がそれぞれどれだけ寄与するかを分離する
- 条件：Full / Privileged-Selection Limited / Agent-Retrieved Limited の3条件
- 規模：10〜15世代
- 対比：
  - \(\text{Full} - \text{Privileged Limited}\) → 情報量そのものの効果
  - \(\text{Privileged Limited} - \text{Agent Limited}\) → retrievalの効果
- 判定は**equivalence testing**で行う。有意差なし＝関係なし、とはしない。事前に実務上無視できる差 \(\Delta_M\)（機能的継続可能性用）と \(\Delta_{R}\)（意味的再構成可能性用）をそれぞれ定める。

\[
|M_{\text{Privileged}} - M_{\text{Agent}}| < \Delta_M
\quad \text{かつ} \quad
|R^{sem}_{\text{Privileged}} - R^{sem}_{\text{Agent}}| < \Delta_{R}
\]

の**両方**が信頼区間で支持された場合にのみ、Stage 5でAgent-Retrieved条件を落とす判断を行う。\(M\) のみでの判定は避ける。理由は、意味を部分的に取り損ねているが実装成功率には少ない世代数では現れていない、というケース（\(R^{sem}\) は異なるが \(M\) は同等）を見逃す可能性があるため。本研究の理論的中心は \(R^{sem}\) であり、\(M\) だけを主指標にしない。

- 分岐パターン：

| パターン | 解釈 |
|---|---|
| Full ≈ Privileged ≈ Agent | bottleneck設定が弱すぎる可能性、domain再設計を検討 |
| Full ≈ Privileged > Agent | 主因はretrieval |
| Full > Privileged ≈ Agent | 主因は情報制約そのもの |
| Full > Privileged > Agent | 両方が効く |

この結果はStage 5の条件数・予算配分を決定する。

### Stage 2：Longitudinal Pilot

- 目的：trajectoryそのものに現象（特にcrossover）の兆候が現れるか
- 規模：30〜50世代、各条件2〜3 lineageのみ（探索目的、統計検定はしない）
- 手順：Stage 1の結果に基づき条件数を確定した上で世代数を伸ばす
- **task bank構成（1.5.1節参照）**：構成A（暗黙ルールなし、通常taskのみ）と構成B（構成A + invariant-stressing task）を並行して走らせる。構成Aの結果が主指標（構造的副次指標の推移）、構成Bの結果は診断的な補助情報として扱う。両者を同数のlineageで走らせる必要はなく、構成Aに多めのlineageを割り当ててよい
- 併せて \(R^{sem}_B(S)\) の簡易フルスケール版（Stage 0.5の較正済みprobeセット）をtrajectory全体に適用する
- 判定：形状（単調・非単調・交差の兆候）が観察できればStage 3へ。完全にフラットでノイズのみの場合、対応はStage 0.5の結果次第で分岐する：
  - Stage 0.5で測定感度（4.3節のdose-response curve）が確認済みであれば、「有限contextはtrajectoryに系統的差を生じさせない」という**null resultの候補**として保持し、Stage 3（対立仮説の排除）へ進める。差が出ないこと自体を実験失敗として扱わない。
  - Stage 0.5の感度確認が不十分、または経過世代数が少なくdose-response自体が再現しない場合にのみ、Stage 0.5へ差し戻す。

### Stage 3：Alternative Explanations

- 目的：observed trajectoryがcontext条件以外の要因で説明できないかを確認する
- 追加する変数：
  - model family（複数）
  - seed architecture（1.4節の複数構造）
  - prior baseline（Zhu & Griffiths型のiterated in-context elicitationによるゼロ世代測定）
  - **task sequence**（1.8節のcounterbalanced topological order、複数パターン）
  - **要求の質（requirement wording）**：1.9節で述べた通り、本研究は`visibleInstruction`の詳細度を独立変数として操作しないが、この統制が結果を歪めていないかを確認する頑健性チェックを行う。具体的には、observed trajectoryに現れた主要な現象（例：Stage 0のPhase 4で観測されたdistributed invariantの見落とし）に関与したtaskのうち1〜2件について、既存制約への明示的な言及を含む**詳細版のvisibleInstruction**を用意し、同一条件下で結果の方向性が反転しないか（見落としが解消される、または頻度が大きく変わるか）を確認する。反転する場合、observed trajectoryの解釈を「有限context下での意味的再構成の困難さ」ではなく「要求文の曖昧さ」に修正する必要がある。反転しない場合、要求の質は交絡要因として排除でき、有限context自体の効果として主張を維持できる。
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
- 出力：Stage 6で操作対象とする有力な媒体候補（例：Spec、テスト、ADR、コメント）のリスト

### Stage 5：Confirmatory Experiment

- 目的：現象を十分な検定力で統計的に検証する
- 事前登録：主仮説を確定してから実施。例えば

\[
Y_{i,g} = f(\text{Context}_i,\ \text{Generation}_g,\ \text{Context}_i \times \text{Generation}_g,\ \text{Model}_i,\ \text{Seed}_i,\ \text{Sequence}_i) + u_i + \epsilon_{i,g}
\]

- モデル形式はoutcomeに合わせる：hidden testの成功/失敗なら binomial GLMM、連続的なsemantic scoreなら LMM
- lineageごとにrandom interceptに加え、Stage 2で観察された形状に応じて **random slope for generation** も検討する
- 交互作用項 \(\beta_{\text{Context} \times \text{Generation}}\) が主要検定対象（crossover仮説の場合はより具体的な関数形を事前登録する）
- 設計：Context × Model × Seed Architecture × Task Sequence の全数実施は組合せ爆発するため、Latin square的な部分計画、またはtask sequenceを固定少数パターン＋covariate化する形で予算を管理する

### Stage 6：Mechanism Control

- 目的：Stage 4で発見した媒体候補を実験的に操作し、因果を確認する
- 条件例：Code only / Code + Tests / Code + Tests + Spec / Code + Tests + ADR
- 位置づけ：Stage 4が観察研究（相関）であるのに対し、Stage 6はその媒体を実際に操作する介入実験
- この結果は、論文3節「外在化された文化的記憶としてのartifact」という理論的核心を実験的に検証する最終ピースとなる

---

## 5. 未決事項・要確定リスト

実装着手前に確定すべき事項を優先度順に列挙する。

| # | 事項 | 関連節 | ステータス |
|---|---|---|---|
| 1 | Ground truth \(G\) の形式スキーマ（TypeScript/JSON定義、実装schemaでの \(O/T\) 分離を含む） | 1.2 | 次アクション①で確定 |
| 2 | 命名方式A（難読化）とB（虚構語彙）のどちらを採用するか | 1.3 | Stage 0.5で決定 |
| 3 | Privileged Selectorのヒューリスティック仕様 | 2.2 | 未定 |
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

---

## 6. 次のアクション

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
5. **⑤ Stage 0.5を通す**：Synthetic World v0に対し、②のharnessと④のpipelineを組み合わせ、\(B \in \{0, 1K, 2K, 4K, 8K, \text{Full}\}\) で \(R^{sem}_B(S)\)（系統1）と \(M_B(S)\)（系統2、`heldout_tasks.json` の task-specific tests および `hidden_regression_tests/`（\(H(G)\)）を使用）を測定し、dose-response curveの感度を確認する。命名方式A/Bの比較もここで行う。
6. **⑥ Generator化**：⑤が通った時点で初めて、Synthetic World v0の構造を一般化したgeneratorを実装し、複数world・複数seed architectureへ展開する。

この順序により、①〜⑤の間に発見される設計上の欠陥（probe形式の不備、\(G\) スキーマの不足、命名方式の問題など）を、generator全体への影響なしに手書きレベルで修正できる。