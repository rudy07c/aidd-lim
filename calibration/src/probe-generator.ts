// calibration/src/probe-generator.ts
//
// synthetic-world/ground_truth.json から5形式のsemantic probeを機械生成する。
//
// 生成形式:
//   - multiple_choice        : ある entity が特定状態にあるとき、どの operation が遷移を起こすか
//   - boolean                : ある状態がinvariantに違反するか / invariant stress reasoning
//   - set_selection          : あるoperationに「影響を与える」entityの集合
//   - graph_edge_prediction  : あるoperationが依存するentity（precondition根拠）
//   - state_transition_prediction : ある状態でoperationを実行するとどうなるか
//
// F5対策チェック（docs/stage0_5_plan.md 3.4節）:
//   生成したprobeについて、visible test file内に直接的なassertionが含まれるか
//   を静的に検査し、含まれるprobeには f5Warning: true フラグを立てる。

import * as fs from "fs";
import * as path from "path";
import {
  GroundTruth,
  NamingScheme,
  EntityId,
  StateId,
  OperationId,
  stateNameKey,
} from "../../synthetic-world/schema";

// ---- 公開型 ----

export type ProbeType =
  | "multiple_choice"
  | "boolean"
  | "set_selection"
  | "graph_edge_prediction"
  | "state_transition_prediction";

export interface GeneratedProbe {
  probeId: string;
  type: ProbeType;
  namingScheme: string;
  prompt: string;
  /** multiple_choice / set_selection / graph_edge_prediction / state_transition_prediction で使用 */
  options?: string[];
  /** multiple_choice: 正解の選択肢 */
  correctOptionId?: string;
  /** boolean / graph_edge_prediction / state_transition_prediction: 正解 */
  correctAnswer?: string | boolean;
  /** set_selection: 正解集合 */
  correctSet?: string[];
  /** probeの根拠となるsemantic element */
  derivedFrom: Record<string, unknown>;
  /** F5対策: visible testに直接的なassertionが存在し、答えが漏れている可能性 */
  f5Warning?: boolean;
  note?: string;
}

// ---- 命名スキームヘルパー ----

function eName(scheme: NamingScheme, entityId: EntityId): string {
  return scheme.entityNames[entityId] ?? entityId;
}

function sName(scheme: NamingScheme, entityId: EntityId, stateId: StateId): string {
  return scheme.stateNames[stateNameKey(entityId, stateId)] ?? stateId;
}

function oName(scheme: NamingScheme, operationId: OperationId): string {
  return scheme.operationNames[operationId] ?? operationId;
}

// ---- F5 静的チェック ----

/**
 * visible test ファイルを読み込み、指定した (operationName, entityName) ペアについて
 * "依存・precondition" を示す直接的なassertionが存在するかを静的チェックする。
 *
 * 判定ロジック:
 *   - operation名 + entity名 の両方がテストファイル内に共起していれば「漏洩の可能性あり」とする。
 *   - これはheuristic（完全な静的解析ではない）。疑わしいprobeにフラグを立てるだけで、
 *     最終的な採否は人間のレビューに委ねる（docs/stage0_5_plan.md 3.4節）。
 */
function buildF5Checker(visibleTestContent: string) {
  const lines = visibleTestContent.split("\n");

  return function checkF5(opName: string, entityName: string): boolean {
    // opNameとentityNameが同一のtest blockに共起するか（5行以内の近接を目安とする）
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(opName)) {
        // 前後5行以内にentityNameが出現するか
        const window = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 6));
        if (window.some((l) => l.includes(entityName))) {
          return true;
        }
      }
    }
    return false;
  };
}

// ---- プローブ生成 ----

