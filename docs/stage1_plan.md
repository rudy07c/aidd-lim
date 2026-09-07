# Stage 1（Context Decomposition）実装計画

**対象**：`docs/experiment_plan.md` の「Stage 1：Context Decomposition（診断実験）」
**前提**：Stage 0（Harness Feasibility）・Stage 0.5（Measurement Calibration）はいずれもゲート達成済み
**このドキュメントの位置づけ**：`docs/harness_stage0_plan.md`・`docs/stage0_5_plan.md`と同じ形式。方針と設計判断の記録。

---

## 0. Stage 1で証明すべきこと（再掲）

計画書より：

> 性能差のうち「情報量」と「retrieval」がそれぞれどれだけ寄与するかを分離する。

3条件：

- **Full**：repositoryの全ファイルをそのままcontextへ含める
- **Privileged-Selection Limited**：固定ヒューリスティックによるselectorが、token budget \(B\) の範囲でworker agentへcontextを渡す
- **Agent-Retrieved Limited**：同じbudget \(B\) の中で、worker agent自身が検索/読み取りツールを用いて情報を取得する

対比：

\[
\text{Full} - \text{Privileged} \to \text{情報量そのものの効果}
\qquad
\text{Privileged} - \text{Agent} \to \text{retrievalの効果}
\]

4パターンの判定基準（計画書4節）：

| パターン | 解釈 |
|---|---|
| Full ≈ Privileged ≈ Agent | bottleneck設定が弱すぎる可能性、domain再設計を検討 |
| Full ≈ Privileged > Agent | 主因はretrieval |
| Full > Privileged ≈ Agent | 主因は情報制約そのもの |
| Full > Privileged > Agent | 両方が効く |

この結果がStage 5の条件数・予算配分を決定する。**Stage 1は「良い数字を出す」段階ではなく、「3条件を正しく切り分けられる装置を作り、診断結果を得る」段階**であることを、Stage 0・0.5と同じ姿勢で徹底する。

---

## 1. Stage 0.5からの引き継ぎ資産と、未確定事項の整理

### 1.1 引き継ぐもの（そのまま再利用）

- **Synthetic World v1**：5 entity・8 operation・6 invariant、20 task（`ground_truth.json`, `heldout_tasks.json`）
- **命名方式**：A-obfuscated（確定済み、`checkNamingSchemeAlignment`で機械検証可能）
- **$R^{sem}_B$の主指標**：boolean型プローブ（12問、F9で確定）。mc/stpはreferenceとして併記可
- **検証ツール一式**：`model_checker.ts`, `validate_task_deltas.ts`, `validate_sequence.ts`, `runScoring()`, `detectProtocolViolation`
- **WorldProtocol契約**：`protocol_adapter.ts`のexport名固定

### 1.2 未確定のまま持ち越されている事項

- **\(\Delta_M, \Delta_R\)（equivalence testingの閾値）**：未決事項#5。Stage 0.5のPhase 4で「反復試行によるばらつきの粗い推定」を計画していたが、実行記録を確認したところ、この反復試行が明示的なステップとして実施された記録がない。**Stage 1着手前に、この値を確定させる必要がある**（2.1節で対応）
- **Privileged Selectorの実装方針**：計画書2.2節で「固定ヒューリスティック（依存グラフ距離、直近の変更履歴、対象ファイルからの参照関係等）」と方針だけは決めていたが、具体的な実装はまだない
- **Agent-Retrievedの実装方針**：worker agentに「検索/読み取りツール」を持たせる、という要件はあるが、現状の`AnthropicBackend`はtool useに対応しておらず、全context文字列をプロンプトに埋め込む設計のまま。**これはStage 0.5までにない、Stage 1で新規に必要となる実装**

---

## 2. 主要な設計判断

### 2.1 \(\Delta_M, \Delta_R\)の確定（Stage 1着手前の前提条件）

Stage 0.5較正で得た20 task・6 budgetのデータのうち、**同一条件（例：$B=\text{Full}$）で複数のheld-out taskがどの程度ばらつくか**を代理指標として使う。ただし本来必要なのは「同一task・同一budgetを複数回試行した際のばらつき」であり、これは未取得のため、Stage 1着手前に軽量な反復試行（3〜5 task × 3回程度）を実施し、$\hat{M}_B$の標準偏差から実務上無視できる差 \(\Delta_M\) を決定する。\(\Delta_R\)（boolean主指標のばらつき）も同様に算出する。

