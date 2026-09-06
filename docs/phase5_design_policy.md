# Phase 5 設計方針（叩き台）

> 作成: 2026-09-06
> 対象: Synthetic World 規模拡大（3→5 entity, 5→8 operation, 2→6 invariant, 6→20 task）
> ステータス: **方針案。実装前に確認・修正を求める。**

---

## 1. Entity 拡張戦略（3→5）

### 採用方針: 並列2チェーン + クロスチェーン invariant

現行の依存チェーン（E3→E2→E1）はそのまま保持し、新たに独立した第2チェーン（E5→E4）を追加する。
2チェーン間を結ぶクロスチェーン invariant を設けることで、「chain1のみを理解した実装」では不十分になる設計を実現する。

```
現行:  E3(Tal, root) → E2(Zef) → E1(Vok)
追加:  E5(新root)    → E4

クロスチェーン invariant により E1/E2 と E5/E4 が意味的に結合
```

**新 entity 仕様案:**

| ID | 仮名 (A-obfuscated) | States      | 初期状態 | 備考                         |
|----|---------------------|-------------|----------|------------------------------|
| E4 | Fen                 | q1/q2/q3    | q1       | Chain 2 の中間・終端 entity  |
| E5 | Osk                 | q1/q2       | q1       | Chain 2 の根（preconditionなし）|

**既存 operation の precondition 修正（クロスチェーン invariant を成立させるため）:**

| ID | 変更前 Precondition | 変更後 Precondition    | 理由                                           |
|----|---------------------|------------------------|------------------------------------------------|
| O2 | [E2=q2]             | [E2=q2, **E5=q2**]     | I4 を explicit に保証（Vok=dor には Osk=pex が必要）|
| O4 | [E3=q2]             | [E3=q2, **E4=q2**]     | I5 を distributed で保証（Zef=dor には Fen=pex が必要）|

**新 operation 仕様案（O6〜O8）:**

| ID | 仮名 (A-obfuscated) | Effect          | Precondition         | 備考                                              |
|----|---------------------|-----------------|----------------------|---------------------------------------------------|
| O6 | advanceOsk1         | E5: q1→q2       | なし                 | Tal と並行する根操作                              |
| O7 | advanceFen1         | E4: q1→q2       | [E5=q2]              | advanceZef1 と対称構造                            |
| O8 | advanceFen2         | E4: q2→q3       | [E5=q2, **E2=q2**]   | E3=q2 ではなく E2=q2 を要求（I6 を distributed で保証）|

計: 5+3 = **8 operation**（目標達成）

**invariant 仕様（I3〜I6）— model_checker.ts で検証済み:**

| ID  | Encoding    | Condition  | Requires   | 成立メカニズム                                                                    |
|-----|-------------|------------|------------|-----------------------------------------------------------------------------------|
| I3  | explicit    | E4=q3      | E5=q2      | O8 が E5=q2 を直接要求                                                            |
| I4  | explicit    | E1=q3      | E5=q2      | O2 が E5=q2 を直接要求（クロスチェーン直接参照）                                  |
| I5  | distributed | E2=q3      | E5=q2      | O4 が E4=q2 を要求 → O7 が E5=q2 を要求 → E5 は単調 → E2=q3 → E4=q2 → E5=q2    |
| I6  | distributed | E4=q3      | E3=q2      | O8 が E2=q2 を要求 → O3 が E3=q2 を要求 → E3 は単調 → E4=q3 → E2=q2 → E3=q2    |

計: 2+4 = **6 invariant**（目標達成）

> **検証結果（model_checker.ts）**: 到達可能状態 26、invariant 違反 0。
> 候補 JSON: `synthetic-world/ground_truth_v1_candidate.json`（実装時は `ground_truth.json` に統合する）
> 状態数が設計初期の 40 から 26 に減少しているのは、クロスチェーン precondition が到達可能空間を意図的に制約しているため。

**3つのクロスチェーン invariant のパターン比較:**

