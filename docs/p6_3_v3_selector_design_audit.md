# P6-3 v3 selector design audit

**Status:** post-v2 design audit; selector family direction only; no final v3 selector freeze and no paid/live execution are authorized by this document  
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

その後のdesign auditで、B1/B2側の失敗は独立した11 taskの難易度差というより、共通したhidden-side compile / contract mismatchへ強く集中していたこと、またB1ではvisible correctnessがほぼ飽和しているのにhidden / task-specific correctnessはほぼゼロであったことが確認された。

selector実装まで遡ると、現行policyは以下のstrict category priorityを持つ。

```text
type_definition
  -> fixed_contract
  -> test
  -> implementation
```

`harness/src/context/privileged-retrieval-controller.ts`はcategoryを最初のsort keyとし、異なるcategory間ではdependency distance / semantic relevanceを比較しない。implementationのtask relevanceはimplementation category内部でのみ使われる。

### 1.1 v2 frozen manifestが示すexact exposure composition

重要な訂正として、P6-3 v2のB2→B3でimplementationが初めて入ったわけではない。

`harness/frozen/p6-3-el-structural-freeze.json`のfrozen profileは、代表profileについて次を記録している。

| arm | nominal budget | actual tokens | type_definition | fixed_contract | test | implementation |
|---|---:|---:|---:|---:|---:|---:|
| B1 | 505 | 339 | 5 | 0 | 0 | 0 |
| B2 | 1011 | 824 | 5 | 2 | 0 | 0 |
| B3 | 2023 | 1875 | 5 | 4 | 3 | 0 |
| B4 | 3034 | task-dependent | 5 | 4 | 7 | 1–2 |
| AF | 4046 | 4046 | 5 | 4 | 7 | 9 |

したがって、B2→B3で起きた構造変化は、少なくともcategoryレベルでは

```text
partial fixed_contract, no tests, no implementation
          ->
full fixed_contract + partial visible tests, no implementation
```

である。

これは「B3でimplementationへ到達したからMが跳ねた」という初期仮説を否定する。

現時点でより正確に言えるのは、**strict category front-loadingにより、budget増加が単なるcapacity増加ではなく、fixed contractの完成やvisible test導入という大きなcontext composition changeと結び付いていた**ということまでである。

B2→B3のM急変を具体的にどのchunkが説明するかは、まだ確定していない。

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

`privileged-retrieval-controller.ts`の導入commit `c50532bf5c177a88ffb28001a12e40949c9e2349`は、コードコメントでcategory orderがhistorical System2 selectorを継承することを明示している。

つまり現在のEL/PR selectorは、P5/P6でEL理論から新しく導出された順序ではなく、過去のfunctional-continuity-oriented policyを引き継いだものである。

### 2.4 この問題はP6-3前から想定されていた

`docs/stage1_plan.md`は、現行policyが`type_definition -> fixed_contract -> test -> implementation`を優先することを既知とし、dose-responseを作る目的でP6-3結果を見た後にtestsを事後的demoteしてはならない、と明記している。

interior candidateが存在しなければ`needs-design-audit`で停止することも事前に定めていた。

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

有限コンテキストはtoken量だけではない。selection policyが強いcategory blockを持つ場合、同じbudget manipulationでも実際の情報構成は不連続に変化しうる。

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
- B1/B2/B3が異なる種類のartifact compositionを表すため、capacityとcompositionが交絡する
- task relevance / dependency distanceを異category間で使えない
- P6-3 v2でnon-degenerate interior budgetを得られなかった

#### v3での位置づけ

**primary selectorとしては採用しない方向とする。**

ただしhistorical reference / offline sensitivity baselineとして保持する。v2の結果を再現するため、既存policyの実装とmanifestは変更・上書きしない。

---

### Candidate B — Scaffold-exempt selector

型定義・固定契約・visible tests等をbudget外の共通scaffoldとして常時露出し、主としてimplementation artifactだけにfinite budgetを適用する。

\[
Exposure(B) = Scaffold_{free} \cup LimitedImplementation(B)
\]

#### 長所

- 型エラー、契約不一致、回帰確認不能といった基礎的failureをcapacity treatmentから分離しやすい
- budget変化をimplementation evidence量の変化として解釈しやすい
- Stage 0の「土台情報は必ず残す」という思想と整合する

#### 問題

- artifactの一部を無条件継承するため、ELの意味が変わる
- 「artifact全体への有限transmission bottleneck」ではなく「implementation-only bottleneck」に近づく
- MOI vs EL、PR vs ELの解釈を再定義する必要がある
- scaffoldの定義自体が新たな特権化になる

#### v3での位置づけ

**primary selectorには現時点で採用しない。**