**測定するbudget値の訂正（レビューで判明）**：$B=\text{Full}$のみで反復試行すると、F10で確認済みの通り$B \geq 2\text{K}$は全てrepository全体（2862トークン）に縮退しているため、**「フルコンテキスト条件での分散」しか測定できない**。Stage 1のPrivileged/Agent-Retrievedが実際に動作するのは有限context領域（$B=1\text{K}$付近）であるため、**$B=\text{Full}$に加えて$B=2\text{K}$（またはStage 1で実際に使う予定のbottleneck budget、2.5節参照）でも反復試行を行う**。

この反復試行は、Stage 0.5の`calibration-runner.ts`のCLIをタスクフィルタ（`--tasks=...`）付きで複数回実行するだけで対応でき、新規実装は不要。

### 2.2 Privileged Selectorの実装（新規、最小構成）

**実装先の訂正**：Stage 1の世代ループは`harness/src/orchestrator.ts`が`harness/src/context/assembler.ts`の`assembleContext()`を呼び出す構造になっている（`calibration/src/budget-assembler.ts`ではない）。したがってPrivileged Selectorは**`harness/src/context/assembler.ts`側に実装する**（Stage 0.5の`budget-assembler.ts`は較正専用パイプラインであり、Stage 1の世代ループからは呼ばれない）。「継承・拡張」という表現は「同じ設計思想を踏襲する」という意味に訂正し、実装場所を明確にする。

計画書2.2節の方針（LLMではなく固定ヒューリスティック）に従い、以下のシグナルを組み合わせた優先順位でファイルを選択する：

- **依存グラフ距離**：held-out taskのGroundTruthDeltaが触れるentityから、`dependencies`（D1〜D8）を辿った距離が近いファイルほど優先。距離計算のロジックは`synthetic-world/semantic_locality.ts`（surface locality / semantic locality算出、Synthetic World v0.2で実装済み）の考え方を再利用する
- **固定契約・型定義**：Stage 0.5の`budget-assembler.ts`のsystem2モード優先順位（型定義→protocol_adapter.ts→tests→実装ロジック）を土台にしつつ、依存グラフ距離を実装ロジックの並び順に反映する
- **直近の変更履歴**：Stage 1は世代を重ねる設計のため、直前世代でagentが変更したファイルを優先する、という要素も加えられる（Stage 0の`orchestrator.ts`の`repository_before`/`repository_after`差分から取得可能）

**前提条件（新規発見、Phase 1着手前に解決）**：task-awareな選択を行うには、「今回のtaskがどのentityに触れるか」（GroundTruthDelta）をPrivileged Selectorが参照できる必要がある。しかし現状の`orchestrator.ts`内の`HeldOutTask`型は`taskId`・`visibleInstruction`・`taskSpecificTestCode`のみを保持し、GroundTruthDeltaを読み込んでいない（worker agentに非公開にする設計は正しいが、**evaluator側であるPrivileged Selector自体はGroundTruthDeltaを参照してよい**——worker agentへ内容を漏らすわけではなく、あくまで「どのファイルを見せるか」の判断材料として使うだけであるため）。Phase 1の最初のタスクとして、`orchestrator.ts`が`heldout_tasks.json`からGroundTruthDeltaも読み込み、Privileged Selectorへ渡せるようにする設計変更を行う。

**追加の前提条件（2回目のレビューで判明）**：

- `computeSemanticLocality(g0, delta)`（`synthetic-world/semantic_locality.ts`）は`Set<EntityId>`（例：`"E1"`, `"E3"`）を返すが、Privileged Selectorが「どのファイルを優先するか」を決めるには**entity→ファイルパスの対応表**が必要（例：`E1`(Vok) → `src/vok/rules.ts`, `src/vok/state.ts`）。この対応表は現状どこにも定義されていない。命名規則（`Vok`→`vok/`等）から機械的に導出できるはずだが、これをコードとして定式化するステップをPhase 1に追加する
- `computeSemanticLocality`は第1引数に`GroundTruth`型全体（＝`ground_truth.json`の中身）を必要とするが、`orchestrator.ts`は現状`ground_truth.json`を一切読み込んでいない。GroundTruthDeltaの読み込みに加え、`ground_truth.json`本体のロードも`orchestrator.ts`に追加する必要がある

