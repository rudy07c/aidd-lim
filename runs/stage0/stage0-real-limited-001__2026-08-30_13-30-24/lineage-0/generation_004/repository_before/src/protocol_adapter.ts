// protocol_adapter.ts
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
import { advanceZef1, advanceZef2, resetZef, fastTrackZef } from "./zef/rules";
import { advanceTal1 } from "./tal/rules";
import { kindleBoth } from "./kindleBoth/rules";

// displayName -> 内部操作の対応表。この対応表自体は世代を経て
// リファクタされてよい（新operationの追加や、内部関数の再編を含む）。
// ただし各displayNameのキー文字列（"advanceVok1"等）はcontractの一部として固定。
const operationTable: Record<string, (w: WorldState) => WorldState> = {
  advanceVok1,
  advanceVok2,
  forceAdvanceVok,
  advanceZef1,
  advanceZef2,
  fastTrackZef,
  resetZef,
  advanceTal1,
  kindleBoth,
};

// entity display name -> WorldStateのプロパティ名
const entityFieldTable: Record<string, keyof WorldState> = {
  Vok: "vok",
  Zef: "zef",
  Tal: "tal",
};

// 内部用のWorldState保持
let world: WorldState = createInitialWorld();

/**
 * reset: WorldStateを初期状態にリセット
 */
export function reset(): void {
  world = createInitialWorld();
}

/**
 * applyOperation: displayNameで指定されたoperationを適用
 */
export function applyOperation(displayName: string): OperationResult {
  const fn = operationTable[displayName];
  if (!fn) {
    return { success: false, error: `Unknown operation: ${displayName}` };
  }
  try {
    world = fn(world);
    return { success: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}

/**
 * getEntityState: entityのcurrent stateを返す
 */
export function getEntityState(entityName: string): string | null {
  const field = entityFieldTable[entityName];
  if (!field) return null;
  return world[field];
}

/**
 * toAbstractSnapshot: internal WorldStateを外部formatに変換
 */
export function toAbstractSnapshot(): Record<string, string> {
  return {
    vok: world.vok,
    zef: world.zef,
    tal: world.tal,
  };
}

// WorldProtocol contract
export const protocol: WorldProtocol = {
  reset,
  applyOperation,
  getEntityState,
  toAbstractSnapshot,
};
