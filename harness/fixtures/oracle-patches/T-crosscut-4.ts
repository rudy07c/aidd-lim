// harness/fixtures/oracle-patches/T-crosscut-4.ts
//
// Task: T-crosscut-4 の正解実装パッチ
// Instruction: "パフォーマンス改善のため、Fen と Zef を同時に 'pex' から 'dor' へ一気に進める
//              'lockFenZef' operation を追加せよ。中間状態の経由は不要。"
//
// groundTruthDelta:
//   O21: Fen(E4) q2(pex) -> q3(dor)  AND  Zef(E2) q2(pex) -> q3(dor)  [複合operation]
//   preconditions: Osk(E5) = q2(pex)  AND  Tal(E3) = q2(pex)
//
// I3 (explicit): E4=dor → E5=pex → Osk=pex precondition が必要
// I6 (distributed): E4=dor → E3=pex → Tal=pex precondition が必要
// I2 (explicit): E2=dor → E3=pex → Tal=pex（同じpreconditionで保証）
// I5 (distributed): E2=dor → E5=pex → Osk=pex（同じpreconditionで保証）

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  return {
    "src/fen/lockFenZef.ts": `import { WorldState } from "../world";

/**
 * lockFenZef (= O21): Fen: pex -> dor  AND  Zef: pex -> dor  [複合operation]
 * preconditions: Osk must be 'pex' AND Tal must be 'pex'
 *
 * I3 (explicit): Fen=dor → Osk=pex  (Osk=pex precondition で保証)
 * I6 (distributed): Fen=dor → Tal=pex  (Tal=pex precondition で保証)
 * I2 (explicit): Zef=dor → Tal=pex  (同じ precondition で保証)
 * I5 (distributed): Zef=dor → Osk=pex  (同じ precondition で保証)
 */
export function lockFenZef(world: WorldState): WorldState {
  if (world.fen !== "pex") {
    throw new Error("lockFenZef: Fen must be in state 'pex'");
  }
  if (world.zef !== "pex") {
    throw new Error("lockFenZef: Zef must be in state 'pex'");
  }
  if (world.osk !== "pex") {
    throw new Error("lockFenZef: requires Osk to be 'pex' (Invariants I3+I5 guard)");
  }
  if (world.tal !== "pex") {
    throw new Error("lockFenZef: requires Tal to be 'pex' (Invariants I2+I6 guard)");
  }
  return { ...world, fen: "dor", zef: "dor" };
}
`,
    "src/protocol_adapter.ts": registerNewOperation(
      currentProtocolAdapter,
      "./fen/lockFenZef",
      "lockFenZef"
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
