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

### F4後の対処（→ F5へ続く）

mc/stp型プローブを記述式（選択肢なし・設問にoperation名なし）に再設計し、
モデルが「repositoryのコードを参照して関数名を答える」形式に変更した。
詳細はF5参照。

---

## F5: mc/stp記述式化によりB=0フロアが88%→0%に改善、dose-response幅が100%ptに拡大

**日付**：2026-09-06
**Phase**：Phase 4 Step 1（System1感度改善）
**元コード**：`calibration/src/probe-generator.ts`（mc/stp生成ロジック改訂）
**元データ**：`calibration/fixtures/probe-bank.json`（再生成後：17問）
**実行条件**：backend=anthropic, model=claude-haiku-4-5-20251001, budgets=[0, full]

### 設計変更の内容

**変更前（選択肢形式）:**
```
mc-1: "Vok が状態 'nim' のとき、Vok を次の状態 'pex' へ遷移させる operation はどれか？"
  Options: [advanceVok1, advanceVok2, advanceZef1, advanceZef2, advanceTal1]
  → 命名規則から選択肢の正解を推定可能（コード不要）

stp-16: "Vok が 'nim' の状態で advanceVok1 を実行すると、Vok の状態はどうなるか？"
  Options: [nim, pex, dor, operation fails]
  → operation名が設問に明示されており、名前から結果を推定可能
```

**変更後（記述式）:**
```
mc-1: "repositoryのコードを参照して、Vok を状態 'nim' から 'pex' へ遷移させる操作の関数名を答えよ。"
  選択肢なし。正解: "advanceVok1"

stp-16 (success): "Vok が 'nim' の状態のとき、repositoryのコードを参照して、Vok を次の状態へ進める操作の関数名を答えよ。"
  選択肢なし。正解: "advanceVok1"（関数名、以前は状態名 "pex"）

stp-18 (failure): "Zef が 'nim'、Vok が 'pex' の状態のとき、repositoryのコードを参照して、Vok を次の状態へ進める操作を呼び出すと、どうなるか？（実行できる場合は最終状態名を、実行できない場合は 'operation fails' と答えよ）"
  選択肢なし。正解: "operation fails"（"preconditionを満たさない"ヒントを除去）
```

### 実行結果（変更後）

```
B=0:    0/17 (0%)   — mc: 0/5, bool: 0/4, stp: 0/8
B=Full: 17/17 (100%) — mc: 5/5, bool: 4/4, stp: 8/8
```

前回との比較:
```
           B=0             B=Full   dose-response幅
変更前:  15/17 (88%)     17/17 (100%)    12%pt
変更後:   0/17  (0%)     17/17 (100%)   100%pt
```

### B=0の回答根拠（透明性チェック）

モデルはB=0（コンテキストなし）で以下のように応答した:

```
"I notice that no repository files were provided... I cannot see the TypeScript code needed to answer these questions"
```

全17問に "AWAITING_CODE" を返し、命名規則からの推測を一切行わなかった。
「advance + entity名 + 連番」という命名規則パターンを使った推測が起きるリスクは、
この実行においては観察されなかった。

（ただし、これはモデルがコードのないことを明示されたからであり、
将来的なモデル変更・プロンプト変更時には再チェックが必要）

### なぜ注目すべきか

- **System1のdose-response幅が12%ptから100%ptに拡大した**。6段階budgetの測定が
  意味を持つための基本条件（B=0とB=Fullの間に有意な差）が確立した。
- B=0でモデルが「コードがないから答えられない」と明示することで、
  System1が「コード理解に依存した測定器」として機能していることが確認できた。
- stp-failure型の変更（"preconditionを満たさない"ヒント除去）により、
  precondition判定もコードを読まないと答えられない問題になった。
  これはとくにdistributed encoding（I1）の理解を要する T-local-1 に相当する
  意味的難易度と対応する。

### 今後への示唆

- System1のdose-response幅が100%ptになったことで、Phase 4 Step 2（6段階フル実行）で
  明確な勾配（B=0→Fullにかけての改善）が観測できる条件が整った。
- B=Full=17/17(100%)は変わらないため、System1の上限は較正済みのまま。
- 残る懸念: B=0が0%なのは「コードがない」と知ったから（モデルが正直に拒否）だが、
  コードが一部しかない中間budget（B=1K）では命名規則推測が混入しうる。
  実API実行後に中間budgetの回答根拠も確認することが望ましい。

---

## F6: Phase 4 Step 2（6段階フル実行）結果 — 両系統でbudget感度を確認、T-local-1のみ全budgetで失敗

**日付**：2026-09-06
**Phase**：Phase 4 Step 2（6段階フル実行）
**実行条件**：backend=anthropic, model=claude-haiku-4-5-20251001, budgets=[0, 1K, 2K, 4K, 8K, Full]

