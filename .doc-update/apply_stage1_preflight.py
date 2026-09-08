from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# 1. Root theory paper
# ---------------------------------------------------------------------------
paper_path = "docs/aidd_ilm_paper.md"
paper = read(paper_path)

paper = replace_once(
    paper,
    "また、全過去世代の履歴\n\n\\[\nH_1 + H_2 + \\cdots + H_g\n\\]\n\nを無制限に渡す設計は採用しない。世代とともにhistory量そのものが増大し、context length・cost・lost-in-the-middle等が新たな交絡となるためである。基本単位は**直前世代のobservable history \\(H_g\\)** とし、より古い情報が必要なら、前世代がartifactまたは明示的な継承memoryへ残す必要がある。\n",
    "また、全過去世代の履歴\n\n\\[\nH_1 + H_2 + \\cdots + H_g\n\\]\n\nを無制限に渡す設計は採用しない。世代とともにhistory量そのものが増大し、context length・cost・lost-in-the-middle等が新たな交絡となるためである。基本単位は**直前世代のobservable history \\(H_g\\)** とし、より古い情報が必要なら、前世代がartifactまたは明示的な継承memoryへ残す必要がある。\n\nしたがってMOIはArtifact-Externalization Pressureをゼロにする条件ではない。MOIが緩和するのは、**直前のgenerational linkにおいてobservableな非repository情報をartifact以外のchannelでも継承できるようにすることによる圧力の一部**である。二世代以上先へ保持したい情報については、MOIでもartifactまたは次世代が再び明示的に外在化した情報へ移す必要がある。したがってMOIは、全歴史についての完全継承ではなく、**各generational linkにおけるMaximal Observable Transmission**への操作的近似として解釈する。\n",
    "paper: MOI pressure clarification",
)

paper = replace_once(
    paper,
    "Stage 0.5のようにbudgetだけを操作したhistorical calibrationでは \\(M_B(S),R_B^{\\mathrm{sem}}(S)\\) という表記を用いてよいが、五条件を横断する理論量としてはcondition / evaluation-environment indexed notationを用いる。\n\n両者を分離して測定することで、「artifactから何が意味的に再構成されたか」を独立に観察できるようになり、ILMとの対応をより厳密にできる。\n\n### 4.2 複合的評価枠組みとしての位置づけ",
    "Stage 0.5のようにbudgetだけを操作したhistorical calibrationでは \\(M_B(S),R_B^{\\mathrm{sem}}(S)\\) という表記を用いてよいが、五条件を横断する理論量としてはcondition / evaluation-environment indexed notationを用いる。\n\nさらにlongitudinal experimentでは、artifactが**どの条件で育ったか**と、最終的に**どの環境で評価されるか**を分離しなければならない。育成条件を \\(c_{\\mathrm{train}}\\)、評価環境を \\(e_{\\mathrm{eval}}\\) とし、generation \\(g\\) のartifactを\n\n\\[\nS_g^{[c_{\\mathrm{train}}]}\n\\]\n\nと表す。評価は、\n\n\\[\nM\\left(S_g^{[c_{\\mathrm{train}}]};e_{\\mathrm{eval}}\\right),\n\\qquad\nR^{\\mathrm{sem}}\\left(S_g^{[c_{\\mathrm{train}}]};e_{\\mathrm{eval}}\\right)\n\\]\n\nと書く。これにより、lineageが自分の育った環境で高いperformanceを示す**native performance**と、同じcommon environmentへ移したときにもartifact自体の差が残る**common-environment performance**を区別する。MOIのnative evaluationでは必要に応じて直前historyも入力に含め、\n\n\\[\nM\\left(S_g^{[MOI]},H_{g-1};e_{MOI}\\right)\n\\]\n\nのように明示する。したがって \\(M_c(S_g)\\) のような簡略記法は、育成条件と評価条件が文脈上明白な場合に限って用いる。\n\n両者を分離して測定することで、「artifactから何が意味的に再構成されたか」を独立に観察できるようになり、ILMとの対応をより厳密にできる。\n\n### 4.2 複合的評価枠組みとしての位置づけ",
    "paper: train/eval notation",
)

