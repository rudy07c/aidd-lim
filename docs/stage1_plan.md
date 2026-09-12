# Stage 1（Inheritance / Context Decomposition）実装計画

**対象**：`docs/experiment_plan.md`（v2.6）の Stage 1「Inheritance / Context Decomposition」  
**理論親文書**：`docs/aidd_ilm_paper.md`  
**前提**：Stage 0（Harness Feasibility）・Stage 0.5（Measurement Calibration）は、それぞれ当時のoperationalizationに対してゲート達成済み  
**Stage 1の役割**：`有限context` に混在していた複数のmechanismを、**inheritance / transmission** と **observation / retrieval** の二軸へ分解し、5条件が意図したmechanismだけを操作できる実験装置を完成させる  
**Stage 1 primary model**：GPT-5.6 Luna（API model ID: `gpt-5.6-luna`）。大量のgeneration / repeatを前提とするためcost efficiencyを優先して採用する。Pre-Stage 1 calibrationでArtifact-Fullのprimary taskがfloorにならないことを確認し、main run前にreasoning effort・tool/structured-output設定・API設定をfreezeする。requested model IDとAPI response上のactual model identifierはrun provenanceへ保存する  
**historical baseline**：Stage 0〜0.5で使用したClaude Haiku 4.5のrunは上書きせずhistorical calibrationとして保持する

---

## 0. Stage 1で確定させる研究上の構造

### 0.1 5条件は一本の「Full → Limited」序列ではない

Stage 1では、5条件を単純な制約強度の順序として扱わない。

研究軸は二つある。

#### Axis A：Inheritance / Transmission

\[
\text{MOI}
\rightarrow
\text{Artifact-Full}
\rightarrow
\text{Exposure-Limited}
\]

これは、

> **何が世代間に残るか**

を操作する。

#### Axis B：Observation / Retrieval

\[
\text{Artifact-Full}
\rightarrow
\text{Privileged-Retrieved}
\rightarrow
\text{Agent-Retrieved}
\]

これは、

> **残されたartifactを次世代主体がどう観測・探索できるか**

を操作する。

**Artifact-Full（AF）が両軸のhub condition**である。

### 0.2 5条件

| 条件 | 世代間継承 | Artifact access | Working context | 情報選択 | Stage 1で主に診断するもの |
|---|---|---|---|---|---|
| **Maximal Observable Inheritance（MOI）** | artifact + 直前世代のobservable interaction record \(\mathcal{I}^{obs}_g\) | 全体 | 追加的人工制限なし | 不要 | observable-history availability |
| **Artifact-Full（AF）** | artifactのみ | 全体 | 追加的人工制限なし | 不要 | hub baseline |
| **Exposure-Limited（EL）** | artifactの選択subsetのみ | subsetのみ | static exposure budget \(B_{expose}\) | privileged static selector | irreversible exposure |
| **Privileged-Retrieved Limited（PR）** | artifactのみ | 全体へ再アクセス可能 | \(B_{work}\) | privileged retrieval controller | bounded working cognition |
| **Agent-Retrieved Limited（AR）** | artifactのみ | 全体へ再アクセス可能 | \(B_{work}\) | worker agent自身 | retrieval / information selection |

### 0.3 全条件でfresh agent原則を維持する

MOIを追加しても、**同一sessionを継続しない**。

各generationで新規agent instanceを開始する。

条件差は、

- fresh agentへartifactだけを渡すか
- artifactに加えてobservable interaction recordを渡すか
- artifact accessを制限するか
- working setを有限にするか
- retrieval主体を誰にするか

だけで作る。

したがってMOIは、

\[
Agent_g
\rightarrow
(S_{g+1},\mathcal{I}^{obs}_g)
\rightarrow
fresh\ Agent_{g+1}
\]

であり、

\[
Agent_g = Agent_{g+1}
\]

ではない。

### 0.4 \(\mathcal{I}^{obs}_g\) の定義

paperではobservable historyを \(H_g\) と表現しているが、実験計画には既にhidden evaluator \(H(G)\) が存在する。

実装・ログでは混同を避けるため、

\[
\mathcal{I}^{obs}_g
\]

を使う。

`ObservableInteractionRecord` に含める候補：

- generation \(g\) のvisible task instruction
- observable agent response
- tool calls
- tool results
- agentが明示的に出力したworking note / scratch note
- applied diff
- agentへ実際に返されたfeedback

含めない：

- private chain-of-thought
- model hidden state
- 非出力の内部表象
- `ground_truth.json`
- `GroundTruthDelta`
- hidden tests / hidden evaluator output
- evaluator内部diagnostics
- workerが実際には受け取っていないscoring情報

MOIは**true Full Contextではない**。

> 実験系が観測・保存可能な情報についてのMaximal Observable Inheritance

である。

### 0.5 全過去historyは継承しない

MOIで、

\[
\mathcal{I}^{obs}_1+\mathcal{I}^{obs}_2+\cdots+\mathcal{I}^{obs}_g
\]

を無制限に次世代へ渡さない。

原則として、

\[
\mathcal{I}^{obs}_g
\]

すなわち**直前世代一世代分**だけを渡す。

理由：

- generationとhistory token量を同時に増やさない
- context-window saturationをMOI固有の交絡にしない
- lost-in-the-middleを新しい独立変数にしない
- 世代間伝達というILM的単位を維持する
- 「さらに古い情報を残したければartifactへ刻む」というselection pressureを完全には消さない

一世代のrecord自体は、共通のtool-call上限・output上限等によってoperation上boundedにする。

### 0.6 4つのprimary contrast

#### C0：Observable-history availability

\[
D_{history}
=
Outcome_{MOI}
-
Outcome_{AF}
\]

MOIとAFの違いは、直前世代のobservable interaction recordを追加継承するかどうか。

ただし、Stage 1で得られるC0の短期差を、

> Externalization Pressureの証拠

とは解釈しない。

短期C0が測るのは、

> **observable historyが次taskへ直接どれだけ有用か**

である。

Externalization Pressureはlongitudinal selection effectなので、Stage 2以降で、

- MOI-grown lineage vs AF-grown lineageのartifact structure
- test / type / interface / Spec等への情報外在化
- common-environment evaluation

を通じて判断する。

#### C1：Working-set / Reconstruction effect

\[
D_{work}
=
Outcome_{AF}
-
Outcome_{PR}
\]

AFとPRはartifact-only inheritanceとfull repository availabilityを共有する。C1をworking-set effectへ寄せるため、model-call上限・decision rounds・retry/repair opportunity・common task protocolを可能な限り揃える。PRにはprivileged controllerによるevidence curationがあるため、C1は厳密なpure working-set effectではなく**best-case privileged bounded-observation effect**として解釈する。

#### C2：Retrieval-policy effect

\[
D_{retrieval}
=
Outcome_{PR}
-
Outcome_{AR}
\]

PRとARは、

- artifact-only inheritance
- full repository availability
- same \(B_{work}\)
- same \(E_{max}\)
- same eviction rule

を共有し、retrieval policyだけが異なる。

#### C3：Recoverability / Exposure effect

\[
D_{recoverability}
=
Outcome_{PR}
-
Outcome_{EL}
\]

ELは最初に提示されなかったartifactへ後からaccessできない。

PRは有限working-set制約のもとartifact全体へ再アクセス可能。なおELの \(B_{expose}\) はepisode全体のstatic artifact pool、PRの \(B_{work}\) は同時保持量であり同じresourceではない。PRは累積では \(B_{work}\) を超えるunique artifactを観測できるため、C3はrecoverabilityだけでなくcumulative exposure possibilityも含むcompound contrastとする。

### 0.7 ILM-core secondary contrast

\[
Outcome_{MOI}
-
Outcome_{EL}
\]

は、

\[
\text{Full transmission}
\quad vs \quad
\text{Bottlenecked transmission}
\]

という古典ILMの対照への最も近い操作的比較として保存する。

