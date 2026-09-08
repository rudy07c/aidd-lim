# AIDDにおける伝達ボトルネックとしての有限コンテキスト
### ―Iterated Learning Modelから見た、ソフトウェアartifactの世代間伝達と再構成―

---

## Abstract

本稿は、言語進化研究におけるIterated Learning Model（ILM）の枠組みを、AIを用いた反復的ソフトウェア開発（AI-Driven Development, AIDD）に応用し、新たな分析単位を提起するものである。従来のAIDD研究は「AIにどう開発させるか」という、AIという主体側の最適化を中心に据えてきた。本稿はこれに対し、ILMが問うたのと同型の問いの転回、すなわち「AIが反復的に扱い続けられるように、開発対象であるsoftware artifactはどのような構造へ変化していくのか」という問いを提示する。

本稿でいう「選択圧」「選択環境」は、複数の変異体（variant）の集団からfitnessの高いものが繁殖するという厳密なDarwinian selectionを意味しない。実際に扱う過程は単一のlineage \(S_0 \to S_1 \to S_2 \to \cdots\) であり、そこで生じうるのは、世代継承の過程で正確に保持・再構成されやすい情報と、歪んだり失われたりしやすい情報との間の**差異的伝達可能性（differential transmissibility）**である。

AIDDにおける世代継承には、少なくとも二種類のselection pressureが考えられる。第一は、前世代の一時的な会話・判断・作業記憶等が次世代へ自動的には残らないことによって、後世に必要な意味を**永続software artifactへ**刻むことを要求する **Artifact-Externalization Pressure（以下、Externalization Pressure）** である。第二は、artifactに情報が残っていても、次世代主体がそれを一度にすべて保持・処理できないことによって、限られた観測から意味を再構成可能な形で情報を配置することを要求する**Reconstruction Pressure**である。

この二つを実験的に分解するため、本稿は世代 \(g\) の内部的理解を \(K_g\)、永続artifactを \(S_g\)、実験系が観測・保存可能だが通常はartifactに含まれないinteraction historyを \(H_g\)、次世代主体が実際に保持しているartifact由来contextを \(C_g\) と区別する。その上で、全条件でfresh agent原則を維持しつつ、**Maximal Observable Inheritance（MOI） / Artifact-Full / Exposure-Limited / Privileged-Retrieved Limited / Agent-Retrieved Limited** の五条件を比較する。MOIは古典的ILMにおけるFull-transmission controlの完全な再現ではなく、実験系が保存可能なobservable informationについての操作的上限である。

この五条件は一本の「制約強度」の序列ではない。MOI → Artifact-Full → Exposure-Limited は主として**世代間transmission / inheritance axis**を、Artifact-Full → Privileged-Retrieved → Agent-Retrieved は主として**observation / retrieval axis**を構成する。Artifact-Fullは両軸を接続するhub conditionとなる。これにより、observable ephemeral contextの喪失、artifact exposureの不可逆な制限、有限working context、self-directed retrievalという異なるbottleneckを因果的に分解できる。

中心概念として、システムの意味・制約・振る舞いを後続AIがどれだけ正しく推定できるかを表す**意味的再構成可能性（semantic reconstructability）**と、その理解に基づいて実際の変更タスクをどれだけ成功させられるかを表す**機能的継続可能性（functional continuation）**を区別して定義する。両者は一般的なsoftware quality全体を表すものではなく、反復的に継承されるartifactとしての**継承品質（inheritance quality）**を操作的に捉える二つの軸である。したがって、特定の制約へのadaptationを一般的な品質向上と同一視しない。

先行研究レビューにより、この構想を構成する各要素――LLMを反復伝達の主体として扱う研究、repository-levelのcontext操作研究、coding agentによる長期的software evolutionのbenchmark研究――は独立に発展してきたことが確認された。しかし、何を世代間に継承するかという**inheritance channel**と、継承されたartifactをどれだけ同時に観測できるかという**observation channel**を分離して操作しながら、同一のsoftware artifactを多世代にわたって進化させる研究は、確認された範囲では存在しない。本稿はこの空白を埋める理論枠組みを提示する。

---

## 1. 背景：Iterated Learning Model（ILM）

### 1.1 従来の問いとILMによる転回

言語習得研究における伝統的な問いは次のようなものである。

> 人間はいかにして言語を獲得するのか？

これに対しILMは、問いそのものを反転させる。

> 人間が獲得可能であるように、言語はどのような構造へ進化するのか？

この転回の本質は、**適応の主体を学習者から環境（言語システム）へ移す**ことにある。Smith, Kirby & Brighton (2003) はこれを、ある学習者の出力が次の学習者への入力になるという反復過程として体系化し、stimulus poverty（学習者が観察できるデータの乏しさ）のもとでも言語構造が文化的に形成されうることを示した。この研究が示す最も重要な視点は、構造を個体の学習能力だけで説明するのではなく、**反復伝達される対象そのものが、伝達条件へ適応する**というものである。

### 1.2 学習者はpriorを持つ：ボトルネックとpriorの共存

ILMは、学習者が事前知識を持たない「白紙の学習者」を前提としているわけではない。Griffiths & Kalish (2007) はBayesian iterated learningの枠組みにより、学習者が持つprior（帰納バイアス）と観察データの関係を形式化し、反復学習の定常分布が学習者のpriorに強く依存することを示した。文化的反復はlearner biasを消去するのではなく、**体系にそのバイアスを反映・増幅する**過程である。

この点は、AIDDへの写像において決定的に重要である。AIエージェントは大規模事前学習によって強いpriorを持つ主体であるが、これはILMとのアナロジーを破壊するものではない。ILMは、学習者が強いpriorを持つ場合にこそ、反復伝達を通じて何が増幅・選択されるのかを問う枠組みとして機能する。

### 1.3 ボトルネックの本質：学習可能性と表現力のトレードオフ

Kirby, Cornish & Smith (2008) は、人間の被験者による人工言語の伝達連鎖実験により、世代を重ねるごとに言語の学習容易性と体系的構造が同時に高まることを観測した。ただし、この構造化過程は単純に「学習しやすいものが生き残る」という一方向的な圧力だけでは説明できない。Kirby, Tamariz, Cornish & Smith (2015) はこれを精緻化し、**学習可能性・圧縮可能性（compressibility）への圧力と、意味を十分に区別して伝える表現力（expressivity）への圧力との競合・トレードオフ**として構造化を再定式化した。構成的（compositional）な構造が選択されるのは、限られた入力から再構築可能でありながら、なお多様な意味を区別して伝達できるという、両立困難な要求のもとでのみである。

---

## 2. AIDDへの転回

### 2.1 従来のAIDDの問いと本稿の転回

AIを用いた反復的開発（AIDD）における従来の関心は、次のように定式化できる。

> AIにどう開発させればよいか。

これは実践的には、プロンプト最適化、Spec記述、エージェント設計、ワークフロー設計といった、AIという主体側の性能・振る舞いを最適化する発想である。ILMの構造をAIDDに写像すると、問いは次のように転回する。

> AIによる反復的な開発の中で、どのようなシステム構造が選択されるのか。

すなわち、AIそのものを研究対象とするのではなく、**AIとの反復的相互作用によって変化していくシステム（コードベース、Spec、テスト、ドキュメント等のartifact全体）**を研究対象とする。

### 2.2 研究対象の再定義

従来のモデルは、AIからシステムへの一方向的な生成過程として捉えられる。

```
AI → System
```

本稿が提起するのは、これを反復的な相互作用の連鎖として捉え直すモデルである。

```
AI → System₁ → AI → System₂ → AI → System₃ → …
```

各世代のシステムは、次に作業するAIにとっての入力（コンテキスト）となり、AIはそれを再構成して新たなシステムを生成する。

### 2.3 「選択圧」という語の限定：単一lineageにおける差異的伝達可能性

ここで、本稿の用語法について重要な限定を加える必要がある。2.2節のモデルが示す通り、本稿が扱う過程は基本的に単一のlineage

\[
S_0 \to S_1 \to S_2 \to S_3 \to \cdots
\]

である。これは、複数の変異体（variant）からなる集団の中で、fitnessの高い個体が選択的に繁殖するという、厳密な意味でのDarwinian selectionを直接実装しているわけではない。

実際にこの過程で生じるのは、次のようなことである。

> 有限コンテキストのもとでは、ある世代のartifactに含まれる情報のうち、次世代へ**正確に再構成される情報**と、**歪んだり失われたりする情報**との間に差が生じる。

本稿ではこれを**差異的伝達可能性（differential transmissibility）**と呼ぶ。より正確には、AIDDにおけるbottleneckは一種類ではなく、3節で述べるexternalizationとobservationの複数段階に存在する。そのため、本稿が想定する因果連鎖は次のように一般化される。

