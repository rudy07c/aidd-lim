# Stage 0 Harness 実装計画

**対象**：`docs/experiment_plan_v1.6.md` の「Stage 0：Harness Feasibility」
**実装場所**：`harness/`（本ドキュメントの方針に従って、VSCode + Claude Codeで実装する）
**このドキュメントの位置づけ**：方針と設計判断の記録。コードそのものはここには書かない。

---

## 0. Stage 0で証明すべきこと（再掲）

計画書より：

> 世代継承ループ（fresh session → artifact読込 → 変更 → テスト → 保存）を安定して回せるか
> 条件：Full vs 単純Limited（3条件の区別はまだしない）
> 規模：5〜10世代、1モデル、1 toy repo
> 判定：クラッシュなく完走し、ログが欠損なく取得できること。**研究上の結論は出さない。**

Stage 0は「良い結果が出るか」を見る段階ではない。**機構そのものが壊れずに回るか**だけを見る。この区別を実装全体で意識する。

---

## 1. 全体アーキテクチャ

```
harness/
  src/
    types.ts                 共有型定義（GenerationLog, TaskResult 等）
    agent-backend/
      types.ts                AgentBackend インターフェース
      mock-noop.ts             何もしないagent（失敗を正しく検出できるかの確認用）
      mock-oracle.ts           正解パッチを直接適用するagent（成功を正しく検出できるかの確認用）
      anthropic.ts              実API呼び出し（Stage 0後半、Claude Code側でAPIキー設定して実行）
    context/
      assembler.ts              Full / 単純Limited のcontext構築（Stage 0では2条件のみ）
    orchestrator.ts             世代ループ本体
    scoring.ts                  visible tests + H(G) 実行、結果集計
    logging.ts                  runs/ への書き込み（experiment_plan 3.1節スキーマ準拠）
  run.ts                        CLIエントリポイント
  config/
    stage0-mock.json            モックagentでの5世代実行設定
    stage0-real.json             実APIでの実行設定（APIキーは環境変数から読む）
```

### データフロー（1世代分）

```
[前世代のrepository（ファイル群）]
        │
        ▼
  context assembler ──► [assembled context: files + task.visibleInstruction]
        │
        ▼
  agent backend（fresh instance） ──► [modified files]
        │
        ▼
  scoring
    ├─ visible tests 実行（repository/tests/）
    └─ H(G) 実行（hidden_regression_tests/、非公開）
        │
        ▼
  logging（runs/<experiment_id>/<lineage_id>/generation_NNN/ へ書き込み）
        │
        ▼
  [次世代へ渡すrepository（ファイル群のみ。対話履歴は破棄）]
```

---

## 2. 主要な設計判断

### 2.1 AgentBackendの抽象化とモック優先の理由

`AgentBackend`インターフェースを最初に固定し、実装を3種類用意する。

```ts
interface AgentBackend {
  run(input: {
    contextFiles: Record<string, string>; // path -> content
    visibleInstruction: string;
    contextBudget: number | "full";
  }): Promise<{
    modifiedFiles: Record<string, string>; // path -> new content（変更後の全体、差分ではない）
    rawResponse: string;
    tokenUsage?: { input: number; output: number };
    latencyMs: number;
  }>;
}
```

- **`mock-noop`**：`contextFiles`をそのまま返す（何も変更しない）。→ task-specific testは必ず失敗し、既存のvisible tests/H(G)は必ず通るはず。**この「必ず失敗するはずの経路が正しく失敗と記録されるか」を確認する**。
- **`mock-oracle`**：各held-out taskに付随する「正解パッチ」を直接適用する。`heldout_tasks.json`の`groundTruthDelta`は評価器側の意味情報であり実装コードそのものではないため、Stage 0用に**各taskの正解実装パッチを別途`harness/fixtures/oracle-patches/`に手書きで用意する**（4件程度、既存のtaskに対応）。→ 必ず全テストが通るはず。**この「必ず成功するはずの経路が正しく成功と記録されるか」を確認する**。
- **`anthropic`**：実際にClaude APIを呼ぶ。Stage 0の最終段階でのみ使う。

理由：Stage 0は「機構が壊れていないか」を見る段階であり、良し悪しが未知の実agentだけでテストすると、**ハーネスのバグなのかagentの能力の問題なのか切り分けられない**。noop/oracleという結果が事前に分かっている2つのagentで機構を先に検証し、既知の入力に対して既知の出力が出ることを確認してから、実agentに進む。

### 2.2 WorldProtocolの保護をどうするか（未解決、実装時に要判断）

`synthetic-world/repository/src/protocol_adapter.ts`は「固定契約」として、Present^behの判定や$H(G)$の実行に使われる。しかし物理的には`repository/`配下の1ファイルであり、agentが（誤って、あるいは意図的に）書き換えてしまう可能性がある。

Stage 0での扱い：