**実装は`harness/src/context/assembler.ts`を拡張する形にする**（ゼロから作らない）。task-awareな優先順位付けロジックを追加するのがStage 1固有の拡張点。

### 2.3 Agent-Retrieved Limitedの実装（新規、最も工数がかかる部分）

**インターフェース設計の変更が先に必要（新規発見）**：現状の`AgentInput`（`harness/src/agent-backend/types.ts`）は`contextFiles`（事前アセンブル済みのファイル群）・`visibleInstruction`・`contextBudget`のみを持ち、**agentが自らファイルを検索・取得するための、full repositoryへのアクセス経路が存在しない**。Agent-Retrieved条件を実装する前に、以下のいずれかでインターフェースを拡張する必要がある：

- `AgentInput`に`repositoryAccessor`（ファイル一覧取得・読み込み関数）を追加する
- または`AnthropicBackend`のコンストラクタに、tool use時にfull repositoryを参照できる形でrepositoryを渡す

この変更は`AgentBackend`インターフェース全体（mock-noop/mock-oracleを含む）に影響しうるため、Phase 2着手前に設計を確定させる。

`harness/src/agent-backend/anthropic.ts`にtool use（Anthropic APIのtool機能）を追加する。

- 提供するツール例：`list_files(directory)`, `read_file(path)`, `search(query)`
- worker agentは、`visibleInstruction`のみを渡され、必要な情報はツール呼び出しで自ら取得する
- **token budget \(B\) の扱い**：Anthropic APIのマルチターン会話では、各ターンのinput tokensに**それ以前の全会話履歴（過去のtool_use/tool_result含む）が累積して含まれる**。したがって「実際に読み込んだファイルの合計トークン数」ではなく、**累積会話履歴のトークン数**でbudget超過を判定する必要がある。単純な合計ではなく、ターンを重ねるごとに指数的に近い増加をしうる点に注意（6節のコスト試算参照）
- **ログスキーマの訂正（新規発見）**：計画書旧版では「`GenerationLog`に`retrieval_queries`・`retrieved_files`フィールドがあることをStage 0の`types.ts`で確認済み」としていたが、これは誤りだった。実際に存在するのは`tool_calls: unknown[]`のみ。Agent-Retrieved条件のために、`retrieval_queries`・`retrieved_files`相当のフィールドを`types.ts`へ**新規追加する必要がある**

**この部分がStage 1で最も実装コストの高い新規要素であり、最初にプロトタイプを作って動作確認してから、本番の世代ループに組み込むべき**。工数の主体は「tool use APIの使い方」（SDKサポートが手厚く中程度の難易度）よりも、**上記のインターフェース設計変更**にある。目安：tool useループ自体1〜2日＋インターフェース設計変更・既存backendへの影響確認1〜2日。

### 2.4 世代ループの設計：Stage 0の`orchestrator.ts`を3条件対応に拡張

Stage 1は「$S$固定・1回のcontext提示」ではなく、**Stage 0と同じく世代を重ねる**（10〜15世代）。したがって`calibration-runner.ts`（Stage 0.5の単発較正用）ではなく、`harness/src/orchestrator.ts`（Stage 0の世代ループ本体）を拡張するのが適切。

- `ContextCondition`型を`"full" | "simple-limited" | "privileged-limited" | "agent-retrieved-limited"`へ**拡張**する（既存の`"simple-limited"`は削除せず残す。以前の記述では削除を示唆する表現になっていたが、これは誤りで、既存configとの後方互換性のため`"simple-limited"`は維持したまま新しい2条件を追加する）
- `assembleContext()`に`"privileged-limited"`のtask-aware分岐を追加（2.2節）
- `"agent-retrieved-limited"`の場合は、事前のcontext構築をスキップし、agentへツールを渡す形に分岐（2.3節）
- held-out task setは、Stage 0.5で確立した20 taskをそのまま使う。ただしStage 1は10〜15世代なので、20 taskのうち構成A/B比率を保ったまま10〜15個を使う（または全20を使い切って良ければそのまま）
- **$\hat{M}_B$の集計方法の明示（レビューで判明、新規追加）**：`orchestrator.ts`は現状「1世代につき1 task（`tasks[gen % tasks.length]`で周回）」というループ構造であり、Stage 0.5の$\hat{M}_B$（固定$S$に対し全20 taskを評価したpass rate）とは前提が異なる。Stage 1における$\hat{M}_B$は、**「$N$世代のうち`functional_task_result=true`だった世代の割合」として定義する**（各世代は異なるtaskを解いているが、世代を重ねてもrepositoryが壊れず機能追加を続けられているか、という継続的な意味で$M_B$を捉え直す）。この定義をPhase 4着手前に`docs/findings/stage1_findings.md`（新規）に明記し、3条件間で同じ定義で比較できるようにする
- **既存configとの後方互換性（新規追加）**：`ContextCondition`型の拡張により、既存の`stage0-mock.json`等（`"simple-limited"`を使用）が引き続き正しく動作するかを確認する。型自体は既存値を包含する拡張なので問題ないはずだが、Phase 3のmock確認時に既存configも一緒に再実行し、回帰がないことを明示的にチェックする

