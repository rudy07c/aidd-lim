// harness/fixtures/oracle-patches/T-invariant-stress-4.ts
//
// Task: T-invariant-stress-4 の正解実装パッチ
// Instruction: "パフォーマンス改善のため、Vok と Zef を同時に 'pex' から 'dor' へ一気に進める
//              'turboVokZef' operation を追加せよ。"
//
// groundTruthDelta:
//   O24: Vok(E1) q2(pex) -> q3(dor)  AND  Zef(E2) q2(pex) -> q3(dor)  [複合operation]
//   preconditions: Tal(E3) = q2(pex)  AND  Osk(E5) = q2(pex)
//
// I1 (distributed): E1=dor → Tal=pex → Tal=pex precondition が必要
// I2 (explicit): E2=dor → Tal=pex → Tal=pex precondition が必要（同一guardで保証）
// I4 (explicit): E1=dor → Osk=pex → Osk=pex precondition が必要
// I5 (distributed): E2=dor → Osk=pex → Osk=pex precondition が必要（同一guardで保証）
//
// Construction B: worker agent が advanceVok2 をコピーして E2=q2 guard を
// 削除（Zef の fromState として扱う）すると E3=q2 guard が欠落する F1/F2 パターン。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  return {
    "src/vok/turboVokZef.ts": `import { WorldState } from "../world";

/**
 * turboVokZef (= O24): Vok: pex -> dor  AND  Zef: pex -> dor  [複合operation]
 * requires Tal === "pex" AND Osk === "pex"
 *
 * I1 (distributed): E1=dor → Tal=pex  (Tal=pex precondition で保証)
 * I2 (explicit): E2=dor → Tal=pex  (同じ precondition で保証)
 * I4 (explicit): E1=dor → Osk=pex  (Osk=pex precondition で保証)
 * I5 (distributed): E2=dor → Osk=pex  (同じ precondition で保証)
 */
export function turboVokZef(world: WorldState): WorldState {
  if (world.vok !== "pex") {
    throw new Error("turboVokZef: Vok must be in state 'pex'");
  }
  if (world.zef !== "pex") {
    throw new Error("turboVokZef: Zef must be in state 'pex'");
  }
  if (world.tal !== "pex") {
    throw new Error("turboVokZef: requires Tal to be 'pex' (Invariants I1+I2 guard)");
  }
  if (world.osk !== "pex") {
    throw new Error("turboVokZef: requires Osk to be 'pex' (Invariants I4+I5 guard)");
  }
  return { ...world, vok: "dor", zef: "dor" };
}
`,
    "src/protocol_adapter.ts": registerNewOperation(
      currentProtocolAdapter,
      "./vok/turboVokZef",
      "turboVokZef"
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