- ファイルシステムレベルで書き込み禁止にする**のではなく**、taskのvisible instructionとは別に、**agentへ渡すsystem prompt相当の指示**として「`protocol_adapter.ts`がexportする`reset` / `applyOperation` / `getEntityState` / `toAbstractSnapshot`の名前とシグネチャは変更しないこと」を明記する
- その上で、**agentがこの契約を実際に破った場合はそれ自体を「契約違反」としてログに記録し、失敗として扱う**（$H(G)$がimportエラーで落ちる、という形で自然に検出されるはず）
- 契約違反の発生率そのものが、後のStageで興味深い副次データになりうる（distributed invariantと同様、「明示的に指示された制約をLimited Contextでどれだけ守れるか」という論点に接続する）

この方針で進め、Stage 0で契約違反が頻発するようなら、より強い保護（例：$H(G)$側でprotocol_adapter.tsの署名をハッシュ検証する等）を検討する。

### 2.3 Context assemblerの最小実装（Stage 0では2条件のみ）

Stage 1で導入するFull / Privileged-Selection Limited / Agent-Retrieved Limitedの3条件は**まだ実装しない**。Stage 0では計画書の記述通り「Full vs 単純Limited」の2条件で機構だけを確認する。

- **Full**：`repository/`配下の全ファイルをそのままcontextへ含める
- **単純Limited**：ナイーブな固定ルールで一部ファイルを省略する。**このルールの巧拙は問わない**。Stage 1で導入するPrivileged Selector / Agent-Retrievedの複雑な設計はここでは不要。

目的はあくまで「context条件によって挙動を変えられる構造になっているか」の確認であり、Limited条件の質を測ることではない。

#### 単純Limited条件の最終ルール（Stage 0実行を経て確定）

初期設計では「`tests/`を除外し、残りを先頭Nトークンで打ち切る」を想定していたが、
Phase 4の実行（`docs/findings/stage0_findings.md` F3参照）を経て、以下のルールに改訂した。

**優先順位**：

1. **testsファイル**（`tests/`配下、`*.test.ts`）: per-file cap なし、常に全文を含める
   - 理由：testsを除外すると、後続世代のAI（fresh session）は前世代で発生した回帰に
     気づく手段がなく、回帰が世代を超えて自己修復されずに蓄積し続けた（F3）。
     「有限contextが意味理解を妨げる」という研究の問いとは別種の失敗であり、
     条件設計として分離しておく必要がある。
2. **型定義ファイル**（`export type` / `export interface` を含むファイル）: per-file cap なし、常に全文を含める
   - 理由：`WorldState`等の基礎型が見えないと、AIは型情報のないままコードを書く
     ことになり、研究したい「意味理解の失敗」とは別種の失敗（型エラー・型の当て推量）
     が混入する意図しない交絡になる。
3. **実装ロジックファイル**（上記以外）: per-file cap あり（削られうる）

**定数**（`harness/src/context/assembler.ts`、Stage 0時点）：
- `SIMPLE_LIMITED_MAX_CHARS_PER_FILE = 1200`（実装ファイルのper-file上限）
- `SIMPLE_LIMITED_MAX_TOTAL_CHARS = 4000`（全ファイル合計の上限）

これらの値は、Synthetic World全体（約7200文字）に対して**実際に発動する水準**に
設定してある（旧設定の 8000/32000 は発動しておらず、事実上 full と同一だった。F3参照）。

**「ただしtests/型定義という土台情報は必ず残す」という最低限のルールは、
Stage 0の実行で発生した失敗を受けてStage 0時点で確定した**。
Stage 1で導入する Privileged Selector 等の設計においても、この原則は継承する。

### 2.4 世代の独立性（fresh session）の実装

計画書2.3節の要件：各generationで新規セッション・新規agentインスタンスを開始し、前世代の対話履歴・chain-of-thought・agent内部メモリは一切継承しない。

実装上の担保：

- `orchestrator.ts`は各世代で`AgentBackend.run()`を**新しい呼び出し**として実行する。`anthropic.ts`実装では、Anthropic APIの`messages`配列を**毎回1メッセージから開始**し、前世代のmessage履歴を一切含めないことをコードレベルで保証する（変数のスコープを世代ループの外に一切持ち出さない設計にする）
- 継承されるのは`modifiedFiles`（ファイルの中身）のみ。これを次世代の`contextFiles`の初期値として渡す

### 2.5 ログスキーマとの対応

`logging.ts`は`docs/experiment_plan_v1.6.md`3.1節のフィールドに対応させる。Stage 0時点で必須なのは最低限以下（残りはStage 0.5以降で埋める）：

```
experiment_id, lineage_id, generation, condition, model
task_id
repository_before, repository_after, git_diff
context_budget, actual_context_tokens, context_contents
agent_prompt, agent_response
hidden_test_results, functional_task_result
latency, token_usage, cost
```

