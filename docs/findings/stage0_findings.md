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

## エントリの追加方法

新しい発見を追加する際は、上記のF1と同じ形式（日付・Phase・元ログ・実行条件・何が起きたか・
なぜ注目すべきか・今後への示唆）に従う。「面白そうだが結論は出せない」段階の観察も歓迎する
（Stage 0〜2は探索段階であり、仮説を並べておくこと自体に価値がある）。