### 実行結果

**系統2 (M̂_B):**
```
B=0K:   0/6 (0.00)
B=1K:   3/6 (0.50)  T-local-1❌ T-invariant-stress-1❌ T-crosscut-2❌
B=2K:   5/6 (0.83)  T-local-1❌
B=4K:   5/6 (0.83)  T-local-1❌ （ctx=1791t、2Kと同一内容）
B=8K:   5/6 (0.83)  T-local-1❌ （ctx=1791t、2Kと同一内容）
B=Full: 5/6 (0.83)  T-local-1❌ （ctx=1791t、2Kと同一内容）
```

**系統1 (R^sem_B):**
```
B=0K:   0/17  (0.00)  — mc:0/5  bool:0/4  stp:0/8
B=1K:  16/17  (0.94)  — mc:5/5  bool:3/4  stp:8/8
B=2K:  17/17  (1.00)  — mc:5/5  bool:4/4  stp:8/8
B=4K:  17/17  (1.00)  （2Kと同一）
B=8K:  17/17  (1.00)  （2Kと同一）
B=Full: 17/17 (1.00)  （2Kと同一）
```

### 観察1：dose-responseパターン

両系統とも `{B=0: 最低, B=1K: 中間, B=2K+: 上限}` という3段階の形を示した。
B=2K以降の横ばいはF2で既知のbudget degeneracy（repo=1791t）による。

System1は B=0→1K で大きく跳ね上がり（0%→94%）、B=1K→2K で追加改善（94%→100%）。
B=0で完全拒否→B=1Kで急上昇という「階段状」ではあるが、これはB=0が「コードなし」という
特殊状態であるため。中間のB=1K→B=2Kにも差があり（94%→100%）、完全なステップ関数ではない。

System2の曲線: 0.00 → 0.50 → 0.83 → 0.83 → 0.83 → 0.83

### 観察2：System1 × System2の同形性

両系統が同じ3段階パターンを示した。これは「contextが増えると両方が改善する」という
hypothesis と整合する。ただし相関係数の計算には実質3点（B=0, 1K, 2K+）しかなく、
定量的な相関分析の前にPhase 5（規模拡大）が必要。

### 観察3：T-local-1の全budget失敗（Stage 0 F1との一致）

T-local-1はB=Full でも task-spec=2/3 で失敗し続けた。
Stage 0 F1（Haiku 4.5が `advanceVok2` のTalガードを実装しない）と完全に一致。
この失敗パターンはcontextの量ではなく、agentの意味理解の欠如によるものと考えられる。

System1: B=1Kでbool=3/4（1問失敗）。I1（distributed encoding）に関連するbool probeの
失敗可能性があり、T-local-1のタスク的失敗と対応している可能性がある（確認には詳細ログが必要）。

### 観察4：B=1Kでのタスク部分失敗（T-invariant-stress-1、T-crosscut-2）

B=1Kでは T-invariant-stress-1（task-spec=2/3）と T-crosscut-2（task-spec=2/3）も失敗。
B=2Kでは両方が回復（3/3）。これはB=1Kで可視テストが52%切り詰められる（F2観察）ことと
対応している。完全なテスト情報があればagentが正解できるが、不完全なテストでは
task-specificの要件を見落とす。

### なぜ注目すべきか

- **Phase 4の較正目標（System1とSystem2がともにbudget感度を持つ）が達成された。**
  両系統が独立して同じ方向の変化を示しており、測定器として機能している。
- T-local-1の全budget失敗は、「budgetを増やしてもHaiku 4.5が解決できない問題がある」
  という質的な限界を示している。これはPhase 5の実験設計（agent選択・タスク難易度）
  に向けた重要なデータ点。
- 実質3点（F2のbag degeneracy）という分解能の制約は確認済み。Phase 5での規模拡大が
  より滑らかなdose-response curveを得るために必要。

### 今後への示唆

- Phase 4の目的（System1/System2の較正確認）は達成。Phase 5（規模拡大）への移行判断が可能。
- T-local-1の継続失敗はPhase 5での難易度分類に活用できる
  （このタスクは「Haiku 4.5 at B=Full で解けない」という難易度ラベルが付いた）。
- System1 B=1Kのbool 3/4（1問失敗）の原因特定は、必要であれば詳細ログから確認可能。
  Phase 5の設計変更前に確認することが望ましい。

---

## F7: budget-assembler に system1/system2 モードを追加（tests・operationTable リークの修正）

**日付**：2026-09-06
**Phase**：Phase 4（System1 較正修正）
**元コード**：`calibration/src/budget-assembler.ts`（`AssemblyMode` 追加）、`calibration/src/calibration-runner.ts`（`runSystem1` の mode 指定）

### 発見した問題（F6 の後日判明）

