// harness/fixtures/oracle-patches/T-crosscut-3.ts
//
// Task: T-crosscut-3 の正解実装パッチ
// Instruction: "Osk と Fen を同時に 'nim' から 'pex' へ進める新しい operation 'advanceOskFen' を追加せよ。"
//
// groundTruthDelta:
//   O20: Osk(E5) q1(nim) -> q2(pex)  AND  Fen(E4) q1(nim) -> q2(pex)  [複合operation]
//   preconditions: [] (なし)
//
// advanceOskFen は Osk と Fen の両方を nim->pex へ同時に進める複合operation。
// どちらも中間状態 q2 止まりのため invariant 違反なし。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  return {
    "src/osk/advanceOskFen.ts": `import { WorldState } from "../world";

/**
 * advanceOskFen (= O20): Osk: nim -> pex  AND  Fen: nim -> pex  [複合operation]
 * no preconditions beyond the fromState guards.
 *
 * O6（advanceOsk1）とO7（advanceFen1）を1 operationに集約した効率化パターン。
 * どちらも q2 止まりなので invariant 違反なし。
 */
export function advanceOskFen(world: WorldState): WorldState {
  if (world.osk !== "nim") {
    throw new Error("advanceOskFen: Osk must be in state 'nim'");
  }
  if (world.fen !== "nim") {
    throw new Error("advanceOskFen: Fen must be in state 'nim'");
  }
  return { ...world, osk: "pex", fen: "pex" };
}
`,
    "src/protocol_adapter.ts": registerNewOperation(
      currentProtocolAdapter,
      "./osk/advanceOskFen",
      "advanceOskFen"
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
