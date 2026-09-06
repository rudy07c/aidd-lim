// harness/fixtures/oracle-patches/T-local-3.ts
//
// Task: T-local-3 の正解実装パッチ
// Instruction: "Fen が 'pex' の状態から 'nim' へ戻す operation 'resetFen' を追加せよ。"
//
// groundTruthDelta:
//   O15: Fen(E4) q2(pex) -> q1(nim)
//   preconditions: [] (なし)
//
// resetFen は Fen を pex から nim へ戻す単純な逆進操作。
// precondition は fromState guard のみ（Fen=pex であること）。
// I3（Fen=dor ならば Osk=pex）は q3（dor）にのみ適用されるため、
// q2→q1 の遷移では invariant 違反が生じない。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  return {
    "src/fen/resetFen.ts": `import { WorldState } from "../world";

/**
 * resetFen (= O15): Fen: pex -> nim, no preconditions beyond fromState guard.
 */
export function resetFen(world: WorldState): WorldState {
  if (world.fen !== "pex") {
    throw new Error("resetFen: Fen must be in state 'pex'");
  }
  return { ...world, fen: "nim" };
}
`,
    "src/protocol_adapter.ts": registerNewOperation(
      currentProtocolAdapter,
      "./fen/resetFen",
      "resetFen"
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