ただし、blended selectorで再び非研究対象のcontract/type failureが支配的になる場合のpredeclared sensitivity / fallback familyとして残す価値がある。

---

### Candidate C — Blended nested selector

categoryをabsolute blocking orderとして使わず、複数categoryがfinite budgetの早い段階から候補になりうるようにする。

内部rankingはtask-relevance / dependency-distance等のoutcome-blind structural signalsを使い、categoryはsoft featureまたはcoverage constraintとして扱う。

P6-3 v3の**leading candidate family**としてこの方向を検討する。

まだfinal selectorとしてfreezeしない。

#### 必須性質

1. **Nestedness**

   \[
   Exposure(B_1) \subseteq Exposure(B_2) \subseteq \cdots
   \]

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
   - v2 success/failureを直接示すdiagnostic label

4. **Cross-category progression**

   full repositoryでmaterialな割合を占めるcategoryが、absolute category orderだけを理由にbudget rangeの大半で完全0になる構造を避ける。

5. **Repository-scale invariance**

   特定fixtureのファイル名、特定rank、今回成功したchunkへhard-codeしない。

6. **Task relevance is allowed, answer relevance is not**

   GroundTruthDelta / dependency graph等、P5で既に許容しているevaluator-side structural mappingは使用可能。ただしhidden outcome由来情報は使用しない。

7. **Canonical budget accounting**

   model-visible serialization全体をcanonical tokenizerで計数する。

---

## 5. Candidate C prototype — category-proportional progressive interleaving

first prototypeでは、full repositoryにおけるcategory別canonical content shareをtarget shareとし、各categoryのqueueをdeterministically interleaveする。

各category内部の順序はhistorical privileged rankingを保持するため、implementation内部ではsemantic relevance / dependency distanceが引き続き働く。

このprototypeは**性能結果を一切参照しない**。

### 5.1 初回offline structural audit

PR #34のCI run `36434374075`で、11 primary M tasksに対してhistorical selectorとprototypeをoutcome-blindに再生した。

CIはtypecheck、structural audit、artifact uploadすべてsuccessだった。

artifact:

- name: `p6-3-v3-selector-structural-audit`
- artifact ID: `10974742369`
- digest: `sha256:587e91248f0781a6d1689aa37e1369df2c476c96a6441c5f37ac1b835669ba75`

historical selectorでは全11 taskで、

- B1: implementation = 0
- B2: implementation = 0
- B3: implementation = 0
- B4: implementation = 1–2 units

だった。

prototype blended selectorでは、

- B1: implementation = 0–2 units（2/11 taskでnon-zero）
- B2: implementation = 1–3 units（11/11 taskでnon-zero）
- B3: implementation = 4–5 units（11/11 taskでnon-zero）
- B4: implementation = 6–7 units（11/11 taskでnon-zero）

となった。

したがってprototypeは、historical selectorの「implementationがB4まで完全に0」というcategory blockを大きく弱めている。

ただしB1では依然として9/11 taskでimplementationが0であり、**このprototypeをそのままfinal freezeする根拠にはならない**。

---

## 6. v3 selectorをfreezeする前のoutcome-blind structural audit

新selectorはP6-3 v2 scientific resultをoptimization targetにしてはならない。

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
- visible / hidden / task-specific pass/failをweight optimizationへ使うこと
- `TS2554`発生locationをselector weight調整へ使うこと
- Rsem score / probe-wise accuracy
- B3で成功したunitを直接bonusすること
- B2で失敗したunitを直接penaltyすること

historical failure mechanismの診断にoutcomeを用いることと、新selectorのweight最適化にoutcomeを用いることを区別する。

---

## 7. structural acceptance gateの方向性

exact gateはまだfreezeしない。次のboundary-unit auditを終えてからversioned specへ固定する。

少なくとも以下を要求する。

### 7.1 Nestedness

全candidate budgetでexposure setがprefix / superset関係を満たす。

### 7.2 Composition provenance

全budgetについてcategory別 exposed token / unit数、selected unit path / line range、selector sequenceを保存する。

### 7.3 No category-complete blocking artifact

あるmaterial categoryが、単にabsolute category orderのためだけにbudget rangeの大半で完全0となる設計を避ける。

ここで要求するのはperformanceの滑らかさではない。**exposure compositionに人工的なblock boundaryを作らないこと**である。

### 7.4 Outcome-blindness

selector build pathが禁止されたscientific outcome artifactへアクセスしないことをoffline verifierで確認する。

### 7.5 Reproducibility

selector version、repository hash、task/delta identity、budgetからordered unit listとcontent hashを完全再現できること。

---

## 8. 次に必要なboundary-unit audit

P6-3 v2 frozen profileでは、B2→B3で追加されたものはimplementationではない。