| Invariant | Precond 変更箇所 | パターン                    | Encoding     |
|-----------|-----------------|------------------------------|--------------|
| I4        | O2 に E5=q2     | Chain 1 terminus → Chain 2 root（直接）| explicit     |
| I5        | O4 に E4=q2     | Chain 1 terminus → Chain 2 intermediate（間接）| distributed  |
| I6        | O8 に E2=q2     | Chain 2 terminus → Chain 1 intermediate（間接、逆方向）| distributed  |

**naming_schemes.json 追記案:**

```json
// A-obfuscated に追加:
"entityNames": { ..., "E4": "Fen", "E5": "Osk" },
"stateNames": {
  ...,
  "E4::q1": "nim", "E4::q2": "pex", "E4::q3": "dor",
  "E5::q1": "nim", "E5::q2": "pex"
},
"operationNames": { ..., "O6": "advanceOsk1", "O7": "advanceFen1", "O8": "advanceFen2" }

// B-fictional に追加（命名例）:
"entityNames": { ..., "E4": "Caldris", "E5": "Vantrel" },
...
```

---

## 2. Task 数・配分（6→20）

### 配分方針

| 種別                  | 現行 | Phase 5 | 追加数 | 配分の考え方                                      |
|-----------------------|------|---------|--------|---------------------------------------------------|
| local                 | 2    | 7       | +5     | 5 entity に各1〜2本。新 E4/E5 に各2本、既存は1本追加|
| cross_cutting         | 2    | 6       | +4     | チェーン内 + クロスチェーン複合操作                |
| invariant_stressing   | 1    | 5       | +4     | 新 invariant 4本（I3〜I6）に各1本                  |
| delayed_dependency    | 1    | 2       | +1     | 緩やかに増加（実験後半向け）                       |

計: 6 + 14 = **20 task**（目標達成）

### 各種別の設計指針

**local（7本）**: 単一 entity・単一操作の追加。precondition なし〜1つ。invariant 抵触なし〜1つ。
- 既存: T-local-1(Vok), T-local-2(Vok)
- 追加案: T-local-3(Zef逆進), T-local-4(Tal追加), T-local-5(Fen新操作), T-local-6(Fen新操作), T-local-7(Osk追加)

**cross_cutting（6本）**: 複数 entity を同時に変化させる操作。
- 既存: T-crosscut-1(Zef+Tal), T-crosscut-2(Vok+Zef)
- 追加案: クロスチェーン結合操作（E4+E3同時進行）、Chain2 まとめて操作 等

**invariant_stressing（5本）**: visibleInstruction が precondition を隠し、invariant 違反を誘発しやすい表現。
- 既存: T-invariant-stress-1(fastTrackZef, I2)
- 追加案: I3 stressing (fastTrackFen), I4 stressing (クロスチェーン Vok jump), I5 stressing, I6 stressing

**delayed_dependency（2本）**: 後半世代で activates。
- 既存: T-delayed-1(resetZef, gen16)
- 追加案: Chain 2 を逆進させる resetFen 等

### Task 導入順序

heldout_tasks.json は配列順が実験順序を示す（＝後半ほど複雑な要求）。
推奨順序: local → cross_cutting → invariant_stressing → delayed_dependency。
クロスチェーン invariant が絡む task は後半に配置する（AI が Chain 2 の存在を把握した後）。

---

## 3. F1〜F8 教訓の再発リスク評価

