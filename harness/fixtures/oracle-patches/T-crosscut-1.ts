// harness/fixtures/oracle-patches/T-crosscut-1.ts
//
// Task: T-crosscut-1 の正解実装パッチ
// Instruction: "Zef と Tal を同時に 'pex' へ進める新しい operation
//              'kindleBoth' を追加せよ。"
//
// groundTruthDelta:
//   O13: Zef(E2) q1(nim) -> q2(pex)  AND  Tal(E3) q1(nim) -> q2(pex)  [複合operation]
//   preconditions: [] (なし)
//
// kindleBoth は Zef と Tal の両方を nim->pex へ同時に進める複合operation。
//
// 実装方針: 既存 zef/rules.ts は変更せず、新規ファイルを作成して登録する。
//   これにより full/limited 両コンテキストで動作する（既存ファイルへの依存なし）。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  return {
    // 新しい operation を独立したファイルに定義
    "src/zef/kindleBoth.ts": `import { WorldState } from "../world";

/**
 * kindleBoth (= O13): Zef: nim -> pex  AND  Tal: nim -> pex  [複合operation]
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
`,

    // protocol_adapter.ts に新しい import と operationTable エントリを追加
    "src/protocol_adapter.ts": registerNewOperation(
      currentProtocolAdapter,
      "./zef/kindleBoth",
      "kindleBoth"
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