paper = replace_once(
    paper,
    "モジュール性、局所性、明示的契約、テスト、Spec、命名規則、ADR、冗長性等は、あらかじめ「良い構造」として目的変数へ埋め込まず、どの形質が差異的に保持・増幅されるかを事後的に検討する候補として位置づける。\n\n---\n\n## 5. 実験設計",
    "モジュール性、局所性、明示的契約、テスト、Spec、命名規則、ADR、冗長性等は、あらかじめ「良い構造」として目的変数へ埋め込まず、どの形質が差異的に保持・増幅されるかを事後的に検討する候補として位置づける。\n\n### 4.4 selection pressureを主張するためのevidence chain\n\n条件間でtrajectoryが異なるという事実だけでは、selection mechanismが実証されたとはみなさない。本研究でselection pressureをより強く主張するには、少なくとも次のevidence chainを区別して追跡する。\n\n\\[\n\\text{Condition}\n\\rightarrow\n\\text{Differential Preservation / Reconstruction}\n\\rightarrow\n\\text{Trait Change}\n\\rightarrow\n\\text{Environment-specific Advantage}\n\\]\n\nすなわち、\n\n1. あるinheritance / observation条件で特定のsemantic elementや構造が差異的に保持・再構成されること、\n2. その差が世代反復を通じてartifact上の形質差へ蓄積すること、\n3. common / reciprocal evaluationで、その形質差が対応する環境における継承品質の差へ結びつくこと、\n\nを段階的に確認する。Stage 2のtrajectory差はこのchainの候補証拠であり、Stage 4のsemantic element / encoding-medium分析とreciprocal evaluationを組み合わせてmechanism claimを強める。\n\n---\n\n## 5. 実験設計",
    "paper: selection evidence chain",
)

write(paper_path, paper)


# ---------------------------------------------------------------------------
# 2. Overall experiment plan
# ---------------------------------------------------------------------------
plan_path = "docs/experiment_plan.md"
plan = read(plan_path)
plan = replace_once(plan, "**版**: v2.1", "**版**: v2.2", "plan: version")

changelog_anchor = "**v2.1での変更点（Stage 1内部妥当性の精密化）**："
changelog = """**v2.2での変更点（Stage 1 preflight freeze）**：
- longitudinal notationで、artifactの**育成条件**と**評価環境**を分離：\\(S_g^{[c_{train}]}\\) と \\(M(S_g^{[c_{train}]};e_{eval})\\) / \\(R^{sem}(S_g^{[c_{train}]};e_{eval})\\) を導入
- MOIはExternalization Pressureを消去する条件ではなく、直前generational linkでobservable historyを追加継承することで圧力の一部を緩和する条件と明記
- selection pressureの主張を trajectory差だけに依存させず、`Condition → Differential preservation/reconstruction → Trait change → Environment-specific advantage` のevidence chainとして事前定義
- Stage 1のprimary task bankをmodel移行後に事前規則でfreezeし、AFでも恒常的に失敗するtaskはchallenge / diagnostic setへ分離する方針を追加
- Stage 1Bのprimary predecessor fixtureは、next taskに関連し、かつartifactへ完全には重複していないobservable informationを含むことを適格条件に追加
- C1〜C3のprimary comparisonではBatch/Syncを混在させず、execution mode / model-call opportunity / output schemaを可能な限り統一
- scientific longitudinal runでは同一GroundTruthDeltaをmodulo循環再利用しないことを明記。Stage 1Cはunique task sequenceを使用し、Stage 2開始前に30〜50世代分のvalid unique deltaを準備する

"""
plan = replace_once(plan, changelog_anchor, changelog + changelog_anchor, "plan: changelog")

plan = replace_once(
    plan,
    "---\n\n## 1. Synthetic Software World",
    """### 0.4 育成条件と評価環境の分離

longitudinal resultでは、artifactがどのconditionで生成・継承されてきたかと、そのartifactをどのenvironmentで評価したかを分離する。

\\[
S_g^{[c_{train}]}
\\]

をcondition \\(c_{train}\\) でgeneration \\(g\\) まで育ったartifactとし、

\\[
M\\left(S_g^{[c_{train}]};e_{eval}\\right),
\\qquad
R^{sem}\\left(S_g^{[c_{train}]};e_{eval}\\right)
\\]

をevaluation environment \\(e_{eval}\\) での評価量とする。

- **native evaluation**：育成条件と同系統のenvironmentで評価する
- **common-environment evaluation**：異なるlineage artifactを同一environmentへ移して評価する
- **reciprocal evaluation**：主要contrastの双方のenvironmentへ両lineage artifactを移して評価する

この区別により、`その条件でagentが有利だった`ことと、`その履歴によってartifact自体がその環境へ適応した`ことを分離する。MOI native evaluationで直前historyを併用する場合は、artifact-only evaluationと同一視せず入力historyを明示する。

### 0.5 selection mechanismのevidence chain

selection pressureは単なるtrajectory差ではなく、次のchainとして検証する。

\\[
\\text{Condition}
\\rightarrow
\\text{Differential Preservation / Reconstruction}
\\rightarrow
\\text{Trait Change}
\\rightarrow
\\text{Environment-specific Advantage}
\\]

Stage 1は主として最初の条件操作とimmediate effectを検証し、Stage 2〜4でtrait trajectoryとcommon / reciprocal evaluationを組み合わせて後半のlinkを検証する。

---

## 1. Synthetic Software World""",
    "plan: preflight theory section",
)

