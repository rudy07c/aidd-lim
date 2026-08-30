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

  applyOperation(w: WorldState, operationName: string): WorldState {
    const op = operationTable[operationName];
    if (!op) {
      throw new Error(`Unknown operation: ${operationName}`);
    }
    return op(w);
  },

  getEntityState(w: WorldState, entityDisplayName: string): string {
    const field = entityFieldTable[entityDisplayName];
    if (!field) {
      throw new Error(`Unknown entity: ${entityDisplayName}`);
    }
    return w[field];
  },

  toAbstractSnapshot(w: WorldState): Record<string, string> {
    return {
      Vok: w.vok,
      Zef: w.zef,
      Tal: w.tal,
    };
  },
};
