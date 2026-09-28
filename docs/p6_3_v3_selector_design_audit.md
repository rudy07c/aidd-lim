# P6-3 v3 selector design audit

**Status:** post-v2 design audit; no P6-3 v3 selector freeze and no paid/live execution are authorized by this document  
**Predecessors:** `docs/findings/p6_3_v2_result_summary_ja.md`, `docs/p6_3_v2_design_audit.md`  
**Purpose:** determine how EL static exposure should be selected after P6-3 v2 ended in `needs-design-audit`, before any new calibration data are collected.

---

## 1. なぜ再設計が必要になったか

P6-3 v2 は 864 / 864 logical cells を完走したが、事前登録済みの M / Rsem conjunctive co-gateを満たす内部 budget が存在せず、`B_expose` は選定されなかった。

aggregate M は概ね次の形だった。

```text
B0    B1    B2      B3      B4      AF
0  -> 0  -> 0  ->  0.947 -> 0.932 -> 0.939
```

その後のdesign auditで、B1/B2側の失敗は独立した11 taskの難易度差というより、同じhidden-side compile / contract mismatchへ強く集中していたこと、またB1ではvisible correctnessがほぼ飽和しているのにhidden / task-specific correctnessがほぼゼロであったことが確認された。

さらにselector実装まで遡ると、現行policyは以下のstrict category priorityを持つ。

```text
type_definition
  -> fixed_contract
  -> test
  -> implementation
```

`harness/src/context/privileged-retrieval-controller.ts`の実装は、categoryを最初のsort keyとし、異なるcategory間ではdependency distance / semantic relevanceを比較しない。implementationのtask relevanceはimplementation category内部でのみ使われる。

したがって低budgetでは、type / contract / testを先に埋め切るまでimplementationが1 unitも露出されない構造になりうる。

今回観測されたB2→B3の急変は、単純なtoken-capacity thresholdだけでなく、

```text
implementation category absent
          ->
implementation category present
```

というranking-policy由来のcategory inclusion switchと交絡している可能性が高い。

---

## 2. このcategory orderはELの理論要件か

結論は **no** とする。

この順序にはhistorical reasonはあるが、ELの理論定義から一意に導かれたものではない。

### 2.1 Stage 0由来の理由

Stage 0では、testsを見せないとfresh generationが前世代の回帰を発見できず、型定義を見せないと研究対象である意味理解とは別の型エラー / 型推測が交絡する、という理由からtests / type definitionsを強く保護した。

これはStage 0のharness feasibilityでは合理的な実装判断だった。

### 2.2 Stage 0.5では順序は「あくまで一例」だった

`docs/stage0_5_plan.md`では、finite-budget calibrationに必要なのは、

> budgetが増えるにつれて情報が単調に追加される固定されたfile inclusion order

であり、`type_definition -> fixed_contract -> test -> implementation`は「あくまで一例」「厳密にどの順が最適かは問わない」と明記されていた。

したがってstrict category-complete front-loadingは理論上の必須条件ではない。

### 2.3 historical System2 policyの継承

現行`privileged-retrieval-controller.ts`の導入commit `c50532bf5c177a88ffb28001a12e40949c9e2349`は、コードコメントでcategory orderがhistorical System2 selectorを継承することを明示している。

つまり現在のEL/PR selectorは、P5/P6でEL理論から新しく導出された順序ではなく、過去のfunctional-continuity-oriented policyを引き継いだものである。

### 2.4 この問題はP6-3前から想定されていた

`docs/stage1_plan.md`は、現行policyが`type_definition -> fixed_contract -> test -> implementation`を優先することを既知とし、dose-responseを作る目的でP6-3結果を見た後にtestsを事後的demoteしてはならない、と明記している。

そしてinterior candidateが存在しなければ`needs-design-audit`で停止するよう事前に定めていた。

したがって今回の停止はprotocol failureではなく、selector policyを結果確認後に正当に再検討するためのpredeclared exitである。