### 2.5 Stage 1で使用するcontext budgetの明示（新規追加）

F10で確認した通り、現在のrepository全体は2862トークンであり、$B \geq 2\text{K}$は全て縮退する。Stage 1の3条件比較で「Limited」を成立させるには、**Full/Privileged/Agent-Retrievedのbudgetを、縮退しない領域（$B=1\text{K}$、またはそれに近い値）に固定する**必要がある。

- **Full条件**：budget制限なし（従来通り）
- **Privileged-Selection Limited・Agent-Retrieved Limited**：$B=1\text{K}$に固定する（2.1節の反復試行結果を踏まえ、必要なら微調整）

この設定を明示しておかないと、Stage 1の結果が「Full > Privileged > Agent」のどのパターンに分類されるかの解釈自体が揺らぐため、Phase 3（mock確認）着手前に確定させる。

**前提となる実装変更（レビューで判明）**：現状の`harness/src/context/assembler.ts`の`assembleContext(repositoryFiles, condition)`は、`condition`のみを受け取り、**budget値を渡すパラメータが存在しない**。`config.contextBudget`（`types.ts`に存在）も、`orchestrator.ts`から`assembleContext()`呼び出し時に渡されていない。Privileged-Selection Limitedで「$B=1\text{K}$に収まるよう選択する」処理を実現するには、以下のいずれかの設計変更が必要：

- `assembleContext(repositoryFiles, condition, budget?)`のようにbudget引数を追加する
- または`condition`と`budget`を1つの設定オブジェクトにまとめて渡す設計に変更する

これはPhase 1着手前に確定させる、Privileged Selector実装の前提条件である。

### 2.6 System1（$R^{sem}_B$）の測定対象と実装方法（レビューを受けて再整理）

**当初の3択（a/b/c、いつ測定するか）は、問いの立て方自体が不正確だった。** 本質的な問いは「いつ測定するか」ではなく、**「どのリポジトリ状態$S$に対して測定するか」**である。

Stage 1は3条件それぞれで世代ループを走らせるため、世代を重ねるにつれてrepositoryは条件ごとに異なる方向へ変化していく。もし「各条件の最終世代後のrepositoryに対してSystem1を測定する」とすると、Full条件とPrivileged条件では測定対象の$S$自体が異なる（世代を重ねる過程で異なるコードに育っているため）。この場合、$R^{sem}_B$の差が「contextの差によるものか」「repositoryの変化の差によるものか」を分離できなくなり、Stage 1の目的（情報量とretrievalの寄与を切り分ける）を果たせない。

**採用する方式**：**初期リポジトリ状態（世代0開始前、Stage 0.5較正で使った$S$と同一）に対して、$B=1\text{K}$と$B=\text{Full}$でSystem1を測定する。** この測定はrepositoryが変化する前の、単一の固定$S$に対して行うため、Stage 0.5の較正データ（`calibration-runner.ts`の実行結果）を**そのまま再利用でき、Stage 1として新たにSystem1を実行する必要がない**。

これにより：

- 測定対象の一貫性が保たれる（3条件とも同じ初期$S$に対する$R^{sem}_B$を参照する）
- 実装コストが発生しない（Stage 0.5の既存データの再利用のみ）
- ただし、この方式では「世代を重ねた後のrepositoryに対する意味理解」は測定しない。**この観点（trajectoryに沿った意味理解の変化）はStage 2（Longitudinal Pilot）以降の課題として明示的に切り分ける**

---

## 3. ビルド順序（タスク分解）

### Phase 0：\(\Delta_M, \Delta_R\)の確定

