// harness/fixtures/oracle-patches/T-invariant-stress-2.ts
//
// Task: T-invariant-stress-2 の正解実装パッチ
// Instruction: "パフォーマンス改善のため、Fen を 'nim' から 'dor' へ一気に進める
//              'jumpFen' operation を追加せよ。中間状態の 'pex' を経由する必要はない。"
//
// groundTruthDelta:
//   O22: Fen(E4) q1(nim) -> q3(dor)
//   preconditions: Osk(E5) = q2(pex)  AND  Tal(E3) = q2(pex)
//
// I3 (explicit): E4=dor → E5=pex → Osk=pex precondition が必要
// I6 (distributed): E4=dor → E3=pex → Tal=pex precondition が必要
//   (distributed chain: O8がE2=q2を要求、O3がE3=q2を要求 → E4=q3→E2=q2→E3=q2)
//
// Construction B: visibleInstruction に invariant guard を明示しない。
// fastTrackZef（I2+I5）と対称的に I3+I6 をターゲットにする設計。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  return {
    "src/fen/jumpFen.ts": `import { WorldState } from "../world";

/**
 * jumpFen (= O22): Fen: nim -> dor (直接ジャンプ)
 * requires Osk === "pex" AND Tal === "pex"
 *
 * Invariant I3 (explicit): E4=dor → E5=pex  (Osk=pex precondition で保証)
 * Invariant I6 (distributed): E4=dor → E3=pex  (Tal=pex precondition で保証)
 */
export function jumpFen(world: WorldState): WorldState {
  if (world.fen !== "nim") {
    throw new Error("jumpFen: Fen must be in state 'nim'");
  }
  if (world.osk !== "pex") {
    throw new Error("jumpFen: requires Osk to be 'pex' (Invariant I3 guard)");
  }
  if (world.tal !== "pex") {
    throw new Error("jumpFen: requires Tal to be 'pex' (Invariant I6 guard)");
  }
  return { ...world, fen: "dor" };
}
`,
    "src/protocol_adapter.ts": registerNewOperation(
      currentProtocolAdapter,
      "./fen/jumpFen",
      "jumpFen"
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
