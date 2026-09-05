# Stage 0.5 実行結果からの発見（Findings Log）

**このドキュメントの位置づけ**：`docs/findings/stage0_findings.md`と同じ形式・役割。
Stage 0.5（Measurement Calibration）の実装・実行から得られた解釈・気づきを永続的に記録する。
元ログ・コードへの参照は残すが、ログ自体は将来上書き・削除されうる前提とする。

各エントリには、元になったコード/ログへの参照、実行条件、何が起きたか、なぜ注目すべきか、
今後への示唆を記載する（stage0_findings.md と同じ形式）。

---

## F1: 命名方式の選択誤りによる語彙断絶と、A-obfuscatedへの確定（改訂版）

**日付**：2026-09-05（初版）／2026-09-05（改訂）
**Phase**：Phase 1（probe-generator実装・F5静的チェック実行）→ Phase 4（実API実行で語彙断絶を発見）
**元コード**：`calibration/src/probe-generator.ts`（`buildF5Checker()`）
**元データ**：`calibration/fixtures/probe-bank.json`（現行版：A-obfuscated 17問）

### 初版の観察（2026-09-05 Phase 1時点）

```
Scheme: A-obfuscated → 23 probes generated
  F5 warning: 6 probe(s) may have answers leaked in visible tests
    [set_selection×3, graph_edge_prediction×3]

Scheme: B-fictional → 23 probes generated
  F5 check: no leakage detected
```

A-obfuscatedは可視テストとの語彙共起でF5判定6件（26%）。
B-fictionalは語彙共起ゼロで「F5漏洩なし」と判定された。

### 初版の結論（誤り）

~~命名方式はB-fictionalに確定する。~~ ← **この判断は誤りであった。**

### 改訂理由（Phase 4で発見）

Phase 4（実API実行、`--backend anthropic`）の fail-fast チェックで、
B=Full でも system1 accuracy ≈ 0% という異常が観測された。
デバッグの結果、モデルは以下のように回答していた：

```
"B-fictional-mc-1": "Cannot determine - Kelvan not defined in repository"
"B-fictional-mc-2": "Cannot determine - Kelvan not defined in repository"
"B-fictional-mc-3": "Cannot determine - Ossuary not defined in repository"
```

**根本原因：** probe-generator.tsは `ground_truth.json` + `naming_schemes.json` だけを参照し、
repositoryのTypeScriptファイルを一切読まない。そのため：

- B-fictional probeは「Kelvan/Ossuary/Brindle/kindleKelvan…」という語彙で生成される
- repositoryコード（`synthetic-world/repository/`）は A-obfuscated 名（Vok/Zef/Tal/advanceVok1…）で実装されている
- B-fictional名はrepositoryのどのファイルにも出現しない → モデルはコードを読んでもprobeに答えられない

**F5チェックが「機能している条件」が成立していなかった：**
B-fictionalでF5漏洩が検出されなかった理由は「probeの答えがvisible testに隠れていないから」ではなく、
「B-fictional語彙とvisible test語彙が完全に別物であるため、F5チェックの前提（同一語彙の共起を見る）
自体が成立していなかったから」である。
B-fictionalはそもそもrepositoryとも可視テストとも語彙が完全に断絶していた。

### 改訂後の正しい結論

- **命名方式はA-obfuscatedに確定し直す。**
  repositoryコードがA-obfuscated名（Vok/Zef/Tal/nim/pex/dor/advanceVok1…）で実装されているため、
  probeも同一スキームを使う必要がある。
- **F5漏洩6問（set_selection×3 + graph_edge_prediction×3）はprobe-bankから除外。**
  残り17問で運用する（multiple_choice×5、boolean×4、state_transition_prediction×8）。
- F5漏洩によるB=0のフロア非ゼロは「dose-responseの絶対値」を下げるが、
  「budgetが増えると得点が上がるか（勾配の有無）」の測定は妨げない。
- 命名スキーム不一致の再発防止として、`calibration-runner.ts` の実行開始時に
  probe-bank の entity/operation 名がrepositoryに出現するか（≥50%）を自動チェックする
  (`checkNamingSchemeAlignment()`)。A-obfuscated: 8/8 (100%)、B-fictional: 0/8 (0%)。

### 今後への示唆

- 「visible testに含まれる語彙がF5漏洩を引き起こす」という観察自体は正しい。
  ただしF5を回避するために語彙を変えると、repositoryとの断絶が生じる。
  真の解決策は「repositoryの実装名をF5に干渉しない別の名前にする」か
  「F5漏洩をB=0のフロアとして許容する」かのどちらかである。
  現段階ではF5漏洩6問を除外して17問とする後者を採用。
- Phase 5の規模拡大後も、probe-generatorはrepositoryコードを直接読まない設計のまま維持する。
  その代わり、repositoryに実装する際に「naming_schemes.jsonのA-obfuscatedスキームと語彙を一致させる」
  という運用ルールを守り、`checkNamingSchemeAlignment()` で機械的に検証する。

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

## F3: runScoring() のjest起動コストにより1 budget × 6 tasks ≈ 70秒かかる

**日付**：2026-09-05
**Phase**：Phase 3（mock-noop/mock-oracle 全budget実行）
**元コード**：`calibration/src/calibration-runner.ts`（`runScoringForTask()`）

### 実行条件

- backend=mock-oracle, 6 budget (0/1K/2K/4K/8K/Full) × 6 tasks
- 各 task に対して `runScoring()` を呼び出す（harness/src/scoring.ts）
- `runScoring()` は内部でjestを3回起動（visible test / hidden test / task-specific test）

### 何が起きたか

