# P6-3 v3 fixed protocol contract boundary audit

**Status:** post-v2 design audit; supersedes any assumption that category interleaving alone is sufficient  
**Parent:** `docs/p6_3_v3_selector_design_audit.md`  
**Scope:** offline design reasoning only; no paid/live execution is authorized

---

## 1. Finding

P6-3 v2のB2→B3急変をselector categoryだけで説明しようとすると不十分である。

frozen manifestをexactに確認すると、B3でもimplementation unitは0だった。

代表的なv2 exposure compositionは以下。

| arm | nominal | actual | type_definition | fixed_contract | test | implementation |
|---|---:|---:|---:|---:|---:|---:|
| B1 | 505 | 339 | 5 | 0 | 0 | 0 |
| B2 | 1011 | 824 | 5 | 2 | 0 | 0 |
| B3 | 2023 | 1875 | 5 | 4 | 3 | 0 |
| B4 | 3034 | task-dependent | 5 | 4 | 7 | 1–2 |
| AF | 4046 | 4046 | 5 | 4 | 7 | 9 |

したがってB2→B3で追加されたのはimplementationではなく、fixed contract後半とvisible test前半だった。

---

## 2. B2→B3 exact boundary units

outcome-blind structural auditで、11 primary M tasksすべてについてB2→B3で追加されるunitは同一だった。

1. `src/protocol_adapter.ts` L42–69 — `fixed_contract`
2. `src/protocol_adapter.ts` L70–80 — `fixed_contract`
3. `tests/rules.visible.test.ts` L1–18 — `test`
4. `tests/rules.visible.test.ts` L19–35 — `test`
5. `tests/rules.visible.test.ts` L36–51 — `test`

これらのboundary unitはtask-specific semantic relevance / dependency distanceで選ばれたものではなく、strict category front-loadingとpath/chunk順によって全task共通で入る。

---

## 3. fixed contract後半に何があるか

`src/protocol_adapter.ts`後半には、hidden evaluatorが依存する公開protocolの具体的シグネチャが初めて明示される。

```ts
export const protocol: WorldProtocol<WorldState> = {
  reset(): WorldState { ... },

  applyOperation(
    world: WorldState,
    operationDisplayName: string
  ): OperationResult<WorldState> { ... },

  getEntityState(
    world: WorldState,
    entityDisplayName: string
  ): string { ... },

  toAbstractSnapshot(
    world: WorldState
  ): Record<string, string> { ... }
};
```

一方hidden evaluator `H_G.test.ts`は、固定protocolだけを通じてrepositoryを評価し、例えば以下のように2引数で呼ぶ。

```ts
protocol.applyOperation(world, op)
```

P6-3 v2の低budgetで頻発した

```text
TS2554: Expected 1 arguments, but got 2
```

は、candidate repositoryがこの固定2引数contractと互換でない形へ変異したとき、hidden evaluatorのcompile時に検出されたものと整合する。

この診断自体はhistorical outcomeを用いるが、今後のselector weightを最適化する入力には使用しない。

---

## 4. system promptはcontractの存在を伝えたが、contract本体を伝えていなかった

P6-3 v2 live checkoutのOpenAI system promptは次を伝えていた。

```text
src/protocol_adapter.ts exports protocol: WorldProtocol.
The names/signatures reset, applyOperation, getEntityState, and
toAbstractSnapshot must remain compatible.
```

しかし、

- `applyOperation`が2引数であること
- 各引数の意味 / 型
- `getEntityState`も2引数であること
- `toAbstractSnapshot`がstate引数を取ること

などのexact signatureはsystem promptに含まれていなかった。

B1/B2ではprotocol_adapter後半もstatic exposureに含まれないため、workerは

> 「signatureを維持せよ」

とは指示される一方で、

> 「維持すべきsignatureが何か」

を必ずしも観測できない状態だった。

これはfinite transmission bottleneckそのものとは別のmeasurement/design issueである。

---

## 5. schema上の理論的位置づけ

`synthetic-world/schema.ts`の`WorldProtocol`コメントは、このinterfaceを明示的に

> 「文化的に継承されるartifact」ではなく、実験世界の固定された外部境界条件

と定義している。

また、実験全体について

```text
固定されるもの:
  WorldProtocol / context条件のルール / 評価方法そのもの /
  agentに何を継承させるかという実験規則
```

と記録している。

exact interfaceは次の通り。

```ts
export interface WorldProtocol<WorldStateHandle = unknown> {
  reset(): WorldStateHandle;
  applyOperation(
    state: WorldStateHandle,
    operationDisplayName: string
  ): OperationResult<WorldStateHandle>;
  getEntityState(
    state: WorldStateHandle,
    entityDisplayName: string
  ): string;
  toAbstractSnapshot(
    state: WorldStateHandle
  ): Record<EntityId, StateId>;
}
```

