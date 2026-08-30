# runs/

Stage 0以降の世代継承実験で生成されるログ出力先。

想定するログスキーマは `docs/experiment_plan_v1.6.md` の3.1節
「Raw trajectory ログスキーマ」を参照。

## ディレクトリ構造

```
runs/
  stage0/                         # Stage 0 の本番実験ログ
    stage0-mock-noop-001/
      lineage-0/
        generation_000/
          repository_before/
          repository_after/
          git_diff.patch
          agent_prompt.json
          agent_response.json
          visible_test_results.json
          hidden_test_results.json
          task_specific_test_result.json
          context_contents.json
          meta.json
        generation_001/
          ...
    stage0-mock-oracle-001/
    stage0-real-smoke-001/
    ...
  stage0.5/                       # Stage 0.5 の本番実験ログ（将来）
    ...
  _smoke/                         # 動作確認・テスト用の使い捨てログ
    ...                           # npx ts-node run.ts --config ... --smoke で出力
```

## 使い分け

- **本番ログ**（`stage0/` 等）: `npx ts-node run.ts --config config/stage0-*.json`
  - configの `"stage"` フィールドに従って自動的に対応するサブディレクトリへ出力する
- **動作確認ログ**（`_smoke/`）: `npx ts-node run.ts --config <config> --smoke`
  - overwrite protection の確認、config変更後の疎通テスト等で使う使い捨てログ

## ログ検証

```
npx ts-node verify-logs.ts --all
npx ts-node verify-logs.ts --experiment stage0-mock-noop-001 --runs-dir runs/stage0
```

大規模な実験ではこのディレクトリ自体を外部ストレージ（S3等）へ retention
してもよい。リポジトリにはコードと分析スクリプトのみを残す方針とする。
