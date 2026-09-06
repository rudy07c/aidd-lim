// harness/fixtures/oracle-patches/T-invariant-stress-5.ts
//
// Task: T-invariant-stress-5 の正解実装パッチ
// Instruction: "Vok が 'pex' の状態から直接 'dor' へ進む高速 operation 'advanceVokSkip' を追加せよ。"
//
// groundTruthDelta:
//   O25: Vok(E1) q2(pex) -> q3(dor)
//   preconditions: Tal(E3) = q2(pex)  AND  Osk(E5) = q2(pex)
//
// I1 (distributed): E1=dor → Tal=pex → E3=q2 を直接 precondition として必要
// I4 (explicit): E1=dor → Osk=pex → E5=q2 を precondition として必要
//
// Construction B: F1/F2 再現パターン。
// advanceVok2 (precond: E2=q2+E5=q2) をコピーして Zef 依存を除去する AI は
// E2=q2 を fromState ガードに変換するため E3=q2（I1ガード）を欠落させやすい。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  return {
    "src/vok/advanceVokSkip.ts": `import { WorldState } from "../world";

/**
 * advanceVokSkip (= O25): Vok: pex -> dor (高速スキップ)
 * requires Tal === "pex" AND Osk === "pex"
 *
 * Invariant I1 (distributed): E1=dor → Tal=pex  (Tal=pex precondition で保証)
 * Invariant I4 (explicit): E1=dor → Osk=pex  (Osk=pex precondition で保証)
 */
export function advanceVokSkip(world: WorldState): WorldState {
  if (world.vok !== "pex") {
    throw new Error("advanceVokSkip: Vok must be in state 'pex'");
  }
  if (world.tal !== "pex") {
    throw new Error("advanceVokSkip: requires Tal to be 'pex' (Invariant I1 guard)");
  }
  if (world.osk !== "pex") {
    throw new Error("advanceVokSkip: requires Osk to be 'pex' (Invariant I4 guard)");
  }
  return { ...world, vok: "dor" };
}
`,
    "src/protocol_adapter.ts": registerNewOperation(
      currentProtocolAdapter,
      "./vok/advanceVokSkip",
      "advanceVokSkip"
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
