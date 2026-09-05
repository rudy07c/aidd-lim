# Stage 0.5 (Measurement Calibration) 実装計画

**対象**：`docs/experiment_plan.md` の「Stage 0.5：Measurement Calibration」
**前提**：Stage 0（Harness Feasibility）はゲート達成済み（experimentId: `stage0-real-001__2026-09-05_06-25-28`、`stage0-real-limited-001__2026-09-05_06-27-32`）
**このドキュメントの位置づけ**：`docs/harness_stage0_plan.md`と同じ形式。方針と設計判断の記録であり、コードそのものはここには書かない。

---

## 0. Stage 0.5で証明すべきこと（再掲）

計画書より：

> \(R^{sem}_B\) と \(M_B\) が測定器として機能するかを確認する。成功基準は「高得点」ではなく**測定感度**があること。

判定基準（4.3節）：

| パターン | 解釈 | 対応 |
|---|---|---|
| \(B=0\) でも高得点 | LLM priorのみで解けている | domain/probeを再設計 |
| 少量budgetで即100% | probeが簡単すぎる（天井効果） | probeを高難度化 |
| Fullでも低得点 | probe/domainが難しすぎる、または不備 | 較正パラメータを見直し |
| budgetに応じ滑らかに改善 | 測定器として使用可能 | Stage 1へ進行 |

Stage 0.5は「有限contextの効果を検証する」段階ではない。**測定器（ものさし）自体の目盛りが正しいか**だけを見る。この区別をStage 0の時と同様、実装全体で意識する。

---

## 1. 現有資産の棚卸しと、規模拡大の要否判定

着手前に、今使えるものと、Stage 0で判明した制約を整理する。実リポジトリ（Stage 0完了時点、`docs/experiment_plan.md` v1.8）に対して以下を確認済み。

### 1.0 事前準備タスク（Phase 0、着手前に必須）

実装着手前に片付けるべき、Stage 0.5固有ではない準備作業。

- **`harness/src/types.ts`の型拡張**：`GenerationLog`の`semantic_probe_results: null`・`semantic_element_trace: null`が、コメント上は「Stage 0.5以降で追加」とありながら、**型定義そのものがリテラル`null`に固定**されており、実際の値を格納できない。系統2用に`GenerationLog`側を拡張する（系統1のログ設計は2節参照、新しい型を作るかどうかは実装判断でよい）
- **`runs/stage0/`のhousekeeping（任意、推奨）**：デバッグ・動作確認で生成されたタイムスタンプ付きの重複ディレクトリ（14MB超、十数個）が整理されないまま蓄積している。Stage 0.5の着手を妨げるものではないため必須ではないが、手が空いたタイミングで整理しておくと見通しが良くなる（本番データ`stage0-real-001__2026-09-05_06-25-28`等は残す）

### 1.1 現有資産

| 資産 | 現状規模 | 計画書1.2節の目標規模 |
|---|---|---|
| entity数 | 3（Vok, Zef, Tal） | 5 |
| operation数 | 5（+held-out task由来4） | 8 |
| dependency数 | 3 | 5 |
| invariant数 | 2（I1: distributed, I2: explicit） | 6 |
| task数 | 4 | 20 |
| semantic probe数 | 6 | 30〜50 |
| seed architecture数 | 1（Architecture A） | 2 |
| world数 | 1 | 3 |

### 1.2 Stage 0で判明した、規模に起因する制約（F5、要対応）

`docs/findings/stage0_findings.md` F5：現在の規模では、visible test（常に全文をcontextへ含める設計、Stage 0で確定）が既存invariantをほぼ網羅してしまい、**semantic probeやheld-out taskの正答率が、ソースコードの情報量ではなくvisible testのカバレッジに支配される**リスクが高い。これは4.3節の判定基準でいう「\(B=0\)でも高得点」（この場合はvisible testが常にcontextへ含まれるため、実質的な最小budgetでも高得点になりうる）に類する天井効果を、規模の小ささが誘発する可能性を意味する。

### 1.3 方針：小規模のまま較正パイプラインを先に組み、規模拡大は判定結果に応じて実施する

計画書の元々の設計思想（「次のアクション」①〜⑥：generatorは最後）を踏襲し、**いきなり規模を拡大しない**。理由は前回と同じで、パイプライン自体に欠陥がある状態で規模だけ拡大すると、欠陥の発見・修正コストが跳ね上がるため。

具体的な進め方：

