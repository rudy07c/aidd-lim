# Stage 0.5 実行結果からの発見（Findings Log）

**このドキュメントの位置づけ**：`docs/findings/stage0_findings.md`と同じ形式・役割。
Stage 0.5（Measurement Calibration）の実装・実行から得られた解釈・気づきを永続的に記録する。
元ログ・コードへの参照は残すが、ログ自体は将来上書き・削除されうる前提とする。

各エントリには、元になったコード/ログへの参照、実行条件、何が起きたか、なぜ注目すべきか、
今後への示唆を記載する（stage0_findings.md と同じ形式）。

---

## F1: 命名方式によってF5漏洩率に大きな差がある（A=26%、B=0%）

**日付**：2026-09-05
**Phase**：Phase 1（probe-generator実装・F5静的チェック実行）
**元コード**：`calibration/src/probe-generator.ts`（`buildF5Checker()`）
**元データ**：`calibration/fixtures/probe-bank.json`（旧版、A/B両方含む46問）

### 実行条件

- probe-generator.tsを2命名方式（A-obfuscated、B-fictional）それぞれで実行
- F5チェック：visible testファイル（`synthetic-world/repository/tests/rules.visible.test.ts`）内で、
  operationの表示名とentityの表示名が5行以内で共起するかを静的解析

### 何が起きたか

```
Scheme: A-obfuscated → 23 probes generated
  F5 warning: 6 probe(s) may have answers leaked in visible tests:
    A-obfuscated-set-10  [set_selection]          derivedFrom: D1 (O2→E2)
    A-obfuscated-set-11  [set_selection]          derivedFrom: D2 (O3→E3)
    A-obfuscated-set-12  [set_selection]          derivedFrom: D3 (O4→E3)
    A-obfuscated-edge-13 [graph_edge_prediction]  derivedFrom: D1 (O2→E2)
    A-obfuscated-edge-14 [graph_edge_prediction]  derivedFrom: D2 (O3→E3)
    A-obfuscated-edge-15 [graph_edge_prediction]  derivedFrom: D3 (O4→E3)

Scheme: B-fictional → 23 probes generated
  F5 check: no leakage detected
```

A-obfuscated（Vok/Zef/Tal/nim/pex/dor等の難読化シンボル）はvisible testでも直接使われているため、
`advanceVok2`（O2の表示名）と`Zef`（E2の表示名）が同一test block内で共起し、F5チェックに引っかかった。
B-fictional（Kelvan/Ossuary/Brindle/latent/kindled/settled等の虚構語彙）はvisible testでは一切
使われておらず、共起は検出されなかった。

### なぜ注目すべきか

- dose-response curveの前提は「B=0（情報ゼロ）のベースラインから始まり、Bの増加とともに
  単調に得点が上がる」ことにある。F5が指摘する問題は、**visible testが常にcontextに含まれる
  設計（3.1節でStage 0から引き継いだルール）と、A-obfuscatedの命名がvisible testで直接
  出現することの組み合わせにより、B=0の時点でも答えが「常時見えている状態」になりうる**
  という点である。
- B-fictionalにはそもそも可視テストとの語彙の重なりが存在しないため、この問題が構造的に
  回避されている。言い換えると、F5漏洩は命名方式の選択で制御できる問題であり、B-fictional
  への一本化によって較正実験の前提条件（情報量の段階的制御）を守れる。
- 漏洩した6問は全て「dependency関連」（set_selection と graph_edge_prediction）であり、
  「preconditionが可視テスト内で直接テストされている」という性質を持つ。これは
  stage0_5_plan.md 1.2節（F5への言及）で予見されていた通りの結果である。

### 今後への示唆

- **命名方式はB-fictionalに確定する。** Phase 2以降のbudget-assemblerおよびcalibration-runner
  はB-fictionalのみで設計する。A-obfuscatedは`probe-bank.json`から除外し、probe-generatorの
  CLIもB-fictionalのみを出力するよう変更する（`docs/stage0_5_plan.md` 3.7節に反映済み）。