| 発見  | 内容要約                                   | Phase 5 での再発リスク | 対策                                                        |
|-------|--------------------------------------------|------------------------|-------------------------------------------------------------|
| F1    | Haiku が I1 guard を実装しない             | **高（再発確実）**     | 6 invariant 化で再発機会が増える。H(G) テスト網羅が必須    |
| F2    | Budget degeneracy（B≥2K = Full）           | **解消見込み**         | 5-entity 世界は ~3000-4000 tokens 予測（O2/O4 precondition 追加でコード量も増加）。B=2K が Full でなくなり実効測定点が 3→4 に増える見込み|
| F3    | tests 除外でregression 蓄積               | 解消済み               | tests は always included。新 entity テストも同様に含める   |
| F5    | テスト記述が probe の答えを漏らす          | **中（要確認）**       | system1 mode で解消済み。新 visible test 追加時も同じルール維持|
| F6    | 複合 operation が schema で表現不可        | 解消済み               | effects: Effect[] 導入済み。継続して使用                    |
| F7    | operationTable + tests が B=1K で answer leak | 中（system1 で対処済み）| operationTable が 8 操作に拡大→ system2 での leakが増えるが system1 は影響なし|
| F8    | advanceZef2 の naming dependency（23%残存）| **低〜解消見込み**     | 世界拡大でリポジトリが大きくなり B=1K での rules.ts 可視率が変化する。Phase 5 後に再測定|

**特に注意が必要な新リスク:**

- **クロスチェーン invariant（I4/I5/I6）の見落とし**: I1/I2 と比べて「なぜ E5 が必要？」が直感的でない。AI がクロスチェーン precondition を省略する可能性が高い。→ H(G) の invariant_stressing テストを I4/I5/I6 に対して必ず設ける。
- **probe 生成スケール**: probe 数が 17→50-80 に増える。`answerProbesWithAnthropicAPI` の `max_tokens=4096` では出力が途中で切れるリスクがある。**バッチ分割が必須**（後述）。
- **budget 再校正が必要**: 現行の B=0/1K/2K/Full という 3 点測定から、B=0/1K/2K/4K/Full という 5 点測定に移行する可能性が高い（degeneracy 解消後）。

---

## 4. 手作業拡張 vs Generator 実装

### 結論: ハイブリッド方針（Generator は部分的にのみ）

**手作業で継続する部分（意味判断が必要なため）:**
- `ground_truth.json`: entity/operation/invariant の意味設計は人間が行う。20 要素程度なら管理可能
- `heldout_tasks.json` の `visibleInstruction` と `type` 設計: 「どう invaraint stressing にするか」は意図的な設計
- `naming_schemes.json` の語彙選択: obfuscated/fictional 各名前は一貫性が必要

**ツール化すべき部分（ボイラープレートで error-prone なもの）:**
- `taskSpecificTestCode` の雛形生成: groundTruthDelta（effects + preconditions）から
  基本的なテストケース（成功・失敗・副作用なし）を自動生成するスクリプト
- `validate_task_deltas.ts` の継続実行: 新 task 追加のたびに invariant 整合性チェック
- `model_checker.ts` の新 entity 対応: E4/E5 追加後に全到達可能状態を再検証

**Phase 5 での判断基準:**
- 20 task の手作業は許容範囲内。全 task を手書きで実装してみてから、
  ボイラープレートの繰り返しが 80% を超えるようであれば task generator を検討する。
- Phase 6（さらなる拡大）まで generator の本格実装は先送りする。

---

## 5. 既存ファイルへの影響範囲

### 変更が必要なファイル（Phase 5 実装時）

**synthetic-world/ 側（Ground Truth 層）:**

| ファイル                              | 変更内容                                              | 後方互換性 |
|---------------------------------------|-------------------------------------------------------|------------|
| `ground_truth.json`                   | E4/E5/O6-O8/D4-D5/I3-I6 を追加                       | 追加のみ。既存 task の groundTruthDelta は O1-O5/I1-I2 を前提とし変更不要 |
| `naming_schemes.json`                 | A-obfuscated / B-fictional に E4/E5/O6-O8 の名前を追記 | 追加のみ |
| `heldout_tasks.json`                  | 14 task を末尾に追加                                  | 追加のみ |

**repository/ 側（AI が継承する artifact 層）:**

