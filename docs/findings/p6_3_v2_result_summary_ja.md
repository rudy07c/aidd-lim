# P6-3 v2 結果要約 — EL の有限コンテキスト量をどう解釈するか

## 1. この検証の目的

P6-3 の目的は、Stage 1A 本実験に入る前に、EL（静的・有限コンテキスト）条件で使う `B_expose` を校正することだった。

EL では AI に repository 全体を見せるのではなく、あらかじめ一定量だけ露出する。したがって本実験で使う budget は、少なすぎて何もできない条件でも、Full Context と実質同じ条件でもいけない。

そのため P6-3 では、以下の6 armを比較した。

| Arm | Nominal budget |
|---|---:|
| B0 | 0 |
| B1 | 505 |
| B2 | 1011 |
| B3 | 2023 |
| B4 | 3034 |
| AF | 4046 / full-context anchor |

選定は M と Rsem の conjunctive co-gate で行う。

- **M**: software artifact を正しく変更・継承できたか
- **Rsem**: repository の意味・構造をどの程度再構成できたか

内部 budget `B1`〜`B4` が `B_expose` 候補になるには、M と Rsem の両方で `B0` より十分高く、かつ `AF` より十分低い必要がある。

凍結済みのmarginは以下。

- `Delta_M = 1/11`
- `Delta_R = 1/12`

複数 arm が両方を通過した場合のみ、その中で最小 budget を `B_expose` として選ぶ。

## 2. Live collection の結果

P6-3 v2 paid/live run は **864 / 864 logical cells** を完走した。

- terminal status: `completed`
- valid scientific observations: `864`
- committed attempts: `866`
- committed infrastructure-invalid attempts: `2`
- interrupted provider-visible attempt: `1`
- exhausted logical cells: `0`
- unresolved audit flag: `none`
- stored estimated cost: approximately `$4.27`

PC reboot による sequence 199 / attempt 1 の中断は、完了したか不明であったため `infrastructure-invalid` と手動裁定し、同一logical cellを attempt 2 で再試行した。

したがって、**collection 自体は正常に完了し、B_expose 選定を実施可能な状態まで到達した**。

## 3. 実測結果

| Arm | Budget | M | Rsem |
|---|---:|---:|---:|
| B0 | 0 | 0 / 132 = **0.0000** | 80 / 144 = **0.5556** |
| B1 | 505 | 0 / 132 = **0.0000** | 72 / 144 = **0.5000** |
| B2 | 1011 | 0 / 132 = **0.0000** | 74 / 144 = **0.5139** |
| B3 | 2023 | 125 / 132 = **0.9470** | 113 / 144 = **0.7847** |
| B4 | 3034 | 123 / 132 = **0.9318** | 142 / 144 = **0.9861** |
| AF | 4046 | 124 / 132 = **0.9394** | 132 / 144 = **0.9167** |

M は 11 tasks × 12 repeats = 132 outcomes/arm、Rsem は 12 probes × 12 repeats = 144 judgments/arm である。

## 4. B_expose の選定結果

結論は以下。

```text
qualifyingInteriorArms = []
selectedBExpose = null
selectionStatus = needs-design-audit
reason = NO_CONJUNCTIVE_INTERIOR_BUDGET
```

つまり、**今回のgridには M と Rsem の両方で「少なすぎず、多すぎない」内部 budget が存在しなかった**。

### B1 / B2

M がどちらも `0 / 132` で、B0 から改善していない。

したがって有限コンテキスト条件としては情報量が少なすぎる。

### B3

Rsem は `113 / 144 = 0.7847` で、B0 と AF の間に十分なmarginを持つ。Rsem 単独なら明確なinterior pointである。

しかし M は `125 / 132 = 0.9470` で、AF の `124 / 132 = 0.9394` と同等以上の点推定になった。

そのため、Mについては「AFから十分離れた有限コンテキスト条件」という選定基準を満たさない。

### B4

MもRsemもAF近傍、あるいはAFを点推定で上回っており、interior conditionではない。

