// harness/fixtures/oracle-patches/T-local-4.ts
//
// Task: T-local-4 の正解実装パッチ
// Instruction: "Vok が 'dor' に達した後に 'pex' へ一段階戻す operation 'recoverVok' を追加せよ。"
//
// groundTruthDelta:
//   O16: Vok(E1) q3(dor) -> q2(pex)
//   preconditions: [] (なし)
//
// recoverVok は Vok を dor から pex へ戻す逆進操作。
// E1=q3→q2 は I1（Vok=dor→Tal=pex）・I4（Vok=dor→Osk=pex）の条件節を解除するため
// invariant 違反は生じない。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  return {
    "src/vok/recoverVok.ts": `import { WorldState } from "../world";

/**
 * recoverVok (= O16): Vok: dor -> pex, no preconditions beyond fromState guard.
 */
export function recoverVok(world: WorldState): WorldState {
  if (world.vok !== "dor") {
    throw new Error("recoverVok: Vok must be in state 'dor'");
  }
  return { ...world, vok: "pex" };
}
`,
    "src/protocol_adapter.ts": registerNewOperation(
      currentProtocolAdapter,
      "./vok/recoverVok",
      "recoverVok"
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