stage1_anchor = "### Stage 1：Inheritance / Context Decomposition\n\n**目的**"
stage1_prefix = """### Stage 1：Inheritance / Context Decomposition

#### Stage 1開始前にfreezeする追加事項（v2.2）

**Primary task eligibility**：Stage 0.5では旧modelでArtifact-Fullでも恒常失敗するtaskが存在したため、既存20 taskを機械的にすべてprimary \\(M\\) へ入れない。primary model移行後、main comparisonとは独立したcalibration runでtask適格性を判定し、次をfreezeする。

- \\(\\mathcal T_{primary}\\)：AFで非floor、system/compiler failure主体でない、measurement leakageがないtask
- \\(\\mathcal T_{challenge}\\)：AFでも難しいが診断価値を持つtask
- task bank構成Aをprimary、構成B（invariant-stressingを含む）をdiagnosticとして扱う

閾値・repeat数・除外理由は結果観測後に変更しない。

**Execution-mode parity**：C1〜C3のprimary comparisonでは、AFだけBatch、PR/ARだけinteractive syncというようにexecution modeを混在させない。model identifier、reasoning、output schema、max model calls、decision opportunity、retry / repair ruleを可能な限り共通化する。Batchはindependent calibration / probe処理へ限定してよい。

**Non-cycling longitudinal tasks**：scientific longitudinal runでは同一GroundTruthDeltaをmoduloで循環再適用しない。Stage 1Cは現在のbankからvalidなunique 10〜15 taskを使い、各deltaを一度だけ適用する。Stage 2の30〜50世代を開始する前に、累積validatorを通過した30〜50個のunique delta sequenceを準備する。

**目的**"""
plan = replace_once(plan, stage1_anchor, stage1_prefix, "plan: Stage 1 freeze")

plan = replace_once(
    plan,
    "Stage 1Bでは複数のpredecessor episode / next-task pairを用意し、特定の1 historyに依存しないことを確認する。\n\nさらに、入力token増加やsection配置だけの効果を診断するため、longitudinal conditionとは別の**Stage 1B限定sham-history control**を置く。",
    "Stage 1Bでは複数のpredecessor episode / next-task pairを用意し、特定の1 historyに依存しないことを確認する。primary fixtureとして採用するpairは、少なくとも **(a) history内にnext taskへ関連するobservable informationがある、(b) その情報がartifactへ完全には重複していない、(c) hidden evaluator / Ground Truth由来の非可視情報を含まない** ことを事前検査する。artifactに完全外在化済みのhistoryやnext taskと無関係なhistoryは、primary C0ではなくnegative / placebo diagnosticとして扱う。\n\nさらに、入力token増加やsection配置だけの効果を診断するため、longitudinal conditionとは別の**Stage 1B限定sham-history control**を置く。",
    "plan: Stage 1B fixture eligibility",
)

plan = plan.replace(
    "M_c(S_g) > M_{AF}(S_g)",
    "M\\left(S_g^{[c]};e_c\\right) > M\\left(S_g^{[AF]};e_c\\right)",
)
plan = plan.replace(
    "R^{sem}_c(S_g) > R^{sem}_{AF}(S_g)",
    "R^{sem}\\left(S_g^{[c]};e_c\\right) > R^{sem}\\left(S_g^{[AF]};e_c\\right)",
)

write(plan_path, plan)


# ---------------------------------------------------------------------------
# 3. Stage 1 implementation plan
# ---------------------------------------------------------------------------
stage_path = "docs/stage1_plan.md"
stage = read(stage_path)
stage = replace_once(
    stage,
    "**対象**：`docs/experiment_plan.md`（v2.1）の Stage 1「Inheritance / Context Decomposition」",
    "**対象**：`docs/experiment_plan.md`（v2.2）の Stage 1「Inheritance / Context Decomposition」",
    "stage1: parent version",
)