---

## 3. 研究上の再定義

P6-3 v2までは、ELを主としてscalar budget `B_expose`で表現していた。

しかし今回の結果から、ELは少なくとも次の2成分で記述すべきである。

\[
EL = (B_{expose}, S_{select})
\]

ここで、

- `B_expose`: model-visible static artifact evidenceのcapacity
- `S_select`: そのcapacityへ何を入れるかを決めるselection policy

である。

有限コンテキストはtoken量だけではない。selection policyが強いcategory switchを持つ場合、同じbudget manipulationでも実際の情報構成は不連続に変化しうる。

P6-3 v3では、`B_expose`を再較正する前に`S_select`をoutcome-blindに再設計・freezeする。

---

## 4. selector候補3案

### Candidate A — Historical front-loaded selector

```text
type_definition
  -> fixed_contract
  -> test
  -> implementation
```

#### 長所

- historical continuityが最も高い
- deterministic / nestedにしやすい
- Stage 0由来の「型・契約・testsを先に守る」思想を強く維持する

#### 問題

- category境界がbudget境界と一致しやすい
- 低budgetでimplementation exposureが完全に0になりうる
- task relevance / dependency distanceを異category間で使えない
- capacity effectとcategory inclusion effectを分離しにくい
- P6-3 v2で実際にnon-degenerate interior budgetを得られなかった

#### v3での位置づけ

**primary selectorとしては採用しない。**

ただしhistorical reference / offline sensitivity baselineとして保持する。v2の結果を再現するため、既存policyの実装とmanifestは変更・上書きしない。

---

### Candidate B — Scaffold-exempt selector

型定義・固定契約・visible tests等をbudget外の共通scaffoldとして常時露出し、主としてimplementation artifactだけにfinite budgetを適用する。

概念的には、

\[
Exposure(B) = Scaffold_{free} \cup LimitedImplementation(B)
\]

とする。

#### 長所

- 型エラー、契約不一致、回帰確認不能といった基礎的failureをcapacity treatmentから分離しやすい
- budget変化をimplementation evidence量の変化として解釈しやすい
- Stage 0で採用していた「土台情報は必ず残す」という思想と整合する

#### 問題

- artifactの一部を無条件継承するため、ELの意味が変わる
- 「artifact全体への有限transmission bottleneck」ではなく「implementation-only bottleneck」に近づく
- MOI vs ELのILM-core secondary contrast、PR vs ELのC3を再解釈する必要がある
- scaffoldの定義自体が新たな研究上の特権化になる

#### v3での位置づけ

**primary selectorには現時点で採用しない。**

ただし、blended selectorで再び型/契約系の非研究対象failureが支配的になる場合のpredeclared sensitivity / fallback familyとして残す価値がある。

---

### Candidate C — Blended nested selector

categoryをabsolute blocking orderとして使わず、全categoryが低budgetから候補になりうるようにする。

内部rankingはtask-relevance / dependency-distance等のoutcome-blind structural signalsを使い、categoryはsoft featureまたはcoverage constraintとして扱う。

P6-3 v3 primary familyとしてこの方向を採用する。

#### 必須性質

1. **Nestedness**

   \[
   Exposure(B_1) \subseteq Exposure(B_2) \subseteq \cdots
   \]

   budget増加で既出evidenceを入れ替えない。

2. **Determinism**

   同じrepository / task / selector version / budgetなら同じordered exposureを返す。

3. **No outcome leakage**

   selector inputに以下を使わない。

   - hidden test result
   - correct answer
   - P6-3 v1/v2 M outcome
   - P6-3 v1/v2 Rsem outcome
   - probe-wise accuracy
   - provider response history
   - v2で特定されたsuccess/failureを直接示すdiagnostic label

4. **Early cross-category coverage**

   非ゼロの実用budgetでimplementation categoryが構造的に常時0になる設計を避ける。

