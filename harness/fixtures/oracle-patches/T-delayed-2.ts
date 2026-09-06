// harness/fixtures/oracle-patches/T-delayed-2.ts
//
// Task: T-delayed-2 の正解実装パッチ
// Instruction: "（世代20で提示）Tal と Osk を同時に 'nim' から 'pex' へ進める
//              'advanceTalOsk' operation を追加せよ。"
//
// groundTruthDelta:
//   O28: Tal(E3) q1(nim) -> q2(pex)  AND  Osk(E5) q1(nim) -> q2(pex)  [複合operation]
//   preconditions: [] (なし)
//
// advanceTal1 (O5) も advanceOsk1 (O6) も precondition なし。
// E3/E5 はともに q2 が最大状態なので invariant 違反なし。
// delayed_dependency: 世代5で設計導入、世代20で実装指示。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  return {
    "src/tal/advanceTalOsk.ts": `import { WorldState } from "../world";

/**
 * advanceTalOsk (= O28): Tal: nim -> pex  AND  Osk: nim -> pex  [複合operation]
 * no preconditions beyond the fromState guards.
 *
 * advanceTal1（O5）と advanceOsk1（O6）を1 operationに集約した効率化パターン。
 * E3/E5 ともに q2 止まりなので invariant 違反なし。
 */
export function advanceTalOsk(world: WorldState): WorldState {
  if (world.tal !== "nim") {
    throw new Error("advanceTalOsk: Tal must be in state 'nim'");
  }
  if (world.osk !== "nim") {
    throw new Error("advanceTalOsk: Osk must be in state 'nim'");
  }
  return { ...world, tal: "pex", osk: "pex" };
}
`,
    "src/protocol_adapter.ts": registerNewOperation(
      currentProtocolAdapter,
      "./tal/advanceTalOsk",
      "advanceTalOsk"
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
