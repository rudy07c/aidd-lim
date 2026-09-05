// verify-discriminated-union.ts
//
// OperationResult が判別共用体になったことで、TypeScript の narrowing が
// 正しく機能するかを確認する使い捨てスクリプト。
//
// 実行: npx ts-node verify-discriminated-union.ts

import { protocol } from "./repository/src/protocol_adapter";

function main() {
  const world = protocol.reset();

  // --- Case 1: 成功ケース ---
  const result = protocol.applyOperation(world, "advanceTal1");

  if (result.success) {
    // ここでは result は { success: true; newState: WorldState } に narrowed。
    // result.newState は WorldState（undefined の可能性なし）。
    const _newState = result.newState; // 型エラーなし
    console.log("[OK] success branch: result.newState accessible without ! assertion");

    // result.error は存在しないので、アクセスしようとするとコンパイルエラーになるはず。
    // 以下の行のコメントを外すとコンパイルエラー:
    // const _err = result.error; // ← TS2339: Property 'error' does not exist on type '{ success: true; newState: WorldState; }'
  } else {
    // ここでは result は { success: false; error: string } に narrowed。
    // result.error は string（undefined の可能性なし）。
    const _err = result.error; // 型エラーなし
    console.log("[OK] failure branch: result.error accessible as string (not optional)");

    // result.newState は存在しないので、アクセスしようとするとコンパイルエラーになるはず。
    // 以下の行のコメントを外すとコンパイルエラー:
    // const _ns = result.newState; // ← TS2339: Property 'newState' does not exist on type '{ success: false; error: string; }'
  }

  // --- Case 2: 失敗ケース（未知のoperation）---
  const failResult = protocol.applyOperation(world, "unknownOp");
  if (!failResult.success) {
    // narrowing 後は error が string として確定
    const errMsg: string = failResult.error;
    console.log(`[OK] failure case: error = "${errMsg}"`);
  }

  // --- Case 3: 連鎖ケース（previousな !result.success の throw で narrowing が機能するか）---
  const r2 = protocol.applyOperation(world, "advanceTal1");
  if (!r2.success) {
    throw new Error(r2.error); // error は string
  }
  // ここで r2 は { success: true; newState: WorldState } に narrowed。
  // ! なしで newState にアクセスできる。
  const nextWorld = r2.newState; // 型エラーなし
  console.log(`[OK] throw narrowing: r2.newState accessible without ! (tal = ${protocol.getEntityState(nextWorld, "Tal")})`);

  console.log("\n✅ All discriminated union narrowing checks passed.");
}

main();