1. 現在の小規模worldのまま、測定パイプライン（probe生成・採点・dose-response curve描画）を組み上げる（Phase 1〜3）
2. 一度小規模のまま較正を実行してみる（Phase 4）
3. 4.3節の判定基準に照らして、天井効果（F5で予見された通り）が実際に出るかを確認する
4. **天井効果が出た場合、それを規模拡大（Synthetic World generator化 or 手動でのworld v1拡張）の着手根拠とする**（Phase 5、条件付き）
5. 拡大後、同じパイプラインで較正をやり直す（Phase 6）

この順序により、「パイプラインのバグ」と「規模不足による天井効果」を混同しない。

---

## 2. 全体アーキテクチャ

**ログ出力先**：`runs/stage0_5/`（`runs/stage0/`と並列）。**系統1と系統2でログの意味が異なる**（系統2はコード変更前後を持つが、系統1は質疑応答のみで`repository_before`/`git_diff`等が意味を持たない）ため、そのまま`GenerationLog`型を両方に流用すると不自然なnull/空フィールドが増える。実装方針はどちらでもよい：

- 系統1用に軽量な専用型（例：`SemanticProbeLog`）を新設する、または
- `GenerationLog`をそのまま両方で使い回し、系統1では使わないフィールド（`repository_before`等）をnull/空文字で埋める

どちらを選んでもStage 0.5の目的達成には影響しない。実装のしやすさで判断してよい。

```
calibration/
  src/
    probe-generator.ts       G(ground_truth.json)からsemantic probeを機械生成
    probe-scorer.ts           probeの回答を採点（5形式対応）
    budget-assembler.ts       context budgetを B∈{0,1K,2K,4K,8K,Full} で段階的に構築
    calibration-runner.ts     系統1（R^sem）・系統2（M_B）を実行する本体
    dose-response.ts          結果を集計し、4.3節の判定基準に照らして分類する
  fixtures/
    probe-bank.json            probe-generatorの出力を保存したもの（レビュー可能な形で固定）
    heldout-task-set.json       M_B測定用のtask set（k=5〜10）
  run-calibration.ts           CLIエントリポイント
  config/
    calibration-worldA-namingA.json
    calibration-worldA-namingB.json
```

### データフロー（1 budget値 B について）

```
[固定完成系 S（synthetic-world/repository/、世代進化させない）]
        │
        ├─ 系統1（意味的再構成）
        │     budget-assembler(S, B) → context
        │     fresh agent 1 → semantic probeへ回答
        │     probe-scorer → R^sem_B(S) の1サンプル
        │
        └─ 系統2（機能的継続）
              budget-assembler(S, B) → context
              held-out task set T_1..T_k のそれぞれについて：
                fresh agent（系統1とは別インスタンス） → 変更を実装
                task-specific test + hidden regression test → 成功/失敗
              → M̂_B(S) = 成功数 / k

すべてのB値について上記を繰り返し、dose-response curveを描く。
命名方式A/Bについても同様に繰り返す（2倍の実行）。
```

---

## 3. 主要な設計判断

### 3.1 budget-assemblerは、Stage 0のcontext/assembler.tsとは別物であり、「常に全文」ルールは持ち込まない

Stage 0の`assembleContext(files, condition)`は`"full" | "simple-limited"`という**named condition**で条件分岐する設計だった。Stage 0.5で必要なのは、\(B \in \{0, 1K, 2K, 4K, 8K, \text{Full}\}\)という**明示的なトークン予算**を受け取り、その予算ちょうどに近づくようcontextを構築するロジックである。

**Stage 0の「tests・型定義・固定契約ファイルは常に全文含める」というルールは、そのままでは持ち込まない。** 理由は、そのルールがStage 0で必要だったのは「世代を重ねる中で、既存機能への回帰が見逃されて蓄積するのを防ぐため」（F3）であり、Stage 0.5には世代の概念がなく\(S\)は固定されるため、回帰蓄積のリスクがそもそも存在しない。このルールをそのまま持ち込むと、\(B=0\)の時点で既にtestsが全文見えることになり、「情報0から始める」というdose-response curveの前提そのものが崩れる。

代わりに、**予算が増えるにつれてどの順番で情報を追加していくか**という固定の優先順位（file inclusion order）を定義する。この順序自体は一例であり、Stage 0の「Limited条件の巧拙は問わない」という方針と同じく、**厳密にどの順が最適かは問わない**。重要なのは「\(B\)が増えるにつれ単調に情報が追加される、固定された順序である」という一点のみ。既存の`harness/src/context/assembler.ts`が持つ判定ヘルパー（`isTestFile()`, `isFixedContractFile()`, `isTypeDefinitionFile()`, `estimateTokenCount()`）はいずれもexportされており、そのまま再利用できる（確認済み）。案：

