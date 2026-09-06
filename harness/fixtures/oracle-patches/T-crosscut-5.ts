// harness/fixtures/oracle-patches/T-crosscut-5.ts
//
// Task: T-crosscut-5 の正解実装パッチ
// Instruction: "Tal と Fen を同時に 'nim' から 'pex' へ進める新しい operation 'boostTalFen' を追加せよ。"
//
// groundTruthDelta:
//   O26: Tal(E3) q1(nim) -> q2(pex)  AND  Fen(E4) q1(nim) -> q2(pex)  [複合operation]
//   preconditions: Osk(E5) = q2(pex)
//
// Osk=pex が必要: advanceFen1（O7）は E5=q2 を要求するため、
// 複合 operation でも同じ precondition を引き継ぐ。
// E3/E4 ともに q2 止まりのため invariant 違反なし（I6 は E4=q3 を条件とする）。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  return {
    "src/tal/boostTalFen.ts": `import { WorldState } from "../world";

/**
 * boostTalFen (= O26): Tal: nim -> pex  AND  Fen: nim -> pex  [複合operation]
 * requires Osk === "pex"  (advanceFen1 の E5=q2 依存を引き継ぐ)
 *
 * E3/E4 ともに q2 止まりなので invariant 違反なし。
 */
export function boostTalFen(world: WorldState): WorldState {
  if (world.tal !== "nim") {
    throw new Error("boostTalFen: Tal must be in state 'nim'");
  }
  if (world.fen !== "nim") {
    throw new Error("boostTalFen: Fen must be in state 'nim'");
  }
  if (world.osk !== "pex") {
    throw new Error("boostTalFen: requires Osk to be 'pex' (Fen advancement dependency)");
  }
  return { ...world, tal: "pex", fen: "pex" };
}
`,
    "src/protocol_adapter.ts": registerNewOperation(
      currentProtocolAdapter,
      "./tal/boostTalFen",
      "boostTalFen"
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
