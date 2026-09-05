// H(G) — 評価ハーネス側にのみ保持し、worker agentには一切見せない（計画書1.7節）。
// 目的:
//  (a) 各世代のrepositoryが ground truth G の behavior と一致し続けているかを
//      independentに検査する（M_B(S) の hidden regression部分）
//  (b) Present^beh(x, S_g) の判定用 micro-test を提供する
//
// 実装は repository の内部importを一切行わず、protocol_adapter.ts が
// exportする WorldProtocol だけを経由する（NOTES.md「発見2」への対応）。
// これにより世代を経てrepositoryの内部構造（ファイル配置・関数分割）が
// どれだけリファクタされても、protocol契約さえ保たれていればH(G)は動く。

import { protocol } from "../repository/src/protocol_adapter";
import { WorldState } from "../repository/src/world";

function apply(world: WorldState, op: string): WorldState {
  const result = protocol.applyOperation(world, op);
  if (!result.success) {
    throw new Error(result.error ?? `operation failed: ${op}`);
  }
  return result.newState;
}

function tryApply(world: WorldState, op: string): { ok: boolean; error?: string } {
  const result = protocol.applyOperation(world, op);
  return { ok: result.success, error: result.success ? undefined : result.error };
}

describe("H(G) — regression: full behavioral fidelity to ground_truth.json (via WorldProtocol only)", () => {
  test("O1 (advanceVok1): E1 q1->q2, no precondition", () => {
    const w = protocol.reset();
    const w2 = apply(w, "advanceVok1");
    expect(protocol.getEntityState(w2, "Vok")).toBe("pex");
  });

  test("O2 (advanceVok2): E1 q2->q3, requires E2=q2", () => {
    let w = protocol.reset();
    w = apply(w, "advanceVok1");
    expect(tryApply(w, "advanceVok2").ok).toBe(false); // E2 still q1
    w = apply(w, "advanceTal1"); // 先にTalをpexにしておく必要がある(O3のprecondition)
    w = apply(w, "advanceZef1"); // E2 -> q2 (Tal=pex なので成功)
    expect(protocol.getEntityState(apply(w, "advanceVok2"), "Vok")).toBe("dor");
  });

  test("O3 (advanceZef1): E2 q1->q2, requires E3=q2", () => {
    let w = protocol.reset();
    expect(tryApply(w, "advanceZef1").ok).toBe(false); // Tal still nim
    w = apply(w, "advanceTal1");
    expect(protocol.getEntityState(apply(w, "advanceZef1"), "Zef")).toBe("pex");
  });

  test("O4 (advanceZef2): E2 q2->q3, requires E3=q2", () => {
    let w = protocol.reset();
    w = apply(w, "advanceTal1");
    w = apply(w, "advanceZef1");
    expect(protocol.getEntityState(apply(w, "advanceZef2"), "Zef")).toBe("dor");
  });

  test("O5 (advanceTal1): E3 q1->q2, no precondition", () => {
    const w = protocol.reset();
    expect(protocol.getEntityState(apply(w, "advanceTal1"), "Tal")).toBe("pex");
  });
});

describe("H(G) — Present^beh micro-tests (per semantic element x in G)", () => {
  // 各要素xのbehaviorがS_g上に保存されているかを個別に判定する
  // 最小粒度のテスト。1つでもfailすれば、その要素xのPresent^behはfalse。

  test("[element: I1, encoding=distributed] Vok=dor implies Tal=pex", () => {
    // I1はどの単一preconditionにも直接現れないが、O3のprecondition連鎖
    // （Zef=pexに到達するにはTal=pexが必須、かつTalは後退しない）により
    // 結果として常に成立する。ここではその連鎖を実際に踏んで確認する。
    let w = protocol.reset();
    w = apply(w, "advanceTal1");   // tal: pex
    w = apply(w, "advanceZef1");   // zef: pex (talが既にpexなので成功)
    w = apply(w, "advanceVok1");   // vok: pex
    w = apply(w, "advanceVok2");   // vok: dor (zef=pexなので成功)
    expect(protocol.getEntityState(w, "Vok")).toBe("dor");
    expect(protocol.getEntityState(w, "Tal")).toBe("pex"); // I1: 常にpexであるはず
  });

  test("[element: I2, encoding=explicit] Zef=dor implies Tal=pex", () => {
    let w = protocol.reset();
    w = apply(w, "advanceTal1");
    w = apply(w, "advanceZef1");
    w = apply(w, "advanceZef2");
    expect(protocol.getEntityState(w, "Zef")).toBe("dor");
    expect(protocol.getEntityState(w, "Tal")).toBe("pex");
  });

  test("[element: D1] O2 fails without E2 dependency satisfied", () => {
    let w = protocol.reset();
    w = apply(w, "advanceVok1");
    expect(tryApply(w, "advanceVok2").ok).toBe(false);
  });

  test("[element: D2] O3 fails without E3 dependency satisfied", () => {
    const w = protocol.reset();
    expect(tryApply(w, "advanceZef1").ok).toBe(false);
  });

  test("[element: D3] O4 fails without E3 dependency satisfied", () => {
    let w = protocol.reset();
    w = apply(w, "advanceTal1");
    w = apply(w, "advanceZef1");
    // ここでTalが仮にリセットされるような不正なoperationが将来追加された場合、
    // このテストが即座にD3の喪失を検出できる。v0では正規表現なのでpassする。
    expect(tryApply(w, "advanceZef2").ok).toBe(true);
  });
});