export function generateProbes(
  g: GroundTruth,
  scheme: NamingScheme,
  visibleTestPath?: string
): GeneratedProbe[] {
  const probes: GeneratedProbe[] = [];
  let counter = 0;
  const nextId = (prefix: string) => `${scheme.schemeId}-${prefix}-${++counter}`;

  const checkF5 = visibleTestPath && fs.existsSync(visibleTestPath)
    ? buildF5Checker(fs.readFileSync(visibleTestPath, "utf8"))
    : () => false;

  const allOpNames = g.operations.map((o) => oName(scheme, o.id));
  const allEntityNames = g.entities.map((e) => eName(scheme, e.id));

  // ─────────────────────────────────────────
  // 1. multiple_choice: transition_from_state
  //    「entity が fromState にあるとき、entity を遷移させるoperationはどれか？」
  // ─────────────────────────────────────────
  for (const t of g.transitions) {
    for (const effect of t.effects) {
      const entityDisplayName = eName(scheme, effect.entity);
      const fromStateDisplayName = sName(scheme, effect.entity, effect.fromState);
      const toStateDisplayName = sName(scheme, effect.entity, effect.toState);
      const correctOp = oName(scheme, t.operationId);

      // distractors: 他のoperation名をすべて選択肢に含める（正解も含む）
      const options = [...allOpNames];

      probes.push({
        probeId: nextId("mc"),
        type: "multiple_choice",
        namingScheme: scheme.schemeId,
        prompt: `${entityDisplayName} が状態 '${fromStateDisplayName}' のとき、${entityDisplayName} を次の状態 '${toStateDisplayName}' へ遷移させる operation はどれか？`,
        options,
        correctOptionId: correctOp,
        derivedFrom: {
          kind: "transition_from_state",
          operationId: t.operationId,
          entity: effect.entity,
          fromState: effect.fromState,
          toState: effect.toState,
        },
      });
    }
  }

  // ─────────────────────────────────────────
  // 2. boolean: invariant_violation_check
  //    「condition が成立し requires が不成立の状態は invariant 違反か？」
  // ─────────────────────────────────────────
  for (const inv of g.invariants) {
    const condEntity = eName(scheme, inv.condition.entity);
    const condState = sName(scheme, inv.condition.entity, inv.condition.state);
    const reqEntity = eName(scheme, inv.requires.entity);
    const reqState = sName(scheme, inv.requires.entity, inv.requires.state);
    // 違反状態: requires のステートとは「異なる」ことを示す必要がある。
    // E3 は q1/q2 しかなく、requires=q2 の NOT は q1（nim）。
    // 一般化: requires.state以外の最初のstateを "not requires" とする。
    const entity = g.entities.find((e) => e.id === inv.requires.entity)!;
    const notReqState = entity.states.find((s) => s !== inv.requires.state) ?? "q1";
    const notReqStateName = sName(scheme, inv.requires.entity, notReqState);

    probes.push({
      probeId: nextId("bool"),
      type: "boolean",
      namingScheme: scheme.schemeId,
      prompt: `${condEntity} が '${condState}' で、${reqEntity} が '${notReqStateName}' である状態は、この世界のinvariantに違反するか？`,
      correctAnswer: true,
      derivedFrom: {
        kind: "invariant_violation_check",
        invariantId: inv.id,
        encoding: inv.encoding,
      },
      note: `${inv.encoding === "distributed" ? "distributed encoding: 直接的なguardは存在せず、複数preconditionの連鎖で成立する" : "explicit encoding: O" + " のpreconditionが直接この関係を強制している"}`,
    });
  }

  // ─────────────────────────────────────────
  // 3. boolean: invariant_stress_reasoning
  //    「新operationがguardなしでentityをdorにできた場合、invariantを壊す可能性があるか？」
  //    各invariantについて1問ずつ。
  // ─────────────────────────────────────────
  for (const inv of g.invariants) {
    const reqEntity = eName(scheme, inv.requires.entity);
    const condEntity = eName(scheme, inv.condition.entity);
    const condState = sName(scheme, inv.condition.entity, inv.condition.state);
    const reqState = sName(scheme, inv.requires.entity, inv.requires.state);

    // 「condEntityを直接condStateにする新operationがguardなしで追加された場合」という仮説
    probes.push({
      probeId: nextId("bool"),
      type: "boolean",
      namingScheme: scheme.schemeId,
      prompt: `もし新しいoperationが追加され、${reqEntity} の状態を確認せずに直接 ${condEntity} を '${condState}' へ遷移させられるようになった場合、既存のinvariantを壊す可能性があるか？`,
      correctAnswer: true,
      derivedFrom: {
        kind: "invariant_stress_reasoning",
        invariantId: inv.id,
        encoding: inv.encoding,
      },
      note: `正答には ${inv.id} (${inv.encoding}) の存在を認識していることが必要。${reqEntity}=${reqState} チェックを省略すると違反状態に到達しうる。`,
    });
  }

  // ─────────────────────────────────────────
  // 4. set_selection: dependency_scope
  //    「operationに影響を与えうるentityをすべて選べ（precond + effect両方）」
  // ─────────────────────────────────────────
  for (const dep of g.dependencies) {
    const t = g.transitions.find((tr) => tr.operationId === dep.from);
    if (!t) continue;

    const opDisplayName = oName(scheme, dep.from);
    const precondEntities = t.preconditions.map((p) => eName(scheme, p.entity));
    const effectEntities = t.effects.map((e) => eName(scheme, e.entity));
    const correctSet = [...new Set([...precondEntities, ...effectEntities])];

    // F5: preconditionを直接記述するvisible testが存在するか
    const f5 = precondEntities.some((en) => checkF5(opDisplayName, en));

    probes.push({
      probeId: nextId("set"),
      type: "set_selection",
      namingScheme: scheme.schemeId,
      prompt: `${opDisplayName} の実行に影響を与えうる entity をすべて選べ（preconditionとして要求するもの、または状態が変化するもの）。`,
      options: allEntityNames,
      correctSet,
      derivedFrom: {
        kind: "dependency_scope",
        dependencyId: dep.id,
        operationId: dep.from,
        onEntity: dep.on,
      },
      f5Warning: f5,
    });
  }

  // ─────────────────────────────────────────
  // 5. graph_edge_prediction: dependency_precondition
  //    「operationが依存するentityはどれか（precondition節を根拠に選べ）」
  // ─────────────────────────────────────────
  for (const dep of g.dependencies) {
    const opDisplayName = oName(scheme, dep.from);
    const depEntityName = eName(scheme, dep.on);

    // F5: preconditionをvisible testが直接述べているか
    const f5 = checkF5(opDisplayName, depEntityName);

    probes.push({
      probeId: nextId("edge"),
      type: "graph_edge_prediction",
      namingScheme: scheme.schemeId,
      prompt: `${opDisplayName} が実行されるために必要なpreconditionは、どの entity の状態に依存するか？`,
      options: allEntityNames,
      correctAnswer: depEntityName,
      derivedFrom: {
        kind: "dependency_precondition",
        dependencyId: dep.id,
        operationId: dep.from,
        onEntity: dep.on,
      },
      f5Warning: f5,
    });
  }

  // ─────────────────────────────────────────
  // 6. state_transition_prediction: transition_outcome
  //    「この状態でoperationを実行すると、対象entityはどうなるか」
  //    preconditionが満たされている場合（成功）と満たされていない場合（失敗）の2パターン。
  // ─────────────────────────────────────────
  for (const t of g.transitions) {
    for (const effect of t.effects) {
      const opDisplayName = oName(scheme, t.operationId);
      const entityDisplayName = eName(scheme, effect.entity);
      const fromStateName = sName(scheme, effect.entity, effect.fromState);
      const toStateName = sName(scheme, effect.entity, effect.toState);

      // 全stateのdisplay name（このentityの）+ "operation fails"
      const entity = g.entities.find((e) => e.id === effect.entity)!;
      const stateOptions = [
        ...entity.states.map((s) => sName(scheme, effect.entity, s)),
        "operation fails",
      ];

      // パターンA: preconditionがすべて満たされた状態での実行
      const precondDescription = t.preconditions.length === 0
        ? `${entityDisplayName} が '${fromStateName}'`
        : t.preconditions
            .map((p) => `${eName(scheme, p.entity)} が '${sName(scheme, p.entity, p.state)}'`)
            .concat([`${entityDisplayName} が '${fromStateName}'`])
            .join("、");

      probes.push({
        probeId: nextId("stp"),
        type: "state_transition_prediction",
        namingScheme: scheme.schemeId,
        prompt: `${precondDescription} の状態で ${opDisplayName} を実行すると、${entityDisplayName} の状態はどうなるか？`,
        options: stateOptions,
        correctAnswer: toStateName,
        derivedFrom: {
          kind: "transition_outcome_success",
          operationId: t.operationId,
          entity: effect.entity,
          fromState: effect.fromState,
          toState: effect.toState,
        },
      });

      // パターンB: preconditionが1つでもある場合、precondition不成立時の失敗を問う
      if (t.preconditions.length > 0) {
        const firstPrecond = t.preconditions[0];
        const precondEntityName = eName(scheme, firstPrecond.entity);
        const precondStateName = sName(scheme, firstPrecond.entity, firstPrecond.state);
        // preconditionを満たさない状態: precond entityのinitialState（多くの場合q1=nim）
        const precondEntity = g.entities.find((e) => e.id === firstPrecond.entity)!;
        const failState = precondEntity.states.find((s) => s !== firstPrecond.state) ?? precondEntity.initialState;
        const failStateName = sName(scheme, firstPrecond.entity, failState);

        probes.push({
          probeId: nextId("stp"),
          type: "state_transition_prediction",
          namingScheme: scheme.schemeId,
          prompt: `${precondEntityName} が '${failStateName}'（preconditionを満たさない）、${entityDisplayName} が '${fromStateName}' の状態で ${opDisplayName} を実行すると、${entityDisplayName} の状態はどうなるか？`,
          options: stateOptions,
          correctAnswer: "operation fails",
          derivedFrom: {
            kind: "transition_outcome_failure",
            operationId: t.operationId,
            entity: effect.entity,
            failedPrecondition: { entity: firstPrecond.entity, state: firstPrecond.state },
          },
        });
      }
    }
  }

  return probes;
}

