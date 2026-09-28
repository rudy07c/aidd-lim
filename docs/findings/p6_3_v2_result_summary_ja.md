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

したがって、事前に定めた M の選定guard上は内部budget候補にならない。

### B3

Rsem は `113 / 144 = 0.7847` で、B0 と AF の間に十分なmarginを持つ。Rsem 単独なら明確なinterior pointである。

M の点推定は `125 / 132 = 0.9470`、AF は `124 / 132 = 0.9394` で、差はわずか1 outcomeである。したがって、この1件差を根拠に「B3の方がAFより性能が高い」と解釈してはいけない。

P6-3 のselection ruleが要求しているのは「B3がAFより優れているか」ではなく、**AFから `Delta_M` 以上離れた明確な内部点であるか**である。B3はその条件を満たさなかった。

したがって、今回の結果から安全に言えるのは、**B3のMはAF近傍であり、今回のcalibrationではAFから十分離れた有限コンテキスト条件として扱えなかった**ということまでである。B3とAFの形式的な統計的同等性や優劣を、このP6-3 analysis自体は主張していない。

### B4

MもRsemもAF近傍、あるいは点推定でAFを上回っており、事前のinterior conditionを満たさない。

## 5. この結果は何を意味するか

最も重要なのは、今回の結果を「有限コンテキストが良い／悪い」と解釈しないことである。

P6-3 は Stage 1A のconfirmatory experimentではなく、**本実験で使うEL条件を定義するためのcalibration**である。

今回分かったのは、次のこと。

> 現在のbudget gridでは、MとRsemの両方にとって非退化な中間条件を作れなかった。

aggregate M のdose-responseだけを見ると、次のようになる。

```text
B0    B1    B2      B3      B4      AF
0  -> 0  -> 0  ->  0.947 -> 0.932 -> 0.939
```

1011 tokens まではaggregate Mがfloorで、2023 tokensではAF近傍まで上昇した。

したがって、少なくとも今回のgridでは、artifact変更能力 M は「context量が増えるほど少しずつ改善する」という滑らかなdose-responseを示さず、**B2とB3の間で急峻に立ち上がるように見える**。

ただし、B2=1011 と B3=2023 の間を直接測定していないため、このaggregate結果だけなら、本当に閾値的な変化なのか、未観測区間で滑らかに上昇しているのかはまだ区別できない。

## 6. aggregate M の内訳を見ると、単純な「コード品質の漸進改善」では説明しにくい

aggregate M は visible / hidden / task-specific / protocol のすべてを含む最終合否である。その内訳を診断的に分解すると、次のパターンが観察された。

| Arm | visible合格 | hidden合格 | task-specific合格 |
|---|---:|---:|---:|
| B0 | 78 / 132 | 2 / 132 | 0 / 132 |
| B1 | **131 / 132** | 1 / 131 | 0 / 131 |
| B2 | 77 / 125 | 2 / 125 | 0 / 125 |
| B3 | 125 / 131 | **127 / 131** | 130 / 131 |

この分解から重要なのは、**B1の時点ですでにvisible testはほぼ飽和しているのに、hidden / task-specific correctnessはほぼゼロのまま**だったことである。

したがって、少なくとも観察された範囲では、

> contextが増えるにつれてコード全体の品質が少しずつ改善し、その延長上でhidden testも徐々に通るようになった

という単純なstoryとは整合しにくい。

むしろ、表面的に妥当なコードを書く能力は比較的小さいbudgetでも成立する一方、**隠れたinvariantや本題の仕様を満たすために必要な情報は別の境界で初めて利用可能になる**、という構造の方が今回の観察には整合的である。

特にB2→B3では、aggregate Mだけでなくhidden / task-specific側がほぼ0から高率へ切り替わっている。このため、「gridが粗いため滑らかな曲線が階段状に見えているだけ」という仮説は依然として可能ではあるものの、**token量だけの連続的なdose-responseではなく、selectorがあるrank境界で特定の情報unitを含むかどうかが主要因である可能性**も優先して検討する必要がある。

ただし、ここから「特定の1 unitが原因だった」と確定することはまだできない。B2とB3では複数unitが同時に追加されている可能性があり、context量・unit構成・rank境界が共変しているためである。

## 7. M と Rsem が同じように動いていない

今回、B3は

- Rsemでは適切なinterior point
- MではAF近傍

だった。

これは、repositoryの意味・構造を再構成できることと、software artifactを実際に正しく変更・継承できることが、context量に対して同じdose-responseを持たない可能性を示している。