Phase 4 Step 2 実行後の分析で、System1（意味理解測定）の B=1K 結果が「実装コード読解」ではなく **2つの別経路からの漏洩** で達成されていたことが判明した：

1. **tests 漏洩（precondition-failure 問題）**：budget-assembler の system2 優先順位では、tests ファイルが priority 2（fixed_contract の次）に置かれるため、B=1K でテストが 52% 切り詰めで含まれる。`rules.visible.test.ts` の冒頭部に `"advanceVok2: fails if Zef is not 'pex'"` 等の記述があり、stp-failure 問題（正解 `"operation fails"`）をコードを読まずに答えられる。

2. **operationTable 漏洩（関数名問題）**：`protocol_adapter.ts` が priority 1（fixed_contract）に置かれるため、B=1K では全文が含まれる。`operationTable` に全5関数名（`advanceVok1`, `advanceVok2`, `advanceZef1`, `advanceZef2`, `advanceTal1`）が列挙されており、mc/stp の関数名問題をコードの実装ロジックを読まずに答えられる。

**根本原因**：budget-assembler の優先順位ルールは Stage 0（世代を重ねる実験、回帰防止が目的）由来であり、System1（コードを変更しない、意味理解を測定する）には不適切な前提だった。

### 対処：AssemblyMode の追加

`budget-assembler.ts` に `AssemblyMode = "system1" | "system2"` を追加：

| モード | 優先順位 | 用途 |
|---|---|---|
| `system2`（デフォルト） | type_def(0) > fixed_contract(1) > test(2) > implementation(3) | Stage 0 由来。系統2（コード変更あり）で回帰防止のため維持 |
| `system1` | type_def(0) > その他全て同列(1)、アルファベット順で埋める | 系統1（意味理解測定）専用。答えを教えてしまう情報源を優先させない |

`calibration-runner.ts` の `runSystem1()` は `mode="system1"` を渡すよう変更。`runSystem2()` はデフォルト `"system2"` のまま（未変更）。

### system1 モード B=1K ファイル内訳（変更後）

```
B=1K (system1, budget=1000 tokens):
  [FULL]      src/vok/state.ts  (type_def, 46 chars)
  [FULL]      src/world.ts      (type_def, 456 chars)
  [FULL]      src/protocol_adapter.ts  (fixed_contract, 2365 chars)  ← アルファベット順で含まれる
  [FULL]      src/tal/rules.ts  (implementation, 300 chars)   ← 新規に含まれる
  [FULL]      src/vok/rules.ts  (implementation, 688 chars)   ← 新規に含まれる
  [TRUNCATED] src/zef/rules.ts  (implementation, 145/1135 chars = 13%)  ← 断片
  [EXCLUDED]  tests/rules.visible.test.ts  (test, 2171 chars)  ← 除外される
```

前回（system2 B=1K）と比較：
- `src/vok/rules.ts`・`src/tal/rules.ts`：EXCLUDED → **FULL** ✅
- `tests/rules.visible.test.ts`：TRUNCATED 52% → **EXCLUDED** ✅
- `src/zef/rules.ts`：EXCLUDED → TRUNCATED 13% ⚠️（precondition 情報の一部が見える）
- `src/protocol_adapter.ts`：FULL のまま（アルファベット順で priority-1 群の先頭になる）

### なぜ注目すべきか

- **意味測定とコード変更支援では budget-assembler の目的が異なる**。Stage 0 の設計を System1 にそのまま流用したことが漏洩の根本原因。測定系の設計は「何を測りたいか」から逆算して priority を決める必要がある。
- `AssemblyMode` という分岐を設けることで、両系統が「同じコードで、異なる情報提示順」を使えるようになり、system2 への影響なく修正できた。

### 今後への示唆

- world 規模拡大後も、System1 用の priority 設定は「型定義のみ優先、実装・契約・tests は同列」のまま維持する。規模が大きくなれば B=1K で見えるファイルの組み合わせが変わるため、再度内訳を確認する。
- `protocol_adapter.ts` は system1 B=1K でも含まれるが（アルファベット順）、vok/rules.ts・tal/rules.ts も同時に含まれるため「operationTable だけで全問答える」状況ではなくなった。F8 参照。

---

## F8: system1 モード修正後の B=0, 1K, 2K 実行結果と残存する advanceZef2 命名パターン依存

**日付**：2026-09-06
**Phase**：Phase 4（System1 較正修正後の検証）
**実行条件**：backend=anthropic, model=claude-haiku-4-5-20251001, budgets=[0, 1K, 2K]

### スコア結果

| Budget | R^sem_B | mc | bool | stp |
|---|---|---|---|---|
| B=0K | 0/17 (0.00) | 0/5 | 0/4 | 0/8 |
| B=1K | 15/17 (0.88) | 5/5 | 2/4 | 8/8 |
| B=2K | 17/17 (1.00) | 5/5 | 4/4 | 8/8 |