1. \(B=0\)：何も渡さない（held-out taskのvisible instructionのみ）
2. \(B\)が増えるにつれ、型定義 → protocol_adapter.ts → tests → 実装ロジック本体、の順で予算を使い切るまで追加していく（あくまで一例。他の順序でも「単調増加」の原則さえ守れば構わない）
3. \(B=\text{Full}\)で、全ファイルが全文含まれる

これにより、\(B=0\)は真にゼロ情報のベースラインとなり、\(B\)の増加に伴い単調に情報が追加される、dose-response curveの前提に忠実な設計になる。F5の対策（3.4節）と組み合わせることで、「どの段階で答えが漏れ始めるか」自体も観察対象になりうる。

### 3.2 probeの提示方法：1回のagent呼び出しで全probeをまとめて聞く

系統1では、ある\(B\)値・ある命名方式について、probe bank内の全probe（Phase 1完了時点で6〜15問程度を想定）を**1回のagent呼び出しでまとめて提示し、まとめて回答させる**。1問ごとに個別のagent呼び出しを行うと、\(B\)値×命名方式×probe数の分だけ呼び出し回数が増え、コストが跳ね上がるため。「fresh session」の原則（世代間の記憶を持ち越さない）は、この文脈では「\(B\)値ごとに新しいagentインスタンスを使う」ことで満たされており、同一呼び出し内で複数probeに答えること自体は問題にならない。

### 3.3 系統1と系統2の独立性

計画書の設計判断（「系統1と系統2は同一世代内では独立したfresh agentで実施」）をそのまま踏襲する。`calibration-runner.ts`は、同一\(B\)値に対して**必ず2つ以上の独立したagent呼び出し**（系統1用に1つ、系統2用に\(k\)個）を行う。Stage 0の`orchestrator.ts`とは異なり、ここでは「世代」という連続性は存在しない（\(S\)は固定、世代進化させない）ため、実装は`orchestrator.ts`を流用するのではなく、より単純な「1回のagent呼び出し→採点→終了」を\(B\)の数×命名方式の数×(1 + k)回繰り返す構成にする。系統1と系統2ではログの**意味**が異なる（2節参照。ログの型を分けるか共用するかは実装判断でよい）ため、`calibration-runner.ts`内部では系統1用・系統2用の処理を関数として分離しておくとよい。

### 3.4 F5対策：probe/taskがvisible testから答えを漏らしていないかの事前チェック（未決事項#14への対応）

`probe-generator.ts`が生成したprobeについて、生成後に以下を自動チェックする：

- そのprobeが問うinvariant/dependencyについて、`repository/tests/`内に**直接的なassertion**が既に存在するか（静的解析：invariantのcondition/requiresに現れるentity名が、テストファイル内でどれだけ直接言及されているか）
- 直接的なassertionが存在するprobeは、\(B=0\)でも高得点になりうる「答えが漏れているprobe」として、フラグを立てるか除外する

これは未決事項#14に対する、Stage 0.5スコープでの最初の実装である。完全な自動化が難しい場合、フラグ付けまでを自動化し、最終的な採否は人間が`probe-bank.json`をレビューする形でよい（Stage 0.5はまだ人手を介在させてよい規模）。

### 3.5 held-out task setの規模（未決事項#9への対応）

現在4 taskしかないため、\(k=5\text{〜}10\)を満たすには最低1 task追加が必要。計画書1.5.1節の構成A/Bの区別は、元々のtask typeラベル（local/cross-cutting/delayed-dependency/invariant-stressing）とは別軸であり、**task-specific testの内容（invariantを直接問うか否か）で再分類する必要がある**。既存4 taskを見直すと：

- **構成B相当**（task-specific testがinvariant guardを明示的に問う）：T-local-1、T-invariant-stress-1
- **構成A相当**（現状のtask-specific testはinvariantを直接問わない）：T-crosscut-1、T-delayed-1

つまり既存4 taskは「構成B寄り」ではなく、**既に2:2で分かれている可能性が高い**（Phase 1で各taskのtask-specific testを再確認して確定する）。この前提のもとで、Stage 0.5の時点で構成A・構成Bそれぞれ最低2〜3 taskずつ確保するには、**両方に1 taskずつ、計2 task追加**するのが妥当な目安になる（3.8節の\(k=6\)試算の根拠）。