1. Stage 0.5の`calibration-runner.ts`を使い、3〜5 task × 3回反復を、$B=\text{Full}$と$B=2\text{K}$の両方で実行する
2. $\hat{M}_B$・boolean accuracyの標準偏差を算出し、\(\Delta_M, \Delta_R\)を決定する
3. `docs/experiment_plan.md`未決事項#5を確定済みに更新

**この時点でのゲート**：\(\Delta_M, \Delta_R\)が具体的な数値として確定していること。

### Phase 1：Privileged Selectorの実装

4. `harness/src/context/assembler.ts`に、entity→ファイルパス対応表の定義、`ground_truth.json`のロード、`assembleContext()`へのbudget引数追加（2.5節）を行った上で、task-awareな優先順位付け（`synthetic-world/semantic_locality.ts`の`computeSemanticLocality`を利用した依存グラフ距離）を追加する新しい`"privileged-limited"`分岐を実装する
5. mock-noop/mock-oracleで、いくつかのheld-out taskについて、実際に選択されるファイルの一覧を出力し、依存グラフ距離が近いファイルが優先されていることを目視確認する

**この時点でのゲート**：Privileged Selectorが、taskごとに異なるファイル優先順位を出力できること（固定順ではなくtask-awareであることの確認）。

### Phase 2：Agent-Retrieved Limitedの実装

6. `anthropic.ts`にtool use対応を追加する（`list_files`, `read_file`, `search`）
7. トークン消費の追跡・budget超過時の制御を実装する
8. mockではなく、実APIで1〜2 taskだけ試し、agentが実際にツールを呼び出して情報を取得する挙動を確認する（このプロトタイプ確認は小規模・低コストで行う）

**この時点でのゲート**：agentが実際にツールを呼び出し、`retrieved_files`ログが正しく記録されること。

### Phase 3：世代ループの3条件対応

9. `orchestrator.ts`の`ContextCondition`型・`assembleContext()`呼び出し箇所を拡張する
10. mock-noop/mock-oracleで、3条件それぞれ2〜3世代を通し、クラッシュなく完走することを確認する（Stage 0のPhase 1〜2と同じ手順を踏襲）

**この時点でのゲート**：mockで3条件・全世代がクラッシュなく完走し、ログが欠損なく残ること。

### Phase 4：実APIでの本実行（10〜15世代 × 3条件）

11. 実APIで3条件それぞれ10〜15世代を実行する
12. 各条件で$R^{sem}_B$（簡易版でよい、Stage 0.5のboolean主指標を再利用）と$\hat{M}_B$を測定
13. Full-Privileged、Privileged-Agentの対比を算出し、4パターンのどれに該当するか判定する

**この時点でのゲート**：4パターンの判定結果が得られること（どのパターンであっても構わない）。

---

## 4. Stage 0・0.5の教訓の反映（見落とし防止のためのチェックリスト）

これまでの経緯を踏まえ、各Phase完了報告には以下を必須とする。

- [ ] 型チェック（`tsc --noEmit`、harness・calibration両方）の実行結果
- [ ] 既存テストに回帰がないことの確認
- [ ] 実際のログを独立に確認できる形でpush（Run 2/Run 3の食い違い、System1 B=1Kパースバグの教訓を踏まえ、集計値だけでなく生ログの提出を必須とする）
- [ ] mockでの機構確認を経てから実agentに進んだことの確認（Phase順序を飛ばさない）
- [ ] Agent-Retrieved条件は、選択肢の答えが漏洩していないか（F5/F9と同種の問題が、ツール経由の情報取得でも起きないか）を新たに確認する。特に、ツールの検索結果（ファイル一覧等）自体が構造的ヒントを与えていないか要注意

---

## 5. Batch API導入の検討（Stage 1着手前、Phase 0.5として実施）

`cost_estimate_stage0_5_to_5.md`で「Stage 2着手前に検討」としていたが、Stage 1の時点で以下の理由から前倒しで導入を検討すべきと判断する。

- Stage 1はStage 0.5に続く、初めての本格的な世代ループ実行（10〜15世代 × 3条件）
- Agent-Retrieved条件は、6節の見積もり通りFull/Privilegedの2〜3倍のコストが見込まれる
- Batch APIは全モデル一律50%引きであり、単純な導入だけでStage 1全体のコストを大きく圧縮できる

