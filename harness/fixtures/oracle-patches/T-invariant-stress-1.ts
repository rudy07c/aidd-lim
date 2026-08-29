// harness/fixtures/oracle-patches/T-invariant-stress-1.ts
//
// Task: T-invariant-stress-1 の正解実装パッチ
// Instruction: "パフォーマンス改善のため、Zef を 'nim' から 'dor' へ一気に進める
//              'fastTrackZef' operation を追加せよ。中間状態の 'pex' を経由する必要はない。"
//
// groundTruthDelta:
//   O9: Zef(E2) q1(nim) -> q3(dor)
//   precondition: Tal(E3) = q2(pex)
//
// 設計の核心: visibleInstruction には「preconditionが必要」とは明記されていない。
//   しかし Invariant I2（Zef=dor ならば Tal=pex）を保つためには、
//   Tal=pex のpreconditionが必要。
//   worker agentがこのpreconditionを実装しなければ、
//   H(G)のI2 micro-testが O9 経路について fail する。
//   これが invariant_stressing taskの本質。（heldout_tasks.json 注記参照）

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentZefRules = files["src/zef/rules.ts"] ?? "";
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  const fastTrackZefCode = `
/**
 * fastTrackZef (= O9): Zef: nim -> dor (中間のpexを経由せず直接ジャンプ)
 * requires Tal === "pex"
 *
 * Invariant I2（Zef=dor ならば Tal=pex）を保つため、
 * Tal=pex のpreconditionが必要。
 * visibleInstructionには「preconditionが必要」と書かれていないが、
 * invariantを壊さないためには必須。（invariant_stressing task）
 */
export function fastTrackZef(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("fastTrackZef: Zef must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("fastTrackZef: requires Tal to be 'pex' (Invariant I2)");
  }
  return { ...world, zef: "dor" };
}
`;

  return {
    ...files,

    // zef/rules.ts に fastTrackZef を追記
    "src/zef/rules.ts": currentZefRules + fastTrackZefCode,

    // protocol_adapter.ts に fastTrackZef を登録
    "src/protocol_adapter.ts": registerOperation(
      currentProtocolAdapter,
      "./zef/rules",
      "fastTrackZef"
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
