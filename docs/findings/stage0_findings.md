# Stage 0 実行結果からの発見（Findings Log）

**このドキュメントの位置づけ**：`runs/`配下の生ログ（JSON、上書きされうる・容量が増え続ける）とは別に、
実行結果から得られた**解釈・気づき**だけを人間が読める形で永続的に記録する。
実験計画（`docs/experiment_plan_v1.6.md`）や研究の理論的立場に影響しうる発見は、
このドキュメントに残した上で、必要に応じて計画書側にも反映する。

各エントリには、元になった`runs/`配下のログへの参照（experiment_id / lineage_id / generation）を
残しておくが、そのログ自体は将来上書き・削除されうる前提とする。

---

## F1: Full条件下でも、distributed invariantが見落とされた（初の実API実行）

**日付**：2026-08-30
**Phase**：Phase 3（実API接続、スモークテスト）
**元ログ**：`runs/stage0-real-smoke-001/lineage-0/generation_000/`（※将来同じexperiment_idで
再実行すると上書きされる可能性があるため、この記録を一次情報とする）

### 実行条件

- backend: anthropic（`claude-haiku-4-5-20251001`）
- condition: full（context制限なし、全7ファイルを提示）
- task: T-local-1（`forceAdvanceVok`という新operationを、Vokをnimからdorへ一気に進める形で追加する）

### 何が起きたか

Task-specific test 3件中、1件が失敗した。

```
✅ forceAdvanceVok: Vok nim→dor when Tal=pex
❌ forceAdvanceVok: fails when Tal=nim (Invariant I1 guard)
✅ forceAdvanceVok: is registered as a known operation
```

Claude（Haiku 4.5）が実装した`forceAdvanceVok`には、Tal依存のprecondition（前提条件）が
含まれていなかった。正解実装（oracle patch, `harness/fixtures/oracle-patches/T-local-1.ts`）は
`Tal === "pex"`のチェックを含めており、これはInvariant I1（「Vokがdorならば、Talはpexで
なければならない」、distributed encoding。単一の関数に局所化されたガードではなく、複数の
precondition連鎖によって結果的に成立する性質のinvariant）を守るために必要な実装だった。

### なぜ注目すべきか

- **Full条件（情報を一切絞っていない）だったにもかかわらず見落とされた。** 渡された
  `zef/rules.ts`には、Invariant I1について名指しで説明したコメントが実際に含まれていた
  （「このpreconditionが、Invariant I1（Vok=dor ならば Tal=pex）を"distributed"に成立させる
  根拠の一部である」という一文）。この情報はagentに提示されていたが、新しいoperationを
  設計する際にはこの制約が反映されなかった。
- これは実験計画書の中心的な問い、すなわち「有限コンテキストの下でAIは前世代のartifactから
  意味を正しく再構成できるか」に直結する現象である。今回はまだcontextを絞っていない
  （Full条件）段階でこれが起きたという点が重要で、**Limited条件ではさらに起きやすくなる
  可能性を示唆する**（ただし今回は1回の試行に過ぎず、この解釈はまだ検証されていない）。
- 一方で、機構面（WorldProtocolの契約保持、visible/hidden testへの回帰なし）は完全に
  守られていた。つまり「言われたことは正確に実装するが、言われていない暗黙の制約は
  見落とす」という傾向が見えた、と言えるかもしれない（これも1回の試行からの仮説に過ぎない）。

### 今後への示唆（未検証の仮説として）

- Stage 0.5のsemantic probe設計で、explicit invariantとdistributed invariantを意図的に
  分けて出題し、正答率に差が出るかを確認する価値が高まった（計画書1.5節で既に提案済みの
  分類だが、実データによる最初の傍証が得られた形になる）。
- Stage 1以降、Limited条件でこの種の見落としの頻度が上がるかどうかが、研究の中心仮説
  （有限contextが選択圧として作用するか）を裏付ける最初の観察対象になりうる。