```
1 budget × 6 tasks ≈ 66〜70秒
6 budget × 6 tasks ≈ 7分（mock-oracle全体）
```

jestプロセス起動コスト（node起動+tsconfig解析+モジュールロード）が
タスクごとに3回×6タスク=18回発生する。実際の計算時間はほぼゼロだが、
オーバーヘッドが支配的になる。

### なぜ注目すべきか

- Phase 4（real API較正）では、1 API呼び出し ≈ 数秒〜十数秒の推論時間が加わるため、
  6 budget × 6 tasks × 1 gen で **7分+API待機** ≈ 10〜20分以上になる見込み。
- 複数generationを実施する場合（gen=3など）、総実行時間は30〜60分規模になりうる。
- **単一実験としては許容範囲**だが、Phase 5（規模拡大）後は task数増加とともに
  線形にスケールするため、jest起動を1タスクあたり1回にまとめる等の最適化が将来必要になる可能性がある。

### 今後への示唆

- Phase 4では gen=1（1回のAPI呼び出しのみ）でまず動作確認を行う。
  実行時間の長さは既知であるため、タイムアウト設定（現状120秒）には余裕がある。
- 将来的には `runScoring()` を可視・隠し・task-specific の3テストを1jestプロセスで
  まとめて実行するよう書き換えることで、起動コストを1/3に削減できる。
  ただしPhase 4の実験結果が出るまでは最適化を行わない（過早最適化の回避）。

---

## F4: B=0 でのSystem1フロアが88%（15/17）と高く、mc/stp型プローブはbudget感度ゼロ

**日付**：2026-09-05
**Phase**：Phase 4（fail-fastチェック → A-obfuscated再実行）
**元データ**：`calibration/fixtures/probe-bank.json`（A-obfuscated 17問）
**元コード**：`calibration/src/calibration-runner.ts`（`runSystem1()`、`answerProbesWithAnthropicAPI()`）
**実行条件**：backend=anthropic, model=claude-haiku-4-5-20251001, budgets=[0, full]

### 実行結果

```
B=0:    15/17 (88.2%)  — mc: 5/5 (100%), bool: 2/4 (50%), stp: 8/8 (100%)
B=Full: 17/17 (100.0%) — mc: 5/5 (100%), bool: 4/4 (100%), stp: 8/8 (100%)
```

B=0でもmc・stpは満点。budgetが増加して感度を示したのはbooleanのみ（50% → 100%）。

### 根本原因：A-obfuscated命名慣習の透明性

**multiple_choice（mc×5）：コードなしで回答可能**

mc probeの設問は「Vok を次の状態 'pex' へ遷移させる operation はどれか？」という形式で、
ターゲット（Vok）と遷移先（pex）を明示する。選択肢は `advanceVok1 / advanceVok2 / advanceZef1 / advanceZef2 / advanceTal1` というように、operation名に entity名と序数が直接エンコードされている。

モデルは「advanceVok = Vokを進める操作」「1 = 最初の遷移」という命名慣習から、
repositoryコードを一切読まずに正答を導出できる。

**state_transition_prediction（stp×8）：operation名が答えを直接エンコード**

stpの設問は「advanceVok1 を実行すると、Vok の状態はどうなるか？」という形式で、
operation名が設問中に明示される。`advanceVok1` = "Vokを前進させる1番目の操作" という
命名から、次の状態を推定できる。`nim → pex → dor` という順序も設問中の状態名から
順序の自然な推定が可能（操作1=最初の遷移）。

さらにstp-18は「Zef が 'nim'（preconditionを満たさない）…advanceVok2 を実行すると？」という設問で、
precondition未充足という情報を設問中に明示しているため、正答 `operation fails` もコードなしで分かる。

**boolean（bool×4）：不変条件はコードを読まなければわからない**

bool probeは「Vok が 'dor' で、Tal が 'nim' である状態は invariantに違反するか？」という形式。
不変条件（例：Vok=dor → Tal=pex でなければならない）は命名慣習から推定できず、
repositoryコード（`rules.ts` 等）を読んで初めて確認できる。
B=0では部分正解（2/4）、B=Full では全問正解（4/4）となり、唯一budget感度を持つプローブ型。

### なぜ注目すべきか

- **System1全体の感度がboolean型4問に依存している**。17問中4問（24%）のみがbudget感度を持ち、
  B=0→Full での全体向上幅は 2/17 ≠ ≈ 12%pt に過ぎない（88% → 100%）。
- mc/stp 13問はB=0でも100%であり、これらはrepositoryコードの読解能力を測っていない。
  現状のSystem1は「命名慣習の推測力」を主に測定しており、「コンテキスト内の意味理解」の
  測定器としては感度が低い。
- B=0のフロア88%という数値は、実験計画書（4.3節）の判定基準「パターン1：B=0でも高得点（天井効果）」
  に該当する可能性があるが、原因が「budgetを与えても情報が入らない」ではなく
  「コードなしでも推定できてしまうプローブ設計」にある点で、意味が異なる。

### 今後への示唆

- System1を「意味理解の測定器」として機能させるには、boolean型の比率を増やすか、
  mc/stp型のプローブをcodingtransparentでない形式に再設計する必要がある。
  具体的な選択肢はStep 2着手前に別途検討する（A/B/C案参照）。
- 現状のSystem1は「B≥Full条件下での100%正答率」を確認する用途（較正の上限チェック）には
  機能している。問題はB=0のフロアが高すぎて、dose-responseの勾配を正確に測定できない点。

---

## エントリの追加方法

新しい発見を追加する際は、上記のF1と同じ形式（日付・Phase・元コード/ログ・実行条件・
何が起きたか・なぜ注目すべきか・今後への示唆）に従う。