### 確認1：bool-6, bool-7 の失敗は genuine な情報不足による ✅

**設問と正解：**
- bool-6：`"Vok が 'dor' で、Tal が 'nim' である状態は、この世界のinvariantに違反するか？"` → `true`
- bool-7：`"Zef が 'dor' で、Tal が 'nim' である状態は、この世界のinvariantに違反するか？"` → `true`

**B=1K の誤答（原文）：**
```
Q6-Q7: Invariant checking - Since TalState only has "nim" | "pex",
Tal can never be "dor", so states with Tal="nim" are valid
→ "false" × 2
```

TalState の型定義から「Tal='nim' は有効な状態」と正しく読んだが、「Vok='dor' かつ Tal='nim' という組み合わせが I1（if Vok=dor then Tal=pex）に違反する」という不変条件との接続に失敗した。I1 の記述は zef/rules.ts の後半にあり、B=1K の 13% 切り詰めで届かない → **コードの情報不足による genuine な失敗**。

### 確認2：mc/stp の advanceZef2 関連に命名パターン依存が残存 ⚠️

**B=1K での advanceZef2 に関する推論（原文）：**
```
Key insight: `advanceZef2` is in the operationTable but the full code
isn't shown. However, based on the pattern and the fact that ZefState
includes "dor", `advanceZef2` must transition Zef: pex → dor.
```

| プローブ | 根拠 | 評価 |
|---|---|---|
| mc-1〜mc-3 (Vok/Zef1/Tal) | vok/rules.ts・zef/rules.ts 冒頭・tal/rules.ts を直接読解 | ✅ コード読解 |
| mc-4 (advanceZef2 名前) | operationTable から名前確認 + ZefState 型からの遷移方向推論 | ⚠️ 命名パターン依存 |
| mc-5 (Tal) | tal/rules.ts を直接読解 | ✅ コード読解 |
| stp-16〜stp-20 (Vok/Zef1/Tal) | vok/tal rules.ts 実装を直接参照 | ✅ コード読解 |
| stp-21 (Tal='pex', Zef='pex' → advanceZef2) | operationTable 名前 + パターン推論 | ⚠️ 命名パターン依存 |
| stp-22 (Tal='nim', Zef='pex' → operation fails) | advanceZef1 の precondition（visible）からのパターン推論 | △ 推論（許容範囲） |
| stp-23 (Tal) | tal/rules.ts を直接参照 | ✅ コード読解 |

mc/stp 13問中10問はコード読解、3問（23%）が命名パターン依存または推論に基づく。

**残存する依存の scope：**
- `advanceZef2` は全 5 operation のうち 1 つ（20%）
- 原因は system1 B=1K で zef/rules.ts が 13% しか見えないため、advanceZef2 の実装本体が読めないこと
- vok/rules.ts・tal/rules.ts は全文読めており、それらに対応する mc/stp はコード読解で正答している

### System2 への影響

system2 の結果は変化なし（B=0: 0/6, B=1K: 3/6, B=2K: 5/6）。`runSystem2()` は `mode="system2"` 維持。

### なぜ注目すべきか

- **bool の genuine gap が生まれた**：B=1K で bool 2/4（I1/I2 の invariant が見えない）という正当な失敗が確認された。B=2K で全文が見えると 4/4 に回復。これは System1 が「情報の有無を感知できている」証拠。
- **advanceZef2 の部分的命名依存は残存**：13問中3問（23%）が operationTable または推論経由。world 規模拡大で zef/rules.ts が B=1K 内に完全に収まるようになれば自然に解消する。
- 全体として F4（命名パターン推測で全問正解）の問題は解消し、「コードを読んだ場合のみ正解できるプローブ」の割合が大幅に増加した。

### 今後への示唆

- advanceZef2 の残存依存は、Phase 5（world 規模拡大）で zef/rules.ts の内容が B=1K 内に収まるようになれば自動解消する。現段階での追加対処は不要。
- bool 2/4 の失敗（B=1K）→ 4/4 成功（B=2K）という推移は、System1 の budget 感度の証拠として有効。Phase 4 の目的である「測定器として機能しているか」の判断には十分な信号。
- F6 で報告した「B=1K での System1: 16/17 (0.94)」は本修正前の誤った数値。正しくは **15/17 (0.88)**（bool が 3/4 → 2/4 に変化）。F6 は当時の実行結果の記録として残すが、この F8 が上書き優先。

---

## エントリの追加方法

新しい発見を追加する際は、上記のF1と同じ形式（日付・Phase・元コード/ログ・実行条件・
何が起きたか・なぜ注目すべきか・今後への示唆）に従う。
