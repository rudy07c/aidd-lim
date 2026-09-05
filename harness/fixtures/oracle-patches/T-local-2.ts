// harness/fixtures/oracle-patches/T-local-2.ts
//
// Task: T-local-2 の正解実装パッチ
// Instruction: "Vok が 'pex' の状態から 'nim' へ戻す operation 'resetVok' を追加せよ。"
//
// groundTruthDelta:
//   O10: Vok(E1) q2(pex) -> q1(nim)
//   preconditions: [] (なし)
//
// resetVok は Vok を pex から nim へ戻す単純な逆進操作。
// precondition は fromState guard のみ（Vok=pex であること）。
// Invariant I1（Vok=dor ならば Tal=pex）の条件は q3（dor）にのみ適用されるため、
// q2→q1 の遷移では invariant 違反が生じない。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentVokRules = files["src/vok/rules.ts"] ?? "";
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  const resetVokCode = `
/**
 * resetVok (= O10): Vok: pex -> nim, no preconditions beyond fromState guard.
 */
export function resetVok(world: WorldState): WorldState {
  if (world.vok !== "pex") {
    throw new Error("resetVok: Vok must be in state 'pex'");
  }
  return { ...world, vok: "nim" };
}
`;

  return {
    ...files,
    "src/vok/rules.ts": currentVokRules + resetVokCode,
    "src/protocol_adapter.ts": registerOperation(
      currentProtocolAdapter,
      "./vok/rules",
      "resetVok"
    ),
  };
}

function registerOperation(source: string, moduleRelPath: string, fnName: string): string {
  const importRegex = new RegExp(
    `(import\\s*\\{[^}]+)\\}\\s*from\\s*["']${escapeRegex(moduleRelPath)}["'];`
  );
  let result = source.replace(importRegex, (match, importList) => {
    if (importList.includes(fnName)) return match;
    return `${importList.trimEnd()}, ${fnName} } from "${moduleRelPath}";`;
  });

  if (!result.includes(`  ${fnName},`)) {
    result = result.replace(
      /(\n  \w+,\n)(};)/,
      `$1  ${fnName},\n$2`
    );
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
