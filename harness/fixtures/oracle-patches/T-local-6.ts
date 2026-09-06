// harness/fixtures/oracle-patches/T-local-6.ts
//
// Task: T-local-6 の正解実装パッチ
// Instruction: "Fen が 'dor' に達した後に 'pex' へ一段階戻す operation 'recoverFen' を追加せよ。"
//
// groundTruthDelta:
//   O18: Fen(E4) q3(dor) -> q2(pex)
//   preconditions: [] (なし)
//
// recoverFen は Fen を dor から pex へ戻す逆進操作。
// E4=q3→q2 は I3（Fen=dor→Osk=pex）・I6（Fen=dor→Tal=pex）の条件節を解除するため
// invariant 違反は生じない。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  return {
    "src/fen/recoverFen.ts": `import { WorldState } from "../world";

/**
 * recoverFen (= O18): Fen: dor -> pex, no preconditions beyond fromState guard.
 */
export function recoverFen(world: WorldState): WorldState {
  if (world.fen !== "dor") {
    throw new Error("recoverFen: Fen must be in state 'dor'");
  }
  return { ...world, fen: "pex" };
}
`,
    "src/protocol_adapter.ts": registerNewOperation(
      currentProtocolAdapter,
      "./fen/recoverFen",
      "recoverFen"
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
