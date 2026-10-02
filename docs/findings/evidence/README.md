# Representative Live-Run Evidence

`runs/_smoke/` は試行錯誤中の一時生成物であり、リポジトリへ一括コミットしない。

今後、研究上引用する価値がある live run が得られた場合は、その run を再構成・検証するために必要な代表ファイルだけをこのディレクトリ配下へ明示的に複製して保存する。

原則として保存候補は次のとおり。

- `retrieved_episode.json`
- `meta.json`
- 必要に応じて evaluation / summary の代表ファイル

保存時は、元の `runs/_smoke/<experiment>/...` の場所、実行日、git SHA、condition、model、task、保存理由を同じサブディレクトリのREADMEまたはfindings本文に記録する。

巨大なrepository snapshot、重複する全step生成物、試行錯誤中の全runは保存しない。`runs/_smoke/` は引き続きgit管理外とし、研究記録としてpromoteすると明示的に判断した最小限のevidenceのみをここへ残す。


## 完全診断アーカイブの例外

通常の live-run evidence は引き続き、研究上引用するために必要な代表ファイルのみを保存する。

ただし、fail-close によって停止した実験について、停止状態そのものの provenance・attempt 履歴・human adjudication・controller state を一体として監査可能にする必要がある場合は、明示的な **diagnostic evidence promotion** として完全な診断 payload を保存してよい。

その場合は以下を必須とする。

- 元の `runs/` は git 管理外のままとする
- 専用サブディレクトリに保存する
- README で source run、git SHA、停止状態、scientific status、payload boundary を記録する
- sanitization がある場合は内容と範囲を記録する
- pre-sanitization / repository-copy の checksum provenance を保存する
- 対応する findings 文書からarchiveを明示的に参照する

これは通常の「代表evidenceのみ」の原則を置き換えるものではなく、
監査可能性のために完全保存が必要な diagnostic stop に限定した例外である。