**新規taskを追加する際は、必ず以下の検証を経る**（Stage 0で構築済みのツールをそのまま再利用する）：

- `model_checker.ts`：新規taskのGroundTruthDeltaを適用した\(G_{g+1}\)が自己無矛盾であることを確認する
- `validate_task_deltas.ts` / `validate_sequence.ts`：既存taskとの単体・累積検証で相互作用バグがないことを確認する

これは以前T-local-1の初版delta（preconditionなし）がI1違反を持ち込んでいたことを、まさにこの検証で発見した経緯があるため、省略しない。

### 3.6 スコアリングはStage 0の`runScoring()`をそのまま呼び出す

系統2（held-out task実装）でも、Stage 0と同じくWorldProtocol契約違反のリスクが存在する（agentが`protocol_adapter.ts`のexportを壊す等）。実装確認の結果、`harness/src/scoring.ts`の契約違反判定（`detectProtocolViolation`）は非公開関数だが、これを内包する**`runScoring(repositoryFiles, syntheticWorldDir, taskSpecificTestCode)`は公開関数**であり、visible/hidden/task-specific test実行と契約違反判定を1回の呼び出しで全て行う。`calibration-runner.ts`はこの`runScoring()`をそのまま呼び出し、重複実装を避ける。

### 3.7 命名方式A/Bの比較は、全パイプラインを通して二重に実行する

計画書の指示通り、命名方式A（難読化）・B（虚構語彙）は独立変数として両方実施する。実装上は、`naming_schemes.json`の2エントリを使い、`budget-assembler`と`probe-generator`の両方に命名方式を渡せるようにする（既存の`semantic_probes.json`は命名方式Aのみで書かれているため、方式B版も生成する必要がある）。

### 3.8 コスト規模の見積もり

\(k=6\)（3.5節の目安：既存4 task(構成A/Bへ再分類後、想定2:2) + 新規2 task(各構成1つずつ) = 3:3、計6）、\(B\)が6段階、命名方式2種とすると、系統2だけで \(6 \times 6 \times 2 = 72\) 回のagent呼び出しになる。系統1は1回の呼び出しで全probeをまとめて聞く設計（3.2節）のため \(6 \times 1 \times 2 = 12\) 回で済む。合計で約85回程度のagent呼び出しが、命名方式A・B両方・全\(B\)値をフル実行した場合の規模になる。実際の追加task数はPhase 1実装時に確定してよく（3.5節参照）、\(k\)が変われば呼び出し回数も比例して変わる。

これを一度に実行せず、Phase 4では命名方式Aのみ・各\(B\)値1試行（\(6 \times (1+6)=42\)回）から始め、Phase 6で命名方式Bを追加する、という段階的な実行にする（既にPhase構成に反映済み）。加えて、\(\Delta_M\)の目安を得るための反復試行（1〜2 task × 2〜3回、Phase 4 step14）を、上記42回に上乗せする（+数回〜十数回程度、大きな増分ではない）。

**使用モデル**：Stage 0で使用した`claude-haiku-4-5-20251001`をそのまま踏襲する。Stage 1以降で異なるモデルを使う計画がある場合、較正結果がそのモデルに転用できない可能性があるため、Phase 4着手前にStage 1で使うモデルを確認しておく。

---

## 4. ビルド順序（タスク分解）

段階を分け、各段階の終わりに動作確認してから次へ進む。

### Phase 0：事前準備（1.0節）

0a. `types.ts`の`semantic_probe_results`/`semantic_element_trace`の型拡張（必須）
0b. `runs/stage0/`のhousekeeping（任意、手が空いたタイミングで）

### Phase 1：Probe generatorとscorerの最小実装、およびheld-out task setの拡張

1. `probe-generator.ts`：`ground_truth.json`から5形式（multiple choice / boolean / set selection / graph edge prediction / state transition prediction）のprobeを機械生成する
2. `probe-scorer.ts`：agentの回答文字列から各形式の正誤を判定するロジック
3. 既存の`semantic_probes.json`（6問、命名方式Aのみ、手書き）を`probe-generator.ts`の出力で置き換えられるか検証する。既存6問を機械生成できたら成功
4. F5対策（3.4節）の静的チェックを実装し、既存6問に対して実行。答えが漏れているprobeがないか確認する
5. **held-out task setをk=5〜10まで拡張する**（3.5節）。まず既存4 taskをtask-specific testの内容から構成A/Bに再分類し、その上で構成A・Bそれぞれ1 task程度を追加して2:2→3:3のバランスに近づける。追加ごとに`model_checker.ts`・`validate_task_deltas.ts`・`validate_sequence.ts`で検証する（3.5節のチェックを省略しない）