この点は今回 M と Rsem を別々のendpointとして持たせた意義そのものでもある。

どちらか一方だけで `B_expose` を決めていた場合、今回とは異なる結論になっていた。

## 8. 研究全体との関係

今回の結果から、以下を主張してはいけない。

- finite context が full context より優れている
- full context が finite context より優れている
- context bottleneck が artifact evolution を改善する
- ILM的な世代伝達効果が確認された
- B3がAFより優れている、または統計的に同等である
- B2→B3の変化が特定の1つの情報unitによって因果的に生じた

これらは今回のcalibration resultの射程外である。

P6-3 v2 が示したのは、その前段階として、**ELという有限コンテキスト条件自体を妥当に構成するためには、現在のgridとselector exposureの境界を再監査する必要がある**ということ。

## 9. 次のdesign auditで最初に見るべきもの

次の作業は、いきなりB2=1011〜B3=2023の間を細かいtoken幅で再実験することではない。

まず、凍結済みselectorのrankingとsynthetic repository fixtureを突き合わせ、**B2とB3で実際に何の情報が追加されたのか**を診断する方が情報量が多い。

優先順序は次の通り。

1. frozen selector のunit rankingを再構成する
2. B1 / B2 / B3それぞれのexact exposure setを列挙する
3. 特に `B3 \ B2` の追加unitを、rank・file・token span・内容カテゴリで可視化する
4. hidden / task-specific correctnessの立ち上がりと、追加unitに含まれるrepository上のinvariant手掛かりとの対応を**diagnostic-only**に調べる
5. その結果を踏まえて、新しいcandidate gridまたはrank境界の設計原則を事前に固定する
6. 反復数、M/Rsem選定rule、stop/audit条件、旧データとの扱いを再度predeclareしてから次のcalibrationを行う

ここでは重要な境界がある。

**「どのunitがB2→B3で追加され、hidden correctnessの急変と対応しているか」を診断すること**は有益である。一方、今回のhidden outcomeを見た後で、既知のhidden invariantを含む特定unitが入るbudgetをそのまま `B_expose` に選ぶことはpost-hoc tuningになる。

したがって、content-level auditは次回設計の理解に使うが、次回の選定基準自体は再実験前に固定する必要がある。

## 10. 現時点での最も妥当な読み方

今回の結果を最も単純化すると、次のように読める。

> 小さいEL budgetでも、表面的にもっともらしいコードを書くこと自体は可能だった。しかし、本来守るべき隠れた仕様・invariantを満たす能力は同じようには改善せず、B2からB3の間で急激に立ち上がった。したがって、有限コンテキストの効果を単なるtoken総量だけで捉えるのではなく、selectorによって「どの情報unitがいつ利用可能になるか」というcontext構成の問題としても調べる必要がある。

これは、有限コンテキスト研究において「量」だけでなく**伝達される情報の構造**を見る必要があることを示唆する。ただし、この解釈は次のdesign auditで検証すべき仮説であり、今回だけで因果的に確定した結論ではない。

## 11. 短い要約

> P6-3 v2 は、EL条件で使う適切な有限コンテキスト量 `B_expose` を決めるためのcalibrationだった。864-cell live run自体は正常完了したが、B1/B2ではaggregate Mがfloor、B3ではMがAF近傍まで上昇していたため、MとRsemの両方で非退化な中間点となるbudgetを選べなかった。したがって `B_expose` は未選定で、P6-3は `needs-design-audit` となる。さらにsuite-levelに分解すると、B1ではvisible correctnessがほぼ飽和しているのにhidden/task-specific correctnessはほぼゼロで、B3で初めて急激に立ち上がっていた。このため次のauditではtoken量を細かく刻む前に、B2→B3でselectorが追加する情報unitを特定し、context量ではなくcontext構成の境界が急変を生んでいる可能性を調べるべきである。

## Provenance

- raw evidence: `docs/findings/evidence/p6-3-v2-live-calibration/state.json`
- raw evidence SHA-256: `e5579674e5fa83c6b68b8f73b9ce67897f7de6cc5f24486f81b57f822ca03069`
- live source checkout: `62110faebc0fa748effa90cb0f44f7c05f479c10`
- raw evidence preservation commit: `b8a80a7a1b236eb9a734f76c4e5784232a039be8`
- raw evidence merge commit: `c999ddbe9cdc0b6ce9d7b7298f6ed31049834560`
- offline selection workflow run: `36425009382`
- workflow artifact: `10970497640`

This summary records the calibration result only. P6-3 remains calibration-only and `confirmatoryStage1AEligible=false`.
