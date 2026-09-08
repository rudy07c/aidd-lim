# Stage 1（Inheritance / Context Decomposition）実装計画

**対象**：`docs/experiment_plan.md` v2.0 の Stage 1「Inheritance / Context Decomposition」  
**理論親文書**：`aidd_ilm_paper_v6.md`  
**前提**：Stage 0（Harness Feasibility）・Stage 0.5（Measurement Calibration）は、それぞれ当時のoperationalizationに対してゲート達成済み  
**Stage 1の役割**：`有限context` に混在していた複数のmechanismを、**inheritance / transmission** と **observation / retrieval** の二軸へ分解し、5条件が意図したmechanismだけを操作できる実験装置を完成させる  
**primary model候補**：GPT-5 mini（プロジェクト上の現行方針）。Stage 1本実験前に利用可能なmodel identifier・reasoning設定・tool/structured-output設定を再確認しfreezeする  
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
| **Exposure-Limited（EL）** | artifactの選択subsetのみ | subsetのみ | \(B_{work}\) 以下 | privileged static selector | irreversible exposure |
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

paper v6ではobservable historyを \(H_g\) と表現しているが、実験計画には既にhidden evaluator \(H(G)\) が存在する。

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

AFとPRはartifact-only inheritanceとfull repository availabilityを共有し、PRだけがfinite working setを持つ。

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

PRは同じ有限working-set制約でもartifact全体へ再アクセス可能。

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

1. `aidd_ilm_paper_v6.md`
2. `docs/experiment_plan.md` v2.0
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

プロジェクト上の現行方針としてStage 1 primary model候補をGPT-5 miniとする。

Stage 1本実験前に、実際に使用するmodel identifier、endpoint、reasoning設定等をfreezeする。

2026-09時点のOpenAI公式model referenceではGPT-5 miniはResponses API、function calling、Structured Outputs、Batchをサポートしている。ただしmodel familyやrecommended modelは将来変化しうるため、**本番run前に再確認して固定**する。

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

### 3.3 model freeze

本run開始前に固定：

- provider
- model identifier
- snapshot / dated modelが利用可能ならそのidentifier
- reasoning effort
- max output
- structured-output schema
- tool policy
- retry policy
- timeout
- SDK version

requested modelとAPI response上のactual model idを両方logする。

### 3.4 Batch

Batchは**独立request**へ使用する。

向く：

- balanced semantic probe calibration
- static EL calibration
- AF fixed-S tasks
- Stage 1A repeat / variance pilot

初版で無理にBatch化しない：

- PR / ARのinteractive paging
- MOI→AF one-step comparisonで前段episode生成と依存する処理
- Stage 1C longitudinal generation loop

Batch / Syncを研究条件にはしない。

**Gate P1**