// ---- CLI エントリポイント ----

if (require.main === module) {
  const swDir = path.join(__dirname, "../../synthetic-world");
  const g: GroundTruth = JSON.parse(
    fs.readFileSync(path.join(swDir, "ground_truth.json"), "utf8")
  );
  const schemes: NamingScheme[] = JSON.parse(
    fs.readFileSync(path.join(swDir, "naming_schemes.json"), "utf8")
  );
  const visibleTestPath = path.join(swDir, "repository/tests/rules.visible.test.ts");

  const outputPath = path.join(__dirname, "../fixtures/probe-bank.json");

  const allProbes: GeneratedProbe[] = [];
  for (const scheme of schemes) {
    const probes = generateProbes(g, scheme, visibleTestPath);
    allProbes.push(...probes);
    console.log(`\nScheme: ${scheme.schemeId} → ${probes.length} probes generated`);

    const f5Count = probes.filter((p) => p.f5Warning).length;
    if (f5Count > 0) {
      console.log(`  F5 warning: ${f5Count} probe(s) may have answers leaked in visible tests:`);
      for (const p of probes.filter((p) => p.f5Warning)) {
        console.log(`    ${p.probeId} [${p.type}] derivedFrom=${JSON.stringify(p.derivedFrom)}`);
      }
    } else {
      console.log(`  F5 check: no leakage detected`);
    }

    // 各タイプの集計
    const byType = new Map<string, number>();
    for (const p of probes) byType.set(p.type, (byType.get(p.type) ?? 0) + 1);
    for (const [type, count] of byType) {
      console.log(`  ${type}: ${count} probe(s)`);
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(allProbes, null, 2), "utf8");
  console.log(`\nTotal: ${allProbes.length} probes written to ${outputPath}`);
}
