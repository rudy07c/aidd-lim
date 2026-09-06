// harness/fixtures/oracle-patches/T-local-5.ts
//
// Task: T-local-5 の正解実装パッチ
// Instruction: "Zef が 'dor' に達した後に 'pex' へ一段階戻す operation 'recoverZef' を追加せよ。"
//
// groundTruthDelta:
//   O17: Zef(E2) q3(dor) -> q2(pex)
//   preconditions: [] (なし)
//
// recoverZef は Zef を dor から pex へ戻す逆進操作。
// E2=q3→q2 は I2（Zef=dor→Tal=pex）・I5（Zef=dor→Osk=pex）の条件節を解除するため
// invariant 違反は生じない。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  return {
    "src/zef/recoverZef.ts": `import { WorldState } from "../world";

/**
 * recoverZef (= O17): Zef: dor -> pex, no preconditions beyond fromState guard.
 */
export function recoverZef(world: WorldState): WorldState {
  if (world.zef !== "dor") {
    throw new Error("recoverZef: Zef must be in state 'dor'");
  }
  return { ...world, zef: "pex" };
}
`,
    "src/protocol_adapter.ts": registerNewOperation(
      currentProtocolAdapter,
      "./zef/recoverZef",
      "recoverZef"
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
