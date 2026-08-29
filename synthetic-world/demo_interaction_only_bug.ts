/**
 * demo_interaction_only_bug.ts
 *
 * レビュー指摘への対応: 旧 demo_order_dependency.ts の buggyTask は
 * 単体で既に不正なdeltaであり、単体validatorでも検出できる。これは
 * 「不正なtaskをどこに置くかで検出世代が変わる」ことしか示しておらず、
 * 累積validator固有の価値（単体検証では見つからない相互作用バグ）を
 * 実証していなかった。
 *
 * 本デモは、
 *   - task P 単体（G_0 + ΔP）は無矛盾
 *   - task Q 単体（G_0 + ΔQ）は無矛盾
 *   - しかし両方を適用した G_0 + ΔP + ΔQ は矛盾を持つ
 * という、単体validatorでは原理的に検出不可能なケースを構成する。
 *
 * 構造:
 *   entities: A(q1,q2,q3), B(q1,q2)
 *   invariant K: "A=q3 ならば B=q2"（explicit encoding: OA2のpreconditionが直接強制）
 *   G_0: OA1(A:q1->q2, no precondition), OA2(A:q2->q3, requires B=q2)
 *        B を動かす操作が存在しない → B は永久にq1のまま → A は q3 に到達不能
 *        （K は vacuously true）
 *
 *   ΔP: OB1(B:q1->q2, no precondition) を追加
 *     → G_0+ΔP単体では、B は q2 に到達できるようになるが、
 *       A が q3 に到達する経路（OA2、B=q2を要求）は依然としてKを守る
 *       （OA2自体がB=q2をチェックしてから遷移するため）→ 安全
 *
 *   ΔQ: OB2(B:q2->q1, no precondition。Bを後退させる操作) を追加
 *     → G_0+ΔQ単体では、B はそもそもq2に到達できない（ΔPがないため）
 *       ので OB2 の fromState 条件（B=q2）が満たされる状況が存在せず、
 *       OB2は事実上の死コード → 安全（vacuous）
 *
 *   G_0+ΔP+ΔQ: OB1でB=q2にし、OA1→OA2でA=q3にする（この時点でB=q2、K成立）。
 *     その後 OB2 で B を q1 へ後退させると、A=q3・B=q1 という
 *     **Kに違反する到達可能状態**が生まれる。
 *     この違反は ΔP（B=q2への到達路）と ΔQ（Bの後退）の両方が
 *     揃って初めて生じる、真の相互作用バグである。
 */

import { GroundTruth, GroundTruthDelta, applyDelta } from "./schema";
import { modelCheck } from "./model_checker";

const g0: GroundTruth = {
  worldId: "demo-interaction-world",
  entities: [
    { id: "A", states: ["q1", "q2", "q3"], initialState: "q1" },
    { id: "B", states: ["q1", "q2"], initialState: "q1" },
  ],
  operations: [
    { id: "OA1", parameters: [] },
    { id: "OA2", parameters: [] },
  ],
  transitions: [
    { operationId: "OA1", effects: [{ entity: "A", fromState: "q1", toState: "q2" }], preconditions: [] },
    {
      operationId: "OA2",
      effects: [{ entity: "A", fromState: "q2", toState: "q3" }],
      preconditions: [{ entity: "B", state: "q2" }],
    },
  ],
  dependencies: [{ id: "D1", from: "OA2", on: "B" }],
  invariants: [
    {
      id: "K",
      description: "A=q3 ならば B=q2",
      encoding: "explicit",
      condition: { entity: "A", state: "q3" },
      requires: { entity: "B", state: "q2" },
    },
  ],
};

const deltaP: GroundTruthDelta = {
  addOperations: [{ id: "OB1", parameters: [] }],
  addTransitions: [
    { operationId: "OB1", effects: [{ entity: "B", fromState: "q1", toState: "q2" }], preconditions: [] },
  ],
};

const deltaQ: GroundTruthDelta = {
  addOperations: [{ id: "OB2", parameters: [] }],
  addTransitions: [
    { operationId: "OB2", effects: [{ entity: "B", fromState: "q2", toState: "q1" }], preconditions: [] },
  ],
};

function report(label: string, g: GroundTruth) {
  const result = modelCheck(g);
  console.log(`${label}: reachable=${result.reachableStateCount}, ${result.ok ? "OK" : `NG (${result.invariantViolations.length})`}`);
  if (!result.ok) {
    for (const v of result.invariantViolations) {
      console.log(`  - ${v.invariantId} violated at ${JSON.stringify(v.state)} (via [${v.reachedVia.join(" -> ")}])`);
    }
  }
  return result.ok;
}

console.log("=== 単体検証（単体validatorでも検出可能な範囲） ===");
const okBase = report("G_0 (base)", g0);
const okP = report("G_0 + ΔP (task P alone)", applyDelta(g0, deltaP));
const okQ = report("G_0 + ΔQ (task Q alone)", applyDelta(g0, deltaQ));

console.log();
console.log("=== 累積検証（単体validatorでは検出不可能） ===");
const gBoth = applyDelta(applyDelta(g0, deltaP), deltaQ);
const okBoth = report("G_0 + ΔP + ΔQ (both applied)", gBoth);

console.log();
if (okBase && okP && okQ && !okBoth) {
  console.log("=> 確認: task P・task Qはそれぞれ単体では正解世界を壊さない（単体validatorはpassする）。");
  console.log("   しかし両方を組み合わせると矛盾が生じる。これは累積validatorでなければ検出できない、");
  console.log("   task同士の相互作用による設計ミスの実例である。");
} else {
  console.log("=> 想定外の結果（デモ設計の見直しが必要）。");
}
