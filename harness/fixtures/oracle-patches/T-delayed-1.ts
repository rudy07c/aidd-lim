// harness/fixtures/oracle-patches/T-delayed-1.ts
//
// Task: T-delayed-1 の正解実装パッチ
// Instruction: "（世代16で提示）Zef に対して、'pex' から 'nim' へ戻す operation
//              'resetZef' を追加せよ。"
//
// groundTruthDelta:
//   O8: Zef(E2) q2(pex) -> q1(nim)
//   preconditions: [] (なし)
//
// 注記: resetZef は Tal には触れないため、Talの単調性（非後退性）を壊さない。
//   ただし導入後は Zef の状態空間が広がる（pex->nim が可能になる）。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentZefRules = files["src/zef/rules.ts"] ?? "";
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  const resetZefCode = `
/**
 * resetZef (= O8): Zef: pex -> nim (リセット操作)
 * no preconditions.
 *
 * Talには触れないため、Talの単調性（非後退性）は保たれる。
 */
export function resetZef(world: WorldState): WorldState {
  if (world.zef !== "pex") {
    throw new Error("resetZef: Zef must be in state 'pex'");
  }
  return { ...world, zef: "nim" };
}
`;

  return {
    ...files,

    // zef/rules.ts に resetZef を追記
    "src/zef/rules.ts": currentZefRules + resetZefCode,

    // protocol_adapter.ts に resetZef を登録
    "src/protocol_adapter.ts": registerOperation(
      currentProtocolAdapter,
      "./zef/rules",
      "resetZef"
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