5. **Repository-scale invariance**

   特定fixtureのファイル名や現在のrank 8〜12にhard-codeしない。repositoryが増減しても同じpolicy definitionを適用できる。

6. **Task relevance is allowed, answer relevance is not**

   GroundTruthDelta / dependency graph等、P5で既に許容しているevaluator-side structural mappingは使用可能。ただしhidden outcomeに由来する情報は使用しない。

7. **Canonical budget accounting**

   model-visible serialization全体をcanonical tokenizerで計数する。category間のbudget accounting ruleを共通化する。

---

## 5. Candidate Cの具体化方針

このauditではまだfinal scoring weightsをfreezeしない。

ただし次の実装候補を第一候補とする。

### 5.1 Category-proportional progressive interleaving

full repositoryにおけるcategory別canonical token shareを、各categoryのtarget exposure shareとして使う。

例：full repositoryのtoken構成が

```text
type_definition  10%
fixed_contract   15%
test             30%
implementation   45%
```

なら、finite budgetでも概ね同じ比率で各categoryからevidenceをprogressively admitする。

各category内部では、許可されたstructural relevanceで順序付けする。

- implementation: semantic relevance -> dependency distance -> path
- type / contract / test: task-linked entity mappingやdependency relevanceが定義できるなら同じ原則を使う
- structural relevanceが同率ならpathでdeterministic tie-break

実装はweighted / deficit round-robin等、budget単位でnestednessを保証する決定的手法を用いる。

### 5.2 なぜrepository-proportionalを第一候補にするか

- 現在のscientific outcomeを使わずに比率を決められる
- 低budgetからimplementationを含められる
- 「土台情報は無料」という新しい特権条件を作らない
- full artifactの構成比を縮小したstatic viewとして解釈できる
- repository規模の変化に追従できる

ただし、これはまだ**candidate algorithm family**であり、実装前にoffline structural auditで妥当性を確認し、machine-readable specとしてfreezeする。

---

## 6. v3 selectorをfreezeする前のoutcome-blind structural audit

新selectorはP6-3 v2 scientific resultをoptimization targetにしてはならない。

以下だけを使ってcandidate selectorを比較する。

### 使用してよい情報

- repository file / chunk paths
- file category
- canonical token count
- GroundTruthDeltaから導けるtask surface entities
- dependency graph distance
- semantic locality mapping
- model-visible serialization metadata
- full repositoryのcategory token composition

### 使用禁止

- M pass/fail
- visible / hidden / task-specific pass/fail
- `TS2554`発生locationをselector weight調整に使用すること
- Rsem score / probe-wise accuracy
- B3で成功したunitを直接bonusすること
- B2で失敗したunitを直接penaltyすること

`TS2554`やB2/B3差分は、**historical failure mechanismを理解するdiagnostic evidence**として記録してよいが、新selectorの具体的weightを最適化するラベルとしては用いない。

---

## 7. structural acceptance gate

v3 selector specは、paid/live calibration前に少なくとも以下を満たすこと。

### 7.1 Nestedness gate

全candidate budgetでexposure setがprefix / superset関係を満たす。

### 7.2 Category coverage gate

少なくともprimary non-zero interior budgetsについて、implementation categoryが0でないこと。

さらにcategory別 exposed token / unit数を全budgetで保存する。

### 7.3 No single category switch gate

隣接budget間で、あるcategoryが`0 -> substantial`へ一括で切り替わることだけが主要構成差にならないことをstructural reportで確認する。

これはperformanceの滑らかさを要求するgateではない。**exposure compositionの人工的なcategory cliffを避けるgate**である。

### 7.4 Outcome-blindness gate

selector build pathが禁止されたscientific outcome artifactへアクセスしないことをoffline verifierで確認する。

### 7.5 Reproducibility gate

selector version、repository hash、task/delta identity、budgetからordered unit listとcontent hashを完全再現できること。

---

## 8. v3 recalibrationで事前に書く予測