\[
\text{Inheritance / Observation Bottlenecks}
\;\longrightarrow\;
\text{Differential Transmissibility}
\;\longrightarrow\;
\text{Artifact Adaptation}
\]

より具体的には、本稿では少なくとも二種類の圧力を区別する。

\[
\text{Ephemeral Context Loss}
\;\longrightarrow\;
\text{Externalization Pressure}
\]

\[
\text{Bounded Artifact Observation}
\;\longrightarrow\;
\text{Reconstruction Pressure}
\]

前者は「後世に必要な意味を非永続なinteraction channelだけに残さず、永続software artifactへ刻め」という圧力であり、後者は「artifactへ外在化するだけでなく、有限な観測から再構成できる形で残せ」という圧力である。

実験で操作する条件は、この有限性をゼロから作り出すのではなく、**何が世代間に残るか、残ったartifactをどのように観測できるかを制御可能な独立変数へ変換するための操作**として位置づける。

本稿で以降「選択圧」「選択環境」という語を用いる場合、それは、この差異的伝達可能性を介して、artifactの構造的性質の保持・消失・変形に系統的な偏りを生じさせる圧力を意味するものとし、複数variantの並行的な繁殖競争を意味するものではない。この限定を明示することで、本稿の主張は「文化進化的なselectionに類似した過程が生じうる」という妥当な射程に収まる。

---

## 3. 何が継承されるのか：artifact・observable history・再構成

本稿の理論的主張の核心は、次の点にある。

> 次世代へ伝わりうる情報を、前世代主体の内部状態、永続artifact、観測可能なinteraction historyに分解し、それぞれを同一視しない。

世代 \(g\) の開発主体がその時点で持つ内部的理解・設計意図・判断・mental modelを \(K_g\)、コード・テスト・型・Spec・ADR・コメント等からなる永続artifactを \(S_g\)、実験系が観測・保存できるが通常はrepositoryに含まれないinteraction historyを \(H_g\)、次世代主体が実際にその時点で保持・処理しているcontextを \(C_g\) とする。

ここで \(H_g\) には、たとえば次のような情報が含まれる。

- その世代に与えられたtask instruction
- agentのobservable response
- tool calls / tool results
- agentが明示的に出力したscratch note / working note
- repositoryへ適用されたdiff
- evaluatorからagentへ実際に返されたfeedback

ただし \(H_g\) は \(K_g\) の完全な写像ではない。モデルのhidden state、非出力の内部表象、非観測的な推論過程等は含まれない。

ここで注意すべきなのは、\(H_g\) の全内容が \(K_g\) から「外在化」されたものではないことである。task instructionやtool result、外部から与えられたfeedbackは、episodeの外部入力・環境との相互作用に由来する。したがって、因果過程をより厳密には、世代 \(g\) のtaskを \(T_g\)、observable tool / feedback environmentを \(E_g\) として、

\[
(K_g,S_g,T_g,E_g)
\xrightarrow{\mathrm{episode\ interaction}}
(S_{g+1},H_g)
\xrightarrow{\mathrm{inheritance\ condition}}
C_{g+1}
\longrightarrow
K_{g+1}
\]

と表す方がよい。

ここで \(S_{g+1}\) は永続software artifact、\(H_g\) はepisode中に観測・保存できた非repositoryのinteraction recordである。本研究がMOI / Artifact-Fullで操作するのは、\(K_g\) 全体の継承ではなく、**episode後に残ったobservable channel \(H_g\) をartifactとは別に次世代へ渡すかどうか**である。

本研究では、**すべての条件で次世代はfresh agentとする**。同一sessionを継続する条件は設けない。変数として操作するのは「fresh agentへ何を渡すか」であり、主体の連続性そのものではない。

### 3.1 Externalization BottleneckとObservable History Loss

前世代の内部状態 \(K_g\) のすべてが、永続artifact \(S_{g+1}\) へ外在化されるわけではない。

ある開発主体が持っていた、

- なぜその設計を選んだのか
- どの箇所を危険だと考えていたのか
- どの代替案を棄却したのか
- どのような暗黙の前提を置いていたのか
- 実装中に形成された一時的なmental model

の多くは、そのままでは次世代へ残らない。

従来のartifact-only継承では、observableな会話・tool interaction等が \(H_g\) として実験系に保存できたとしても、次世代へ渡さず、

\[
S_{g+1}
\rightarrow
Agent_{g+1}
\]

のみを許す。

このとき、後世に必要な意味が \(S_{g+1}\) へ外在化されていなければ失われる。これが、意味を非永続なinteraction channelに残すのではなく**永続software artifactへ刻むことを要求するArtifact-Externalization Pressure**を生みうる。以下では簡潔さのためExternalization Pressureと呼ぶ。

一方、本研究ではこの圧力を固定前提のままにせず、部分的に操作可能な変数へ昇格させる。そのため、fresh agentへ

\[
(S_{g+1}, H_g)
\]

を可能な限り渡す **Maximal Observable Inheritance（MOI）** 条件を導入する。

MOIとArtifact-Fullの差は、

> **artifactへ外在化されなかったobservable ephemeral contextを次世代へ継承するか、失わせるか**

である。

したがって、

\[
\text{MOI} - \text{Artifact-Full}
\]

は、Externalization Bottleneck全体ではなく、そのうち**実験系が観測・保存可能なephemeral context lossの成分**を操作するcontrastとして解釈する。

重要なのは、MOIであっても \(K_g\) 全体は継承できないことである。したがってMOIは「真に完全なcontext継承」ではなく、後述する通り**Maximal Observable**な上限条件にすぎない。

### 3.2 Observation / Cognitive Bottleneck

第二のbottleneckは、

\[
S_{g+1} \rightarrow C_{g+1} \rightarrow K_{g+1}
\]

で生じる。

artifact上に情報が残っていても、次世代主体がそのすべてを一度に観測・保持・統合できるとは限らない。

巨大なrepositoryを扱う人間の開発者もcoding agentも、通常はartifact全体を一度に内部状態へロードするのではなく、必要なfileを検索し、型定義やtestを読み、呼び出し関係を辿りながら、局所的な観測からsystemの意味を再構成する。

したがって、

> **artifact全体へアクセス可能であること**

と、

> **artifact全体を同時に認知できること**

は区別されなければならない。

本稿では、artifact全体へのアクセス可能性を維持したまま、一時点で保持・処理可能なartifact由来情報を有限にする制約を **Observation / Cognitive Bottleneck** と呼ぶ。

この制約が反復的に作用すると、

> **artifactへ意味を外在化するだけでなく、有限な観測から再構成可能な形で外在化せよ**

という **Reconstruction Pressure** を生みうる。

したがって本稿では、

\[
\text{Session / History Loss}
\Rightarrow
\text{Externalization Pressure}
\]

と、

\[
\text{Finite Observation}
\Rightarrow
\text{Reconstruction Pressure}
\]

を異なるselection pressureとして扱う。

### 3.3 Artifact-Full：二つの研究軸を接続するhub condition

従来「Artifact-Full」と呼んでいた条件は、五条件設計では **Artifact-Full** と呼ぶ。

Artifact-Fullとは、

> **前世代のobservable interaction history \(H_g\) は継承せず、永続artifact \(S_g\) のみを継承する。一方、そのartifact自体には追加的なaccess制限・working-context制限を課さない条件**

である。

Artifact-Fullは「完全な世界」ではない。前世代のobservable ephemeral contextも、非observableな内部状態も失われる。

しかし、この条件は理論上きわめて重要である。なぜなら、Artifact-Fullを中心に、

\[
\text{MOI}
\rightarrow
\text{Artifact-Full}
\rightarrow
\text{Exposure-Limited}
\]

という**inheritance / transmission axis**と、

\[
\text{Artifact-Full}
\rightarrow
\text{Privileged-Retrieved}
\rightarrow
\text{Agent-Retrieved}
\]

という**observation / retrieval axis**を接続できるからである。

したがってArtifact-Fullは単なるbaselineではなく、**ILM-coreに近い伝達研究と、AIDD固有のbounded cognition研究を接続するhub condition**として位置づける。

### 3.4 Maximal Observable Inheritance：古典ILMのFullへの操作的近似

古典的ILMにおける理論的なFull-transmission controlをAIDDへそのまま実装することはできない。モデルのhidden stateや非出力の内部表象まで完全に取得し、次世代へコピーすることはできないためである。

そこで本研究では、実験系が観測・保存可能な範囲について最大限の継承を行う **Maximal Observable Inheritance（MOI）** を、Full-transmission controlへの操作的近似として置く。

MOIでも各世代はfresh agentである。

\[
Agent_g
\rightarrow
(S_{g+1},H_g)
\rightarrow
fresh\ Agent_{g+1}
\]

