/**
 * validate_task_deltas.ts
 *
 * heldout_tasks.json の各 groundTruthDelta を ground_truth.json (= G_g) に適用し、
 * G_{g+1} = applyDelta(G_g, delta) が自己無矛盾か（全invariantが全到達可能状態で
 * 成立するか）を model_checker.ts で検証する。
 *
 * これは「task設計者自身が、正解世界を壊すtaskを誤って作っていないか」を
 * 事前に検出するための品質チェックであり、worker agentの評価とは別の用途である。
 */

import * as fs from "fs";
import * as path from "path";
import { GroundTruth, HeldOutTask, applyDelta } from "./schema";
import { modelCheck } from "./model_checker";

const g0: GroundTruth = JSON.parse(fs.readFileSync(path.join(__dirname, "ground_truth.json"), "utf-8"));
const tasks: HeldOutTask[] = JSON.parse(fs.readFileSync(path.join(__dirname, "heldout_tasks.json"), "utf-8"));

console.log(`Base G (${g0.worldId}):`);
const baseResult = modelCheck(g0);
console.log(`  reachable states: ${baseResult.reachableStateCount}, ok: ${baseResult.ok}`);
console.log();

for (const task of tasks) {
  const gNext = applyDelta(g0, task.groundTruthDelta);
  const result = modelCheck(gNext);
  console.log(`Task ${task.taskId} (${task.type}):`);
  console.log(`  G_{g+1} reachable states: ${result.reachableStateCount}`);
  if (result.ok) {
    console.log(`  OK: このtaskのgroundTruthDeltaは、正解世界の自己無矛盾性を壊さない。`);
  } else {
    console.log(`  NG: このtaskのgroundTruthDeltaは、正解世界に ${result.invariantViolations.length} 件のinvariant違反を持ち込む。`);
    for (const v of result.invariantViolations.slice(0, 3)) {
      console.log(`    - ${v.invariantId} violated at ${JSON.stringify(v.state)} (via [${v.reachedVia.join(" -> ")}])`);
    }
  }
  console.log();
}
