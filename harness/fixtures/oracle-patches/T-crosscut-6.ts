// harness/fixtures/oracle-patches/T-crosscut-6.ts
//
// Task: T-crosscut-6 の正解実装パッチ
// Instruction: "パフォーマンス改善のため、Vok と Fen を同時に 'nim' から 'dor' へ一気に進める
//              'jumpVokFen' operation を追加せよ。中間状態の 'pex' を経由する必要はない。"
//
// groundTruthDelta:
//   O27: Vok(E1) q1(nim) -> q3(dor)  AND  Fen(E4) q1(nim) -> q3(dor)  [複合operation]
//   preconditions: Tal(E3) = q2(pex)  AND  Osk(E5) = q2(pex)
//
// I1 (distributed): E1=dor → Tal=pex → E3=q2 precondition が必要
// I3 (explicit): E4=dor → Osk=pex → E5=q2 precondition が必要
// I4 (explicit): E1=dor → Osk=pex → E5=q2 precondition が必要（同一guardで保証）
// I6 (distributed): E4=dor → Tal=pex → E3=q2 precondition が必要（同一guardで保証）
//
// jumpVokZef（T-crosscut-2）の Vok+Fen 対称版。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  return {
    "src/vok/jumpVokFen.ts": `import { WorldState } from "../world";

/**
 * jumpVokFen (= O27): Vok: nim -> dor  AND  Fen: nim -> dor  [複合operation]
 * requires Tal === "pex" AND Osk === "pex"
 *
 * I1 (distributed): E1=dor → Tal=pex  (Tal=pex precondition で保証)
 * I3 (explicit): E4=dor → Osk=pex  (Osk=pex precondition で保証)
 * I4 (explicit): E1=dor → Osk=pex  (同じ precondition で保証)
 * I6 (distributed): E4=dor → Tal=pex  (同じ precondition で保証)
 */
export function jumpVokFen(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error("jumpVokFen: Vok must be in state 'nim'");
  }
  if (world.fen !== "nim") {
    throw new Error("jumpVokFen: Fen must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("jumpVokFen: requires Tal to be 'pex' (Invariants I1+I6 guard)");
  }
  if (world.osk !== "pex") {
    throw new Error("jumpVokFen: requires Osk to be 'pex' (Invariants I3+I4 guard)");
  }
  return { ...world, vok: "dor", fen: "dor" };
}
`,
    "src/protocol_adapter.ts": registerNewOperation(
      currentProtocolAdapter,
      "./vok/jumpVokFen",
      "jumpVokFen"
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