- 複数回の試行（同一task・同一条件でのsampling variance）を見ないと、これが
  「Haiku 4.5というモデルの傾向」なのか「distributed invariantという構造自体の困難さ」
  なのかを切り分けられない。Stage 3（対立仮説の排除）で複数model familyを試す際に
  再確認する。

---

## F2: Full条件下でのdistributed invariant見落としは再現性がある。手本のパターンが原因の可能性

**日付**：2026-08-30
**Phase**：Phase 4（Stage 0ゲート判定、5世代フル実行）
**元ログ**：`runs/stage0/stage0-real-001/lineage-0/`（generation_000, generation_003, generation_004）

### 実行条件

- backend: anthropic（`claude-haiku-4-5-20251001`）
- condition: full
- tasks: T-local-1 → T-crosscut-1 → T-delayed-1 → T-invariant-stress-1 → T-local-1（5世代）

### 何が起きたか

5世代中、**T-local-1（`forceAdvanceVok`追加）だけが、1回目（generation_000）・2回目
（generation_004、同一taskの再出題）とも同じパターンで失敗した**。他の3タスク
（T-crosscut-1, T-delayed-1, T-invariant-stress-1）はすべてtask-specific test 3/3で
一発成功している。

これはF1（初回の1回きりの観測）が**偶然ではなく再現性のある失敗**だったことを示す。

特に興味深いのは、T-invariant-stress-1（`fastTrackZef`追加。これもTalの暗黙チェックが
必要な課題）は**成功**した点である。両課題を比較すると：

- **T-invariant-stress-1（成功）**：既存の`advanceZef2`（Zefをdorにする関数）が、
  すぐ近くに**Talを直接チェックする実装**として存在した。AIが新しい`fastTrackZef`
  （同じくZefをdorにする）を書く際、この隣接する実例を模倣し、正しくTalチェックを
  含めた（実際のコード：`if (world.tal !== "pex") { throw ... }`を含めて生成）。
- **T-local-1（失敗、2回とも）**：一方、Vokをdorにする既存の`advanceVok2`は
  **Zefしかチェックしておらず、Talには一切触れていない**。AIが新しい
  `forceAdvanceVok`を書く際、この局所的な手本を真似た結果、Talチェックが漏れた。

### なぜ注目すべきか

AIは「近くにある似た実装をコピー（アナロジー）する」という振る舞いをしており、
**その手本自体に必要な情報が含まれているかどうかが、distributed invariantを
再構成できるかを左右している**可能性が見えてきた。単に「情報が足りているか」
だけでなく、「参照すべき手本が、たまたま近くにあるかどうか」という構造的な要因が
影響しているという仮説は、F1の時点ではまだ立てられなかった。

### 今後への示唆（未検証の仮説として）

- この「近くの手本をコピーする」傾向が本当だとすれば、distributed invariantの
  再構成しやすさは、invariantの抽象的な難しさだけでなく、**そのinvariantを示唆する
  手がかりがcontext上のどこに・どれだけ近接して配置されているか**にも依存する
  可能性がある。Stage 0.5のsemantic probe設計や、Synthetic World generator化の際、
  「手がかりとの近接度」を意図的に操作できる変数として検討する価値がある。
- 複数model familyでこの「近接手本コピー」傾向が共通して見られるか、Stage 3で
  確認する価値が高い。

---

## F3: Limited条件で、既存機能への回帰が世代を超えて自己修復されずに蓄積した

**日付**：2026-08-30
**Phase**：Phase 4（Stage 0ゲート判定、5世代フル実行）
**元ログ**：`runs/stage0/stage0-real-limited-001/lineage-0/`（generation_001〜generation_004）

### 実行条件

- backend: anthropic（`claude-haiku-4-5-20251001`）
- condition: simple-limited（`tests/`ディレクトリを除外、ファイルごと・全体の文字数上限あり）
- tasks: T-local-1 → T-crosscut-1 → T-delayed-1 → T-invariant-stress-1 → T-local-1（5世代）

### 何が起きたか

generation_000ではvisible 7/7・hidden 10/10（正常）だったが、**generation_001で
既存テストに回帰が発生し（visible 5/7・hidden 8/10）、これがgeneration_004まで
一度も回復せずそのまま残り続けた**。

