// harness/fixtures/oracle-patches/T-crosscut-2.ts
//
// Task: T-crosscut-2 の正解実装パッチ
// Instruction: "Vok と Zef を同時に 'nim' から 'dor' へ一気に進める
//              'jumpVokZef' operation を追加せよ。中間状態の 'pex' を経由する必要はない。"
//
// groundTruthDelta:
//   O11: Vok(E1) q1(nim) -> q3(dor)  AND  Zef(E2) q1(nim) -> q3(dor)  [複合operation]
//   preconditions: Tal(E3) = q2(pex)
//
// jumpVokZef は VokとZefを同時にdorへ一気に進める複合operation。
// E1=dor→E3=pex（I1）とE2=dor→E3=pex（I2）の両方を同時に保証するため、
// preconditionにE3=q2（Tal=pex）が必須。
//
// 実装はvok/rules.tsに追加する（compound operationの配置は任意だが、
// Vok側を主とみなした配置にする）。

export function applyOracle(
  files: Record<string, string>
): Record<string, string> {
  const currentVokRules = files["src/vok/rules.ts"] ?? "";
  const currentProtocolAdapter = files["src/protocol_adapter.ts"] ?? "";

  const jumpVokZefCode = `
/**
 * jumpVokZef (= O11): Vok: nim -> dor  AND  Zef: nim -> dor  [複合operation]
 * precondition: Tal must be 'pex' (required for Invariant I1 and I2).
 *
 * I1: Vok=dor → Tal=pex  (この precondition で保証)
 * I2: Zef=dor → Tal=pex  (同じ precondition で保証)
 */
export function jumpVokZef(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error("jumpVokZef: Vok must be in state 'nim'");
  }
  if (world.zef !== "nim") {
    throw new Error("jumpVokZef: Zef must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("jumpVokZef: requires Tal to be 'pex' (Invariant I1+I2 guard)");
  }
  return { ...world, vok: "dor", zef: "dor" };
}
`;

  return {
    ...files,
    "src/vok/rules.ts": currentVokRules + jumpVokZefCode,
    "src/protocol_adapter.ts": registerOperation(
      currentProtocolAdapter,
      "./vok/rules",
      "jumpVokZef"
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