ただしMOIとELの間では複数factorが同時に変わるため、C0〜C3のような単一mechanism contrastとはみなさない。

### 0.8 Stage 1A / 1B / 1C

MOIは「固定artifactをどう見るか」ではなく「前世代から何を継承するか」というconditionである。

したがってStage 1を三つに分ける。

#### Stage 1A：Fixed-S Observation Decomposition

同一 \(S_0\) に対して、

- AF
- EL
- PR
- AR

を比較し、C1〜C3を診断する。

#### Stage 1B：One-Step Inheritance Diagnostic

同一predecessor episodeから生成した、

\[
(S_{g+1},\mathcal{I}^{obs}_g)
\]

を固定し、次taskでMOI / AFを比較する。

C0の**immediate history utility**を診断する。

#### Stage 1C：Five-Condition Iterated Integration

MOI / AF / EL / PR / ARを10〜15世代通し、5条件がlongitudinal harness上で安定して動くことを確認する。

Stage 1Cでartifact adaptationの科学的結論は出さない。

### 0.9 Stage 1 preflightでfreezeする追加決定

#### 0.9.1 育成条件と評価環境を分離する

longitudinal artifactは、育成条件を明示して

\[
S_g^{[c_{train}]}
\]

と表し、評価は

\[
M\left(S_g^{[c_{train}]};e_{eval}\right),
\qquad
R^{sem}\left(S_g^{[c_{train}]};e_{eval}\right)
\]

と記録する。native / common-environment / reciprocal evaluationをlog schema上でも区別する。MOIでhistory付きnative evaluationを行う場合は、artifact-only evaluationと区別してhistory inputを明示する。

#### 0.9.2 MOIはExternalization Pressureをゼロにしない

MOIは直前世代の \(\mathcal I_g^{obs}\) を追加継承することでartifactへの外在化圧力の一部を緩和するが、全過去historyを継承しないため、二世代以上先へ保持する情報についてはなおartifact等への外在化が必要である。MOIを`pressure = 0` controlとは解釈しない。

#### 0.9.3 selection signature

Stage 2以降でselection pressureを主張する際は、

\[
\text{Condition}
\rightarrow
\text{Differential Preservation / Reconstruction}
\rightarrow
\text{Trait Change}
\rightarrow
\text{Environment-specific Advantage}
\]

のevidence chainを用いる。Stage 1のimmediate performance差だけではselection mechanismを主張しない。

#### 0.9.4 execution modeをprimary contrastで揃える

C1〜C3のprimary comparisonではBatch/Syncを混在させない。AF / EL / PR / ARで、model、reasoning、output schema、model-call上限、decision opportunity、retry / repair ruleを可能な限り共有する。Batchはindependent calibrationに限定してよい。

#### 0.9.5 scientific lineageではtaskを循環再利用しない

現行Stage 0 orchestratorの `tasks[gen % tasks.length]` はStage 1 scientific runへ持ち込まない。GroundTruthDeltaは同一IDを再追加できないため、Stage 1Cでは10〜15個のvalid unique taskを一度ずつ適用する。Stage 2開始前に30〜50世代分のvalid unique delta sequenceを別途準備する。

---

## 1. Stage 0 / 0.5の扱い

今回の5条件化によってStage 0 / 0.5を「失敗」としてやり直さない。

### Stage 0

Stage 0で確認済みなのは、

> fresh session → artifact read → modification → scoring → repository persistence → next generation

というharness feasibilityである。

これは5条件化後もそのまま基盤となる。

### Stage 0.5

Stage 0.5で確認済みなのは、

> static subsetとして提示するartifact-derived information量に \(R^{sem}\) と \(M\) が反応する

というmeasurement sensitivityである。

これは現在の概念では主として**EL / static exposure型のhistorical calibration**として扱える。

ただし、

- PR / ARのfinite working-set
- MOIのhistory inheritance
- model/provider変更後の挙動

にはそのまま転用しない。

Stage 1事前準備で追加較正する。

---

## 2. Pre-Stage 1 / P0：理論・文書・命名の同期

本実装前に以下を同じ定義へ揃える。

1. `docs/aidd_ilm_paper.md`
2. `docs/experiment_plan.md`（v2.6）
3. `docs/stage1_plan.md`
4. `docs/findings/` のmethodology note
5. code側 `ContextCondition` / `InheritanceMode`

固定する名称：

- `maximal-observable-inheritance`
- `artifact-full`
- `exposure-limited`
- `privileged-retrieved-limited`
- `agent-retrieved-limited`

旧名称：

- `full`
- `simple-limited`
- `privileged-limited`

はhistorical config compatibilityのため必要な範囲で残すが、新runのprimary condition名には使わない。

**Gate P0**

- paper / experiment plan / Stage 1 plan / code namingが一致
- MOIを「same session」と記述している箇所がない
- paperの \(H_g\) とhidden evaluator \(H(G)\) の記号衝突が実装文書で解消されている

---

## 3. Pre-Stage 1 / P1：Model / API migration とfreeze

### 3.1 primary model

Stage 1 primary modelは **GPT-5.6 Luna**（`gpt-5.6-luna`）とする。Lunaは現行GPT-5.6 familyのcost-sensitive / high-volume tierであり、Stage 1の大量反復で必要なcost efficiencyを優先する基準モデルとして採用する。能力面は事前に仮定せず、Artifact-Full calibrationでprimary taskがfloorにならないことを採用gateとする。

ただしmodel tierの継続的更新と実験再現性は分離する。main run開始前に、利用可能なmodel identifier、reasoning effort、endpoint、tool / structured-output設定、retry policyをfreezeし、requested model IDとAPI response上のactual model identifierを必ず保存する。dated snapshotが利用可能な場合はその採用を優先検討するが、存在を前提にはしない。

Stage 1本実験前に、実際に使用するmodel identifier、endpoint、reasoning設定等をfreezeする。

2026-09時点のOpenAI公式model referenceではGPT-5.6 LunaはResponses API、function calling、Structured Outputs、Batchをサポートしている。ただしmodel familyやrecommended modelは将来変化しうるため、**本番run前に再確認して固定**する。

### 3.2 provider-neutral backend

```text
harness/src/agent-backend/
  anthropic.ts        # historical / robustness comparison用
  openai.ts           # Stage 1 primary候補
  types.ts
```

provider-neutral interfaceで少なくとも：

- one-shot modification
- episodic multi-turn modification
- structured modified-files output
- tool calling
- explicit working note
- usage
- latency
- provider/model id
- normalized errors

を扱えるようにする。

### 3.3 model / request freeze

本run開始前に固定：

- provider
- model identifier
- snapshot / dated modelが利用可能ならそのidentifier
- reasoning effort
- max output
- structured-output schemaのversion / hash
- system/common promptのversion / hash
- tool policy / tool schema version
- requested service tier（primary Sync runではproject setting依存の`auto`を避け、原則`default`を明示）
- prompt-cache policy（implicit / explicit等）
- retry policy
- timeout
- SDK version
- store / truncation policy

requested modelとAPI response上のactual model id、requested / actual service tierを両方logする。

**freeze必須fieldはraw config上で明示されていることを検査する。** `run.ts`等でdefaultを補った後に「値が存在する」ことだけを検査してはならない。これを許すと、設定ファイルに書かれていないprovider default / harness defaultがmain runへ混入してもfreeze済みと誤判定するためである。

### 3.4 Batch API：P1で実装必須

GPT-5.6 Lunaをcost-sensitive / high-volume experimental modelとして採用するため、**P2へ進む前にOpenAI Batch API経路を実装する**。

Batchはprovider-neutral `AgentBackend.run()`そのものへ押し込まず、同じResponses request body・structured-output schema・model freeze設定・result normalizationを再利用する独立の`BatchRunner` / `OpenAIBatchClient`層として実装する。Batchは非同期jobであり、同期的な1 episode executionとはlifecycleが異なるためである。

最低実装要件：

