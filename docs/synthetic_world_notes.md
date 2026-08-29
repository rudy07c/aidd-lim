# Synthetic World v0.3 — 累積validatorの正当化、ID一意性、semantic locality

v0.2からの変更点は3つ。いずれもレビューで指摘された、v0.2の主張に含まれていた不正確さの修正。

1. **`demo_interaction_only_bug.ts`（新規）**：累積validator固有の価値を正しく実証するデモ。
2. **`schema.ts`にID一意性チェックと正準化を追加**：「最終Gは順序不変」を仮定ではなく実際に検証できるようにした。
3. **`semantic_locality.ts`（新規）**：意味的局所性を「deltaのみ」ではなく「$(G_g + \Delta_g)$」から機械的に算出する。

型チェック・全17テストともにpass。

---

## 修正1：累積validatorの正当化をやり直した

v0.2の`demo_order_dependency.ts`は、「不正なtaskをどこに置くかで矛盾が検出される世代が変わる」ことしか示していなかった。`buggyTask`は単体で既に不正なdeltaであり、これは既存の単体validator（`validate_task_deltas.ts`）でも検出できる。つまり累積validator固有の価値をまだ実証していなかった。

`demo_interaction_only_bug.ts`で、**単体では両方安全なdeltaが、組み合わせでのみ矛盾を生む真の相互作用バグ**を構成し直した。

- entity A(q1,q2,q3), B(q1,q2)、invariant K「A=q3ならB=q2」（explicit encoding）
- $G_0$：Bを動かす操作が存在しない → Bは永久にq1 → Aはq3に到達不能（Kはvacuously true）
- task P：`OB1(B: q1→q2)`を追加。単体では、Aがq3に到達する経路（`OA2`、B=q2を要求）は引き続きKを守る → **安全**
- task Q：`OB2(B: q2→q1、後退)`を追加。単体では、Bはそもそもq2に到達できない（Pがないため）ので`OB2`は事実上の死コード → **安全（vacuous）**
- **P + Q 両方適用**：`OB1`でB=q2にしてから`OA1→OA2`でA=q3にし（この時点でK成立）、その後`OB2`でBを後退させると、**A=q3・B=q1というK違反状態**が生まれる

実行結果：

```
=== 単体検証（単体validatorでも検出可能な範囲） ===
G_0 (base): reachable=2, OK
G_0 + ΔP (task P alone): reachable=5, OK
G_0 + ΔQ (task Q alone): reachable=2, OK

=== 累積検証（単体validatorでは検出不可能） ===
G_0 + ΔP + ΔQ (both applied): reachable=6, NG (1)
  - K violated at {"A":"q3","B":"q1"} (via [OA1 -> OB1 -> OA2 -> OB2])
```

これにより、累積validatorの位置づけを

> 「task sequenceによる科学的現象の発見装置」ではなく、**「task同士を組み合わせたときに、単体検証では見つからない相互作用上の設計ミスがないか確認する品質保証ツール」**

として正確に位置づけ直せる。計画書のStage 3の記述もこの位置づけに合わせて修正すべきである（下記反映候補参照）。

なお、GroundTruthDeltaが加算のみで構成される現在の設計では、「$G_g$が矛盾を持ったら以降のどの世代も矛盾を持ち続ける」というレビュー指摘は正しい。したがって「中間世代だけ一時的に壊れて後で直る」という現象は起きない。累積validatorの価値は「順序によって中間の無矛盾性が変わる」ことではなく、「単体では見えない相互作用バグを検出できる」ことにある。

## 修正2：ID一意性・canonicalizationで「最終Gは順序不変」を実証

`schema.ts`に以下を追加した：

- `checkIdUniqueness(g)`：entity/operation/transition(operationId)/dependency/invariantのIDに重複がないかを検査する
- `canonicalizeGroundTruth(g)`：全配列をID順にsortし、配列順の違いを意味の違いと誤認しないようにする
- `groundTruthsEquivalent(a, b)`：正準化した上での深い等価性比較

`validate_sequence.ts`に、累積適用のたびにID一意性を検査するチェックを追加し、CLI実行時には順序A・順序Bで適用した最終$G$をcanonicalize後に比較する検証を追加した：

```
最終G（順序A） と 最終G（順序B） は canonicalize後に等価か: true
```

これにより「最終Gは順序不変」は仮定ではなく実際に検証された主張になった。将来、本番のtask bank生成でtask同士がID衝突するケース（例：generatorが偶然同じoperationIdを2つのtaskに割り当てる）も、この一意性チェックで機械的に検出できる。

## 修正3：Semantic localityを$(G_g + \Delta_g)$から算出

