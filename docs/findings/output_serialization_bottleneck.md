# Output Serialization Bottleneck（Stage 1C前の要対応事項）

**記録日**: 2026-09-08  
**状態**: Open / 未対処  
**適用期限**: Stage 1C着手前

## 発見

現在のrepository mutation protocolは、変更対象fileについて差分ではなく**完全なfile content**をmodelに再出力させる。したがって小さな変更であっても、大きなfileほどoutput token・serialization負荷が増える。

この仕様は、研究対象としているinheritance / observation bottleneckとは別に、実験装置自身が次のような独立の選択圧を作る可能性がある。

> 大きなfileは変更コストが高い → 小さなfile・局所的moduleへ分割されたartifactの方が変更しやすい

その結果、longitudinal experimentでmodularity・semantic locality・file-size分布の変化を観測した場合、それが有限contextへの適応なのか、full-file mutation output protocolへの適応なのかを分離できない可能性がある。

### P2で確認したMOI `appliedDiff`表現

P2実装レビュー時に、`harness/src/logging.ts` の `generateDiff()` は変更ファイルについて最小patch/hunkを生成しておらず、**変更前ファイル全文を `-`、変更後ファイル全文を `+` として並べる表現**であることを確認した。

そのためMOIでは、current repositoryに変更後artifact全文が存在することに加え、直前世代の`ObservableInteractionRecord.appliedDiff`にも変更後ファイル全文（および変更前全文）が再露出する。さらにMaximal Observable Inheritanceの定義に従いobservable assistant responseも`artifact-redundant`として保持するため、artifact情報の反復/salienceはMOI固有の測定対象・交絡候補になり得る。

現時点ではharness側で意味的deduplicationを行わない。観測可能だった情報は保持し`artifact-redundant`等のsource tagで識別可能にして、後続ablationで含める/除外する判断を可能にする。`generateDiff()`のpatch化はOutput Serialization Bottleneck全体の扱いと合わせてStage 1C前に検討する。

### P4で確認したworking-set JSON escape圧力

P4の`B_work`会計をmodel-visible artifact evidenceへ揃える過程で、`path`・`line range`・`content`を一つの`JSON.stringify()`へ入れる初期実装では、source content内の改行・quote・backslashがJSON escapeされ、その文字構成に応じてtoken負荷が増えることを確認した。

これは単なる固定framing overheadではない。artifact自身の文字構成によって追加token costが変わるため、longitudinal runでは例えばquote/backslash/newlineを多く含む表現が`B_work`上で不利になるという、研究対象とは無関係な人工的selection pressureを生み得る。full-file mutationが「file sizeに依存するserialization pressure」を作る問題と同根であり、**serialization形式そのものがartifact traitに依存したコスト関数になる**という問題である。

P4ではこの圧力をworking-set側へ持ち込まないため、`serializeArtifactUnitForWorkingSet()`を次の形式へ変更した。

```text
{"path":"src/example.ts","lines":[10,25]}
<raw content>
```

metadataだけをcompact JSONで構造化し、contentは改行の後へrawのまま連結する。`B_work`はこの**実際にmodelへ提示する文字列そのもの**をcanonical tokenizerで数える。したがって、会計文字列とmodel-visible文字列を一致させつつ、content内部の文字をJSON表現へ変換することによる追加圧力を除く。

この修正はP4 working-set accounting側の局所的対処であり、既存のfull-file mutation protocolやMOI `appliedDiff`の全文再掲問題を解消するものではない。それらは引き続きStage 1C前のOpen issueとする。

## 研究上の意味

これは全条件に共通する固定的な実装制約ではあるが、artifact構造が世代ごとに変化するため、その負荷はlineage間・generation間で一定ではない。したがって単純な共通ノイズではなく、trajectoryと相互作用し得る。

より一般には、serialization protocolがartifactの構造・サイズ・文字構成に応じて異なるcostを課す場合、そのprotocol自体がselection environmentの一部になる。研究対象のcontext bottleneckと区別するには、model-visible representationとそのtoken accountingを一致させ、不要な表現変換によるtrait-dependent costを避ける必要がある。

## Stage 1C前に必要な対応

Stage 1C開始前に、少なくとも次のいずれかを採用してこの圧力を統制または測定する。

- patch / edit operation型mutation protocolへ変更する
- full-file serialization burdenを明示的に計測し、独立要因として評価・統制する
- それ以外の方法で、output serialization costと研究対象のcontext pressureを識別可能にする

P4 working-setのJSON escape問題についてはraw-content serializationへ変更済みだが、mutation schema側の問題は未対処である。現時点では**mutation schema自体の変更には着手しない**。