1. 各requestをunique `custom_id`付きJSONLへserializeする
2. method=`POST`、url=`/v1/responses`を使用する
3. input fileをpurpose=`batch`でuploadする
4. `completion_window=24h`でbatch jobを作成する
5. batch status / request countsを取得できる
6. output file / error fileを取得し、`custom_id`で元requestへ対応付ける
7. response bodyからstructured mutation / probe answer、actual model、usage、request errorをsync pathと同じ研究用型へnormalizeする
8. Batch料金でcostを計算し、Sync料金と混同しない
9. batch id、input/output/error file id、custom_id、endpoint、completion window、status、pricing modeをprovenanceとして保存する

Batchを使うprimary用途：

- balanced semantic probe calibration
- Luna capability-floor calibration
- static EL calibration
- independent fixed-S AF calibration / variance pilot
- tool callを必要としない独立repeat

Batchを使わないprimary用途：

- C1〜C3のprimary condition comparison（AF / EL / PR / ARは同一Sync execution modeへ揃える）
- PR / ARのinteractive paging / retrieval
- Stage 1Bで前段episodeに依存するMOI / AF comparison
- Stage 1C longitudinal generation loop
- application-side custom function toolの結果を同一episode中に返す必要がある処理

したがってBatch / Syncは**研究条件ではなくexecution infrastructure**である。Batchによる50% discountや別rate-limit poolはexperiment throughput改善に利用するが、condition contrastへ混入させない。

### 3.5 Failure semantics

API / network / provider infrastructure failureとmodel-originated failureを分離する。

- provider timeout、5xx、rate-limit exhaustion等：frozen retry policy後も解消しなければepisode / runをinvalidまたはcensoredとし、**有効なgenerationとしてlineageを進めない**
- Responses `incomplete` / `failed` / refusal：response status / incomplete details / refusal情報を保存し、generic JSON parse failureへ潰さない
- valid responseだがstructured mutationを満たさない、またはmutation/path validationに失敗：model-originated protocol outcomeとして別statusで記録する
- harness内部例外：`provider-error`へ偽装せずharness/infrastructure errorとして停止する

この区別は、外部API障害を有限context条件のtask failureとして誤計上しtrajectoryへ混入させないために必要である。

**Gate P1**

- selected OpenAI modelでSync one-shot structured outputが動く
- function callingが動く
- Sync pathでusage/model/error provenanceが取れる
- raw config上でfreeze必須fieldの明示指定を検査できる
- requested / actual service tier、prompt/schema version/hash、response incomplete/refusal detailsを記録できる
- provider/infrastructure failureでlineageを有効generationとして進めない
- independent tool-free requestをBatch JSONLへserializeできる
- `/v1/responses` Batchをcreate / retrieve / output-error decodeできる
- Batch resultを`custom_id`で元requestへ対応付け、usage/model/error/cost provenanceを正規化できる
- Sync / Batchのpricing modeがlog上で区別される
- primary C1〜C3でBatch/Syncが混在しないことをconfig / runnerで検証できる
- existing Stage 0 mock regressionを壊していない

---

## 4. Pre-Stage 1 / P2：ObservableInteractionRecord / MOI runtime

5条件化で新しく必要になる中核層。

### 4.1 型

例：

```ts
interface ObservableInteractionRecord {
  schemaVersion: string;
  generation: number;
  taskId: string;
  visibleInstruction: string;

  observableAssistantMessages: string[];

  toolEvents: Array<{
    toolName: string;
    arguments: unknown;
    result: unknown;
  }>;

  explicitWorkingNote: string | null;

  appliedChanges: Array<{
    path: string;
    operation: "add" | "modify" | "delete";
  }>;

  visibleFeedback: Array<{
    source: string;
    content: string;
  }>;

  tokenCount: number;
  sourceBreakdown: {
    ephemeralRationaleTokens: number;
    taskFeedbackTokens: number;
    artifactRedundantTokens: number;
    mutationMetadataTokens: number;
  };

  contentHash: string;
}
```

実装時にfield名は調整してよい。

### 4.2 「observable」の機械的境界

`ObservableInteractionRecord`はpost-hocに好きな情報を追加しない。

また、`explicitWorkingNote`を生成させる場合、そのprompt wordingは全条件で共通かつneutralにする。workerへ「successorへのhandoff」「次世代へ渡るnote」等と伝えない。AF等で実際には継承されないchannelをworkerが利用可能だと誤認すると、artifactへの外在化行動そのものを変える可能性があるためである。workerには単に**observable episode note**として事実・依存・riskを短く記録させ、MOIだけが後段のinheritance conditionとしてそのrecordを継承する。

原則：

> **workerがgeneration中に生成した、またはworkerへ実際に提示された情報のみ**

を候補にできる。

evaluator-only dataからhistoryを生成してはならない。

### 4.3 forbidden fields test

CI / testで以下がrecordへ混入していないことを検査する。

- ground truth entity ids / delta raw object
- hidden test source
- hidden evaluator result
- evaluator reasoning
- unrevealed scoring details
- system-side privileged relevance score
- private chain-of-thought

### 4.4 visible feedbackの扱い

現行harnessがagentへscoring結果を返していない場合、MOI recordへscoringを勝手に追加しない。

`visibleFeedback`には**実際にworkerへ返したfeedbackだけ**を入れる。

Stage 1中にrepair loopを導入しないなら、通常は空でもよい。

### 4.5 explicit working note

AR/PR等でagentに明示的working noteを出させる場合、MOIではそれをobservable historyとして次世代へ渡せる。

ただしprivate reasoningではなく、専用fieldとして明示的に出力させる。

### 4.6 history itemのsource tagging

MOI historyには、非artifact的なrationaleだけでなく、tool resultとして取得したrepository断片やapplied diffも含まれる。これらを一括して「非artifact context」と解釈すると、history継承効果とartifact re-exposure / salience効果を混同する。

各itemを少なくとも次へ分類する。

- `ephemeral-rationale`
- `task-feedback`
- `artifact-redundant`
- `mutation-metadata`

raw item自体とcategoryを保存し、token countもcategory別に集計する。

Stage 3では`artifact-redundant`だけを除いたMOI history等のablationを可能にする。

### 4.7 前世代一世代だけ

orchestratorはgeneration \(g+1\) 開始時に、

- MOI：`repository + previousInteractionRecord`
- その他：condition定義に応じたrepository情報のみ

を渡す。

`allPriorInteractionRecords[]`をpromptへ積まない。

log保存用には全generation recordをdiskへ保持してよい。

### 4.8 MOI history size

MOIだけhistory量が無制限に増えないよう、一世代episodeの：

- max agent output
- max tool calls
- max tool-result size
- explicit note max tokens

を全条件共通または機能的に対応する形でfreezeする。

MOI recordが事前上限を超えた場合の扱いを本実験前に固定：

候補：

1. run invalid
2. deterministic lossless structural trimming不可能ならepisode上限そのものを下げる
3. semantic summarizationでの圧縮は新たなselector/biasになるため主実験では避ける

初版推奨：**episode生成側の上限でrecordをboundedにし、MOI継承時に後処理summarizationしない**。

### 4.9 MOI prompt assembly

MOI用promptは、

```text
SYSTEM / common task protocol
CURRENT TASK
PREVIOUS OBSERVABLE INTERACTION RECORD
CURRENT REPOSITORY
```

など、固定順で組み立てる。

AFとの差がhistory有無以外へ広がらないよう、MOI/AFのcommon prompt wordingを可能な限り共有する。

### 4.10 Operational-Full feasibility invariant

AF / MOIでは全repository（MOIは加えて直前history）を追加的な人工制限なしで渡すため、model contextへ無truncateで収容できること自体を実験invariantにする。

\[
tokens(S_g)
+ tokens(\mathcal{I}^{obs}_{g-1})_{\mathrm{MOI}}
+ fixed\ overhead
+ reserved\ output
< context\ capacity
\]

をgenerationごとに検査する。

超過時のsilent truncationは禁止。Stage 1本実験前に、`invalid/censored runとして停止`を基本とする規則をfreezeし、必要ならworld規模・generation horizonを再設計する。

