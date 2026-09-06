// harness/fixtures/oracle-patches/T-local-1.ts
//
// Task: T-local-1 の正解実装パッチ
// Instruction: "Vok が 'nim' の状態から一度の操作で強制的に 'dor' まで進める
//              新しい operation 'forceAdvanceVok' を追加せよ。"
//
// groundTruthDelta:
//   O12: Vok(E1) q1(nim) -> q3(dor)
//   preconditions: Tal(E3) = q2(pex)  AND  Osk(E5) = q2(pex)
//
// 設計注記: visibleInstructionには「preconditionが必要」とは書かれていないが、
//   I1（Vok=dor ならば Tal=pex）と I4（Vok=dor ならば Osk=pex）を守るためには
//   Tal=pex かつ Osk=pex のpreconditionが必要。
//   これが「見た目はlocal、実は invariant-stressing に近い」設計（heldout_tasks.json 注記参照）。
//
// 実装方針: 既存 vok/rules.ts は変更せず、新規ファイルを作成して登録する。
//   これにより full/limited 両コンテキストで動作する（既存ファイルへの依存なし）。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  return {
    // 新しい operation を独立したファイルに定義
    "src/vok/forceAdvanceVok.ts": `import { WorldState } from "../world";

/**
 * forceAdvanceVok (= O12): Vok: nim -> dor (直接ジャンプ)
 * requires Tal === "pex" AND Osk === "pex"
 *
 * Invariant I1（Vok=dor ならば Tal=pex）を保つため Tal=pex が必要。
 * Invariant I4（Vok=dor ならば Osk=pex）を保つため Osk=pex が必要。
 */
export function forceAdvanceVok(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error("forceAdvanceVok: Vok must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("forceAdvanceVok: requires Tal to be 'pex' (Invariant I1)");
  }
  if (world.osk !== "pex") {
    throw new Error("forceAdvanceVok: requires Osk to be 'pex' (Invariant I4)");
  }
  return { ...world, vok: "dor" };
}
`,

    // protocol_adapter.ts に新しい import と operationTable エントリを追加
    "src/protocol_adapter.ts": registerNewOperation(
      currentProtocolAdapter,
      "./vok/forceAdvanceVok",
      "forceAdvanceVok"
    ),
  };
}

/**
 * protocol_adapter.ts に全く新しいモジュールから operation を登録する。
 * - 最後の import 行の後に新しい import 行を追加
 * - operationTable に関数名を追加
 */
function registerNewOperation(source: string, moduleRelPath: string, fnName: string): string {
  if (source.includes(`from "${moduleRelPath}"`)) {
    // 既に import 済みの場合は operationTable のみ追加
    return addToOperationTable(source, fnName);
  }

  // 最後の import 行の直後に新しい import を挿入
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