`semantic_locality.ts`を新規実装。

- **Surface locality**：deltaが直接言及するentityの集合（`addTransitions`の`effects.entity`・`preconditions.entity`の和集合）
- **Semantic locality**：Surface localityを起点に、**$G_{g+1} = G_g + \Delta_g$**（deltaのみではなく、既存の$G_g$を適用した後の完全なground truth）のdependency/invariantグラフをBFSで辿って到達するentityの集合

`heldout_tasks.json`の4 taskに対して実行した結果：

```
T-local-1 (type=local):
  surface locality  = {E1, E3}  (size=2)
  semantic locality = {E1, E2, E3}  (size=3)
  divergence = 1

T-crosscut-1 (type=cross_cutting):
  surface locality  = {E2, E3}  (size=2)
  semantic locality = {E1, E2, E3}  (size=3)
  divergence = 1

T-delayed-1 (type=delayed_dependency):
  surface locality  = {E2}  (size=1)
  semantic locality = {E1, E2, E3}  (size=3)
  divergence = 2

T-invariant-stress-1 (type=invariant_stressing):
  surface locality  = {E2, E3}  (size=2)
  semantic locality = {E1, E2, E3}  (size=3)
  divergence = 1
```

T-local-1は、修正済みのdelta自体には既にE3へのprecondition（I1を守るために必要と判明した制約）が明示的に含まれているため、surface localityの時点で{E1, E3}となる。それでもE2は表面上どこにも現れないが、E3経由の連鎖（I1: Vok=dor⇒Tal=pex、かつO3のprecondition連鎖でE2がE3に依存）によりsemantic localityに含まれる。**deltaだけでなく$G_g$全体のグラフを辿らなければ、この間接的な必要知識は検出できない**ことが実際に確認できた。

T-delayed-1がdivergence=2で最大なのは興味深い。表面的には「Zefを1つ戻すだけ」の単純なtaskだが、$G$全体のinvariant/dependencyグラフを辿ると3 entity全部と関連する。これは「delayed dependency」というtask type自体が、意味的局所性を意図的に広げる設計になっていることの一つの裏付けとも言える。

---

## 計画書（v1.5）への反映候補まとめ（v0.3分）

| # | 内容 | 反映先候補 |
|---|---|---|
| 10 | 累積validatorの位置づけを「task sequenceによる科学的現象」ではなく「単体検証では見つからない相互作用バグの品質保証」に修正する | 4節 Stage 3 |
| 11 | GroundTruthDeltaが加算のみの現設計では「$G_g$が矛盾を持てば以降も矛盾を持ち続ける」（中間だけ壊れて後で直ることは原理的に起きない）ことを明記する | 4節 Stage 3 |
| 12 | 「最終Gは順序不変」に、ID一意性・canonicalizationという前提条件を付記する | 4節 Stage 3、未決事項リスト |
| 13 | 意味的局所性の算出式を「GroundTruthDeltaのみ」から「$(G_g + \Delta_g)$」に修正する | 3.2節（副次指標） |

---

## 実装規模の参考値（v0.3実測）

- `schema.ts`：約230行（ID uniqueness / canonicalize追加後）
- `demo_interaction_only_bug.ts`：約110行、独立した最小worldで相互作用バグを実証
- `semantic_locality.ts`：約130行、surface/semantic locality算出とBFS
- 既存ファイル（`model_checker.ts`, `validate_task_deltas.ts`, `validate_sequence.ts`, `ground_truth.json`, `heldout_tasks.json`, `repository/`, `hidden_regression_tests/`）は変更内容を除き維持

型チェック・全17テストpass。

---

## 現在地とこれから

レビューでの指摘は今回で解消された。Synthetic World側は次の状態まで到達している：

- 正解世界$G$自体の無矛盾性を機械検証できる
- 複数entityを同時変更する複合operationを正確に表現できる
- 新しい要求による正解世界の進化（$G_g \to G_{g+1}$）を表現できる
- AIが内部構造を変えても外から採点できる（WorldProtocol）
- task同士の相互作用による設計ミスを、単体検証では届かない範囲まで検出できる（累積validator、実証済み）
- 「最終Gは順序不変」という主張が、仮定ではなく実際に検証された
- 表面的局所性と意味的局所性の乖離を、既存$G_g$のグラフ構造まで含めて機械的に算出できる

測定装置側の主要な理論的懸念はここでほぼ解消できたため、次はいよいよ**Stage 0（世代継承ハーネスそのもの：fresh AI → repositoryを読む → taskを実装 → 採点 → repositoryだけ次世代へ渡す、を5〜10回回す）**に進む段階と考える。