**この時点でのゲート**：機械生成したprobeが、既存の手書きprobeと同等以上の質（採点可能・答えが漏れていない）であること。held-out task setが\(k=5\text{〜}10\)に達し、全taskが検証済みであること。

### Phase 2：budget-assemblerの実装

6. `budget-assembler.ts`：\(B \in \{0, 1K, 2K, 4K, 8K, \text{Full}\}\)それぞれについて、3.1節のfile inclusion orderに従いcontextを構築する
7. \(B=0\)で本当に何も渡らないこと、\(B\)の増加に伴い型定義→protocol_adapter.ts→tests→実装ロジックの順で単調に情報が追加されることを、Stage 0で使った検証パターン（`assembleContext`を直接呼び出し、ファイルごとの文字数内訳を出力する）で確認する

**この時点でのゲート**：6段階のbudgetそれぞれで、想定通りの文字数・ファイル構成のcontextが構築されること。

### Phase 3：mockでcalibration-runnerの機構を通す

Stage 0のPhase 1と同じ発想で、まずmock-noop/mock-oracleで機構を検証してから実agentに進む。

8. `calibration-runner.ts`（系統1・系統2）を、mock-noop/mock-oracleで実行する。系統1は3.2節の通り、probeをまとめて1回のagent呼び出しで聞く設計にする
9. 系統2（\(\hat{M}_B\)）がheld-out task set全体で正しく集計されるか確認する（mock-oracleなら全\(B\)で\(\hat{M}_B=1\)、mock-noopなら全\(B\)で低い値になるはず）
10. 系統1（\(R^{sem}_B\)）はmockでは意味のある値が出ないため、パイプラインが最後まで実行されクラッシュしないことだけ確認する
11. `runScoring()`経由の契約違反判定（3.6節）が系統2から正しく機能し、契約違反が検出されることを、意図的に壊したfixture（`harness/verify-broken-contract.ts`のパターンを流用）で確認する

**この時点でのゲート**：mockで両系統・全\(B\)値・両命名方式が、クラッシュなく実行され、ログが欠損なく残ること。

### Phase 4：実agentで小規模worldの較正を実行

12. `dose-response.ts`を実装する。判定は**task set全体の一括判定ではなく、held-out task単位でも行う**（後述の理由）。系統1・系統2それぞれの結果を\(B\)ごとに集計し、4.3節の4パターンに分類するロジックを実装
13. **fail-fastの事前チェック**：6段階すべてを実行する前に、まず\(B=0\)と\(B=\text{Full}\)の2点だけを実行し、そもそも差が出そうか（Fullで極端に低得点、または\(B=0\)で既に高得点、といった致命的な兆候がないか）を確認する。ここで明らかな異常が出た場合、6段階フル実行に進む前にprobe/task側を見直す
14. 実APIで、現在の小規模world・命名方式Aのみ、全\(B\)値（6通り）× 系統1（1 agent呼び出し）+ 系統2（\(k\)個のagent呼び出し）を実行する。**このとき、held-out taskのうち1〜2件について、同一\(B\)値で2〜3回の反復試行を追加する**（3.8節参照）。目的は主にdose-response curveの精度向上ではなく、**Stage 1のequivalence testingで使う\(\Delta_M\)（未決事項#5）の目安を得るための、条件内ばらつきの粗い推定**である
15. 結果をdose-response curveとして可視化し、**task set全体の集計**と**task単位**の両方で、4.3節のどのパターンに該当するか判定する。一部のtaskだけが天井効果等を示す場合、そのtaskをheld-out task setから除外する候補として記録する（全体を棄却してPhase 5へ進む前に、task単位の選別で解決できないか確認する）

**この時点でのゲート**：4.3節の判定結果が出ること（どのパターンであっても構わない。判定自体ができることがゲート）。task単位での取捨選択を経て、Stage 1へ引き継ぐheld-out task setが確定していること。

### Phase 5（条件付き）：規模拡大

