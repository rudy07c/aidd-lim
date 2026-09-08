# Output Serialization Bottleneck（Stage 1C前の要対応事項）

**記録日**: 2026-09-08  
**状態**: Open / 未対処  
**適用期限**: Stage 1C着手前

## 発見

現在のrepository mutation protocolは、変更対象fileについて差分ではなく**完全なfile content**をmodelに再出力させる。したがって小さな変更であっても、大きなfileほどoutput token・serialization負荷が増える。

この仕様は、研究対象としているinheritance / observation bottleneckとは別に、実験装置自身が次のような独立の選択圧を作る可能性がある。

> 大きなfileは変更コストが高い → 小さなfile・局所的moduleへ分割されたartifactの方が変更しやすい

その結果、longitudinal experimentでmodularity・semantic locality・file-size分布の変化を観測した場合、それが有限contextへの適応なのか、full-file mutation output protocolへの適応なのかを分離できない可能性がある。

## 研究上の意味

これは全条件に共通する固定的な実装制約ではあるが、artifact構造が世代ごとに変化するため、その負荷はlineage間・generation間で一定ではない。したがって単純な共通ノイズではなく、trajectoryと相互作用し得る。

## Stage 1C前に必要な対応

Stage 1C開始前に、少なくとも次のいずれかを採用してこの圧力を統制または測定する。

- patch / edit operation型mutation protocolへ変更する
- full-file serialization burdenを明示的に計測し、独立要因として評価・統制する
- それ以外の方法で、output serialization costと研究対象のcontext pressureを識別可能にする

現時点では**発見の記録のみ**とし、mutation schema自体の変更には着手しない。
