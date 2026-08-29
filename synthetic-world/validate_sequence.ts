/**
 * validate_sequence.ts
 *
 * 単体task検証（validate_task_deltas.ts: G_0 + Δ_i を独立に検証）では、
 * 「task Aの後にBを入れると壊れる」という順序依存の矛盾を検出できない。
 * 本ファイルは task sequence 全体を累積的に適用しながら、各世代で
 * model checkerを通す。
 *
 *   G_0 --Δ_1--> G_1 --Δ_2--> G_2 --Δ_3--> ...
 *
 * 各 G_g で invariant 成立を検証する。この検証はtask sequenceの
 * counterbalance設計（計画書1.8節）にも直結する：同じtask集合でも
 * 順序によって、ある時点のG_gが矛盾を持つかどうかが変わりうる。
 */

import * as fs from "fs";
import * as path from "path";
import { GroundTruth, HeldOutTask, applyDelta, checkIdUniqueness, groundTruthsEquivalent } from "./schema";
import { modelCheck, ModelCheckResult } from "./model_checker";

export interface SequenceValidationStep {
  generationIndex: number; // 0 = G_0 (適用前), 1 = G_1 (task[0]適用後), ...
  taskId: string | null;   // G_0にはnull
  result: ModelCheckResult;
}

export interface SequenceValidationReport {
  ok: boolean; // 全世代でinvariant成立していればtrue
  steps: SequenceValidationStep[];
  firstFailureAt: number | null; // 最初に矛盾が生じたgenerationIndex（ok=trueならnull）
}

export function validateSequence(g0: GroundTruth, tasks: HeldOutTask[]): SequenceValidationReport {
  const steps: SequenceValidationStep[] = [];
  let current = g0;

  const initialResult = modelCheck(current);
  steps.push({ generationIndex: 0, taskId: null, result: initialResult });

  let firstFailureAt: number | null = initialResult.ok ? null : 0;

  tasks.forEach((task, i) => {
    current = applyDelta(current, task.groundTruthDelta);
    // ID uniqueness: 累積適用のたびに、重複IDが混入していないかを確認する。
    // これはmodel checkの前提条件（GがIDの一意性という意味で妥当なデータ構造であること）を保証する。
    const idReport = checkIdUniqueness(current);
    if (!idReport.ok) {
      throw new Error(
        `validateSequence: task ${task.taskId} 適用後にID重複を検出。` +
          `entities=${idReport.duplicateEntityIds}, operations=${idReport.duplicateOperationIds}, ` +
          `transitions=${idReport.duplicateTransitionOperationIds}, dependencies=${idReport.duplicateDependencyIds}, ` +
          `invariants=${idReport.duplicateInvariantIds}`
      );
    }
    const result = modelCheck(current);
    steps.push({ generationIndex: i + 1, taskId: task.taskId, result });
    if (!result.ok && firstFailureAt === null) {
      firstFailureAt = i + 1;
    }
  });

  return {
    ok: firstFailureAt === null,
    steps,
    firstFailureAt,
  };
}

function printReport(label: string, report: SequenceValidationReport) {
  console.log(`=== ${label} ===`);
  for (const step of report.steps) {
    const tag = step.taskId ?? "(initial G_0)";
    const status = step.result.ok ? "OK" : `NG (${step.result.invariantViolations.length} violation(s))`;
    console.log(`  G_${step.generationIndex} [after ${tag}]: reachable=${step.result.reachableStateCount}, ${status}`);
    if (!step.result.ok) {
      for (const v of step.result.invariantViolations.slice(0, 2)) {
        console.log(`    - ${v.invariantId} violated at ${JSON.stringify(v.state)} (via [${v.reachedVia.join(" -> ")}])`);
      }
    }
  }
  console.log(report.ok ? "  => sequence全体でOK" : `  => generationIndex=${report.firstFailureAt} で最初の矛盾`);
  console.log();
}

if (require.main === module) {
  const g0: GroundTruth = JSON.parse(fs.readFileSync(path.join(__dirname, "ground_truth.json"), "utf-8"));
  const tasks: HeldOutTask[] = JSON.parse(fs.readFileSync(path.join(__dirname, "heldout_tasks.json"), "utf-8"));

  // 順序A: heldout_tasks.jsonの記載順
  const reportA = validateSequence(g0, tasks);
  printReport("Sequence A (original order)", reportA);

  // 順序B: 逆順（counterbalanceの例。実際にはpartial orderに従う複数順列を試す）
  const reversedTasks = [...tasks].reverse();
  const reportB = validateSequence(g0, reversedTasks);
  printReport("Sequence B (reversed order)", reportB);

  // 「最終Gは順序不変」という主張を、仮定ではなく実際に検証する。
  // 配列連結の実装上、JSON表現の配列順は異なりうるため、
  // canonicalize（IDでsort）した上で比較する。
  let finalA = g0;
  for (const t of tasks) finalA = applyDelta(finalA, t.groundTruthDelta);
  let finalB = g0;
  for (const t of reversedTasks) finalB = applyDelta(finalB, t.groundTruthDelta);
  const equivalent = groundTruthsEquivalent(finalA, finalB);
  console.log(`最終G（順序A） と 最終G（順序B） は canonicalize後に等価か: ${equivalent}`);
  console.log();

  if (!reportA.ok || !reportB.ok || !equivalent) {
    process.exitCode = 1;
  }
}