とし、同一agent sessionの継続は行わない。

また、全過去世代の履歴

\[
H_1 + H_2 + \cdots + H_g
\]

を無制限に渡す設計は採用しない。世代とともにhistory量そのものが増大し、context length・cost・lost-in-the-middle等が新たな交絡となるためである。基本単位は**直前世代のobservable history \(H_g\)** とし、より古い情報が必要なら、前世代がartifactまたは明示的な継承memoryへ残す必要がある。

したがってMOIはArtifact-Externalization Pressureをゼロにする条件ではない。MOIが緩和するのは、**直前のgenerational linkにおいてobservableな非repository情報をartifact以外のchannelでも継承できるようにすることによる圧力の一部**である。二世代以上先へ保持したい情報については、MOIでもartifactまたは次世代が再び明示的に外在化した情報へ移す必要がある。したがってMOIは、全歴史についての完全継承ではなく、**各generational linkにおけるMaximal Observable Transmission**への操作的近似として解釈する。

### 3.5 ILMとの対応：ILM-coreとAIDD extension

五条件設計により、古典ILMとの対応範囲をより明確にできる。

古典ILMを極端に単純化すれば、

\[
\text{Full Transmission}
\quad vs \quad
\text{Bottlenecked Transmission}
\]

という対照を考えられる。

本研究では、

\[
\boxed{
\text{MOI}
\quad vs \quad
\text{Exposure-Limited}
}
\]

がこの対照への最も近い操作的対応となる。ただしMOIはtrue fullではなく、observable informationに限った近似である。

一方、AIDDでは「artifact自体は完全に保存されているが、それを扱う主体が有限」という古典ILMには直接含まれない問題がある。そこで、

\[
\boxed{
\text{Artifact-Full}
\rightarrow
\text{Privileged-Retrieved}
\rightarrow
\text{Agent-Retrieved}
}
\]

を、ILM思想のAIDDへの拡張として位置づける。

したがって本研究は、

1. **ILM-core**：世代間に何が伝達されるか
2. **AIDD extension**：残されたartifactを有限主体がどう観測・探索するか

の二層を持つ。

ILMは「有限contextならartifactは必ずこう進化する」という答えを与える理論ではない。

> **有限な伝達を反復して通過することが、伝達される構造そのものへselection pressureを与える**

という着想を、本研究ではinheritance channelとobservation channelへ分解し、software artifact上で検証可能な形へ一般化する。

---

## 4. 中心概念：意味的再構成可能性と機能的継続可能性

### 4.1 二つの構成要素への分割

これまでの議論では、後続AIによる「再構成可能性（Reconstructability）」を単一の量として扱ってきた。しかし、この量は実際には二つの異なる能力を合成したものである。

- **意味的再構成（semantic reconstruction）**：後続のAIが、与えられた限られたコンテキストから、システムの制約・依存関係・振る舞いの意味を正しく推定できるか。
- **機能的継続（functional continuation）**：その理解に基づいて、実際の変更タスクを、既存機能を損なわずに遂行できるか。

この二つは独立でありうる。AIがシステムを正しく理解していても、コード生成能力自体が不十分で変更に失敗する場合がある。逆に、システムの意味を十分に理解していなくても、偶然テストを通過する変更を生成できる場合もある。本稿の哲学的な核心は「次世代のAIに意味が伝わるか」という問いにあるため、この二つを区別せず「タスクが成功したか」のみを測定すると、通常のcoding benchmarkに接近してしまい、ILMとの理論的対応が弱まる。

そこで本稿では、両者を分離して定義する。五条件化後は、単一のbudget \(B\) だけではMOI / AF / EL / PR / ARの評価環境を一意に表せない。そこで、inheritance・observation・retrieval条件を含む評価環境を \(e\) とし、簡略表記としてcondition \(c\) を用いる。

\[
M(S;e)
=
P(\text{将来の変更タスクが回帰を伴わず成功する} \mid S,e)
\]

または簡潔に

\[
M_c(S)
\]

を**機能的継続可能性**とする。意味的再構成そのものは、変更タスクの成功とは独立のsemantic probeによって

\[
R^{\mathrm{sem}}(S;e)
\quad\text{または}\quad
R_c^{\mathrm{sem}}(S)
\]

として定義する。

Stage 0.5のようにbudgetだけを操作したhistorical calibrationでは \(M_B(S),R_B^{\mathrm{sem}}(S)\) という表記を用いてよいが、五条件を横断する理論量としてはcondition / evaluation-environment indexed notationを用いる。

さらにlongitudinal experimentでは、artifactが**どの条件で育ったか**と、最終的に**どの環境で評価されるか**を分離しなければならない。育成条件を \(c_{\mathrm{train}}\)、評価環境を \(e_{\mathrm{eval}}\) とし、generation \(g\) のartifactを

\[
S_g^{[c_{\mathrm{train}}]}
\]

と表す。評価は、

\[
M\left(S_g^{[c_{\mathrm{train}}]};e_{\mathrm{eval}}\right),
\qquad
R^{\mathrm{sem}}\left(S_g^{[c_{\mathrm{train}}]};e_{\mathrm{eval}}\right)
\]

と書く。これにより、lineageが自分の育った環境で高いperformanceを示す**native performance**と、同じcommon environmentへ移したときにもartifact自体の差が残る**common-environment performance**を区別する。MOIのnative evaluationでは必要に応じて直前historyも入力に含め、

\[
M\left(S_g^{[MOI]},H_{g-1};e_{MOI}\right)
\]

のように明示する。したがって \(M_c(S_g)\) のような簡略記法は、育成条件と評価条件が文脈上明白な場合に限って用いる。

両者を分離して測定することで、「artifactから何が意味的に再構成されたか」を独立に観察できるようになり、ILMとの対応をより厳密にできる。

### 4.2 複合的評価枠組みとしての位置づけ

意味的再構成可能性と機能的継続可能性に加え、既存機能の保持や将来拡張性への耐性も含めた複合的な評価を検討する必要がある。ここで、以前の版で提示した線形結合

\[
F(S) = \alpha R(S) + \beta P_{\mathrm{functional}}(S) + \gamma E_{\mathrm{future}}(S) - \delta C_{\mathrm{context}}(S)
\]

について明確化しておく。この式は、**確定的な適応度関数として提案するものではなく、複数の選択圧を概念的に分離するための暫定的な表現**である。線形結合という形式の妥当性、各項の重み \(\alpha, \beta, \gamma, \delta\) の決定方法、既存機能保持を加点項として扱うか制約として扱うかについては、いずれも未解決である。

特に、既存機能の保持は本質的に**最低限満たすべき制約**である可能性が高い。テストの半分を壊してよいシステムに再構成可能性が高くても意味がない。したがって、実験設計としては、線形結合よりも次のような制約付き最適化の形で捉える方が自然でありうる。

\[
\max_S\ R^{\mathrm{sem}}(S)\ \text{ または }\ M(S)
\quad \text{subject to} \quad
P_{\mathrm{functional}}(S) \geq \theta
\]

本稿では、\(F(S)\) の線形結合表現と制約付き最適化表現のいずれが妥当かを事前に確定させず、パイロット実験を通じて経験的に検討すべき問題として明示的に開いておく。

ここでさらに、本稿が扱う「adaptation」と「quality」の関係を限定しておく必要がある。あるcontext条件のもとで特定の構造的形質が選択されることは、そのartifactが一般的なsoftware qualityの意味で「良くなった」ことを意味しない。

たとえば有限working contextへの適応によって、semantic localityや局所的な自己完結性が高まる一方で、冗長性・重複・局所最適化が増える可能性もある。逆に、高度な抽象化や共有化はFull条件では有利でも、有限な後続主体には再構成しにくい可能性がある。

したがって、

\[
\text{adaptation} \neq \text{general quality improvement}
\]

である。

一方、本研究では反復的継承という限定された観点から、二つの主要評価軸をすでに持つ。そこで、一般的なsoftware quality全体とは区別した操作的な**継承品質（inheritance quality）**を、

\[
Q(S;e)
=
\left(
R^{\mathrm{sem}}(S;e),
M(S;e)
\right)
\]

または簡潔に、

\[
Q_c(S)
=
\left(
R_c^{\mathrm{sem}}(S),
M_c(S)
\right)
\]

という二次元量として捉えることができる。

これは単一のquality scoreへ還元することを意図しない。むしろ二軸を分けて保持することで、

- \(R^{\mathrm{sem}}\uparrow,\ M\uparrow\)：意味を再構成しやすく、変更も成功しやすい
- \(R^{\mathrm{sem}}\uparrow,\ M\rightarrow\)：理解しやすくなったが変更成功にはまだ反映されていない
- \(R^{\mathrm{sem}}\downarrow,\ M\uparrow\)：system全体の意味を明示的には再構成できなくても、型・test・局所pattern等によって安全に変更しやすくなった可能性