**Gate P2**

- recordがgenerationごとに生成される
- hidden data contamination testが通る
- MOIでfresh backend instanceが作られる
- MOI generation \(g+1\) が直前recordだけ受け取る
- AFは同じrepositoryを受け取るがrecordは受け取らない
- record hash / tokensとsource breakdownがlogされる
- AF/MOIでOperational-Full feasibility invariantを検査できる

---

## 5. Pre-Stage 1 / P3：Stage 0.5測定器の修正

### 5.1 Legacy static budgetの保持

既存 `calibration/src/budget-assembler.ts` のstatic subset calibrationは削除しない。

historical意味：

> Exposure-Limited型measurement calibration

新しいworking-set calibrationとは別物として保持する。

### 5.2 Boolean probeをbalancedにする

Stage 0.5 primary boolean probesはpositive label偏りを持っていた。

Stage 1ではmatched negativeを追加する。

例：

- invariant violating state → true
- matched invariant-satisfying state → false
- unsafe shortcut → true
- matched safe shortcut → false

検査：

- true/false label balance
- always-true baseline
- always-false baseline
- leakage scan
- parse robustness

constant-answer strategyが高得点を取れないことをgateとする。

### 5.3 Token counting

Stage 0/0.5のchar-based approximationはhistorical runの記録として残す。

Stage 1ではcanonical token countingを導入。

同時にlog：

- canonical artifact/history tokens
- chars
- provider reported input/output
- working-set peak
- cumulative retrieved tokens

### 5.4 ArtifactUnit

static exposureとdynamic retrievalで同じ情報単位を扱えるよう正規化する。

```ts
interface ArtifactUnit {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  tokenCount: number;
  kind: "file" | "chunk" | "search-result" | "listing";
}
```

`ArtifactUnit.tokenCount` はcontent単体ではなく、**modelへ実際に提示するartifact evidence全体**をcanonical tokenizerで数えた値とする。model-visible serializationは `serializeArtifactUnitForWorkingSet(unit)` に一元化し、初版では `path + line range + content` を提示する。`kind` はharness側のprovenance / selector metadataでありmodel-visible evidenceには含めない。

大きな1 fileだけで \(B_{work}\) を超えることを避けるためchunk readを前提にする。chunk capも同じmodel-visible serialization全体に対して適用する。

### 5.5 shared utilities

重複している：

- file classification
- path normalization
- token counting
- artifact chunking

をshared layerへ寄せる。

legacy Stage 0/0.5 behaviorはregression testで保持する。

**Gate P3**

- balanced boolean probes
- constant-answer baseline rejection
- canonical token counter
- ArtifactUnit
- legacy calibration regression

---

## 6. Pre-Stage 1 / P4：Bounded Working-Set Runtime

### 6.1 定義

PR / ARで有限なのは「一度でも読める総量」ではない。

\[
|W_t| \le B_{work}
\]

である。

repository全体は常に再アクセス可能。

ただし「再アクセス可能」と「provider会話履歴に過去artifactが残り続ける」は別である。working-setからevictしたchunkがAPI thread historyまたはmodel-internal continuation stateに残れば \(B_{work}\) 制約を迂回できるため、PR / ARでは各reasoning stepを**research-stateless request**として再構築する。入力はcurrent \(W_t\) + bounded explicit memory + current task + fixed system/tool schemaのみとする。

禁止するcontinuation stateには少なくとも以下を含む：

- `previous_response_id`
- provider conversation / thread
- prior assistant message historyを無制限に再送すること
- `reasoning.encrypted_content`
- Responses compaction item
- その他、modelのprior reasoning stateを次stepへ復元するopaque / persisted state

OpenAI API上で`store=false`かつreturned output itemsを手動再送する方式はAPI運用上はstatelessと呼べるが、本研究では**encrypted reasoning等がevict済みartifact evidenceを内包しうるためresearch-statelessとはみなさない**。PR / ARでは各stepを新しいinferenceとして起動し、必要な継続情報は明示的memoryへ外在化して \(B_{work}\) に算入する。

さらに、artifact evidenceのbudget enforcementはcondition runner / `WorkingSetManager`だけが行う。provider backendは受け取ったactive evidenceを勝手に再truncateしない。backend側の二重truncateは、selectorが選んだ \(W_t\) とmodelが実際に見た \(W_t\) をずらすため禁止する。

### 6.2 \(B_{work}\) に含める

\(B_{work}\) は**model-visible artifact evidence tokens**として定義する。artifact contentだけを数えるのではなく、modelがevidenceを解釈するため実際に提示されるrepository-derived framingも含める。`ArtifactUnit`では `serializeArtifactUnitForWorkingSet(unit)` を唯一の会計・提示形式とし、初版は `path + line range + content` をcanonical token countする。`kind` はmodelへ提示しないharness-side provenanceなので算入しない。

- active artifact chunks（path + line range + contentのmodel-visible serialization全体）
- retained search/listing artifact evidence（modelへ提示されるserialization全体）
- explicit working note / summary
- task遂行のためagentがpersistentに保持する明示的repository-derived memory

`WorkingSetManager`はこの会計の唯一のbudget authorityとし、`ArtifactUnit.tokenCount`の自己申告値も同じserializationから再計算して検証する。provider backendによる二重truncateは引き続き禁止する。

### 6.3 原則として \(B_{work}\) から除外

独立変数をartifact cognitionへ限定するため、別logとする：

- system prompt
- current visible instruction
- tool schemas
- final output tokens
- API transport上の再送overhead

ただしAPI billing inputと実験上の \(B_{work}\) は別々に記録する。

### 6.4 explicit memory

multi-turn pagingでagentが以前の観測を統合できるよう、

`workingNote`

等の明示的memory fieldを持たせる。

- private chain-of-thoughtを要求しない
- unlimited scratchpadは禁止
- 次turnへ持ち越す内容は \(B_{work}\) を消費する

### 6.5 eviction

Stage 1ではeviction policyを研究変数にしない。

PR / AR共通のdeterministic policyとして **FIFO-v1** をfreezeする。

- capacity pressure時は、admission sequenceが最も古いactive `ArtifactUnit`から必要量だけevictする
- explicit working memoryはpersistent / pinnedとし、`B_{work}`へ算入するがeviction victimにはしない
- explicit memory増加がcapacity pressureを生む場合も、artifact unit側へ同じFIFO-v1を適用する
- incoming unit + pinned memoryだけで `B_{work}` を超える場合は、既存unitをevictする前にatomic rejectする
- explicit memory単体が `B_{work}` を超える場合もatomic rejectする
- manual victim指定はharness/controller diagnostic専用であり、PR / AR workerへagent-selectable policyとして公開しない
- Step 5以降、rereadは**以前admit済みかつ現在inactiveな同一 `ArtifactUnit`** に限って許可する
- reread成功時はfresh admission sequenceを付与し、FIFO上は最も新しいentryとして再admitする
- already-active unitのrereadはFIFO ageをrefreshせずrejectする
- reread evidenceはcumulative retrieved / admission tokensへ再度算入するが、unique observed unit数は増やさない
- 同一unit IDでpath / line range / content / kind等が変化したevidenceはepisode内aliasingを避けるためrejectする
- reread自体がcapacity pressureを起こす場合も同じFIFO-v1でevictし、incoming reread + pinned memoryだけで `B_{work}` を超える場合はatomic rejectする
- reread回数・累積探索量の上限はStep 6の `E_{max}` で別途freezeする

FIFOを選ぶ理由は、LRUのように「access / touch」を何とみなすかをStep 5より前に定義せずに済み、retrieval policyとeviction policyを分離しやすいためである。

PR / ARは**同一のFIFO-v1**を用い、C2ではretrieval policyだけを変える。

### 6.6 exploration resource

\[
E_{max}
\]

を別に定義する。

候補：

- max retrieval turns
- max tool calls
- max API calls
- max wall-clock

