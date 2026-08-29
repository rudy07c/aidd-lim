# harness/

Stage 0（世代継承ループ本体）の実装先。未着手。

想定する責務（`docs/experiment_plan_v1.6.md` Stage 0 / 2.3節「世代の定義」参照）：

- fresh session/fresh agent instanceの起動（前世代の対話履歴・chain-of-thoughtは継承しない）
- `synthetic-world/repository/` を初期artifactとして各lineageへ配布
- held-out task（`synthetic-world/heldout_tasks.json` の `visibleInstruction` のみ）をworkerへ提示
- workerの変更結果を `synthetic-world/repository/tests/` (visible tests) と
  `synthetic-world/hidden_regression_tests/` (H(G)、非公開) で採点
- 採点後、repositoryのみを次世代へ渡す（agentの対話履歴は破棄）
- `runs/` へ `docs/experiment_plan_v1.6.md` 3.1節のログスキーマに従って記録

最初の目標は5〜10世代を安定して回し切ること（Stage 0のゲート条件）。