したがって次に調べるべき対象は、exactに

\[
Exposure(B3) \setminus Exposure(B2)
\]

である。

この差分について、

- path
- line range
- category
- fixed contractのどの部分か
- visible testのどの部分か
- selector sequence
- mapped entities / dependency metadata

を記録する。

目的は「このchunkが成功を生んだ」と断定することではない。

まず、**B2とB3が情報量だけでなく、どの種類・どの具体的artifact evidenceで違っていたかを正確に記述すること**である。

このauditを終えるまで、v3 selector familyのexact algorithm / weightsはfreezeしない。

---

## 9. v3 recalibrationで事前に書く予測

新selectorの目的は「きれいなdose-responseを作ること」ではない。

performanceを滑らかにすること自体をacceptance criterionにしてはならない。

fresh calibration前に許される予測は次のレベルに限定する。

> historical selectorで存在したcategory-complete block boundaryはblended selectorで弱まる。

その上でfresh dataを集め、M / Rsemがどう反応するかを観測する。

新selectorでも急峻なresponseが残り、かつその急変が新たなcomposition cliffで説明できない場合にのみ、有限情報伝達そのもののthreshold hypothesisを強く検討する。

---

## 10. EL多水準化との関係

EL-tight / EL-boundary / EL-looseをStage 1/2本実験へ導入する案は、このauditではまだ採用しない。

P6-3 v2のcliffがselector compositionと交絡しているためである。

順序は以下とする。

1. historical boundary-unit audit
2. selector policyをoutcome-blindに再設計
3. structural gatesをfreeze
4. fresh P6-3 v3 recalibration
5. 新selectorでもstable threshold / regime differenceが残るか確認
6. 残る場合のみEL多水準化をformal amendmentとして再検討

EL多水準化は却下ではなく**保留**である。

---

## 11. Stage 1 contrastへの影響

primary selector familyをblendedに変更しても、ELの概念定義は維持可能である。

ELは依然として、

- artifact subsetのみを提示
- episode中に未露出artifactへ再アクセス不可
- static exposure budget `B_expose`

というconditionである。

したがってC3 `PR - EL`、および`MOI - EL`のILM-core secondary contrastは概念上維持できる。

ただしselector versionはcondition provenanceへ必ず記録し、historical front-loaded ELとv3 selectorのdataを無注記でpoolしない。

---

## 12. Current decision

### leading direction

- **blended nested selector family**を第一候補として継続評価する
- first prototypeはcategory-proportional progressive interleaving
- outcome-blind structural auditをlive前に必須化する

### primaryでは採用しない方向

- historical strict category front-loading
- scaffold-exempt / implementation-only budget

### まだfreezeしない

- exact category share algorithm
- within-category relevance scoring details
- structural acceptance threshold
- v3 budget grid
- v3 repeat count
- v3 M/Rsem selection margins
- EL多水準化

これらは新しいscientific outcomeを見る前にversioned freeze document / machine-readable specで確定させる。

---

## 13. 次の実装順序

1. B2 / B3 exact selected-unit provenanceをoffline audit artifactへ追加する。
2. `Exposure(B3) - Exposure(B2)`をpath / line / category単位で記録する。
3. prototype blended selectorのstructural reportと比較する。
4. exact selector ruleをoutcome-blindに決定する。
5. machine-readable specとoffline verifierへfreezeする。
6. v3 budget gridとselection ruleを別途predeclareする。
7. offline parity / safety gateを通す。
8. explicit paid/live authorization後にのみP6-3 v3 calibrationを開始する。

この文書自体はpaid/live executionを認可しない。

---

## 14. Provenance

- P6-3 v2 result summary: `docs/findings/p6_3_v2_result_summary_ja.md`
- raw v2 evidence: `docs/findings/evidence/p6-3-v2-live-calibration/state.json`
- v2 live source checkout: `62110faebc0fa748effa90cb0f44f7c05f479c10`
- v2 frozen structural manifest: `harness/frozen/p6-3-el-structural-freeze.json`
- historical selector implementation: `harness/src/context/privileged-retrieval-controller.ts`
- selector introduction commit: `c50532bf5c177a88ffb28001a12e40949c9e2349`
- historical Stage 0.5 selector: `calibration/src/budget-assembler.ts`
- relevant planning records: `docs/stage0_5_plan.md`, `docs/harness_stage0_plan.md`, `docs/stage1_plan.md`
- v3 prototype branch: `p6-3-v3-selector-prototype`
- v3 structural audit workflow run: `36434374075`
- v3 structural audit artifact: `10974742369`

P6-3 v2 remains historical calibration evidence and must not be pooled into future v3 primary M/Rsem estimates.