\(E_{max}\) はPR / ARで同一。

通常taskで容易にはbindingにならない値へ較正する。

actual：

\[
E_{used}
\]

をlogする。

### 6.7 AF / PR / ARのdecision opportunity統制

C1をworking-set effectへ寄せるには、AFが1回call、PRが複数回callというだけで推論機会が増減しないようにする必要がある。

Stage 1Aでは可能な限り以下を揃える。

- max model calls / decision rounds
- max output tokens per step / total
- retry / repair opportunity
- common task protocol
- final mutation opportunity

AFを同じepisodic runnerへ通すことが可能ならそれを優先する。ただしAFでは全artifactをactive working contextとして保持し、retrieval自体は不要とする。

それでもPRにはprivileged curationが残るため、C1の名称・解釈は`pure working-set effect`ではなく**best-case privileged bounded-observation effect**とする。

### 6.8 common episodic runner

```text
current task
    ↓
current working set + explicit memory
    ↓
agent step
    ↓
condition-specific information controller
    ↓
working-set update / eviction
    ↓
agent step
    ↓
...
    ↓
final modification
```

PR / ARは同じstate machineを使う。

ELはstatic exposureだが、可能な範囲で同じagent result schemaを使う。

**Gate P4**

- PR / ARでfull repoへのre-accessが可能
- \(B_{work}\) invariantが常時成立
- evicted evidenceを再取得できる
- explicit memoryがbudget計数される
- \(E_{max}\) と \(B_{work}\) が分離
- evicted evidenceがprovider-side historyから再参照不能
- AF/PR/ARのdecision opportunity差が事前規則内

---

## 7. Pre-Stage 1 / P5：Repository Accessor・Security・Logging

### 7.1 provider-neutral RepositoryAccessor

```ts
interface RepositoryAccessor {
  listFiles(args): Promise<...>;
  search(args): Promise<...>;
  readChunk(args): Promise<...>;
}
```

provider SDKへrepository semanticsを埋め込まない。

### 7.2 AR tool set

初版：

- `list_files(directory?)`
- `search(query)`
- `read_file_chunk(path, startLine?, endLine?)`

tool resultはartifact-derived informationとしてworking-set計数対象。

### 7.3 PR controller

PRは同じRepositoryAccessorをevaluator-side controllerから利用する。

worker自身がGTを受け取らない。

### 7.4 read isolation

virtual root：

```text
synthetic-world/repository/
```

のみ。

禁止：

- `ground_truth.json`
- `heldout_tasks.json`
- hidden tests
- evaluator source
- run logs
- repo外filesystem

guard：

- absolute path
- `..`
- normalized escape
- symlink escape

### 7.5 write isolation

`modifiedFiles` / future mutation schemaのpathもrepository root内へ限定する。

Stage 0実装のmerge pathを信頼しない。

### 7.6 raw logs

各agent/retrieval stepで：

- condition
- inheritance mode
- generation
- step
- current task
- previous interaction record hash / token count（MOI）
- retrieval policy
- tool args
- returned ArtifactUnit ids
- content hash
- working-set before / after
- evicted units
- explicit working note
- \(B_{expose}\)（EL）
- \(B_{work,used}\)
- unique observed tokens
- total retrieved tokens
- retrieval count
- API usage
- latency
- cost

後から

\[
Exposed(x,C_g)
\]

を再構成できる粒度を目指す。

**Gate P5**

- hidden read impossible
- write escape impossible
- history contamination impossible
- working-set trajectory再現可能
- MOI継承record再現可能

---

## 8. 5条件の具体的実装

### 8.1 Maximal Observable Inheritance（MOI）

generation \(g+1\) のworker入力：

- current visible instruction \(T_{g+1}\)
- current full repository \(S_{g+1}\)
- previous generation's \(\mathcal{I}^{obs}_g\)

追加的working-set restrictionなし。

ただしAPI/model自身のcontext windowは当然有限であり、「true infinite Full」とは呼ばない。

MOI conditionで比較する対象は**observable inheritance availability**である。

### 8.2 Artifact-Full（AF）

generation \(g+1\) のworker入力：

- current visible instruction
- current full repository

\(\mathcal{I}^{obs}_g\) は渡さない。

artifact-only inheritanceのbaseline。

### 8.3 Exposure-Limited（EL）

- artifact-only inheritance
- privileged relevance policyでinitial static subset選択
- static exposure budget \(B_{expose}\) 相当量を提示
- 未提示artifactへepisode中アクセス不可
- workerにGTは見せない

AF/PRと比較可能なselector semanticsへ寄せる。

### 8.4 Privileged-Retrieved Limited（PR）

- artifact-only inheritance
- full repository availability
- \(B_{work}\)
- evaluator-side privileged controller
- evict / re-read可能
- bounded explicit memory
- \(E_{max}\)

### 8.5 Agent-Retrieved Limited（AR）

PRと共有：

- artifact-only inheritance
- full repository availability
- same \(B_{work}\)
- same \(E_{max}\)
- same eviction
- same tools

違い：

> retrieval actionをworker自身が決める

のみ。

---

## 9. Privileged Relevance Policy

### 9.1 利用可能なevaluator-side情報

- `ground_truth.json`
- current \(G_g\)
- current task GroundTruthDelta
- semantic locality
- dependency graph
- source mapping

これらは**selection計算にだけ使用可能**。

workerへGT-derived explanationを直接提示しない。

### 9.2 Entity → ArtifactUnit mapping

Ground Truth EntityIdをsource chunkへ写像する明示mappingを用意する。

命名規則による曖昧な文字列推測だけに依存しない。

### 9.3 EL / PR policyを可能な限り共有

C3をcleanにするため、

- EL：ranking上位をinitial static subset
- PR：同じranking policyをstepwise retrievalへ利用

とする。

### 9.4 Determinism

同一

\[
(S,T,G)
\]

なら同じrankingを返す。

Stage 1でLLM selectorは使わない。

---

## 10. Pre-Stage 1 / P6：再較正

### 10.0 Primary task eligibility

旧Stage 0.5では、当時のmodelでArtifact-Fullでも恒常的に失敗するtaskが存在した。primary model移行後は、その旧結果だけでtaskを除外せず、main comparisonとは独立したcalibration repeatでtask適格性を再評価する。

事前にfreezeする集合：

\[
\mathcal T_{primary}
\]

- AFでsuccess probabilityがfloorではない
- compiler/system/protocol failureだけで決まらない
- visible test / prompt leakageがない
- condition差を測る余地がある

\[
\mathcal T_{challenge}
\]

- AFでも難しいが、diagnostic / stress testとして価値があるtask

構成A（通常feature task）をprimary outcomeの中心に置き、構成B（invariant-stressingを含む）はdiagnosticとして別集計する。閾値、repeat数、分類理由はStage 1Aのcondition差を見る前にfreezeする。

### 10.0.1 Luna capability-floor gate

GPT-5.6 Lunaはcost efficiencyを優先して採用するため、main comparison前にmodel capability floorを明示的に検査する。Artifact-Fullで \(\mathcal T_{primary}\) が恒常的に失敗する、または \(R^{sem}\) / \(M\) がfloorへ張り付く場合、そのtaskはchallenge setへ移す。primary task全体がfloorとなる場合のみ、model選択自体を再検討する。

このgateはLunaを有利に見せるためのpost-hoc task除外ではなく、context conditionを測定できるexperimental organismとして十分なheadroomがあるかをmain condition comparison前に確認するためのmeasurement calibrationである。

### 10.1 AF baseline

selected primary modelで、

- balanced \(R^{sem}\)
- \(M\)

のAF baselineを再取得。

### 10.2 EL static exposure

複数static exposure budget：

\[
B_{expose} \in \{0,B_1,B_2,\ldots,AF\}
\]

でdose-response確認。

既存1K/2Kは候補であり、model/token-counter変更後に再freezeする。

### 10.3 PR working-set dose-response

複数 \(B_{work}\) で：

