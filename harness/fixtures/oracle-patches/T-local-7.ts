// harness/fixtures/oracle-patches/T-local-7.ts
//
// Task: T-local-7 の正解実装パッチ
// Instruction: "Vok が 'dor' の状態から一気に 'nim' へ完全リセットする operation 'fullResetVok' を追加せよ。"
//
// groundTruthDelta:
//   O19: Vok(E1) q3(dor) -> q1(nim)
//   preconditions: [] (なし)
//
// fullResetVok は Vok を dor から nim へ一気にリセットする操作。
// E1=q3→q1 は I1/I4 の条件節を解除するため invariant 違反は生じない。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  return {
    "src/vok/fullResetVok.ts": `import { WorldState } from "../world";

/**
 * fullResetVok (= O19): Vok: dor -> nim (完全リセット)
 * no preconditions beyond fromState guard.
 */
export function fullResetVok(world: WorldState): WorldState {
  if (world.vok !== "dor") {
    throw new Error("fullResetVok: Vok must be in state 'dor'");
  }
  return { ...world, vok: "nim" };
}
`,
    "src/protocol_adapter.ts": registerNewOperation(
      currentProtocolAdapter,
      "./vok/fullResetVok",
      "fullResetVok"
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