といった異なる適応形態を区別できる。

したがって本研究が問うべきなのは「Limited Contextがartifactを良くするか」ではなく、**context bottleneckがどの構造的形質を選択し、その結果として \(R^{\mathrm{sem}}\) と \(M\) をどのように変化させるか**である。

### 4.3 研究の問いの再設定

反復的AIDDを自然に観察するだけでも、artifactが世代とともに変化すること自体は観測できる。しかし、その変化はmodel、初期architecture、task sequence、requirements、tests、context条件、偶然など、多数の要因が同時に作用した結果であり、**何がtrajectoryを形成したのか**を識別できない。

したがって本研究の目的は、単に

> 「AIDDを続けるとartifactがどう変わるか」

を記述することではない。

より根本的には、

> **反復的AIDDにおいて、software artifactのtrajectoryを形成するselection pressureを実験的に分解すること**

にある。

そのため、意味のground truthが既知であるSynthetic Software Worldを用い、model・task・task sequence・seed architecture・requirements・evaluator等を可能な限り統制した上で、context bottleneckの強さと形だけを操作する。

研究全体の問いは、概念的には次の順序を持つ。

\[
\text{What changes?}
\;\rightarrow\;
\text{What causes the change?}
\;\rightarrow\;
\text{Through what mechanism?}
\]

この中で本稿が特に検証したい仮説は、

> **世代間でobservable ephemeral contextが失われることは意味をartifactへ外在化するExternalization Pressureを、artifactを有限にしか観測できないことは限られた観測から再構成可能な形を要求するReconstruction Pressureを生み、それぞれが反復的継承を通じてartifact trajectoryへ系統的な差を形成する可能性がある。**

というものである。

したがって研究として中心に置くべき問いは、「モジュール性は高まるか」や「有限contextは良いか悪いか」ではなく、

> **反復的AIDDにおいて、何を世代間に残せるかというinheritance constraintと、残されたartifactをどれだけ同時に観測・探索できるかというcognitive constraintは、それぞれどのようなselection pressureとしてsoftware artifactへ作用し、その構造、および後続主体による意味的再構成可能性 \(R^{\mathrm{sem}}\) と機能的継続可能性 \(M\) をどのように変化させるのか。**

となる。

モジュール性、局所性、明示的契約、テスト、Spec、命名規則、ADR、冗長性等は、あらかじめ「良い構造」として目的変数へ埋め込まず、どの形質が差異的に保持・増幅されるかを事後的に検討する候補として位置づける。

### 4.4 selection pressureを主張するためのevidence chain

条件間でtrajectoryが異なるという事実だけでは、selection mechanismが実証されたとはみなさない。本研究でselection pressureをより強く主張するには、少なくとも次のevidence chainを区別して追跡する。

\[
\text{Condition}
\rightarrow
\text{Differential Preservation / Reconstruction}
\rightarrow
\text{Trait Change}
\rightarrow
\text{Environment-specific Advantage}
\]

すなわち、

1. あるinheritance / observation条件で特定のsemantic elementや構造が差異的に保持・再構成されること、
2. その差が世代反復を通じてartifact上の形質差へ蓄積すること、
3. common / reciprocal evaluationで、その形質差が対応する環境における継承品質の差へ結びつくこと、

を段階的に確認する。Stage 2のtrajectory差はこのchainの候補証拠であり、Stage 4のsemantic element / encoding-medium分析とreciprocal evaluationを組み合わせてmechanism claimを強める。

---

## 5. 実験設計

### 5.1 五条件設計：inheritanceとobservationを分解する

五条件は、単純な「FullからLimitedへ徐々に制約を強める一本の序列」として扱わない。

本稿では、少なくとも次の二つの研究軸を区別する。

#### Axis A：Inheritance / Transmission

\[
\text{MOI}
\rightarrow
\text{Artifact-Full}
\rightarrow
\text{Exposure-Limited}
\]

これは、**何が世代間に残るか**を操作する軸である。

#### Axis B：Observation / Retrieval

\[
\text{Artifact-Full}
\rightarrow
\text{Privileged-Retrieved}
\rightarrow
\text{Agent-Retrieved}
\]

これは、**残されたartifactを次世代主体がどのように観測・探索できるか**を操作する軸である。

Artifact-Fullが両軸のhub conditionとなる。

五条件は次の通りである。

| 条件 | 世代間に継承するもの | Artifact access | Working context | 情報選択 | 主に見る効果 |
|---|---|---|---|---|---|
| **Maximal Observable Inheritance（MOI）** | artifact + 直前世代のobservable history \(H_g\) | 全体 | 追加制限なし | 不要 | observable ephemeral context loss |
| **Artifact-Full（AF）** | artifactのみ | 全体 | 追加制限なし | 不要 | artifact-only inheritance baseline / hub |
| **Exposure-Limited（EL）** | artifactの選択subsetのみ | subsetのみ | static exposure budget \(B_{expose}\) | privileged static selector | irreversible transmission / exposure loss |
| **Privileged-Retrieved Limited（PR）** | artifactのみ | 全体へ再アクセス可能 | \(B_{work}\) | privileged controller | finite working cognition |
| **Agent-Retrieved Limited（AR）** | artifactのみ | 全体へ再アクセス可能 | \(B_{work}\) | agent自身 | retrieval / information-selection |

すべての条件で**fresh agent**を使用する。同一session継続を条件差として導入しない。

この五条件により、主要contrastは次のようになる。

#### C0：Observable-history loss / Externalization pressure

\[
D_{history}
=
Outcome_{MOI}
-
Outcome_{AF}
\]

MOIとAFはrepository accessとworking-context条件を共有し、違いは直前世代のobservable history \(H_g\) を追加継承するかどうかである。

この差は、**observable ephemeral contextが世代間で失われることの効果**を表す。長期trajectoryでAFの方がtest・type・Spec等への情報外在化を強めるなら、history lossがExternalization Pressureとして作用した可能性を示す。

#### C1：Working-set effect / Reconstruction pressure

\[
D_{work}
=
Outcome_{AF}
-
Outcome_{PR}
\]

AFとPRはartifact-only inheritanceとrepository全体へのaccess可能性を共有する。PRだけが有限working contextを持つ。

したがってこの差を、**privilegedな情報選択を与えたbest-case bounded-observation effect**として解釈する。AFとPRでmodel-call回数やepisode protocolまで異なれば純粋なworking-set effectではなくなるため、実験では可能な限りrunner・decision opportunityを揃え、残る差を有限working cognitionの効果へ寄せる。

#### C2：Retrieval-policy effect

\[
D_{retrieval}
=
Outcome_{PR}
-
Outcome_{AR}
\]

PRとARはartifact-only inheritance、full repository access、同一 \(B_{work}\)、同一exploration上限を共有する。違いは何を観測するかをprivileged controllerが決めるかagent自身が決めるかである。

#### C3：Recoverability / Exposure effect

\[
D_{recoverability}
=
Outcome_{PR}
-
Outcome_{EL}
\]

ELはepisode開始時に提示されなかったartifactへアクセスできず、PRは必要に応じてartifact全体へ再アクセスできる。ELの \(B_{expose}\) はepisode全体でアクセス可能なstatic artifact pool、PRの \(B_{work}\) は同時保持量であり、同一resourceではない。

この差は、**不可逆な情報欠落と、回復可能な有限認知帯域の差**を表す。ただしPRはepisode全体では \(B_{work}\) を超える累積unique informationを観測できる一方、ELは提示subset外を一度も観測できないため、C3はrecoverabilityだけでなく**cumulative exposure possibility**も含むcompound contrastである。純粋な一因子比較とは解釈しない。

補助的に、

\[
Outcome_{MOI}-Outcome_{EL}
\]

を古典ILMのFull-transmission vs bottlenecked-transmissionへの最も近い操作的contrastとして記録する。ただし、MOIがtrue full transmissionではないことを常に明記する。

### 5.1.1 Working-set条件の実装原則

PR / ARでは有限working contextを、

> episode中に累積で一定tokenまでしかrepositoryを読めない

という総アクセス量制限として実装しない。

artifact全体へのaccess可能性は維持し、

- ある時点のworking setを \(B_{work}\) 以下に制限
- 新規情報取得時に既存情報をevict
- evict済み情報の再取得を許可
- agentが明示的に持ち越すsummary / working memoryも \(B_{work}\) に算入
- exploration resource \(E_{max}\) は別管理

とする。