- selected OpenAI modelでone-shot structured outputが動く
- function callingが動く
- usage/model provenanceが取れる
- independent calibration requestのBatch pathが動く
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
  contentHash: string;
}
```

実装時にfield名は調整してよい。

### 4.2 「observable」の機械的境界

`ObservableInteractionRecord`はpost-hocに好きな情報を追加しない。

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

### 4.6 前世代一世代だけ

orchestratorはgeneration \(g+1\) 開始時に、

- MOI：`repository + previousInteractionRecord`
- その他：condition定義に応じたrepository情報のみ

を渡す。

`allPriorInteractionRecords[]`をpromptへ積まない。

log保存用には全generation recordをdiskへ保持してよい。

### 4.7 MOI history size

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

### 4.8 MOI prompt assembly

MOI用promptは、

```text
SYSTEM / common task protocol
CURRENT TASK
PREVIOUS OBSERVABLE INTERACTION RECORD
CURRENT REPOSITORY
```

など、固定順で組み立てる。

AFとの差がhistory有無以外へ広がらないよう、MOI/AFのcommon prompt wordingを可能な限り共有する。

**Gate P2**

- recordがgenerationごとに生成される
- hidden data contamination testが通る
- MOIでfresh backend instanceが作られる
- MOI generation \(g+1\) が直前recordだけ受け取る
- AFは同じrepositoryを受け取るがrecordは受け取らない
- record hash / tokensがlogされる

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

大きな1 fileだけで \(B_{work}\) を超えることを避けるためchunk readを前提にする。

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

### 6.2 \(B_{work}\) に含める

- active artifact chunks
- retained search/listing artifact evidence
- explicit working note / summary
- task遂行のためagentがpersistentに保持する明示的repository-derived memory

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

PR / AR共通のdeterministic policyをfreezeする。

候補：

- LRU
- FIFO

重要なのは**同一policy**であること。

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

### 6.7 common episodic runner

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
- \(B_{work}\) 相当量を提示
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

### 10.1 AF baseline

selected primary modelで、

- balanced \(R^{sem}\)
- \(M\)

のAF baselineを再取得。

### 10.2 EL static exposure

複数budget：

\[
B \in \{0,B_1,B_2,\ldots,AF\}
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

1. privileged retrievalでもfinite working-set effectは残るか
2. self-retrievalは追加損失を生むか
3. irreversible exposureとrecoverable bounded cognitionは異なるか
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

### 13.5 outcomes

- \(R^{sem}\)
- \(M\)
- immediate task success
- history references in observable response（diagnostic）
- history tokens
- total input tokens
- latency/cost

### 13.6 Stage 1B gate

C0：

\[
D_{history}^{immediate}
\]

が推定可能。

ただしExternalization Pressureのtrajectory claimは出さない。

---

## 14. Pre-Stage 1 / P7：Longitudinal Evaluator修正

### 14.1 現状問題

Stage 0 scoringは、

- base hidden tests
- current task-specific test

を中心に実行する。

過去taskの意味が後世代で壊れても、全てが累積再評価される保証がない。

### 14.2 最低限

generation \(g\) では：

- \(H(G_0)\)
- \(T_1...T_g\) の全task-specific tests

を累積実行。

### 14.3 望ましい

current \(G_g\) からbehavioral micro-tests / evaluatorを構築し、

\[
S_g \models G_g
\]

を評価できるinterface。

### 14.4 path guard

scoring workspaceへのwriteもrepository root内pathのみ。

### 14.5 MOIにscoring leakageさせない

cumulative evaluator結果をMOI recordへ自動追加しない。

workerへ実際にfeedbackした情報だけが`\mathcal{I}^{obs}`へ入る。

**Gate P7**

- cumulative behavior preservation
- scoring hidden boundary
- MOI history boundary

が同時に成立。

---

## 15. Stage 1C：Five-Condition Iterated Integration Run

### 15.1 規模

5条件：

- MOI
- AF
- EL
- PR
- AR

各10〜15 generations。

原則1 lineage / condition。

目的はintegrationでありpower確保ではない。

### 15.2 common fixed controls

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

- \(B_{work}\)
- \(E_{max}\)
- eviction

MOI：

- record schema
- record size rule
- previous-generation-only rule

をfreeze。

### 15.3 generation flow

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
privileged static exposure(S_g,T_g,B_work)
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

### 15.4 評価

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
- working-set logs
- MOI history metadata
- actual cost

### 15.5 Stage 1Cではまだ言わない

10〜15 generation trajectoryから、

- Externalization Pressureが成立した
- Reconstruction Pressureがartifactを適応させた
- crossoverが起きた
- history-bearing artifactが価値を持つ

等のscientific claimを確定しない。

Stage 2のpilotに進むためのintegration gate。

---

## 16. Stage 2 common-environment evaluationの事前準備

本格実行はStage 2だが、Stage 1C終了時にrunner interfaceだけ準備しておく価値がある。

### 16.1 目的

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

### 16.2 必須候補

**Artifact-Full evaluation**

を共通環境の第一候補とする。

### 16.3 optional

共通finite-\(B_{work}\) evaluation。

### 16.4 Stage 1ではpreflightのみ

- runner accepts arbitrary snapshot
- lineage historyを自動継承しない
- same task/probe setを使える

まで確認。

---

## 17. 既存コードに対する変更一覧

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
- \(B_{work}\)
- \(E_{max}\)
- retrieval/eviction
- API usage/cost
- repository hash
- GT/task/probe hashes

---

## 18. File deletion

現行mutationはadd/replace中心で、deleteが弱い。

Stage 1A/1Bにはblockerではない。

しかしStage 2でartifact structure trajectoryを見る際、削除不能はartifact肥大化バイアスになる。

したがって：

- Stage 1 completion blockerにはしない
- **Stage 2開始前までに必須**
- Stage 1でmutation schemaを触る際に前倒し実装してもよい

MOI recordの`appliedChanges`は将来のdeleteも表現できるschemaにする。

---

## 19. Reproducibility / Provenance

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

## 20. 実装順序

### Phase P0：Conceptual / Naming Sync

1. paper v6
2. experiment plan v2.0
3. Stage 1 plan v2.0
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
42. MOI serialization preflight
43. \(B_{work}\) freeze
44. \(E_{max}\) freeze
45. MOI schema/size freeze
46. equivalence margins
47. variance / repeats freeze

**Gate**：5 conditions non-degenerate。

### Phase 1A：Fixed-S Observation Main Diagnostic

48. System1 AF/EL/PR/AR
49. System2 AF/EL/PR/AR
50. C1〜C3
51. CI/equivalence
52. resource diagnostics

**Gate**：observation mechanisms分離。

### Phase 1B：One-Step Inheritance Diagnostic

53. predecessor task-pair design
54. predecessor fixtures生成
55. freeze S/Iobs pair
56. MOI vs AF fresh-agent runs
57. C0 immediate effect
58. pair-level/aggregate uncertainty

**Gate**：observable-history availabilityをcleanに比較可能。

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

## 21. Stage 1完了条件

### A. Conceptual validity

- 5条件が二軸として実装
- AFがhub
- MOIはfresh agent
- MOIはtrue fullと呼ばない
- C0 short-term utilityとExternalization Pressureを混同しない
- PR/ARはfull artifactへ再アクセス可能
- ELだけがirrecoverable exposure

### B. Inheritance validity

- `ObservableInteractionRecord` schema freeze
- hidden-data contaminationなし
- previous generation only
- MOI/AFで同一repositoryを比較可能
- record size rule freeze
- provenance hash

### C. Measurement validity

- balanced \(R^{sem}\)
- model移行後再較正
- \(B_{work}\), \(E_{max}\) freeze
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
- C0 immediate utility
- no externalization claim

### F. Stage 1C engineering gate

- 5 conditions × 10〜15 gen
- fresh agent every generation
- cumulative behavior preservation
- raw history / retrieval / working-set logs
- no extreme condition-specific system failures
- cost/provenance reconstructable

### G. Documentation

- `docs/findings/stage1_findings.md`
- experiment plan Stage 1 gate update
- cost estimate update
- Stage 2 common-environment design
- Stage 2 deletion support task

---

## 22. Stage 1で言ってよいこと / まだ言わないこと

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

## 23. Stage 1の位置づけ

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