## 5. この結果は何を意味するか

最も重要なのは、今回の結果を「有限コンテキストが良い／悪い」と解釈しないことである。

P6-3 は Stage 1A のconfirmatory experimentではなく、**本実験で使うEL条件を定義するためのcalibration**である。

今回分かったのは、次のこと。

> 現在のbudget gridでは、MとRsemの両方にとって非退化な中間条件を作れなかった。

特に M のdose-responseは特徴的だった。

```text
B0    B1    B2      B3      B4      AF
0  -> 0  -> 0  ->  0.947 -> 0.932 -> 0.939
```

1011 tokens までは完全にfloorで、2023 tokensでは既にほぼAF相当だった。

したがって、少なくとも今回のgridでは、artifact変更能力 M は「context量が増えるほど少しずつ改善する」という滑らかなdose-responseを示さず、**B2とB3の間で急峻に立ち上がるように見える**。

ただし、これは現時点では記述的観察にとどまる。

B2=1011 と B3=2023 の間を測定していないため、本当に閾値的な変化なのか、未観測区間で滑らかに上昇しているのかは区別できない。

## 6. M と Rsem が同じように動いていない

今回、B3は

- Rsemでは適切なinterior point
- Mでは既にAF相当

だった。

これは、repositoryの意味・構造を再構成できることと、software artifactを実際に正しく変更・継承できることが、context量に対して同じdose-responseを持たない可能性を示している。

この点は今回 M と Rsem を別々のendpointとして持たせた意義そのものでもある。

どちらか一方だけで `B_expose` を決めていた場合、今回とは異なる結論になっていた。

## 7. 研究全体との関係

今回の結果から、以下を主張してはいけない。

- finite context が full context より優れている
- full context が finite context より優れている
- context bottleneck が artifact evolution を改善する
- ILM的な世代伝達効果が確認された

これらはまだ Stage 1A 以降で検証する対象である。

P6-3 v2 が示したのは、その前段階として、**ELという有限コンテキスト条件自体を妥当に構成するためには、現在のgridを再設計する必要がある**ということ。

## 8. 次に考えるべきこと

P6-3 は `B_expose` を選べなかったため、現時点では `needs-design-audit` とする。

次の自然な検討対象は、B2=1011 と B3=2023 の間である。

ただし、今回の結果を見た後で都合のよいbudgetを選ぶのではなく、次のcalibrationでは先に

1. 新しいcandidate grid
2. 反復数
3. M/Rsemの選定ルール
4. stop / audit条件
5. 次回結果と今回結果の扱い

を固定してから再実行する必要がある。

## 9. 短い要約

> P6-3 v2 は、EL条件で使う適切な有限コンテキスト量 `B_expose` を決めるためのcalibrationだった。864-cell live run自体は正常完了したが、B1/B2ではMが完全にfloor、B3ではMが既にAF相当まで上昇していたため、MとRsemの両方で非退化な中間点となるbudgetを選べなかった。したがって `B_expose` は未選定で、P6-3は `needs-design-audit` となる。今回の結果は finite context 仮説の否定ではなく、現在のbudget gridではartifact変更能力の立ち上がりを十分に解像できておらず、特にB2〜B3間を再校正する必要があることを示す。

## Provenance

- raw evidence: `docs/findings/evidence/p6-3-v2-live-calibration/state.json`
- raw evidence SHA-256: `e5579674e5fa83c6b68b8f73b9ce67897f7de6cc5f24486f81b57f822ca03069`
- live source checkout: `62110faebc0fa748effa90cb0f44f7c05f479c10`
- raw evidence preservation commit: `b8a80a7a1b236eb9a734f76c4e5784232a039be8`
- raw evidence merge commit: `c999ddbe9cdc0b6ce9d7b7298f6ed31049834560`
- offline selection workflow run: `36425009382`
- workflow artifact: `10970497640`

This summary records the calibration result only. P6-3 remains calibration-only and `confirmatoryStage1AEligible=false`.