さらに、working-set manager上で情報をevictしても、provider側の会話履歴に過去のfile内容が残っていればmodelはそれを再参照でき、\(|W_t|\le B_{work}\) が形骸化する。したがってPR / ARの各reasoning stepは、**current \(W_t\) + bounded explicit memory + current taskからstatelessにmodel inputを再構築**し、provider thread、previous response参照、暗黙のmessage history等によってevicted artifact evidenceを保持してはならない。

### 5.1.2 MOIの実装原則

MOIで継承する \(H_g\) は、実験系がobservableかつ保存可能な情報に限定する。

候補：

- task instruction
- observable agent response
- tool calls / results
- explicit scratch / working note
- applied diff
- agentへ実際に返されたfeedback

非observableなhidden reasoningやmodel hidden stateを「継承した」とはみなさない。

また、原則として直前世代 \(H_g\) のみを渡し、全過去historyを無制限に累積しない。これにより、世代数に比例したcontext膨張を新しい独立変数として持ち込むことを避ける。

MOIのhistoryには、設計理由・working note等の**ephemeral information**だけでなく、tool resultとして取得したrepository断片やdiffなど、artifact内容の再提示も含まれうる。したがって \(H_g\) 内の各itemにはsource tagを付与し、少なくとも `ephemeral-rationale / task-feedback / artifact-redundant / mutation-metadata` を区別して保存する。これによりMOIの効果が非artifact文脈の継承によるものか、単なるartifact salience / re-exposureによるものかを後続ablationで検査できるようにする。


### 5.2 priorの統制

AIエージェントは事前学習によって強いpriorを持つ。単に人工的なドメインを用いるだけでは、「訓練データに全く存在しない」ことを保証できない。より頑健な設計として、以下を組み合わせる。

- ランダムに生成したAPIセマンティクス、シンボル名、依存関係規則を用いる。
- 機能的に等価だが構造の異なる複数のseed architectureをcounterbalanceする。
- 複数のモデルファミリーで同一実験を実施する。
- Zhu & Griffiths (2024) が提案する反復的in-context学習によるprior elicitation手法を用いて、実験開始前に各モデルが元来どのような設計・命名・モジュール分割を好むかを測定し、ゼロ世代のベースラインとする。

これにより、「モデルが最初から好っていた構造」と「反復伝達によって増幅・選択された構造」をある程度分離できる。

### 5.3 要求の質の統制：本稿が操作しない変数の明示

本研究が操作するのは、**世代間に何を継承するかというinheritance channel**（observable historyを継承するか、artifactのみか、artifact exposureをさらに制限するか）と、**継承されたartifactをどう観測・探索するかというobservation channel**（working-context、retrieval）の強さと形である。これに対し、各世代でAIへ提示される新規要求（held-out taskのvisible instruction）そのものの詳細度・明確さは、本研究が操作する変数ではない。

この区別は実験の初期段階で明確化する必要が生じた。予備的な実行観察において、AIが新しいoperationを実装する際、既存のinvariant（複数entityにまたがる制約）を壊さないという条件を、要求文が明示していない場合に見落とす事例が観察された。この観察は、有限context下での意味的再構成可能性を検証する上で重要な交絡因子を示唆する。すなわち、観測される失敗が

> (a) 過去のartifactから間接的な制約を読み取れなかったことに起因するのか
> (b) 単に今回の要求文が、守るべき制約について何も述べていなかったことに起因するのか

を区別できなければ、本研究の中心的主張（有限context下でのartifact adaptation）を誤って強める、あるいは弱める可能性がある。

要求文の詳細度・明確さそのものをどう設計すればAIの実装成功率が上がるかという問いは、要求工学（requirements engineering）ないしプロンプト設計の問題であり、本研究が中心に据える**文化的継承**（過去のartifactに外在化された意味の伝達）の問いとは異なる分析単位に属する。したがって本研究では、次の方針を取る。

- 全held-out taskのvisible instructionは、**統一されたスタイル**（簡潔な1〜2文、既存の制約への言及を含まない）に統制し、変数として操作しない。
- ただし、この統制が本研究の主張を歪めていないかを確認するため、対立仮説排除の段階（実験計画書のStage 3に相当）で、一部のtaskについてのみ要求文の詳細化（既存制約への明示的な言及を含む版）を用意し、結果の方向性が反転しないことを確認する頑健性チェックを行う。
- 要求文の詳細度そのものを独立変数として体系的に操作する研究は、本研究の範囲外とし、8節で将来課題として明示する。

### 5.4 従属変数とtrajectory評価

評価は最終世代の値だけでなく、**trajectory全体**を取る必要がある。Guo, Wu & Yiu (2026) はLLMの複数世代self-trainingにおいて、構成性が最初は上昇し後に低下する非単調な軌跡を報告しており、最終値のみを見ると選択過程を見誤る危険がある。Orlanski et al. (2026, SlopCodeBench) やShen et al. (2026, EvoCode-Bench) も、反復的な変更を通じた継続的な劣化を報告している。

主要な従属変数の候補は以下の通りである。

**主要指標（primary outcome）**
- 指定されたcontext条件・working-context budgetのもとでの機能的継続可能性 \(M(S;e)\) / \(M_c(S)\)
- 独立に測定された意味的再構成可能性 \(R^{\mathrm{sem}}(S;e)\) / \(R_c^{\mathrm{sem}}(S)\)
- 累積的な隠しテストの保持率
- 目標成功確率に到達するための最小working-context量または必要観測量

**副次指標（secondary outcome：構造的形質の候補）**
- 構造的劣化・複雑性の集中度
- 冗長性・重複度
- 変更の局所性（change locality）
- 依存関係の広がり（dependency breadth）
- Spec・テスト・型への情報外在化率

主要指標を先に固定し、副次指標を「どの構造的性質が予測変数となるか」を探索する変数として位置づけることで、「モジュール性が上がるはずだ」という規範を結果へ先取りして埋め込むことを避けられる。

### 5.5 共通環境での再評価：lineageの履歴とartifact自体の効果を分ける

longitudinal experimentで重要なのは、各lineageが「自分が育った条件」で高い性能を示すことだけではない。

たとえばMOI lineageはhistory付きで育っているため、最終世代でもhistory付き条件で評価すれば有利なのは当然である。一方Artifact-Full lineageは、historyなしでも必要な情報をartifactへ外在化する圧力を受け続けている可能性がある。

そこで、最終artifactを**共通の評価環境**へ持ち込み、lineage historyとは独立に評価する。

たとえば、

\[
S^{MOI}_{g}
\quad\text{and}\quad
S^{AF}_{g}
\]

をともに、

\[
fresh\ agent + artifact\ only + fixed\ observation\ condition
\]

へ投入し、同一の \(R^{sem}\) / \(M\) を測定する。

さらに、適応が一般的改善なのか特定環境への適応なのかを区別するため、AF-grown / PR-grown artifactをAF環境とPR環境の双方で評価するような**reciprocal evaluation**も有効である。これにより、artifactが育成環境を離れても優位を保つのか、あるいは特定のobservation regimeでのみ優位なのかを区別できる。

もしArtifact-Full lineageのartifactがこの共通条件で高い継承品質を示すなら、

> **Artifact-Full条件で育ったagentがその場で有利だったのではなく、その履歴によってartifact自体が単独で継承しやすい構造へ変化した**

という主張が強くなる。

逆にMOI lineageのartifactがhistoryを除去した途端に大きく性能を落とすなら、そのlineageは必要情報をartifact外のephemeral contextへ依存する方向へ進化した可能性がある。

この種の評価は、lineageが経験したselection environmentと、最終artifactの性質を分けるために重要である。

### 5.6 想定される結果パターン

五条件化後は、単純な「Full vs Limited」の優劣ではなく、inheritance channelとobservation channelのどのbottleneckが短期性能と長期trajectoryへ作用したかをcontrastごとに解釈する。

短期的には、MOIまたはArtifact-Fullがbounded条件より有利である可能性が高い。利用可能なartifact情報を一度に多く保持できるためである。しかし本研究で重要なのは、世代を重ねたときにその差が固定的であるかどうかである。

特に注目する仮説は**crossover**である。たとえば初期には

\[
M_{\mathrm{AF}}(S_g)
>
M_{c}(S_g),
\qquad
c \in \{\mathrm{EL},\mathrm{PR},\mathrm{AR}\}
\]

であっても、有限working contextや有限exposureのもとで変更され続けたlineageだけが、その制約下で再構成しやすいartifactへ変化していけば、後半で差が縮まり、場合によっては

\[
R^{\mathrm{sem}}_{c}(S_g)
>
R^{\mathrm{sem}}_{\mathrm{AF}}(S_g)
\]

あるいは

\[
M_{c}(S_g)
>
M_{\mathrm{AF}}(S_g)
\]

となる可能性がある。

