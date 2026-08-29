/**
 * semantic_locality.ts
 *
 * 発見5の指標化: 表面的局所性(surface locality)と意味的局所性(semantic
 * locality)の乖離を機械的に算出する。
 *
 * レビュー指摘への対応: 意味的局所性は GroundTruthDelta 単体からではなく、
 * (G_g + Δ_g) から求める必要がある。理由は、deltaに書かれていない
 * 既存のdistributed invariantやdependencyまで理解しないと正しく
 * 変更できない場合があるため（例: T-local-1のO6は、deltaにはE3への
 * precondition以外何も書かれていないが、そのpreconditionが必要である
 * こと自体は、既存invariant I1（Vok=dorならTal=pex, distributed）を
 * 理解して初めて分かる）。
 *
 * 定義:
 *   Surface locality(Δ) = Δが直接言及するentityの集合
 *     （addTransitionsのeffects.entity, preconditions.entity の和集合）
 *
 *   Semantic locality(G, Δ) = Surface localityを起点に、
 *     G（deltaも適用した後のG_{g+1}）のdependency/invariantグラフを
 *     BFSで辿って到達するentityの集合。
 *     具体的には、あるentity xが集合に含まれるなら、
 *       - xを condition または requires に持つinvariantのもう一方のentity
 *       - xに on または from（Dependency経由）で結びつくentity
 *       - xを preconditions に持つtransitionのeffects.entity（逆に、
 *         xの状態がpreconditionとして使われるoperationの、影響先entity）
 *     も集合に加える。
 *
 * 乖離度 = |Semantic locality| - |Surface locality|（0以上。大きいほど
 * 「見た目より広い意味理解が必要」なtask）
 */

import { GroundTruth, GroundTruthDelta, EntityId, applyDelta } from "./schema";

export function computeSurfaceLocality(delta: GroundTruthDelta): Set<EntityId> {
  const entities = new Set<EntityId>();
  for (const t of delta.addTransitions ?? []) {
    for (const e of t.effects) entities.add(e.entity);
    for (const p of t.preconditions) entities.add(p.entity);
  }
  for (const inv of delta.addInvariants ?? []) {
    entities.add(inv.condition.entity);
    entities.add(inv.requires.entity);
  }
  for (const dep of delta.addDependencies ?? []) {
    entities.add(dep.on);
  }
  return entities;
}

export function computeSemanticLocality(g0: GroundTruth, delta: GroundTruthDelta): Set<EntityId> {
  const gNext = applyDelta(g0, delta); // G_{g+1} = G_g + Δ_g
  const surface = computeSurfaceLocality(delta);
  const visited = new Set<EntityId>(surface);
  const queue = [...surface];

  while (queue.length > 0) {
    const x = queue.shift()!;

    // invariant経由: xが condition/requires のどちらかに現れるinvariantの、もう一方のentity
    for (const inv of gNext.invariants) {
      if (inv.condition.entity === x && !visited.has(inv.requires.entity)) {
        visited.add(inv.requires.entity);
        queue.push(inv.requires.entity);
      }
      if (inv.requires.entity === x && !visited.has(inv.condition.entity)) {
        visited.add(inv.condition.entity);
        queue.push(inv.condition.entity);
      }
    }

    // dependency経由: xを対象とする、またはxが対象とするentity
    for (const dep of gNext.dependencies) {
      if (dep.on === x) {
        // depはoperation->entityなので、そのoperationのeffectsのentityも辿る
        const t = gNext.transitions.find((t) => t.operationId === dep.from);
        if (t) {
          for (const e of t.effects) {
            if (!visited.has(e.entity)) {
              visited.add(e.entity);
              queue.push(e.entity);
            }
          }
        }
      }
    }

    // transition precondition経由: xが precondition に現れるtransitionの、effects entity
    // （xの状態が、他entityの遷移可否を左右する）
    for (const t of gNext.transitions) {
      const touchesXAsPrecondition = t.preconditions.some((p) => p.entity === x);
      if (touchesXAsPrecondition) {
        for (const e of t.effects) {
          if (!visited.has(e.entity)) {
            visited.add(e.entity);
            queue.push(e.entity);
          }
        }
      }
      // 逆方向: xがeffectsに現れるtransitionのpreconditionのentityも辿る
      // （xを変更するにはpreconditionのentityも理解する必要がある）
      const touchesXAsEffect = t.effects.some((e) => e.entity === x);
      if (touchesXAsEffect) {
        for (const p of t.preconditions) {
          if (!visited.has(p.entity)) {
            visited.add(p.entity);
            queue.push(p.entity);
          }
        }
      }
    }
  }

  return visited;
}

export interface LocalityReport {
  surfaceLocality: EntityId[];
  semanticLocality: EntityId[];
  divergence: number; // |semantic| - |surface|
}

export function computeLocalityReport(g0: GroundTruth, delta: GroundTruthDelta): LocalityReport {
  const surface = computeSurfaceLocality(delta);
  const semantic = computeSemanticLocality(g0, delta);
  return {
    surfaceLocality: [...surface].sort(),
    semanticLocality: [...semantic].sort(),
    divergence: semantic.size - surface.size,
  };
}

if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const g0: GroundTruth = JSON.parse(fs.readFileSync(path.join(__dirname, "ground_truth.json"), "utf-8"));
  const tasks = JSON.parse(fs.readFileSync(path.join(__dirname, "heldout_tasks.json"), "utf-8"));

  for (const task of tasks) {
    const report = computeLocalityReport(g0, task.groundTruthDelta);
    console.log(`${task.taskId} (type=${task.type}):`);
    console.log(`  surface locality  = {${report.surfaceLocality.join(", ")}}  (size=${report.surfaceLocality.length})`);
    console.log(`  semantic locality = {${report.semanticLocality.join(", ")}}  (size=${report.semanticLocality.length})`);
    console.log(`  divergence = ${report.divergence}`);
    console.log();
  }
}
