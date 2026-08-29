# AIDD–ILM: Finite Context as a Transmission Bottleneck in AI-Driven Development

有限コンテキストという伝達ボトルネックが、AIによって反復的に継承・変更される
ソフトウェアartifactの構造にどう影響するかを、Iterated Learning Model (ILM) の
枠組みで検証する研究のリポジトリ。

## 現在のステータス

- 実験計画書：`docs/experiment_plan_v1.6.md`
- Synthetic World（測定装置の較正用の合成意味世界）：`synthetic-world/` — v0.3。型チェック・全17テストpass
- Stage 0 harness（世代継承ループ本体）：`harness/` — 未着手。次の作業対象

進め方や各Stageの判定基準は `docs/experiment_plan_v1.6.md` を参照。
Synthetic World構築時に見つかった設計上の発見（model checker導入の経緯、
GroundTruthDeltaの累積検証、semantic locality算出など）は
`docs/synthetic_world_notes.md` に記録している。

## ディレクトリ構成

```
docs/
  experiment_plan_v1.6.md      実験計画書本体（Stage 0〜6の設計、判定ゲート、統計計画）
  synthetic_world_notes.md     Synthetic World実装時の発見と計画書への反映候補

synthetic-world/                測定装置（合成意味世界 G、model checker、validator一式）
  schema.ts                     G / WorldProtocol / GroundTruthDelta の型定義
  ground_truth.json             最小構成の意味世界 G_0（3 entity, 5 transition, 2 invariant）
  model_checker.ts              G の到達可能な全状態でinvariantが成立するかをBFS検証
  validate_task_deltas.ts       各held-out taskのGroundTruthDeltaを単体検証
  validate_sequence.ts          task sequenceを累積的に適用しながら検証（相互作用バグの検出）
  semantic_locality.ts          表面的局所性と意味的局所性の乖離を機械的に算出
  demo_interaction_only_bug.ts  累積validator固有の価値を示す実証デモ
  demo_order_dependency.ts      task順序と矛盾検出世代の関係を示す補助デモ
  naming_schemes.json           命名方式A（難読化）/ B（虚構語彙）の束縛例
  semantic_probes.json          R^sem_B(S) 測定用のsemantic probe
  heldout_tasks.json            M_B(S) 測定用のheld-out modification task
  repository/                   Architecture A（entity-oriented）による G の実装例
    src/protocol_adapter.ts     WorldProtocol実装（固定公開境界）
  hidden_regression_tests/      H(G)。worker agentには非公開の評価用テスト

harness/                        Stage 0：世代継承ループの実装（未着手）

runs/                           実験ログ出力先（.gitignore対象、構造のみREADMEに記載予定）
```

## Synthetic World の動作確認

```bash
cd synthetic-world
npm install
npx tsc --noEmit                        # 型チェック
npx jest                                # visible tests + H(G) の実行
npx ts-node model_checker.ts            # G_0 の無矛盾性検証
npx ts-node validate_task_deltas.ts     # 各held-out taskの単体検証
npx ts-node validate_sequence.ts        # task sequenceの累積検証
npx ts-node semantic_locality.ts        # 表面的/意味的局所性の算出
npx ts-node demo_interaction_only_bug.ts
```

## 次にやること（Stage 0）

fresh AI session → repositoryを読む → held-out taskを実装 → visible tests + H(G) で採点 →
repositoryだけを次世代へ渡す、というループを5〜10世代回し、ハーネスが安定して動くかを確認する。
詳細は `docs/experiment_plan_v1.6.md` の「Stage 0：Harness Feasibility」を参照。