`semantic_probe_results` / `semantic_element_trace`はStage 0.5以降で追加するため、Stage 0では空またはnullでよい。

出力先は`runs/<experiment_id>/<lineage_id>/generation_NNN/`（`runs/README.md`の想定構造に準拠）。

---

## 3. ビルド順序（Claude Codeでの実装ステップ）

段階を分け、各段階の終わりに動作確認してから次へ進む。

### Phase 1：モックのみで機構を通す
1. `types.ts`、`AgentBackend`インターフェース、`logging.ts`を実装
2. `mock-noop.ts`を実装
3. `orchestrator.ts`（単一lineage、単一task、1世代分だけ）を実装し、mock-noopで1世代だけ動かす
4. ログが正しく出力されるか確認
5. `mock-oracle.ts`用のoracle patchを`T-local-1`について1件だけ用意し、同様に1世代動かして成功が正しく記録されるか確認

**この時点でのゲート**：noopで失敗、oracleで成功が、それぞれ期待通りログに残ること。

### Phase 2：世代ループとcontext assemblerを組み込む
6. `orchestrator.ts`を複数世代・複数task対応に拡張（`heldout_tasks.json`の4 taskを順に使用）
7. `context/assembler.ts`（Full / 単純Limited）を実装し、両条件でmock-noop 5世代を通す
8. `protocol_adapter.ts`の契約違反検出（2.2節）が機能するか、意図的に壊れたfixtureで確認

**この時点でのゲート**：mock-noop / mock-oracle それぞれで、Full条件・単純Limited条件、5世代が完走しログが欠損なく残ること。

### Phase 3：実APIへ接続
9. `anthropic.ts`を実装（Claude Code側でAPIキーを環境変数に設定して実行）
10. 1世代だけ実APIで動かし、`modifiedFiles`の形式（フルファイル内容のJSON）でパースできるか確認。プロンプト設計（system prompt、出力フォーマットの指示）をここで固める
11. 問題なければ5〜10世代、Full条件のみでフル実行

### Phase 4：Stage 0ゲート判定
12. 5〜10世代 × Full/単純Limited × mock-noop/mock-oracle/anthropicの組み合わせでクラッシュなく完走することを確認
13. ログの欠損チェック（各generationディレクトリに必須フィールドが揃っているかを検証するスクリプトを`harness/verify-logs.ts`として用意すると良い）
14. 完走したら`docs/experiment_plan_v1.6.md`のStage 0ゲートを満たしたと判断し、Stage 0.5（測定較正）へ進む

---

## 4. Stage 0の実行スコープ（範囲の限定）

以下はStage 0では**意図的にやらない**。後続Stageの担当。

| やらないこと | 理由 | 担当Stage |
|---|---|---|
| Privileged Selector / Agent-Retrieved Limitedの実装 | context条件の質はまだ問わない | Stage 1 |
| $R^{sem}_B$（semantic probe）の実施 | 測定較正はまだ | Stage 0.5 |
| GroundTruthDeltaによる$G_g$の世代進化 | task内容の正しさの検証はvalidate_task_deltas等で既に完了済み。Stage 0はharnessの機構確認が目的なので、固定の4 taskをそのまま順に使えば十分 | Stage 0.5以降で本格導入 |
| 複数model family、複数seed architecture | 対立仮説の排除はまだ早い | Stage 3 |
| 統計的検定 | 判定はクラッシュの有無とログ欠損の有無のみ | Stage 5 |

---

## 5. 未決事項（Claude Code実装時に判断してよいもの）

- `anthropic.ts`の出力フォーマット：フルファイル内容をJSONで返させるか、unified diff形式にするか。Stage 0では前者（フルファイル）を推奨（パース失敗のリスクが低いため）。ツール呼び出し（file editツール）を使わせる設計も可能だが、Stage 0の目的（機構確認）には過剰。
- モデル選定：Stage 0では単一モデル固定でよい。速度・コストの観点でClaude Haiku系を使い、Phase 4完走後に本番想定モデルへ差し替えても構わない。
- `runs/`のログ形式：JSON Lines形式かディレクトリ+ファイル形式か。`runs/README.md`は後者を想定しているため、そのまま踏襲するのが無難。

---

## 6. Stage 0完了の定義（このドキュメントのゴール）

- mock-noop / mock-oracle / anthropic の3 backendで、Full / 単純Limitedの2条件、5〜10世代がクラッシュなく完走する
- 各世代のログに3.1節の必須フィールドが欠損なく記録されている
- `protocol_adapter.ts`の契約違反が発生した場合に、それが「クラッシュ」ではなく「記録された失敗」として扱われる

これが満たされたら、`docs/experiment_plan_v1.6.md`を更新し（Stage 0完了の記録）、Stage 0.5（測定較正）の実装計画を次に作成する。
