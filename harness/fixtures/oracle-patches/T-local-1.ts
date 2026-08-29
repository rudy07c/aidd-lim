// harness/fixtures/oracle-patches/T-local-1.ts
//
// Task: T-local-1 の正解実装パッチ
// Instruction: "Vok が 'nim' の状態から一度の操作で強制的に 'dor' まで進める
//              新しい operation 'forceAdvanceVok' を追加せよ。"
//
// groundTruthDelta:
//   O6: Vok(E1) q1(nim) -> q3(dor)
//   precondition: Tal(E3) = q2(pex)
//
// 設計注記: visibleInstructionには「preconditionが必要」とは書かれていないが、
//   I1（Vok=dor ならば Tal=pex）を守るためには precondition が必要。
//   これが「見た目はlocal、実は invariant-stressing に近い」設計（heldout_tasks.json 注記参照）。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  return {
    ...files,

    // vok/rules.ts に forceAdvanceVok を追加
    "src/vok/rules.ts": `import { WorldState } from "../world";

/**
 * advanceVok1 (= O1): Vok: nim -> pex, no preconditions
 */
export function advanceVok1(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error("advanceVok1: Vok must be in state 'nim'");
  }
  return { ...world, vok: "pex" };
}

/**
 * advanceVok2 (= O2): Vok: pex -> dor, requires Zef === "pex"
 * (D1: O2 depends on E2)
 */
export function advanceVok2(world: WorldState): WorldState {
  if (world.vok !== "pex") {
    throw new Error("advanceVok2: Vok must be in state 'pex'");
  }
  if (world.zef !== "pex") {
    throw new Error("advanceVok2: requires Zef to be 'pex'");
  }
  return { ...world, vok: "dor" };
}

/**
 * forceAdvanceVok (= O6): Vok: nim -> dor (直接ジャンプ), requires Tal === "pex"
 *
 * Invariant I1（Vok=dor ならば Tal=pex）を保つため、
 * Tal=pex のpreconditionが必要。
 */
export function forceAdvanceVok(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error("forceAdvanceVok: Vok must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("forceAdvanceVok: requires Tal to be 'pex'");
  }
  return { ...world, vok: "dor" };
}
`,

    // protocol_adapter.ts に forceAdvanceVok を登録
    "src/protocol_adapter.ts": `// protocol_adapter.ts
//
// これは「文化的に継承されるartifact」ではなく、実験世界の固定された
// 外部境界条件である（schema.ts の WorldProtocol コメント参照）。
// H(G) は internal な rules.ts / entity module 構造を一切知らず、
// このファイルがexportする関数だけを呼ぶ。
//
// worker AIは、内部構造（vok/zef/tal ディレクトリ、rules.ts の分割方法等）を
// 自由にリファクタしてよいが、この protocol_adapter.ts が定義する
// エクスポート名・振る舞いだけは保持しなければならない
// （Generation 0で確定した固定契約）。

import { WorldProtocol, OperationResult } from "../../schema";
import { WorldState, createInitialWorld } from "./world";
import { advanceVok1, advanceVok2, forceAdvanceVok } from "./vok/rules";
import { advanceZef1, advanceZef2 } from "./zef/rules";
import { advanceTal1 } from "./tal/rules";

// displayName -> 内部操作の対応表。この対応表自体は世代を経て
// リファクタされてよい（新operationの追加や、内部関数の再編を含む）。
// ただし各displayNameのキー文字列（"advanceVok1"等）はcontractの一部として固定。
const operationTable: Record<string, (w: WorldState) => WorldState> = {
  advanceVok1,
  advanceVok2,
  forceAdvanceVok,
  advanceZef1,
  advanceZef2,
  advanceTal1,
};

// entity display name -> WorldStateのプロパティ名
const entityFieldTable: Record<string, keyof WorldState> = {
  Vok: "vok",
  Zef: "zef",
  Tal: "tal",
};

export const protocol: WorldProtocol<WorldState> = {
  reset(): WorldState {
    return createInitialWorld();
  },

  applyOperation(world: WorldState, operationDisplayName: string): OperationResult<WorldState> {
    const fn = operationTable[operationDisplayName];
    if (!fn) {
      return { success: false, error: \`unknown operation: \${operationDisplayName}\` };
    }
    try {
      const next = fn(world); // immutable: 新しいWorldStateを返す
      return { success: true, newState: next };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  getEntityState(world: WorldState, entityDisplayName: string): string {
    const field = entityFieldTable[entityDisplayName];
    if (!field) throw new Error(\`unknown entity: \${entityDisplayName}\`);
    return world[field];
  },

  toAbstractSnapshot(world: WorldState): Record<string, string> {
    const stateReverse: Record<string, string> = { nim: "q1", pex: "q2", dor: "q3" };
    return {
      E1: stateReverse[world.vok],
      E2: stateReverse[world.zef],
      E3: stateReverse[world.tal],
    };
  },
};
`,
  };
}
