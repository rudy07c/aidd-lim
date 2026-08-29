# runs/

Stage 0以降の世代継承実験で生成されるログ出力先。中身は `.gitignore` で
バージョン管理から除外している（世代数×条件数×試行数で容量が大きくなりうるため）。

想定するログスキーマは `docs/experiment_plan_v1.6.md` の3.1節
「Raw trajectory ログスキーマ」を参照。実行時は以下のような構造を想定：

```
runs/
  <experiment_id>/
    <lineage_id>/
      generation_000/
        repository_before/
        repository_after/
        git_diff.patch
        agent_prompt.json
        agent_response.json
        semantic_probe_results.json
        hidden_test_results.json
        context_contents.json
        meta.json          # context_budget, model, latency, token_usage, cost 等
      generation_001/
        ...
```

大規模な実験ではこのディレクトリ自体を外部ストレージ（S3等）へ retention
してもよい。リポジトリにはコードと分析スクリプトのみを残す方針とする。
