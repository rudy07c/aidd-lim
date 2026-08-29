// harness/fixtures/oracle-patches/T-crosscut-1.ts
//
// Task: T-crosscut-1 の正解実装パッチ
// Instruction: "Zef と Tal を同時に 'pex' へ進める新しい operation
//              'kindleBoth' を追加せよ。"
//
// groundTruthDelta:
//   O7: Zef(E2) q1(nim) -> q2(pex)  AND  Tal(E3) q1(nim) -> q2(pex)  [複合operation]
//   preconditions: [] (なし)
//
// 注記: このパッチは前世代のファイル群（currentFiles）に対して適用される。
//   前世代に T-local-1 が適用済みの場合、forceAdvanceVok も含む状態になっている。
//
// kindleBoth は Zef と Tal の両方を nim->pex へ同時に進める複合operation。
// 既存の zef/rules.ts には WorldState が既にインポートされているため、
// ファイルに追記するだけで型が使える。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentZefRules = files["src/zef/rules.ts"] ?? "";
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  const kindleBothCode = `
/**
 * kindleBoth (= O7): Zef: nim -> pex  AND  Tal: nim -> pex  [複合operation]
 * no preconditions beyond the fromState guards.
 *
 * 1 operationで複数entityを同時に変更するcross-entity operation。
 */
export function kindleBoth(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("kindleBoth: Zef must be in state 'nim'");
  }
  if (world.tal !== "nim") {
    throw new Error("kindleBoth: Tal must be in state 'nim'");
  }
  return { ...world, zef: "pex", tal: "pex" };
}
`;

  return {
    ...files,

    // zef/rules.ts に kindleBoth を追記（WorldState は既にインポート済み）
    "src/zef/rules.ts": currentZefRules + kindleBothCode,

    // protocol_adapter.ts に kindleBoth を登録
    "src/protocol_adapter.ts": registerOperation(
      currentProtocolAdapter,
      "./zef/rules",
      "kindleBoth"
    ),
  };
}

/**
 * protocol_adapter.ts に新しい operation 関数を登録する。
 * - import 行に関数名を追加
 * - operationTable に関数名を追加
 *
 * @param source 現在の protocol_adapter.ts のソースコード
 * @param moduleRelPath import元のモジュール相対パス（"./zef/rules" 等）
 * @param fnName 追加する関数名
 */
function registerOperation(source: string, moduleRelPath: string, fnName: string): string {
  // import 行に fnName を追加
  // 例: import { advanceZef1, advanceZef2 } from "./zef/rules";
  //  -> import { advanceZef1, advanceZef2, kindleBoth } from "./zef/rules";
  const importRegex = new RegExp(
    `(import\\s*\\{[^}]+)\\}\\s*from\\s*["']${escapeRegex(moduleRelPath)}["'];`
  );
  let result = source.replace(importRegex, (match, importList) => {
    // fnName が既に含まれていれば追加しない
    if (importList.includes(fnName)) return match;
    return `${importList.trimEnd()}, ${fnName} } from "${moduleRelPath}";`;
  });

  // operationTable に fnName エントリを追加
  // 「最後のエントリ,\n};」を「最後のエントリ,\n  fnName,\n};」に置換する。
  // advanceTal1 に依存せず、任意の最後エントリに対応できる。
  if (!result.includes(`  ${fnName},`)) {
    result = result.replace(
      /(\n  \w+,\n)(};)/,
      `$1  ${fnName},\n$2`
    );
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