このcrossoverが観測された場合、それは単に「LimitedがFullに追いついた」ことを意味しない。

> **制約にさらされ続けた履歴によって、その制約下で継承しやすいartifact構造が形成された可能性**

を示す。

ただし、crossoverを一般的な品質向上と同一視しない。Limited lineageで \(R^{\mathrm{sem}}\) や \(M\) が改善していても、冗長性・重複・局所最適化等の別の構造的コストが増加している可能性がある。そのため、trajectoryの解釈では4.2節の `adaptation ≠ general quality improvement` を維持し、主要二軸と構造的副次指標を分けて分析する。

また五条件の比較により、同じ「Limited」であっても結果が異なる可能性がある。たとえばExposure-Limitedだけが強い構造変化を示し、Privileged/Agent-Retrievedでは示さない場合、主たるselection pressureはworking-context capacityではなく不可逆な情報欠落に由来する可能性がある。逆にPrivileged-Retrievedでもtrajectoryが変わるなら、**情報への完全なアクセス可能性が維持されていても、有限な同時認知帯域そのものがselection pressureになりうる**ことを意味する。

さらにMOIとArtifact-Fullのtrajectory差は、Externalization Pressureを直接検討する上で重要である。たとえばArtifact-Full lineageでのみ、

- invariantのtest化
- implicit assumptionのtype化
- interface contractの明示
- namingの説明性向上
- ADR / Spec等への理由の外在化

が強く進み、MOI lineageではそれらが弱い場合、

\[
\text{Observable History Loss}
\rightarrow
\text{Externalization Pressure}
\rightarrow
\text{Artifact Structure}
\]

という因果鎖を支持する候補証拠となる。

いずれの結果も本研究の中心問いに答える。重要なのは「有限contextは良いか悪いか」ではなく、**どの種類の有限性が、どの構造的trajectoryを生じさせるか**である。

---

## 6. 関連研究との関係、および本稿の位置づけ

### 6.1 ILMにおける伝達・prior・トレードオフ

Smith, Kirby & Brighton (2003)、Griffiths & Kalish (2007)、Kirby, Cornish & Smith (2008)、Kirby, Tamariz, Cornish & Smith (2015) は、それぞれ反復学習の枠組み、Bayesian priorの役割、人間実験による累積的構造化、圧縮可能性と表現力のトレードオフを確立している。これらは本稿の理論的基盤である。

### 6.2 LLMを反復伝達の主体として扱う研究

Ren et al. (2024) はBayesian iterated learningの理論をLLMの反復進化に直接接続し、微弱なモデルバイアスが反復を通じて増幅されることを示した。Zhu & Griffiths (2024) は反復的in-context学習をMarkov連鎖として用い、LLMが内在的に持つpriorを抽出する方法を提案している。Kouwenhoven, Peeperkorn & Verhoef (2025) およびKouwenhoven et al. (2025) は、LLM間の人工言語創発において学習可能性の向上と退化的語彙の共存、また人間向けとLLM向けで最適化された言語が異なることを報告した。Acerbi & Stubbersfield (2023)、Perez et al. (2025)、Mohamed et al. (2025)、Ghafouri & Ferrara (2026) は、LLM間の反復的伝達においてcontent bias、attractorへの収斂、情報の選択的な生存と消失が生じることを示している。Guo, Wu & Yiu (2026) は、モデル自体の反復self-trainingにおいて構成性が非単調に変化することを報告している。

これらの研究群により、「LLMにIterated Learningを適用できること」「反復によってLLM由来のバイアスや出力特性が変化しうること」は、既に確立された知見と見なすべきである。したがって、本稿の新規性は**この接続自体には置かない**。

### 6.3 Repository-level context研究

Le Hai, Nguyen & Bui (2024)、Wu et al. (2024, Repoformer)、Zhang et al. (2024, Hierarchical Context Pruning)、Khatri (2026)、Qin & Xie (2026, Agent Retrieval Bench)、Liu et al. (2024, Lost in the Middle) は、「どの情報をどれだけAIに渡すべきか」を直接扱っている。これらが一貫して示すのは、**コンテキストは多ければ多いほどよいわけではない**という点である。特にKhatri (2026) の288-runアブレーションでは、永続的なcontext file戦略がcorrectnessへ与える測定可能な効果が見られなかった。これらの知見は、5.1節でaccess availability・working-context capacity・retrieval能力を分離する五条件設計に直接反映されている。

### 6.4 長期ソフトウェア進化のbenchmark研究

Orlanski et al. (2026, SlopCodeBench)、Chen et al. (2026, SWE-CI)、Le et al. (2025/2026, SWE-EVO)、Shen et al. (2026, EvoCode-Bench) は、coding agentが同一のコードベースを多数ターンにわたり変更したときの品質・保守性の推移を測定する研究であり、2025〜2026年にかけて急速に確立された分野である。特にSlopCodeBenchは、エージェント自身が過去に行った設計判断を次の要求で再利用させる点で、本稿の構想に最も近いbenchmarkである。ただし、これらの研究はいずれも**コンテキストボトルネックの強度を独立変数として操作していない**。

日本語圏の関連研究として、切貫 (2025) は設計文書を介したコード生成が、特に多ファイル規模の課題において開発者の修正工数を削減することを報告しており、Specを独立した伝達artifactとして扱う直接的な先行研究である。小川 (2025) は、訓練データに存在しない人工的なプログラミング言語仕様からでもLLMが小規模なコード生成を行えることを報告しており、priorを統制するための人工ドメイン設計において参考になる。

### 6.5 本稿が埋める空白

研究状況は次の2×2で整理できる。

| | **artifactを長期進化させない** | **artifactを長期進化させる** |
|---|---|---|
| **contextボトルネックを操作しない** | 一般的なcode benchmark | SlopCodeBench, SWE-CI, SWE-EVO, EvoCode-Bench |
| **contextボトルネックを操作する** | Repoformer, RepoExec, HCP, Context Files ablation | **本稿が狙う空白** |

したがって、本稿の新規性は次のように定式化する。

> 既存研究は、LLM間の反復伝達における言語・テキストの変容、およびcoding agentによる長期的software evolutionを、それぞれ個別に研究してきた。本稿は、Iterated Learning理論を理論的出発点とし、AIDDにおける「何を世代間に継承するか」というinheritance channelと、「残されたartifactを有限主体がどう観測・探索するか」というobservation channelを分離して操作する。これにより、observable ephemeral context loss、不可逆なartifact exposure、有限working context、retrievalという異なるselection pressureのもとで、反復的に継承されるsoftware artifactそのものがどのように進化するかを検証する枠組みを提示する。

新規性はさらに、ソフトウェアという対象の性質にも由来する。自然言語実験では意味表現の一部を失っても伝達が成功したとみなされる場合があるが、ソフトウェアでは既存要求への違反はregression testによって検出可能である。この性質により、ソフトウェアはILMのcompression–expressivityトレードオフを**実行可能な適応度地形（executable fitness landscape）**として実験できる、稀な対象になりうる。

---

## 7. Discussion：artifact adaptationが存在した場合の含意

本稿の理論的主張と実験設計が対象とするのは、まず第一に

> **何を世代間に継承するかというinheritance条件と、継承されたartifactをどう観測・探索できるかというobservation条件の違いが、artifactの構造的trajectoryに系統的な差を生じさせるか**

という、存在の検証である。以下の含意は、この現象が実証された場合に検討すべき二次的な論点として位置づける。

一般的な理解では、AI活用の巧拙は「AIをいかに賢く使うか」に還元されがちである。しかし、もしartifact adaptationが実証されれば、次のような再解釈が可能になる。

> AIを賢くすることではなく、AIが反復的に再構成しやすい環境を育てることが、AI駆動開発における持続的な能力の源泉となりうる。

この観点は、Anderson (2026, *The AI Codebase Maturity Model*) の主張と近い。同研究は100日間の実開発経験に基づき、AI駆動開発システムの「知能」はモデル単体にではなく、instructions・tests・metrics・feedback loopsといった周辺インフラにも宿ると論じている。ただしこれは単一事例のexperience reportであり、本稿が提起する実験設計は、この主張を**因果的・進化的に検証する**ための一つの経路になりうる。

もしこの含意が支持されれば、組織間の能力差は、採用しているAIモデルの性能差ではなく、**AIが再構成しやすい環境を時間をかけて蓄積してきたこと**に由来する可能性がある。ただし、これはあくまで実証結果を踏まえた上での派生的な含意であり、本稿の主目的ではない。


五条件化によって、この含意はさらに二種類の「歴史」に分解できる。

第一に、**artifact-only inheritanceの歴史**である。前世代のobservable interaction contextが失われ続ける環境では、後世に必要な意味がartifactへ外在化されなければ生き残れない。これはExternalization Pressureとして、test・type・Spec・interface等への情報移動を促す可能性がある。

