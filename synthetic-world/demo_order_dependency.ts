/**
 * demo_order_dependency.ts
 *
 * 重要な理論的観察: GroundTruthDeltaは加算のみ（addOperations等）なので、
 * task集合全体を適用し終えた最終的な G は、適用順序に依存しない
 * （集合の合併は可換）。
 *
 * しかし、各世代 G_g が個別に無矛盾かどうかは順序に依存しうる。
 * なぜなら、ある時点で「どのdeltaまで適用済みか」が順序によって変わり、
 * 単独では矛盾を持ち込むdeltaが存在する場合、その矛盾が
 * 「どの世代で最初に検出されるか」が順序によって変わるからである。
 *
 * これは実験的には重要な意味を持つ: S_g は各世代ごとに G_g を満たす
 * 必要があるため（最終世代だけでなく）、矛盾が生じる世代そのものが
 * 実験条件（task sequence）に依存する。
 *
 * 本デモでは、意図的に「単独では矛盾を持ち込む」delta（旧版T-local-1の
 * バグ、E3依存preconditionを欠いたO6）と、無関係な無害delta（T-delayed-1の
 * O8）を使い、順序によって最初の矛盾検出世代が変わることを示す。
 */

import * as fs from "fs";
import * as path from "path";
import { GroundTruth, HeldOutTask } from "./schema";
import { validateSequence } from "./validate_sequence";

const g0: GroundTruth = JSON.parse(fs.readFileSync(path.join(__dirname, "ground_truth.json"), "utf-8"));

// 意図的に「単独で矛盾を持ち込む」delta（旧版のバグを再現）
const buggyTask: HeldOutTask = {
  taskId: "DEMO-buggy",
  type: "local",
  namingScheme: "A-obfuscated",
  visibleInstruction: "(demo) Vok を無条件で q1->q3 へ進める operation を追加",
  groundTruthDelta: {
    addOperations: [{ id: "OX", parameters: [] }],
    addTransitions: [
      {
        operationId: "OX",
        effects: [{ entity: "E1", fromState: "q1", toState: "q3" }],
        preconditions: [], // わざとE3依存を外し、I1を壊すdeltaにする
      },
    ],
  },
};

// 無害なdelta（T-delayed-1と同内容）
const harmlessTask: HeldOutTask = {
  taskId: "DEMO-harmless",
  type: "delayed_dependency",
  namingScheme: "A-obfuscated",
  visibleInstruction: "(demo) Zef を q2->q1 へ戻す operation を追加",
  groundTruthDelta: {
    addOperations: [{ id: "OY", parameters: [] }],
    addTransitions: [
      {
        operationId: "OY",
        effects: [{ entity: "E2", fromState: "q2", toState: "q1" }],
        preconditions: [],
      },
    ],
  },
};

console.log("順序X: [buggy, harmless] — 最初の矛盾は generationIndex=1 で検出されるはず\n");
const reportX = validateSequence(g0, [buggyTask, harmlessTask]);
for (const step of reportX.steps) {
  console.log(`  G_${step.generationIndex} [${step.taskId ?? "(initial)"}]: ${step.result.ok ? "OK" : `NG (${step.result.invariantViolations.length})`}`);
}
console.log(`  firstFailureAt = ${reportX.firstFailureAt}\n`);

console.log("順序Y: [harmless, buggy] — 最初の矛盾は generationIndex=2 で検出されるはず\n");
const reportY = validateSequence(g0, [harmlessTask, buggyTask]);
for (const step of reportY.steps) {
  console.log(`  G_${step.generationIndex} [${step.taskId ?? "(initial)"}]: ${step.result.ok ? "OK" : `NG (${step.result.invariantViolations.length})`}`);
}
console.log(`  firstFailureAt = ${reportY.firstFailureAt}\n`);

console.log(
  reportX.firstFailureAt !== reportY.firstFailureAt
    ? "=> 確認: 同一のtask集合でも、順序によって矛盾が最初に検出される世代が異なる。"
    : "=> 今回はfirstFailureAtが一致（デモ設計の見直しが必要）。"
);