- \(R^{sem}\)
- \(M\)
- \(E_{used}\)
- eviction
- unique observations
- total retrieved tokens

を測る。

確認：

> **finite simultaneous working setでもmeasurement sensitivityがあるか**

### 10.4 AR smoke / non-floor

ARはretrieval能力そのものが研究変数。

「PR並みに高得点」をgateにしない。

確認：

- tools work
- full repo re-access works
- budget works
- pathological floor onlyではない

### 10.5 MOI serialization preflight

MOIについては「budget dose-response」は不要。

代わりに：

- record schema安定
- token accounting
- hidden leakageなし
- same predecessor episodeからMOI/AF next-stepを作れる
- MOI promptがhistoryなしAF promptと機能的に同じcommon template
- record sizeがoperation上bounded

を較正する。

### 10.6 freeze

Stage 1本実験前に：

- \(B_{expose}\)
- \(B_{work}\)
- \(E_{max}\)
- eviction policy
- MOI record schema
- MOI max observable-record size
- model settings
- probe bank
- task set

をfreezeする。

**Gate P6**

5条件すべてがnon-degenerateでmechanistically valid。

---

## 11. Equivalence / Uncertainty設計

### 11.1 \(\Delta_M,\Delta_R\)

観測後のSDからequivalence marginを逆算しない。

まず、

> 研究上どの差以下なら実質同等とするか

を定義する。

その後variance pilotでrepeat数を決める。

### 11.2 Stage 1A paired design

同一：

- fixed artifact
- task/probe
- repeat id
- model settings

でAF / EL / PR / ARを対応させる。

### 11.3 Stage 1B paired predecessor design

MOI/AFは、

**同じpredecessor episodeから得た同じ \(S_{g+1}\) と \(\mathcal{I}^{obs}_g\)**

を共有する。

次世代taskも同一。

differenceはhistoryを渡すかだけ。

### 11.4 CI

各contrastで、

\[
CI(D_M)
\]

\[
CI(D_R)
\]

を計算。

equivalence主張はCI全体が事前margin内へ入ることを要求する。

wide CI：

> 判定不能

とする。

### 11.5 C0の解釈制限

C0でMOI > AFが出ても、

> history lossがartifactを変えた

とはStage 1では言わない。

言ってよいのは、

> historyがnext-step performance / reconstructionへ直接寄与した

まで。

---

## 12. Stage 1A：Fixed-S Observation Decomposition

### 12.1 Repository

全conditionで同一完成artifact \(S_0\)。

artifact evolutionを起こさない。

### 12.2 Conditions

- AF
- EL
- PR
- AR

MOIは含めない。

理由：

> fixed \(S_0\) だけでは「前世代から何を継承したか」というMOIの意味が成立しない。

### 12.3 System 1

\[
\hat R^{sem}_{AF}(S_0)
\]

\[
\hat R^{sem}_{EL}(S_0)
\]

\[
\hat R^{sem}_{PR}(S_0)
\]

\[
\hat R^{sem}_{AR}(S_0)
\]

### 12.4 System 2

同一held-out task setに対して：

\[
\hat M_c(S_0)
=
\frac{1}{|\mathcal T|}
\sum_i
\mathbf{1}
[
success(S_0,T_i,c)
]
\]

### 12.5 Primary contrasts

- C1 AF − PR
- C2 PR − AR
- C3 PR − EL

### 12.6 Diagnostic resource metrics

- unique observed tokens
- total retrieved tokens
- distinct chunks/files
- retrieval count
- eviction count
- context churn
- \(E_{used}\)
- semantic locality coverage
- latency
- API billing tokens
- cost

### 12.7 Stage 1A gate

答える：

1. privileged curationを与えたbest-case bounded observationでもAFとの差は残るか
2. self-retrievalは追加損失を生むか
3. irreversible static exposureとrecoverable bounded working cognitionというcompound environmentsは異なるか
4. \(R^{sem}\) と \(M\) で解釈は一致するか

---

## 13. Stage 1B：One-Step Inheritance Diagnostic

### 13.1 なぜ別実験にするか

MOIはartifact stateだけでは定義できない。

必要なのは、

\[
S_{g+1}
\]

と、

\[
\mathcal{I}^{obs}_g
\]

を生成した**predecessor episode**である。

### 13.1.1 Primary predecessor fixtureの適格条件

Stage 1Bのprimary pairは、predecessor historyが単に長いだけでなく、情報的に意味を持つことを事前確認する。

必須条件：

1. \(\mathcal I^{obs}_{pre}\) 内に \(T_{next}\) と関連するobservable informationが存在する
2. その情報が \(S_{next}\) に完全には重複していない
3. Ground Truth / hidden evaluator / unrevealed scoring情報を含まない
4. fixture eligibility判定はMOI / AFのnext-step outcomeを見る前に行う

artifactに完全外在化済みのhistory、無関係historyはnegative control / sham-history側へ回す。

### 13.2 paired episode生成

各pairについて：

1. standard \(S_{pre}\) を用意
2. predecessor task \(T_{pre}\)
3. selected primary modelで一度episode実行
4. output：
   - \(S_{next}\)
   - \(\mathcal{I}^{obs}_{pre}\)
5. この2つをimmutable fixtureとしてfreeze

重要：

MOI/AF群ごとにpredecessorを別々に生成しない。

それをすると \(S_{next}\) 自体が変わり、C0がconfoundedになる。

### 13.3 next-step comparison

同一 \(T_{next}\) にfresh agent：

#### MOI

\[
input =
(S_{next},\mathcal{I}^{obs}_{pre},T_{next})
\]

#### AF

\[
input =
(S_{next},T_{next})
\]

### 13.4 task pair設計

predecessor/next pairは、historyが原理的に：

- useful
- potentially irrelevant
- misleadingではない

複数タイプを含める。

単一のhistory-tailored taskだけでC0を測らない。

候補：

- prior design rationaleが次taskに関係
- prior tool explorationで発見したdependencyが次taskに関係
- prior interactionとは弱く関連
- artifactにすでに完全外在化された情報

### 13.5 sham-history placebo diagnostic

C0でMOIがAFを上回った場合、それがhistory内容の意味によるのか、単に入力token数やprompt sectionが増えたためなのかを診断する。

longitudinal 5条件とは別に、Stage 1B限定で`MOI-sham`を用意する。

- real MOIと同程度のhistory token量
- 同じschema / placement
- 別predecessor episode由来で \(T_{next}\) に無関係
- hidden informationは当然含まない

比較：

\[
MOI_{real},\quad MOI_{sham},\quad AF
\]

`MOI-sham`は第6のlineage conditionではなく、C0解釈用のplacebo controlである。

### 13.6 outcomes

- \(R^{sem}\)
- \(M\)
- immediate task success
- history references in observable response（diagnostic）
- history tokens
- total input tokens
- latency/cost

### 13.7 Stage 1B gate

C0：

\[
D_{history}^{immediate}
\]

が推定可能で、real historyとsham historyの差もdiagnosticに確認できる。

ただしExternalization Pressureのtrajectory claimは出さない。

---

## 14. Pre-Stage 1 / P6.5：MOI対応Semantic Element Trace

既存traceの`Exposed(x,C_g)`だけでは、MOIでsemantic element \(x\) をartifactから見たのかhistoryから見たのか区別できない。

Stage 1C開始前に、少なくとも以下へ拡張する。

\[
Present^{syn}(x,S_g)
\]
\[
Present^{beh}(x,S_g)
\]
\[
Present^{hist}(x,\mathcal{I}^{obs}_{g-1})
\]
\[
Exposed^{artifact}(x,C_g)
\]
\[
Exposed^{history}(x,C_g)
\]
\[
Reconstructed(x,A_g)
\]
\[
Preserved(x,S_{g+1})
\]

これにより、例えば

```text
historyには存在
artifactには不存在
→ MOIではhistory経由で再構成
→ 後世代でtest/type/specへartifact化
```

というartifact re-externalizationの経路を追跡できる。