第二に、**bounded observationの歴史**である。artifactに情報が存在していても、一度に全体を認知できない環境では、限られた観測から再構成できるsemantic locality、局所的契約、探索可能なnaming等が有利になる可能性がある。

したがって「歴史を持つsystem」の価値は、単なる世代数ではなく、

> **どのようなinheritance / observation bottleneckを反復的に通過してきたか**

によって異なる可能性がある。

さらに、この枠組みは「歴史を持つsystem」の価値についても、非神秘的な説明可能性を与える。長期間にわたってfresh agentから変更され続けたartifactでは、後続主体に理解されなかった暗黙知や壊れやすいdependencyが、失敗と修正を通じてtest・type・interface・naming・module boundary・Spec等へ再外在化されてきた可能性がある。

したがって、あるartifactの「歴史」に価値があるとすれば、それは履歴の長さ自体に価値が宿るからではない。

> **有限な後続主体による反復的変更を生き残る過程で、再構成・継続に有利な形質がartifactそのものへ蓄積された可能性**

にある。

Artifact-Full / Exposure-Limited / Privileged-Retrieved / Agent-Retrievedのartifact-only条件では、前世代のobservable interaction historyは継承されない。したがって、これらのlineageで世代を経るほど後続agentが扱いやすくなる現象が観測され、さらに5.5節の共通環境評価でもその優位が残るなら、その改善は継承artifactの側へ刻まれている可能性が高い。MOIでは \(H_g\) も継承されるため、その場での性能向上をartifact自体の適応と直ちに同一視せず、共通環境でhistoryを除去して再評価する必要がある。

さらに、もしartifact adaptationが実証された場合、その先にはもう一つ、本稿の実験設計そのものの前提に関わる問いが生じる。5.3節で述べた通り、本研究は要求（visible instruction）を、artifactとは異なり**選択圧を受けえない外的入力**として設計上固定している——要求は毎世代、人間（あるいは実験系）から一方向的に与えられるものであり、artifactのように前世代から引き継がれて変化していく対象ではない。この設計上の区別自体は、要求とartifactを独立した交絡因子として切り分けるために必要な前提であり、本稿はこれを変更しない。

しかし、もしcontext bottleneckがAIDDシステムを、特定の継承条件のもとでより再構成・変更しやすい構造へ導くことが実証されるならば、次の問いが自然に浮かび上がる。

> **実際のAIDD運用において、要求そのものもまた、artifactと同様に「継承され、進化していく対象」として扱うべきではないか。**

言い換えれば、要求を人間が固定テンプレートに毎回書き込む（あるいは実験のように統制されたスタイルで与える）という運用ではなく、要求の書き方・粒度・構造自体もAIが前世代から引き継ぎ、次世代へ向けて書き換えていくフローにした方が、AIDD全体としての持続的な生産性は高まるのではないか、という問いである。これは本稿が検証する対象（artifactの選択圧）そのものとは異なる、**要求記述プロセスの選択圧**という、さらに一段先の研究課題である。本稿の実験設計は要求を意図的に選択圧の外側に置くことで内部妥当性を確保しているため、この問いに直接答えることはできないが、artifact adaptationの実証は、この問いを検討する動機を与える最初のステップになりうる。

---

## 8. 限界と今後の課題

### 8.1 意味的再構成と機能的継続の測定可能性

4.1節で提案した \(R^{\mathrm{sem}}(S;e)\) と \(M(S;e)\) の分離は理論的には妥当だが、意味的再構成そのものを変更タスクの成功と独立に測定する方法は、さらなる精緻化が必要である。後続AIに仕様を説明させる課題の設計、正解との一致度の自動評価方法などは、パイロット実験を通じて検討すべき課題として残る。

### 8.2 複合評価枠組みの形式

4.2節で述べた通り、線形結合 \(F(S)\) と制約付き最適化のいずれが妥当かは未解決である。この選択は実験結果の解釈に影響するため、早期のパイロット実験で経験的に検討する必要がある。

### 8.3 priorの完全な排除は原理的に不可能である

5.2節で述べた統制手法を用いても、「訓練データに絶対に存在しない」ことを証明することは現実的に困難である。観察される構造化が真の差異的伝達可能性の結果か、事前学習された規範への収斂かの識別は、確率的な証拠の積み重ねによる推論にとどまらざるを得ない。

### 8.4 一般化可能性

本稿の実験設計は、特定のプログラミング言語・ドメイン・エージェント実装に依存する可能性がある。長期的には、複数のプログラミング言語、複数の問題ドメイン、複数のエージェントアーキテクチャにわたる頑健性の検証が必要である。

### 8.5 Maximal Observable Inheritanceは「完全なcontext」ではない

MOIは古典ILMのFull-transmission controlへの操作的近似であり、true full inheritanceではない。

実験系が保存できるのはobservable response、tool interaction、explicit note、feedback等に限られ、model hidden stateや非出力の内部表象を継承することはできない。したがって、

\[
MOI = K_g\text{の完全継承}
\]

とは解釈しない。

また、どこまでを \(H_g\) に含めるかによってMOIの強さは変わるため、含有項目を事前に固定し、全runで同じschemaを使用する必要がある。全過去historyの無制限累積はcontext量そのものを世代とともに増加させるため、主実験では直前世代のobservable historyを基本単位とする。

さらに、Artifact-FullおよびMOIが操作的に「全artifactを追加制限なく渡す条件」であり続けるには、各generationでrepository全体（MOIでは加えて直前history）がmodelの入力contextへ実際に収まる必要がある。したがって実験では、

\[
tokens(S_g)
+ tokens(H_{g-1})_{\mathrm{MOI}}
+ fixed\ overhead
+ reserved\ output
< model\ context\ capacity
\]

を**Operational-Full feasibility invariant**として監視する。これを超えた場合にsilent truncationして「Full」と呼び続けてはならず、事前に定めた停止・censoring・world-size再設計規則に従う必要がある。

### 8.6 要求の質という、本研究が扱わない変数

5.3節で述べた通り、本研究は各世代の新規要求（visible instruction）の詳細度・明確さを統制変数として固定し、操作しない。しかし、実際のAIDD運用においては、要求文自体の質（曖昧さ、既存制約への言及の有無、粒度）がAIの実装成功率に与える影響は無視できないと考えられる。

本研究の中心的関心は、あくまで**世代間に何を継承するかというinheritance channel**（observable historyを継承するか、artifactのみか、artifact exposureをさらに制限するか）と、**継承されたartifactをどう観測・探索するかというobservation channel**（有限working context、retrieval）を操作することで、他の要因（要求の質、prompt設計）との交絡を避け、主張を明確に保つことにある。しかし、これは「要求の質が重要でない」ことを意味しない。むしろ、有限context下でのartifact adaptationという現象と、要求文の質という現象は、独立した研究として体系的に比較・統合されるべき関係にある。将来的には、

> inheritance / observation bottleneckの強さ・形（本研究が操作する変数）と、新規要求の詳細度（本研究が統制する変数）は、AIの実装成功率に対してどのように相互作用するか

という問いを扱う後続研究が有望である。本研究はその前段として、要求の質を固定した条件下での基礎的な現象（artifact adaptationの有無）を先に確立することを目指す。

**否定的結果（null result）の解釈における留意点**：五条件化後は、null resultも一括して解釈しない。

- MOIとArtifact-Fullにtrajectory差がない場合、少なくとも今回実装した範囲のobservable history lossについてExternalization Pressureが弱い可能性がある。
- Artifact-FullとPrivileged-Retrievedに差がない場合、bounded working contextそのもののselection pressureが弱い可能性がある。
- Privileged-RetrievedとAgent-Retrievedに差がない場合、agent自身のretrieval能力が主要因ではない可能性がある。
- Privileged-RetrievedとExposure-Limitedに差がない場合、recoverabilityの有無が主要因ではない可能性がある。

ただし、いずれのnull resultについても、要求文の質やtask構成が条件差を覆い隠した可能性は残る。要求文が十分に明確であればinheritance / observation条件に関わらず実装でき、逆に要求文が曖昧すぎれば全条件で失敗するという状況では、selection pressureの差が観測されにくくなる。

この可能性を検討するため、否定的結果が得られた場合にはStage 3の頑健性チェック（要求文の詳細化等）を合わせて報告する。詳細化後も同じcontrastがnullなら、そのselection pressureが弱いという解釈は強まる。一方、詳細化後に差が現れるなら、当初のnull resultは要求文条件によって効果が覆い隠されていた可能性を再検討する。

---

## 9. 結論