**ただし、条件によって導入の可否が異なる点、および適用箇所によって効果が大きく異なる点に注意する**：

- **Full・Privileged-Selection Limited**：contextを事前に一括構築してから1回のリクエストで完結するため、Batch API化しやすい
- **Agent-Retrieved Limited**：worker agentがtool useで複数ターンのやり取り（`list_files`→`read_file`×数回→最終応答）を行う設計のため、Batch APIとの相性は実装方式次第。**無理に全条件を一律でBatch化せず、Full/Privilegedを先にBatch化し、Agent-Retrievedは同期APIのまま様子を見る、という部分導入も選択肢に入れる**

**適用箇所の限定（重要、レビューで判明）**：Batch APIの効果は、呼び出し元によって大きく異なる。

- **`calibration-runner.ts`（Phase 0の反復試行）**：個々の呼び出しが独立しており、「全task・全budgetのリクエストを一括submit→polling→結果回収」という構造に書き換えやすい。**Batch API導入のメリットが大きいのはこちら**
- **`orchestrator.ts`（Phase 4の世代ループ本体）**：世代は直列に処理される（前世代の`repositoryAfter`が次世代の`repositoryBefore`になる、という依存関係があるため）。「全世代を一括submit」が原理的にできず、1世代内の1条件は元々1 APIコールで完結するため、個々のコールをBatch化しても**非同期で受け取るだけでメリットがほぼない**。orchestrator.ts側へのBatch API導入は見送る

対応順序：Phase 0（\(\Delta_M, \Delta_R\)確定、`calibration-runner.ts`を使う）の中でBatch API化を検討・実施する。Phase 4（`orchestrator.ts`本実行）へのBatch API導入は行わない。

## 6. コスト見積もり（`cost_estimate_stage0_5_to_5.md`との接続）

Stage 1の想定規模：10〜15世代 × 3条件 = 30〜45回のsystem2相当呼び出し。ただしAgent-Retrieved条件は、ツール呼び出しの往復が発生するため、**1世代あたりのAPI呼び出し回数がFull/Privilegedより多くなる**。

**倍率の見直し（レビューで判明）**：Anthropic APIのマルチターン会話では、各ターンのinput tokensに**それ以前の全会話履歴（tool_use/tool_resultを含む）が累積して含まれる**。例えば5回のtool callで平均1000トークンのファイルを読む場合、累積input tokensは単純合計ではなく三角数的に増加しうる（1000+2000+3000+4000+5000=15,000トークン）。これはFull条件（1回・2862トークン）の約5倍になりうる。当初「2〜3倍」としていた見積もりは、**agentが2〜3ファイルしか読まない想定に基づく楽観的な下限**であり、複数ファイル参照が必要なtask（cross-cutting系等）では上回る可能性が高い。**Phase 2で実測するまでは「2〜5倍」のレンジで見積もっておく**。

**5節のBatch API導入が完了した場合**：`calibration-runner.ts`側（Phase 0の反復試行）は単純計算で半額になる。`orchestrator.ts`側（Phase 4の本実行）はBatch API非適用のため、この効果は反映されない。

Phase 2のプロトタイプ確認（1〜2 task）で実測値を取り、`cost_estimate_stage0_5_to_5.md`のStage 1見積もり（$1〜1.5）を実測ベースで更新する。

---

## 7. 未決事項（このPhaseで判断してよいもの）

- Privileged Selectorの依存グラフ距離の具体的な重み付け（単純な最短距離か、複数経路を考慮するか）は、Phase 1実装時に判断してよい
- Agent-Retrievedのツール種類（`list_files`/`read_file`/`search`で十分か、他に必要か）は、Phase 2のプロトタイプ確認を経てから確定してよい
- held-out taskを20個全部使うか、10〜15個に絞るかは、Phase 4着手前にコスト見積もり（5節）を見てから決める

---

## 8. Stage 1完了の定義

- \(\Delta_M, \Delta_R\)が確定していること（Phase 0）
- 3条件それぞれで、mock・実APIともにクラッシュなく完走すること
- Full-Privileged、Privileged-Agentの対比から、4パターンのいずれかに分類できること
- 分類結果を`docs/findings/stage1_findings.md`（新規）に記録し、`docs/experiment_plan.md`のStage 1ゲート判定を更新すること

これが満たされたら、Stage 2（Longitudinal Pilot）の実装計画書を次に作成する。