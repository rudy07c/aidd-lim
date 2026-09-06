// harness/fixtures/oracle-patches/T-invariant-stress-3.ts
//
// Task: T-invariant-stress-3 の正解実装パッチ
// Instruction: "パフォーマンス改善のため、Zef と Fen を同時に 'nim' から 'dor' へ一気に進める
//              'rushZefFen' operation を追加せよ。中間状態の 'pex' を経由する必要はない。"
//
// groundTruthDelta:
//   O23: Zef(E2) q1(nim) -> q3(dor)  AND  Fen(E4) q1(nim) -> q3(dor)  [複合operation]
//   preconditions: Tal(E3) = q2(pex)  AND  Osk(E5) = q2(pex)
//
// I2 (explicit): E2=dor → E3=pex → Tal=pex guard が必要
// I3 (explicit): E4=dor → E5=pex → Osk=pex guard が必要
// I5 (distributed): E2=dor → E5=pex → Osk=pex guard が必要
// I6 (distributed): E4=dor → E3=pex → Tal=pex guard が必要
// 4つの invariant を E3=q2+E5=q2 の2条件でカバー。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  return {
    "src/zef/rushZefFen.ts": `import { WorldState } from "../world";

/**
 * rushZefFen (= O23): Zef: nim -> dor  AND  Fen: nim -> dor  [複合operation]
 * requires Tal === "pex" AND Osk === "pex"
 *
 * I2 (explicit): E2=dor → Tal=pex  (Tal=pex precondition で保証)
 * I3 (explicit): E4=dor → Osk=pex  (Osk=pex precondition で保証)
 * I5 (distributed): E2=dor → Osk=pex  (Osk=pex precondition で直接保証)
 * I6 (distributed): E4=dor → Tal=pex  (Tal=pex precondition で直接保証)
 */
export function rushZefFen(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("rushZefFen: Zef must be in state 'nim'");
  }
  if (world.fen !== "nim") {
    throw new Error("rushZefFen: Fen must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("rushZefFen: requires Tal to be 'pex' (Invariants I2+I6 guard)");
  }
  if (world.osk !== "pex") {
    throw new Error("rushZefFen: requires Osk to be 'pex' (Invariants I3+I5 guard)");
  }
  return { ...world, zef: "dor", fen: "dor" };
}
`,
    "src/protocol_adapter.ts": registerNewOperation(
      currentProtocolAdapter,
      "./zef/rushZefFen",
      "rushZefFen"
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