**Gate P6.5**

- MOIでartifact-source / history-source exposureを区別可能
- history item source tagとtraceが対応
- AF/EL/PR/ARではhistory-source exposureが常にfalse

---

## 15. Pre-Stage 1 / P7：Longitudinal Evaluator修正

### 15.1 現状問題

Stage 0 scoringは、

- base hidden tests
- current task-specific test

を中心に実行する。

過去taskの意味が後世代で壊れても、全てが累積再評価される保証がない。

### 15.2 最低限

generation \(g\) では：

- \(H(G_0)\)
- \(T_1...T_g\) の全task-specific tests

を累積実行。

### 15.3 望ましい

current \(G_g\) からbehavioral micro-tests / evaluatorを構築し、

\[
S_g \models G_g
\]

を評価できるinterface。

### 15.4 path guard

scoring workspaceへのwriteもrepository root内pathのみ。

### 15.5 MOIにscoring leakageさせない

cumulative evaluator結果をMOI recordへ自動追加しない。

workerへ実際にfeedbackした情報だけが`\mathcal{I}^{obs}`へ入る。

**Gate P7**

- cumulative behavior preservation
- scoring hidden boundary
- MOI history boundary

が同時に成立。

---

## 16. Stage 1C：Five-Condition Iterated Integration Run

### 16.1 規模

5条件：

- MOI
- AF
- EL
- PR
- AR

各10〜15 generations。

原則1 lineage / condition。

目的はintegrationでありpower確保ではない。

### 16.2 common fixed controls

- model
- reasoning
- task sequence
- task wording
- retry
- evaluator
- WorldProtocol
- mutation schema
- log schema

bounded conditions：

- \(B_{expose}\)
- \(B_{work}\)
- \(E_{max}\)
- eviction

MOI：

- record schema
- record size rule
- previous-generation-only rule

をfreeze。

### 16.3 generation flow

#### MOI

```text
S_g
+ previous Iobs_(g-1)
+ T_g
   ↓
fresh agent
   ↓
S_(g+1)
+ Iobs_g
```

#### AF

```text
S_g
+ T_g
   ↓
fresh agent
   ↓
S_(g+1)
```

#### EL

```text
privileged static exposure(S_g,T_g,B_expose)
+ T_g
   ↓
fresh agent
   ↓
S_(g+1)
```

#### PR / AR

```text
S_g available via accessor
+ bounded working set
+ T_g
   ↓
fresh episodic agent
   ↓
S_(g+1)
```

### 16.4 評価

各generation：

- current task result
- cumulative hidden pass
- cumulative task-specific pass
- protocol violations
- compiler/system error
- repository snapshot/diff
- \(R^{sem}\) checkpoint（Stage 1Cでは必要最小限）
- \(M\) diagnostic
- structural snapshot
- retrieval logs
- exposure / working-set logs
- MOI history metadata + source breakdown
- Operational-Full feasibility status
- actual cost

### 16.5 Stage 1Cではまだ言わない

10〜15 generation trajectoryから、

- Externalization Pressureが成立した
- Reconstruction Pressureがartifactを適応させた
- crossoverが起きた
- history-bearing artifactが価値を持つ

等のscientific claimを確定しない。

Stage 2のpilotに進むためのintegration gate。

---

## 17. Stage 2 common-environment evaluationの事前準備

本格実行はStage 2だが、Stage 1C終了時にrunner interfaceだけ準備しておく価値がある。

### 17.1 目的

育成環境のadvantageとartifact自体の性質を分ける。

例えば：

\[
S^{MOI}_{15}
\]

\[
S^{AF}_{15}
\]

を同じ：

```text
fresh agent
artifact-only
same evaluation condition
```

へ投入。

### 17.2 必須候補

**Artifact-Full evaluation**

を共通環境の第一候補とする。

### 17.3 reciprocal evaluation候補

共通finite-\(B_{work}\) evaluationに加え、主要contrastごとのreciprocal evaluationを候補とする。

- MOI-grown / AF-grown → AF environment
- AF-grown / PR-grown → AF + PR environments
- PR-grown / EL-grown → PR + EL environments
- PR-grown / AR-grown → PR + AR environments

### 17.4 Stage 1ではpreflightのみ

- runner accepts arbitrary snapshot
- lineage historyを自動継承しない
- same task/probe setを使える

まで確認。

---

## 18. 既存コードに対する変更一覧

### `harness/src/types.ts`

追加・変更：

```ts
type ContextCondition =
  | "maximal-observable-inheritance"
  | "artifact-full"
  | "exposure-limited"
  | "privileged-retrieved-limited"
  | "agent-retrieved-limited"
  | "simple-limited"; // legacy
```

必要に応じてconceptをさらに分ける：

```ts
type InheritanceMode =
  | "maximal-observable"
  | "artifact-only"
  | "exposure-limited";
```

追加：

- `ObservableInteractionRecord`
- working-set logs
- retrieval logs
- inheritance metadata
- provider/model provenance
- cost
- content hashes

### `harness/src/agent-backend/types.ts`

provider-neutral：

- one-shot
- episodic tool loop
- explicit working note
- observable messages/tool events
- structured file mutation

### `harness/src/agent-backend/openai.ts`

- selected OpenAI model
- Responses or selected endpoint
- structured outputs
- function calling
- usage
- reasoning settings
- fresh request/session behavior

### `harness/src/inheritance/observable-interaction.ts`（新規候補）

責務：

- build `ObservableInteractionRecord`
- validate forbidden fields
- hash
- token count
- serialize / deserialize
- MOI prompt payload

### `harness/src/context/assembler.ts`

責務整理：

- AF full artifact
- EL static subset
- legacy simple-limited

PR/AR dynamic pagingは別layer。

### `harness/src/context/working-set.ts`（新規候補）

- budget invariant
- evidence insertion
- eviction
- explicit memory
- peak/current usage

### `harness/src/retrieval/repository-accessor.ts`

- list
- search
- read chunk
- path isolation

### `harness/src/retrieval/privileged-controller.ts`

- deterministic GT-assisted ranking
- ArtifactUnit selection

### `harness/src/agent-runner/episodic-runner.ts`

PR / AR共通state machine。

### `harness/src/orchestrator.ts`

主要変更：

- 5 condition branches
- previous `ObservableInteractionRecord`
- generation終了時record生成
- MOIのみprevious record injection
- fresh backend every generation
- cumulative \(G_g\)
- cumulative scoring
- condition-specific context runtime

### `harness/src/scoring.ts`

- cumulative task-specific tests
- path validation
- future dynamic \(H(G_g)\) interface

### `calibration/src/probe-generator.ts`

- balanced boolean probes
- matched negative
- label balance checks

### `calibration/src/calibration-runner.ts`

- primary model backend
- AF
- EL
- PR working-set calibration
- AR smoke
- Stage 1B paired runnerは別fileでもよい

### `calibration/src/inheritance-diagnostic.ts`（新規候補）

Stage 1B：

- predecessor fixture生成
- immutable S/Iobs pair
- MOI / AF paired next-step
- C0 aggregation

### logging

最低限：

- git SHA
- provider/model
- condition
- inheritance mode
- `Iobs` hash/tokens
- \(B_{expose}\)
- \(B_{work}\)
- \(E_{max}\)
- retrieval/eviction
- API usage/cost
- repository hash
- GT/task/probe hashes

---

## 19. File deletion

現行mutationはadd/replace中心で、deleteが弱い。

Stage 1A/1Bにはblockerではない。

しかしStage 2でartifact structure trajectoryを見る際、削除不能はartifact肥大化バイアスになる。

したがって：

- Stage 1 completion blockerにはしない
- **Stage 2開始前までに必須**
- Stage 1でmutation schemaを触る際に前倒し実装してもよい

MOI recordの`appliedChanges`は将来のdeleteも表現できるschemaにする。

---

## 20. Reproducibility / Provenance

Stage 1以降のrunで保存：

