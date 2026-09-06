// harness/fixtures/oracle-patches/T-delayed-1.ts
//
// Task: T-delayed-1 の正解実装パッチ
// Instruction: "（世代16で提示）Zef に対して、'pex' から 'nim' へ戻す operation
//              'resetZef' を追加せよ。"
//
// groundTruthDelta:
//   O14: Zef(E2) q2(pex) -> q1(nim)
//   preconditions: [] (なし)
//
// resetZef は Tal には触れないため、Talの単調性（非後退性）を壊さない。
// ただし導入後は Zef の状態空間が広がる（pex->nim が可能になる）。
//
// 実装方針: 既存 zef/rules.ts は変更せず、新規ファイルを作成して登録する。
//   これにより full/limited 両コンテキストで動作する（既存ファイルへの依存なし）。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  return {
    // 新しい operation を独立したファイルに定義
    "src/zef/resetZef.ts": `import { WorldState } from "../world";

/**
 * resetZef (= O14): Zef: pex -> nim (リセット操作)
 * no preconditions.
 *
 * Talには触れないため、Talの単調性（非後退性）は保たれる。
 */
export function resetZef(world: WorldState): WorldState {
  if (world.zef !== "pex") {
    throw new Error("resetZef: Zef must be in state 'pex'");
  }
  return { ...world, zef: "nim" };
}
`,

    // protocol_adapter.ts に新しい import と operationTable エントリを追加
    "src/protocol_adapter.ts": registerNewOperation(
      currentProtocolAdapter,
      "./zef/resetZef",
      "resetZef"
    ),
  };
}

function registerNewOperation(source: string, moduleRelPath: string, fnName: string): string {
  if (source.includes(`from "${moduleRelPath}"`)) {
    return addToOperationTable(source, fnName);
  }

  const lastImportMatch = source.match(/^import .+;$/gm);
  if (lastImportMatch) {
    const lastImport = lastImportMatch[lastImportMatch.length - 1];
    const insertAfter = source.lastIndexOf(lastImport) + lastImport.length;
    source =
      source.slice(0, insertAfter) +
      `\nimport { ${fnName} } from "${moduleRelPath}";` +
      source.slice(insertAfter);
  }

  return addToOperationTable(source, fnName);
}

function addToOperationTable(source: string, fnName: string): string {
  if (source.includes(`  ${fnName},`)) return source;
  return source.replace(
    /(\n  \w+,\n)(};)/,
    `$1  ${fnName},\n$2`
  );
}