stage = replace_once(
    stage,
    "---\n\n## 1. Stage 0 / 0.5の扱い",
    """### 0.9 Stage 1 preflightでfreezeする追加決定

#### 0.9.1 育成条件と評価環境を分離する

longitudinal artifactは、育成条件を明示して

\\[
S_g^{[c_{train}]}
\\]

と表し、評価は

\\[
M\\left(S_g^{[c_{train}]};e_{eval}\\right),
\\qquad
R^{sem}\\left(S_g^{[c_{train}]};e_{eval}\\right)
\\]

と記録する。native / common-environment / reciprocal evaluationをlog schema上でも区別する。MOIでhistory付きnative evaluationを行う場合は、artifact-only evaluationと区別してhistory inputを明示する。

#### 0.9.2 MOIはExternalization Pressureをゼロにしない

MOIは直前世代の \\(\\mathcal I_g^{obs}\\) を追加継承することでartifactへの外在化圧力の一部を緩和するが、全過去historyを継承しないため、二世代以上先へ保持する情報についてはなおartifact等への外在化が必要である。MOIを`pressure = 0` controlとは解釈しない。

#### 0.9.3 selection signature

Stage 2以降でselection pressureを主張する際は、

\\[
\\text{Condition}
\\rightarrow
\\text{Differential Preservation / Reconstruction}
\\rightarrow
\\text{Trait Change}
\\rightarrow
\\text{Environment-specific Advantage}
\\]

のevidence chainを用いる。Stage 1のimmediate performance差だけではselection mechanismを主張しない。

#### 0.9.4 execution modeをprimary contrastで揃える

C1〜C3のprimary comparisonではBatch/Syncを混在させない。AF / EL / PR / ARで、model、reasoning、output schema、model-call上限、decision opportunity、retry / repair ruleを可能な限り共有する。Batchはindependent calibrationに限定してよい。

#### 0.9.5 scientific lineageではtaskを循環再利用しない

現行Stage 0 orchestratorの `tasks[gen % tasks.length]` はStage 1 scientific runへ持ち込まない。GroundTruthDeltaは同一IDを再追加できないため、Stage 1Cでは10〜15個のvalid unique taskを一度ずつ適用する。Stage 2開始前に30〜50世代分のvalid unique delta sequenceを別途準備する。

---

## 1. Stage 0 / 0.5の扱い""",
    "stage1: preflight section",
)

stage = replace_once(
    stage,
    "## 10. Pre-Stage 1 / P6：再較正\n\n### 10.1 AF baseline",
    """## 10. Pre-Stage 1 / P6：再較正

### 10.0 Primary task eligibility

旧Stage 0.5では、当時のmodelでArtifact-Fullでも恒常的に失敗するtaskが存在した。primary model移行後は、その旧結果だけでtaskを除外せず、main comparisonとは独立したcalibration repeatでtask適格性を再評価する。

事前にfreezeする集合：

\\[
\\mathcal T_{primary}
\\]

- AFでsuccess probabilityがfloorではない
- compiler/system/protocol failureだけで決まらない
- visible test / prompt leakageがない
- condition差を測る余地がある

\\[
\\mathcal T_{challenge}
\\]

- AFでも難しいが、diagnostic / stress testとして価値があるtask

構成A（通常feature task）をprimary outcomeの中心に置き、構成B（invariant-stressingを含む）はdiagnosticとして別集計する。閾値、repeat数、分類理由はStage 1Aのcondition差を見る前にfreezeする。

### 10.1 AF baseline""",
    "stage1: task eligibility",
)

stage = replace_once(
    stage,
    "### 13.2 paired episode生成",
    """### 13.1.1 Primary predecessor fixtureの適格条件

Stage 1Bのprimary pairは、predecessor historyが単に長いだけでなく、情報的に意味を持つことを事前確認する。

必須条件：

1. \\(\\mathcal I^{obs}_{pre}\\) 内に \\(T_{next}\\) と関連するobservable informationが存在する
2. その情報が \\(S_{next}\\) に完全には重複していない
3. Ground Truth / hidden evaluator / unrevealed scoring情報を含まない
4. fixture eligibility判定はMOI / AFのnext-step outcomeを見る前に行う

artifactに完全外在化済みのhistory、無関係historyはnegative control / sham-history側へ回す。

### 13.2 paired episode生成""",
    "stage1: fixture eligibility",
)

write(stage_path, stage)

print("Stage 1 preflight documentation sync completed")
