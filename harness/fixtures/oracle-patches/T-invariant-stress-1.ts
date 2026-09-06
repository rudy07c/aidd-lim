// harness/fixtures/oracle-patches/T-invariant-stress-1.ts
//
// Task: T-invariant-stress-1 の正解実装パッチ
// Instruction: "パフォーマンス改善のため、Zef を 'nim' から 'dor' へ一気に進める
//              'fastTrackZef' operation を追加せよ。中間状態の 'pex' を経由する必要はない。"
//
// groundTruthDelta:
//   O9: Zef(E2) q1(nim) -> q3(dor)
//   preconditions: Tal(E3) = q2(pex)  AND  Fen(E4) = q2(pex)
//
// 設計の核心: visibleInstruction には「preconditionが必要」とは明記されていない。
//   しかし Invariant I2（Zef=dor ならば Tal=pex）を保つためには Tal=pex が必要。
//   また Invariant I5（Zef=dor ならば Osk=pex）を distributed chain で保つためには
//   Fen=pex が必要（Fen=pex → Osk=pex が advanceFen1 precondition により保証済み）。
//   worker agentがこれらのpreconditionを実装しなければ、
//   H(G)のI2/I5 micro-testが O9 経路について fail する。
//   これが invariant_stressing taskの本質。（heldout_tasks.json 注記参照）
//
// 実装方針: 既存 zef/rules.ts は変更せず、新規ファイルを作成して登録する。
//   これにより full/limited 両コンテキストで動作する（既存ファイルへの依存なし）。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  return {
    // 新しい operation を独立したファイルに定義
    "src/zef/fastTrackZef.ts": `import { WorldState } from "../world";

/**
 * fastTrackZef (= O9): Zef: nim -> dor (中間のpexを経由せず直接ジャンプ)
 * requires Tal === "pex" AND Fen === "pex"
 *
 * Invariant I2（Zef=dor ならば Tal=pex）を保つため Tal=pex が必要。
 * Invariant I5（Zef=dor ならば Osk=pex）を distributed chain で保つため
 * Fen=pex が必要（advanceFen1 precondition により Osk=pex が保証される）。
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
  if (world.fen !== "pex") {
    throw new Error("fastTrackZef: requires Fen to be 'pex' (Invariant I5 via distributed chain)");
  }
  return { ...world, zef: "dor" };
}
`,

    // protocol_adapter.ts に新しい import と operationTable エントリを追加
    "src/protocol_adapter.ts": registerNewOperation(
      currentProtocolAdapter,
      "./zef/fastTrackZef",
      "fastTrackZef"
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
