# Representative Live-Run Evidence

`runs/_smoke/` は試行錯誤中の一時生成物であり、リポジトリへ一括コミットしない。

今後、研究上引用する価値がある live run が得られた場合は、その run を再構成・検証するために必要な代表ファイルだけをこのディレクトリ配下へ明示的に複製して保存する。

原則として保存候補は次のとおり。

- `retrieved_episode.json`
- `meta.json`
- 必要に応じて evaluation / summary の代表ファイル

保存時は、元の `runs/_smoke/<experiment>/...` の場所、実行日、git SHA、condition、model、task、保存理由を同じサブディレクトリのREADMEまたはfindings本文に記録する。

巨大なrepository snapshot、重複する全step生成物、試行錯誤中の全runは保存しない。`runs/_smoke/` は引き続きgit管理外とし、研究記録としてpromoteすると明示的に判断した最小限のevidenceのみをここへ残す。