本稿は、Iterated Learning Modelにおける問いの転回――「主体が対象に適応する」から「対象が主体に適応する」への転回――を、AIを用いた反復的software development（AIDD）の文脈へ一般化した。ただし、本稿が扱う過程は単一lineageにおける差異的伝達可能性であり、複数variantの並行的な繁殖競争としての厳密なDarwinian selectionではないことを明示した上で、この限定された意味においてselection pressureという語を用いた。

五条件化によって、AIDDにおける「有限context」は単一のtoken budgetではなく、二つの異なる研究軸へ分解される。

第一は、**何が世代間に残るか**というinheritance / transmission axisである。

\[
\text{MOI}
\rightarrow
\text{Artifact-Full}
\rightarrow
\text{Exposure-Limited}
\]

MOIは、artifactに加えて直前世代のobservable interaction history \(H_g\) をfresh agentへ継承する。Artifact-Fullではhistoryを失い、artifactだけが継承される。Exposure-Limitedではさらにartifactの一部だけが次世代へ伝達され、それ以外は回復不能となる。

第二は、**残されたartifactを有限主体がどう観測・探索するか**というobservation / retrieval axisである。

\[
\text{Artifact-Full}
\rightarrow
\text{Privileged-Retrieved}
\rightarrow
\text{Agent-Retrieved}
\]

Artifact-Fullではartifactに追加的な観測制限を課さない。Privileged-Retrievedではartifact全体へのaccess可能性を維持したままworking contextのみを有限にし、理想的なretrieval controllerが情報を選択する。Agent-Retrievedでは同じ有限working contextのもとでagent自身が探索を行う。

Artifact-Fullはこの二軸を接続するhub conditionである。

この整理により、少なくとも二種類のselection pressureを区別できる。

\[
\text{Observable Ephemeral Context Loss}
\rightarrow
\text{Externalization Pressure}
\]

すなわち、

> **後世に必要な意味はartifactへ外在化せよ**

という圧力と、

\[
\text{Bounded Artifact Observation}
\rightarrow
\text{Reconstruction Pressure}
\]

すなわち、

> **しかも有限な観測から再構成できる形で外在化せよ**

という圧力である。

本研究では全条件でfresh agent原則を維持し、同一session継続を独立変数へ混ぜない。MOIも、同じagentを継続させる条件ではなく、実験系が観測・保存可能な \(H_g\) を次世代のfresh agentへ追加伝達する条件である。またMOIはtrue full contextではなく、古典ILMのFull-transmission controlへの**Maximal Observableな操作的近似**として位置づける。

この五条件によって、古典ILMとの関係も明確になる。

\[
\text{MOI}
\quad vs \quad
\text{Exposure-Limited}
\]

は古典ILMのFull-transmission vs bottlenecked-transmissionへの最も近い操作的対応であり、

\[
\text{Artifact-Full}
\rightarrow
\text{Privileged-Retrieved}
\rightarrow
\text{Agent-Retrieved}
\]

は、永続artifactと有限なobserverを持つAIDD固有の拡張である。

中心的な評価軸として、後続主体がartifactから必要な意味をどれだけ再構成できるかを表す \(R^{\mathrm{sem}}\) と、既存機能を壊さず新しい変更を継続できる可能性を表す \(M\) を区別する。両者は一般的software quality全体ではなく、反復的に継承されるartifactとしての継承品質を操作的に捉える二つの軸であり、

\[
\text{adaptation} \neq \text{general quality improvement}
\]

という限定を維持する。

本研究の目的は、AIDDを続ければartifactが変化するという事実を単に記述することではない。Synthetic Software Worldでmodel・task・task sequence・requirements・evaluator等を統制しながらinheritance / observation条件を操作することで、

\[
\text{What changes?}
\rightarrow
\text{What causes the change?}
\rightarrow
\text{Through what mechanism?}
\]

という順序で、artifact trajectoryを形成するselection pressureを分解する。

本稿の中心命題は、次のように集約される。

> **反復的AIDDにおいて、何を世代間に残せるかというinheritance constraintと、残されたartifactをどれだけ同時に観測・探索できるかというcognitive constraintは、それぞれ異なるselection pressureとしてsoftware artifactへ作用しうる。前者は意味の外在化を、後者は有限観測からの再構成可能性を要求し、その反復がartifactの構造的trajectory、および後続主体による意味的再構成可能性と機能的継続可能性を系統的に変化させる可能性がある。**

高まるとも、劣化するとも、priorに吸収されるとも、あらかじめ決めない。「有限contextは良いか悪いか」ではなく、**どの種類の有限性が、どの構造的形質を選択し、その結果として \(R^{\mathrm{sem}}\) と \(M\) をどのように変化させるのか**を問う。

---

## 主要参考文献

- Smith, K., Kirby, S., & Brighton, H. (2003). Iterated Learning: A Framework for the Emergence of Language. *Artificial Life*, 9(4), 371–386.
- Griffiths, T. L., & Kalish, M. L. (2007). Language Evolution by Iterated Learning With Bayesian Agents. *Cognitive Science*, 31(3), 441–480.
- Kirby, S., Cornish, H., & Smith, K. (2008). Cumulative Cultural Evolution in the Laboratory. *PNAS*, 105(31), 10681–10686.
- Kirby, S., Tamariz, M., Cornish, H., & Smith, K. (2015). Compression and Communication in the Cultural Evolution of Linguistic Structure. *Cognition*, 141, 87–102.
- Ren, Y., Guo, S., Qiu, L., Wang, B., & Sutherland, D. J. (2024). Bias Amplification in Language Model Evolution: An Iterated Learning Perspective. *NeurIPS 2024*.
- Zhu, J.-Q., & Griffiths, T. L. (2024). Eliciting the Priors of Large Language Models using Iterated In-Context Learning. arXiv:2406.01860.
- Zheng, C., Zhang, J., Kembhavi, A., & Krishna, R. (2024). Iterated Learning Improves Compositionality in Large Vision-Language Models. *CVPR 2024*.
- Guo, D., Wu, J., & Yiu, S. M. (2026). Model Collapse as Cultural Evolution. arXiv:2605.23054.
- Kouwenhoven, T., Peeperkorn, M., & Verhoef, T. (2025). Searching for Structure: Investigating Emergent Communication with Large Language Models. *COLING 2025*, 9977–9991.
- Kouwenhoven, T., Peeperkorn, M., de Kleijn, R., & Verhoef, T. (2025). Shaping Shared Languages. *IJCAI 2025*.
- Acerbi, A., & Stubbersfield, J. M. (2023). Large Language Models Show Human-like Content Biases in Transmission Chain Experiments. *PNAS*, 120(44).
- Perez, J., Léger, C., Kovač, G., et al. (2025). When LLMs Play the Telephone Game. *ICLR 2025*.
- Mohamed, et al. (2025). LLM as a Broken Telephone. *ACL 2025*, 7493–7509.
- Ghafouri, & Ferrara (2026). Lost Before Translation. arXiv:2602.17674.
- Orlanski, et al. (2026). SlopCodeBench. arXiv:2603.24755.
- Chen, et al. (2026). SWE-CI. arXiv:2603.03823.
- Le, et al. (2025/2026). SWE-EVO. arXiv:2512.18470.
- Shen, et al. (2026). EvoCode-Bench. arXiv:2605.24110.
- Li, Zhang, & Hassan (2025). The Rise of AI Teammates in Software Engineering 3.0 (AIDev). arXiv:2507.15003.
- Anderson (2026). The AI Codebase Maturity Model. arXiv:2604.09388.
- Le Hai, N., Nguyen, D. M., & Bui, N. D. Q. (2024). On the Impacts of Contexts on Repository-Level Code Generation. arXiv:2406.11927.
- Wu, D., et al. (2024). Repoformer: Selective Retrieval for Repository-Level Code Completion. *ICML 2024*.
- Zhang, L., et al. (2024). Hierarchical Context Pruning. arXiv:2406.18294.
- Khatri, P. (2026). Do Context Files Help Coding Agents? arXiv:2607.27250.
- Qin, B., & Xie, Y. (2026). Agent Retrieval Bench. arXiv:2607.24882.
- Liu, N. F., et al. (2024). Lost in the Middle: How Language Models Use Long Contexts. *TACL*, 12, 157–173.
- 切貫弘之 (2025)．LLMを用いた開発における設計文書を介したコード生成の有効性に関する調査．第32回ソフトウェア工学の基礎ワークショップ論文集, 171–176.
- 小川秀人 (2025)．AIのAIによる人のためのプログラミング言語の検討．第32回ソフトウェア工学の基礎ワークショップ論文集, 193–194.

*（本文献一覧は添付レビュー資料の分類を基に整理したものである。査読投稿に用いる場合は、各出版社の正式書誌情報とarXivプレプリントの正式発表先を再確認すること。）*