| ファイル                              | 変更内容                                              | 注意点 |
|---------------------------------------|-------------------------------------------------------|--------|
| `src/world.ts`                        | `WorldState` に `fen: string; osk: string` を追加。`createInitialWorld()` も更新 | 既存コードの TypeScript 型チェックに影響（全 destructuring が要更新）|
| `src/fen/state.ts` (新規)             | FenState 型定義                                       | 新規ファイル |
| `src/fen/rules.ts` (新規)             | advanceFen1/advanceFen2 実装（I3/I6 guard 含む）       | 新規ファイル |
| `src/osk/state.ts` (新規)             | OskState 型定義                                       | 新規ファイル |
| `src/osk/rules.ts` (新規)             | advanceOsk1 実装                                      | 新規ファイル |
| `src/protocol_adapter.ts`             | operationTable に O6-O8 を追加。entityFieldTable に E4/E5 を追加 | 固定契約ファイル。エクスポート名の変更は禁止 |
| `tests/rules.visible.test.ts`         | 新 entity/operation の visible test を追加             | 新テストは probe_generator.ts の F5 チェックに自動反映される |

**harness/ 側（評価インフラ層）:**

| ファイル                              | 変更内容                                              | 注意点 |
|---------------------------------------|-------------------------------------------------------|--------|
| `synthetic-world/H_G.test.ts`         | I3〜I6 の micro-test を追加。E4/E5 の toAbstractSnapshot 対応 | H(G) は worker agent 非公開。必ず更新しないと新 invariant が評価されない |
| `harness/src/scoring.ts` 等           | 変更不要（test runner は動的に動く）                  | — |

**calibration/ 側:**

| ファイル                              | 変更内容                                              |
|---------------------------------------|-------------------------------------------------------|
| `src/probe-generator.ts`              | 変更不要（ground_truth.json が自動的に新 entity/operation/invariant を反映する）|
| `src/calibration-runner.ts`           | `max_tokens=4096` を probe 数に応じてバッチ分割する対応が必要（Phase 5 着手前に修正を推奨）|
| `src/budget-assembler.ts`             | 変更不要（ファイル分類ロジックは新ファイルに自動適用される）|

**oracle-patches 側:**

- 既存の oracle patches（stage0-oracle.json 用）は O1〜O5/E1〜E3 のみ対象なので **影響なし**。
- 新 task 用の oracle patches を 14 本追加する必要がある（oracle を使う実験で新 task を適用する場合）。

### 後方互換リスクのまとめ

1. **TypeScript コンパイルエラー**: `world.ts` に `fen`/`osk` を追加した時点で、E4/E5 を知らない旧実装は型エラーになる（`WorldState` の destructuring が不完全になる）。これは**意図的な regression 検出**として使える。
2. **H_G.test.ts の非更新**: I3〜I6 micro-test を追加しないと、worker agent が cross-chain invariant を省略しても検出されない。実装最優先。
3. **probe バッチング未対応**: calibration-runner.ts が max_tokens 超過で途中切れを起こすと、probe 測定結果が不正になる。Phase 5 作業開始前にバッチ対応を完了させること。

---

## 実装着手順序（推奨）

1. `calibration-runner.ts` の probe バッチング対応（前提条件）
2. `synthetic-world/schema.ts` の確認（`addEntities?` が GroundTruthDelta にあることを確認済み）
3. `ground_truth_v1_candidate.json` の内容を `ground_truth.json` に統合（O2/O4 precondition 修正 + E4/E5/O6-O8/D2-D8/I3-I6 追加）→ `model_checker.ts` で再検証（26 states OK が基準）
4. `naming_schemes.json` 更新
5. `repository/src/` に新ファイル追加 + `world.ts`/`protocol_adapter.ts` 更新
6. `tests/rules.visible.test.ts` に新テスト追加
7. `H_G.test.ts` に I3〜I6 micro-test 追加
8. `heldout_tasks.json` に 14 task 追加（validate_task_deltas.ts で都度検証）
9. calibration 再実行で budget degeneracy 解消確認 + 新 dose-response 測定