- 「visible testに含まれる語彙がF5漏洩を引き起こす」という観察は、将来Synthetic World
  generator化（Phase 5）の際の命名設計指針にもなる。visible testとsemantic probeで語彙が
  共有されないよう、命名スキームを独立して設計することが重要。
- B-fictionalでも、visible testの構造的な情報（どのoperationがどのentityを前提とするか
  という構造的パターン）は依然として読み取れる可能性がある。F5チェックは
  「表面的な語彙共起」を検出するheuristicに過ぎず、意味的な情報漏洩の完全な排除を
  保証するものではない。Phase 4で実際にB=0での正答率を測定し、真の漏洩を確認する。

---

## F2: リポジトリ全体が1791トークンしかなく、B≥2Kは全て同一内容になる（budget段階の実質的縮退）

**日付**：2026-09-05
**Phase**：Phase 2（budget-assembler実装・検証）
**元コード**：`calibration/src/budget-assembler.ts`（CLI実行結果）

### 実行条件

- リポジトリ：`synthetic-world/repository/`（7ファイル）
- 6段階のB値（0, 1K, 2K, 4K, 8K, Full）それぞれでcalibration/src/budget-assembler.tsを実行

### 何が起きたか

```
Repository: 7 files, Full=1791 tokens (~7164 chars)

B=0:    0/7 files, 0 tokens
B=1K:   4/7 files, 1000 tokens  (型定義full + protocol_adapter full + test 52%切り詰め)
B=2K:   7/7 files, 1791 tokens  （全ファイル全文）
B=4K:   7/7 files, 1791 tokens  （全ファイル全文 = B=2Kと同一）
B=8K:   7/7 files, 1791 tokens  （全ファイル全文 = B=2Kと同一）
B=Full: 7/7 files, 1791 tokens  （全ファイル全文 = B=2Kと同一）
```

B=2K以上（2K/4K/8K/Full）の4段階が完全に同一内容になった。6段階のbudgetのうち、実質的に
意味を持つ（情報量が異なる）のは **{0, 1K, 2K(≡Full)}** の3段階のみである。

### なぜ注目すべきか

- Phase 4でdose-response curveを描く際、B=2K〜Fullは全て同一点になり、実質的に
  **3点しかないカーブ**しか描けない。これでは「budgetに応じた滑らかな改善」
  （判定基準パターン4）と「B=0でも高得点（天井効果）」（パターン1）の区別が難しくなる。
- Stage 0.5の1.2節で予見していた通り、**現在の小規模worldでは規模そのものがbottleneckになっている**
  という最初の明確な証拠が得られた。
- B=1Kでtest fileが52%切り詰められることも注目すべき点である。切り詰められたvisible testは
  agentに不完全な安全網を見せることになる。real agent実行時には、このpartial testがどう
  影響するかを観察する価値がある。

### 今後への示唆

- **Phase 4のdose-response curveは実質3点分のデータしか持たない**。これは4.3節の判定基準を
  適用するには不十分な可能性が高く、Phase 5（規模拡大）へ進む蓋然性が高い。ただし、3点のうち
  B=0とB=Full/2K+の間に差があれば「測定器として機能している（budgetが影響する）」という
  定性的な判定自体は可能である。
- Phase 5の規模拡大目標（1.1節の目標規模：5 entity・8 operation）に達した場合、
  Fullトークン数は現在の1791から大幅に増加する（目標規模では5〜10倍程度と推定）。
  拡大後にPhase 2のbudget-assemblerを再実行し、6段階が再び意味を持つことを確認する。
- B値の刻み幅設計（6節の未決事項）について：現在の小規模worldでは {0, 500, 1K, Full} の
  4段階が実質的な最大分解能であり、B=2K以上の刻みは意味がない。拡大後のworld規模に
  合わせて刻みを再設計することを検討する。

---

## エントリの追加方法

新しい発見を追加する際は、上記のF1と同じ形式（日付・Phase・元コード/ログ・実行条件・
何が起きたか・なぜ注目すべきか・今後への示唆）に従う。