新selectorの目的は「きれいなdose-responseを作ること」ではない。

performanceを滑らかにすること自体をacceptance criterionにしてはならない。

再calibration前に許される予測は次のレベルに限定する。

> historical front-loaded selectorで存在した「implementation categoryが一定budgetまで完全に0」という構造的cliffは、blended selectorでは存在しない。

その上でfresh dataを集め、M / Rsemがどう反応するかを観測する。

結果が再び急峻でも、それが新selectorのstructural composition artifactで説明できないなら、初めて有限情報伝達そのもののthreshold hypothesisを強く検討する。

---

## 9. EL多水準化との関係

EL-tight / EL-boundary / EL-looseをStage 1/2本実験へ導入する案は、このauditではまだ採用しない。

理由は、P6-3 v2で観測されたcliffがhistorical selectorのcategory-front-loadingと交絡しているためである。

順序は以下とする。

1. selector policyをoutcome-blindに再設計
2. structural gatesをfreeze
3. fresh P6-3 v3 recalibration
4. 新selectorでもstable threshold / regime differenceが残るか確認
5. 残る場合のみEL多水準化をformal amendmentとして再検討

したがって、EL多水準化は却下ではなく**保留**である。

---

## 10. Stage 1 contrastへの影響

primary selector familyをblendedに変えても、ELの概念定義は維持する。

ELは依然として、

- artifact subsetのみを提示
- episode中に未露出artifactへ再アクセス不可
- static exposure budget `B_expose`

というconditionである。

したがってC3 `PR - EL` のrecoverability / exposure contrast、および `MOI - EL` のILM-core secondary contrastは概念上維持できる。

ただしselector versionはcondition provenanceへ必ず記録し、historical front-loaded ELとv3 blended ELを同一conditionとして無注記でpoolしない。

---

## 11. Decision

このdesign audit時点の決定は以下。

### 採用

- **P6-3 v3 primary selector family: blended nested selector**
- first candidate implementation: **category-proportional progressive interleaving**
- outcome-blind structural auditをlive前に必須化

### primaryでは不採用

- historical strict category front-loading
- scaffold-exempt / implementation-only budget

### 保留

- EL-tight / boundary / looseのStage 1/2多水準化
- exact category share algorithm
- within-category relevance scoring details
- v3 budget grid
- v3 repeat count
- v3 M/Rsem selection margins

これら保留事項は、**新しいscientific outcomeを見る前に**別のversioned freeze document / machine-readable specで確定させる。

---

## 12. 次の実装順序

1. historical selectorのexact ordered exposure / category composition reportを再生成するoffline toolを用意する。
2. category-proportional progressive interleaving prototypeをoffline-onlyで実装する。
3. M/Rsem結果を参照せず、nestedness / category coverage / deterministic replay / no-outcome-inputを検証する。
4. candidate algorithmのexact ruleをversioned machine-readable specへfreezeする。
5. v3 budget gridとselection ruleを別途predeclareする。
6. offline parity / safety gateを通す。
7. explicit paid/live authorization後にのみP6-3 v3 calibrationを開始する。

この文書自体はpaid/live executionを認可しない。

---

## 13. Provenance

- P6-3 v2 result summary: `docs/findings/p6_3_v2_result_summary_ja.md`
- raw v2 evidence: `docs/findings/evidence/p6-3-v2-live-calibration/state.json`
- historical v2 source checkout: `62110faebc0fa748effa90cb0f44f7c05f479c10`
- historical selector implementation: `harness/src/context/privileged-retrieval-controller.ts`
- selector introduction commit: `c50532bf5c177a88ffb28001a12e40949c9e2349`
- historical Stage 0.5 selector: `calibration/src/budget-assembler.ts`
- relevant planning records: `docs/stage0_5_plan.md`, `docs/harness_stage0_plan.md`, `docs/stage1_plan.md`

P6-3 v2 remains historical calibration evidence and must not be pooled into future v3 primary M/Rsem estimates.
