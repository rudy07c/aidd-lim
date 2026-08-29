/**
 * Ground Truth Model Checker
 *
 * G自体が自己矛盾していないか（S ⊨ G が原理的に成立可能か）を、
 * ground_truth.jsonを書いた段階で機械検証する。
 *
 * 検証内容: 初期状態からBFSで到達可能な全状態を列挙し、
 * すべての状態ですべてのinvariantが成立するかを確認する。
 * 違反する到達可能状態が1つでもあれば、Gの設計に誤りがある
 * （「守られていないinvariant」ではなく「Gそのものの矛盾」として扱う）。
 */

import { GroundTruth, StateId, EntityId } from "./schema";

type WorldSnapshot = Record<EntityId, StateId>;

function snapshotKey(s: WorldSnapshot): string {
  return JSON.stringify(s, Object.keys(s).sort());
}

function checkPrecondition(s: WorldSnapshot, cond: { entity: EntityId; state: StateId }): boolean {
  return s[cond.entity] === cond.state;
}

function checkInvariant(s: WorldSnapshot, inv: GroundTruth["invariants"][number]): boolean {
  if (!checkPrecondition(s, inv.condition)) return true; // 条件節が不成立ならinvariantは自動的に成立
  return checkPrecondition(s, inv.requires);
}

export interface ModelCheckResult {
  reachableStateCount: number;
  invariantViolations: Array<{
    invariantId: string;
    state: WorldSnapshot;
    reachedVia: string[]; // このstateへ至るoperation列
  }>;
  ok: boolean;
}

export function modelCheck(g: GroundTruth): ModelCheckResult {
  const initial: WorldSnapshot = {};
  for (const e of g.entities) initial[e.id] = e.initialState;

  const visited = new Map<string, WorldSnapshot>();
  const pathTo = new Map<string, string[]>();
  const queue: WorldSnapshot[] = [initial];
  visited.set(snapshotKey(initial), initial);
  pathTo.set(snapshotKey(initial), []);

  const violations: ModelCheckResult["invariantViolations"] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = snapshotKey(current);
    const path = pathTo.get(currentKey)!;

    // このstateで全invariantを検査
    for (const inv of g.invariants) {
      if (!checkInvariant(current, inv)) {
        violations.push({ invariantId: inv.id, state: { ...current }, reachedVia: path });
      }
    }

    // 全operationを試して次状態を展開
    for (const t of g.transitions) {
      const preconditionsOk = t.preconditions.every((p) => checkPrecondition(current, p));
      if (!preconditionsOk) continue;
      // 全effectsのfromStateが現在の状態と一致していることを確認（複合operation対応）
      const effectsApplicable = t.effects.every((e) => current[e.entity] === e.fromState);
      if (!effectsApplicable) continue;

      const next: WorldSnapshot = { ...current };
      for (const e of t.effects) next[e.entity] = e.toState;
      const nextKey = snapshotKey(next);
      if (!visited.has(nextKey)) {
        visited.set(nextKey, next);
        pathTo.set(nextKey, [...path, t.operationId]);
        queue.push(next);
      }
    }
  }

  return {
    reachableStateCount: visited.size,
    invariantViolations: violations,
    ok: violations.length === 0,
  };
}

// CLI実行用
if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const gtPath = process.argv[2] || path.join(__dirname, "ground_truth.json");
  const g: GroundTruth = JSON.parse(fs.readFileSync(gtPath, "utf-8"));
  const result = modelCheck(g);
  console.log(`Reachable states: ${result.reachableStateCount}`);
  if (result.ok) {
    console.log("OK: すべてのinvariantが全到達可能状態で成立している。");
  } else {
    console.log(`NG: ${result.invariantViolations.length} 件のinvariant違反が見つかった。`);
    for (const v of result.invariantViolations) {
      console.log(`  - ${v.invariantId} violated at state ${JSON.stringify(v.state)} (via [${v.reachedVia.join(" -> ")}])`);
    }
    process.exitCode = 1;
  }
}