- git commit SHA
- provider
- requested model
- actual model
- SDK version
- model settings
- Ground Truth hash
- task bank hash
- probe bank hash
- condition
- inheritance mode
- previous `Iobs` hash / size
- `Iobs` schema version
- `Iobs` source breakdown
- Operational-Full feasibility status
- EL `B_expose`
- \(B_{expose}\)
- \(B_{work}\)
- \(E_{max}\)
- eviction policy
- retrieval policy version
- token counter version
- attempt/repeat
- Batch/Sync
- API usage
- actual cost
- repository before/after hash
- raw snapshots

MOI/AF比較では**predecessor fixture id**を必須にする。

---

## 21. 実装順序

### Phase P0：Conceptual / Naming Sync

1. `docs/aidd_ilm_paper.md`
2. `docs/experiment_plan.md`（v2.1）
3. `docs/stage1_plan.md`
4. code condition names
5. methodology finding

**Gate**：5条件・2軸・C0〜C3が文書/型で一致。

### Phase P1：Backend / Model Migration

6. OpenAI backend
7. selected model smoke
8. structured output
9. function calling
10. provenance
11. independent Batch path
12. existing mock regression

**Gate**：provider-neutral execution。

### Phase P2：MOI / Observable Interaction

13. `ObservableInteractionRecord`
14. generation event capture
15. forbidden-field validator
16. hashing/token accounting
17. MOI prompt assembly
18. previous-generation-only enforcement
19. AF history absence regression
20. MOI fresh-agent regression

**Gate**：observable inheritanceがmechanistically isolated。

### Phase P3：Measurement Repair

21. balanced boolean probes
22. constant-answer check
23. canonical token counter
24. ArtifactUnit
25. legacy static-calibration regression

**Gate**：measurement instrument repaired。

### Phase P4：Working-Set Runtime

26. WorkingSetManager
27. explicit memory
28. deterministic eviction
29. reread
30. \(E_{max}\)
31. episodic runner

**Gate**：bounded cognitionがcumulative read limitではなくworking setとして成立。

### Phase P5：Retrieval / Security

32. RepositoryAccessor
33. tools
34. privileged controller
35. path security
36. hidden-data isolation
37. retrieval/eviction logs

**Gate**：PR/ARがsafe full-repo access。

### Phase P6：Recalibration

38. AF baseline
39. EL static dose-response
40. PR working-set dose-response
41. AR smoke/non-floor
42. MOI serialization + source-tagging preflight
43. Operational-Full feasibility preflight
44. \(B_{expose}\) freeze
45. \(B_{work}\) freeze
46. \(E_{max}\) freeze
47. MOI schema/size freeze
48. equivalence margins
49. variance / repeats freeze

**Gate**：5 conditions non-degenerate。

### Phase 1A：Fixed-S Observation Main Diagnostic

48. System1 AF/EL/PR/AR
49. System2 AF/EL/PR/AR
50. C1〜C3
51. CI/equivalence
52. resource diagnostics

**Gate**：observation mechanisms分離。

### Phase 1B：One-Step Inheritance Diagnostic

55. predecessor task-pair design
56. predecessor fixtures生成
57. freeze S/Iobs pair
58. MOI vs AF + sham-history fresh-agent runs
59. C0 immediate effect + sham diagnostic
60. pair-level/aggregate uncertainty

**Gate**：observable-history availabilityをcleanに比較可能。

### Phase P6.5：MOI-aware Semantic Trace

61. `Present^hist` / source-aware `Exposed`
62. history source tag連携
63. AF/EL/PR/AR history-source=false regression

**Gate**：artifact経由とhistory経由のsemantic transmissionを区別可能。

### Phase P7：Longitudinal Evaluator

59. cumulative tests
60. current \(G_g\) state tracking
61. path guard
62. scoring/history boundary
63. five-condition mock multi-generation

**Gate**：longitudinal evaluator ready。

### Phase 1C：Five-Condition Integration

64. MOI 10〜15 gen
65. AF 10〜15 gen
66. EL 10〜15 gen
67. PR 10〜15 gen
68. AR 10〜15 gen
69. raw log verifier
70. system error comparison
71. usage/cost report
72. common-environment runner preflight

**Gate**：Stage 2へ移行可能。

---

## 22. Stage 1完了条件

### A. Conceptual validity

- 5条件が二軸として実装
- AFがhub
- MOIはfresh agent
- MOIはtrue fullと呼ばない
- C0 short-term utilityとExternalization Pressureを混同しない
- PR/ARはfull artifactへ再アクセス可能
- evicted artifact evidenceはprovider-side historyから再参照不能
- C1はdecision opportunity差を統制しbest-case bounded-observation effectとして解釈
- ELの \(B_{expose}\) とPR/ARの \(B_{work}\) は別resource
- C3はcompound contrastとして解釈
- AF/MOIはOperational-Full feasibility invariantを満たす
- ELだけがirrecoverable exposure

### B. Inheritance validity

- `ObservableInteractionRecord` schema freeze
- hidden-data contaminationなし
- previous generation only
- MOI/AFで同一repositoryを比較可能
- record size rule freeze
- provenance hash
- history source breakdown

### C. Measurement validity

- balanced \(R^{sem}\)
- model移行後再較正
- \(B_{expose}\), \(B_{work}\), \(E_{max}\) freeze
- equivalence margins freeze
- raw logs available

### D. Stage 1A scientific gate

- AF / EL / PR / AR
- fixed \(S_0\)
- \(R^{sem}\), \(M\)
- C1/C2/C3
- uncertainty

### E. Stage 1B scientific gate

- paired predecessor fixtures
- same \(S_{next}\)
- same next task
- MOI vs AF difference only in `Iobs`
- MOI-sham placebo control
- C0 immediate utility
- real vs sham history diagnostic
- no externalization claim

### F. Stage 1C engineering gate

- 5 conditions × 10〜15 gen
- fresh agent every generation
- cumulative behavior preservation
- raw history / exposure / retrieval / working-set logs
- source-aware semantic element trace
- Operational-Full feasibility logs
- no extreme condition-specific system failures
- cost/provenance reconstructable

### G. Documentation

- `docs/findings/stage1_findings.md`
- experiment plan Stage 1 gate update
- cost estimate update
- Stage 2 common-environment design
- Stage 2 deletion support task

---

## 23. Stage 1で言ってよいこと / まだ言わないこと

### Stage 1で言ってよい

- finite working setがimmediate \(R^{sem}\)/\(M\)へ影響するか
- self-retrievalが追加のimmediate lossを生むか
- irreversible exposureとrecoverable bounded cognitionが違うか
- observable previous interaction recordがnext-step performanceへ直接役立つか
- 5 conditionsがlongitudinally実行可能か

### Stage 1ではまだ言わない

- history lossがartifactへのExternalization Pressureを生んだ
- finite working setがartifactをReconstruction Pressureへ適応させた
- MOI lineageとAF lineageで構造進化が違う
- Limited lineageがFullをcrossoverした
- 歴史を持つartifactに一般的な品質優位がある

これらはStage 2以降のtrajectory + common-environment evaluationで検証する。

---

## 24. Stage 1の位置づけ

Stage 1は、

> **5条件で良い数字を出すStage**

ではない。

Stage 1の役割は、

> **「何を世代間に残すか」と「残ったartifactをどう観測するか」という二種類の有限性を、互いに混同せず操作できる実験装置を作ること**

である。

特に重要なのは、古典ILMに近い

\[
MOI \leftrightarrow EL
\]

という大きな対照だけで結論を出さず、

\[
MOI \leftrightarrow AF
\]

\[
AF \leftrightarrow PR
\]

\[
PR \leftrightarrow AR
\]

\[
PR \leftrightarrow EL
\]

へmechanismを分解することである。

この分解が成立して初めて、Stage 2以降で、

> **Session / history loss → Externalization Pressure**

と、

> **Finite observation → Reconstruction Pressure**

がartifact trajectoryへ本当に異なる形質を選択するのかを検証できる。