Phase 4の結果が「測定器として使用可能」（budgetに応じ滑らかに改善）であれば、Phase 5はスキップしてPhase 6（命名方式Bとの比較、正式な較正完了）へ進んでよい。

Phase 4の結果が天井効果・床効果を示した場合（1.2節で予見した通りの結果になった場合）：

16. Synthetic World generatorの設計に着手する（計画書「次のアクション」⑥）。1.1節の目標規模（5 entity・8 operation・6 invariant・20 task）を満たすworldを構築する
17. 拡大後のworldに対し、model checker・累積validator・semantic locality計算等、Stage 0時点で構築済みの検証ツール一式を再実行し、拡大後のworldが自己無矛盾であることを確認する
18. Phase 1〜4を拡大後のworldに対して再実行する

### Phase 6：命名方式Bとの比較、較正の正式完了

19. 命名方式B（虚構語彙）でも同様にPhase 4（または5経由の再実行）を行う
20. 命名方式A・Bのdose-response curveを比較し、より感度の高い方式を採用する（未決事項#2の解決）
21. 較正結果を`docs/findings/stage0_5_findings.md`として記録し、`docs/experiment_plan.md`のStage 0.5ゲート判定を更新する
22. **Stage 1への引き継ぎ資産を確定する**（8節参照）：確定したprobe bank、選別後のheld-out task set、勝った命名方式を固定資産としてfreeze。Stage 1ではこれらを再導出せず、そのまま使う

---

## 5. Stage 0の教訓の反映（見落とし防止のためのチェックリスト）

Stage 0で繰り返し発生した「一部だけ修正して、依存箇所の更新漏れに気づかず進めてしまう」問題を避けるため、各Phaseの完了報告には以下を必須とする。

- [ ] 型チェック（`tsc --noEmit`）の実行結果
- [ ] 既存テスト（`jest`、17件）に回帰がないことの確認
- [ ] 新規追加した測定パイプラインの出力を、**集計値だけでなく個別の中身（どのprobeに正解し、どのtaskで失敗したか）まで目視確認したこと**の明記
- [ ] mockでの機構確認を経てから実agentに進んだことの確認（Phase 3→4の順序を飛ばさない）

---

## 6. 未決事項（このPhaseで判断してよいもの）

- probe-generatorが生成する形式ごとの比率（5形式を均等に割り振るか、invariant関連のboolean/set selectionを厚めにするか）は、Phase 1実装時に判断してよい
- \(B\)の刻み幅（\(0, 1K, 2K, 4K, 8K, \text{Full}\)固定でよいか、小規模worldでは\(1K\)刻みが粗すぎないか）は、Phase 2でFullのトークン数を実測してから調整してよい
- Phase 5（規模拡大）に進む場合のgenerator実装方針（完全自動生成 vs テンプレートからの半自動生成）は、その時点で改めて設計相談する

---

## 7. Stage 0.5完了の定義

- Phase 1〜4（必要ならPhase 5〜6）を通して、\(R^{sem}_B(S)\)と\(\hat{M}_B(S)\)が4.3節のいずれかのパターンに分類できる
- 「測定器として使用可能」と判定された場合のみ、Stage 1（Context Decomposition）へ進む
- 天井/床効果と判定された場合は、Phase 5（規模拡大）または probe/domain の再設計を経てから再判定する

これが満たされたら、`docs/experiment_plan.md`を更新し、Stage 1の実装計画書を次に作成する。

---

## 8. Stage 1への引き継ぎ資産

Stage 0.5で確定した以下の資産は、Stage 1で**再導出せず、固定資産としてそのまま使う**：

- `probe-bank.json`（F5対策済み、答えの漏洩がないことを確認済みのprobe集合）
- `heldout-task-set.json`（Phase 4のtask単位判定で選別済み、\(k\)件の構成）
- 採用された命名方式（A or B、Phase 6で決定）
- 較正済みの`budget-assembler.ts`（file inclusion orderのロジック自体は、Stage 1のPrivileged Selector設計のベースラインとしても参照できる）
- 反復試行から得た条件内ばらつきの粗い推定値（未決事項#5 \(\Delta_M, \Delta_R\) の初期値の参考として、Stage 1着手時に正式決定する材料に使う）

逆に、Stage 0.5の`calibration/`ディレクトリ構成（budget値による段階的context構築）は、Stage 1のFull/Privileged-Selection Limited/Agent-Retrieved Limitedという3条件設計とは別物であり、そのまま流用しない（3.1節で述べた通り、目的が異なる）。