したがって、ELの`B_expose`がこの固定外部contractの可視性まで削っていたことは、ELの理論目的と整合しているか再検討が必要である。

---

## 6. whole `protocol_adapter.ts`を無料化してはいけない

ただし、解決策を

> `protocol_adapter.ts`全文をbudget外で常時見せる

とするのも不適切である。

同ファイルには固定contractだけでなく、

- operation display name -> internal function mapping (`operationTable`)
- entity display name -> internal field mapping (`entityFieldTable`)
- concrete adapter implementation

が含まれる。

これらはartifact-derived implementation informationであり、全文を無料化するとEL bottleneckから実質的なrepository evidenceを除外することになる。

問題は`protocol_adapter.ts`という**file単位で「fixed contract」と「evolving artifact implementation」が同居している**ことにある。

---

## 7. v3での第一候補: external contract specification separation

P6-3 v3では、selectorをfreezeする前に次の分離を第一候補とする。

### A. budget外の固定environment specification

workerへ全condition共通で、WorldProtocolの**公開contract surfaceだけ**を明示する。

含めるもの:

- method names
- arity
- argument roles / public typesとして必要な最小情報
- return shapeとしてcontract維持に必要な情報

含めないもの:

- operationTable
- entityFieldTable
- invariant / dependency情報
- hidden evaluator内容
- concrete operation implementation
- task-specific correct answer

これはartifact evidenceではなく、実験環境の固定interface specificationとして扱う。

### B. budget対象のartifact implementation

`src/protocol_adapter.ts`のimplementation bodyは引き続きartifactの一部としてEL budget対象にする。

つまり

```text
fixed external interface specification   -> common / non-budgeted
adapter implementation + repository      -> EL-selected / budgeted
```

と分ける。

---

## 8. blended selectorとの関係

PR #34で実装中のcategory-proportional blended selectorは、historical front-loadingの構造診断・比較prototypeとして価値がある。

しかし、offline auditするとprototypeでもexact `applyOperation(state, op)` contractを含むprotocol_adapter chunkは、多くのtaskでB4またはAFまで入らない。

したがって、**blended selectorだけではfixed-contract under-specificationを解決しない**。

v3の設計順序は次へ改める。

1. fixed external contract surfaceをartifact budgetから分離する
2. その上でartifact implementation用selectorをoutcome-blindに設計する
3. nestedness / composition / determinismをoffline検証する
4. selector + contract-specの組をversioned treatmentとしてfreezeする
5. fresh calibrationを行う

---

## 9. EL多水準化との関係

EL-tight / boundary / looseの多水準化は引き続き保留する。

現行v2では、

- capacity
- category composition
- fixed external contract observability

の3つが絡んでいた可能性がある。

これらを整理したfresh v3 calibrationでなおstable thresholdが残る場合にのみ、多水準ELを本実験へ導入する根拠として再検討する。

---

## 10. Current decision boundary

このauditで確定するのは以下のみ。

- v2 B2→B3はimplementation inclusion thresholdではなかった
- strict category front-loadingはcapacityとcompositionを交絡させていた
- fixed WorldProtocol contractのexact surfaceが低budgetで不可視だった
- WorldProtocolはschema上、evolving cultural artifactではなくfixed external boundary conditionである
- `protocol_adapter.ts`全文無料化はartifact information leakageを生むため採用しない
- v3では**external contract specification separation**をselector freezeより先に設計する
- PR #34のblended selectorは比較prototypeでありfinal selectorではない

まだ確定しない:

- exact contract-spec serialization
- contract-spec token accountingの扱い
- protocol_adapterのfile classification変更有無
- final blended selector algorithm
- v3 budget grid / repeats / selection margins
- EL多水準化

これらはpaid/live前に別途freezeする。

---

## 11. Provenance

- live source checkout: `62110faebc0fa748effa90cb0f44f7c05f479c10`
- frozen exposure manifest: `harness/frozen/p6-3-el-structural-freeze.json`
- v2 OpenAI prompt: `harness/src/agent-backend/openai/shared.ts`
- fixed protocol definition: `synthetic-world/schema.ts`
- adapter implementation: `synthetic-world/repository/src/protocol_adapter.ts`
- hidden contract consumer: `synthetic-world/hidden_regression_tests/H_G.test.ts`
- v3 selector prototype PR: #34
- latest v3 structural audit run: `36435041716`
- latest structural audit artifact: `10974499058`

This document does not authorize any provider call.