原因を`git_diff.patch`で特定した。generation_001でAIに`kindleBoth`（ZefとTalを
同時に進める新機能）を追加させたところ、**AIは無関係な既存関数`advanceZef2`まで
誤って書き換えていた**：

```diff
  export function advanceZef2(world: WorldState): WorldState {
    ...
-   return { ...world, zef: "dor" };   // 元の正しい実装
+   return { ...world, zef: "pex" };   // 誤って書き換えられた
  }
```

意図的な変更ではなく、ファイル全体を書き直す過程での転記ミスと考えられる
（新規追加した`kindleBoth`が"pex"を返す実装だったため、近接する記述に引きずられた
可能性がある）。

**Full条件（`stage0-real-001`）では、5世代を通じてこの種の回帰は一度も起きていない**
（全世代、visible 7/7・hidden 10/10を維持）。

### なぜこの回帰が一度も直らなかったのか

Limited条件では`tests/`ディレクトリを完全にAIのcontextから除外している。そのため、
generation_002以降のAI（fresh sessionで、前世代の意図やこのミスの経緯を一切知らない）は、
既存テストが2件落ちていること自体に気づく手段がない。バグは静かに、世代を超えて
そのまま引き継がれ続けた。

### なぜ注目すべきか

これは実験計画書の中心仮説（有限コンテキストが選択圧として作用するか）を直接支持する、
最初の明確な証拠と言える。Full条件とLimited条件の対比が非常にクリーンである：

- Full条件：同じ5世代構成で、回帰は一度も発生しない
- Limited条件：世代1で回帰が発生し、それが可視化される手段（テスト）自体を
  隠しているために、**自己修復されず蓄積し続けた**

計画書のパターン④（「短期Full優位→長期Limited優位のcrossover」）とは異なる形だが、
「有限contextの下では、一度入り込んだ欠陥が自己修復されずに蓄積していく」という、
より具体的で観測しやすい現象として立ち現れた可能性がある。

### 今後への示唆（未検証の仮説として）

- この現象が再現性を持つか（同一条件で複数回試行して、Limited条件で回帰が
  発生する頻度がFull条件より有意に高いか）を確認する価値が非常に高い。
  Stage 1のOracle Limited / Agent-Retrieved Limitedとの比較でも、この
  「回帰の自己修復可能性」という軸を副次指標として追加することを検討したい
  （計画書3.2節の副次指標候補に追加できる：「visible/hidden testへの回帰が
  発生してから、後続世代で自然に修正されるまでの世代数」）。
- 今回はtests/を完全除外するという単純なLimitedルールだったため、
  「回帰の可視化手段そのものを奪う」という極端な効果が出た可能性がある。
  Stage 1で導入するPrivileged Selector / Agent-Retrievedでは、この極端さが
  緩和されるかどうかも比較対象になりうる。
- この転記ミス自体は、distributed invariantの見落とし（F1, F2）とは異なる
  失敗モードである。前者は「暗黙の制約を推論できない」ことに起因するが、
  今回は「ファイル全体を書き直す際の不注意な書き換え」であり、diff形式での
  出力にすれば防げた可能性がある（現在のharnessはフルファイル出力形式を
  採用している。`docs/harness_stage0_plan.md`5節「未決事項」参照）。
  出力形式（フルファイル vs diff）が回帰率に影響するかも、将来的な比較軸になりうる。

### この発見を受けた設計変更

この発見を受けて、simple-limited条件のルールを修正した。testsファイルは除外せず常に
全文を含める（また型定義ファイルも同様）ことを確定した。詳細は
`docs/harness_stage0_plan.md` 2.3節「単純Limited条件の最終ルール」を参照。

---

## エントリの追加方法

新しい発見を追加する際は、上記のF1と同じ形式（日付・Phase・元ログ・実行条件・何が起きたか・
なぜ注目すべきか・今後への示唆）に従う。「面白そうだが結論は出せない」段階の観察も歓迎する
（Stage 0〜2は探索段階であり、仮説を並べておくこと自体に価値がある）。