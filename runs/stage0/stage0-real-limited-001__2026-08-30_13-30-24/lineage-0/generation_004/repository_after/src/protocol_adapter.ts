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

interface OperationResult {
  success: boolean;
  newState?: WorldState;
  error?: string;
}

/**
 * WorldProtocol implementation
 */
export const protocol = {
  /**
   * Reset world to initial state
   */
  reset(): WorldState {
    return createInitialWorld();
  },

  /**
   * Apply a named operation to the current world state
   */
  applyOperation(operationName: string, currentState: WorldState): OperationResult {
    const operation = operationTable[operationName];
    if (!operation) {
      return {
        success: false,
        error: `Unknown operation: ${operationName}`,
      };
    }
    try {
      const newState = operation(currentState);
      return {
        success: true,
        newState,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  /**
   * Get the state of a specific entity
   */
  getEntityState(entityName: string, worldState: WorldState): string | undefined {
    const fieldName = entityFieldTable[entityName];
    if (!fieldName) {
      return undefined;
    }
    return worldState[fieldName];
  },

  /**
   * Convert to abstract snapshot format
   */
  toAbstractSnapshot(worldState: WorldState): Record<string, string> {
    return {
      Vok: worldState.vok,
      Zef: worldState.zef,
      Tal: worldState.tal,
    };
  },
};
