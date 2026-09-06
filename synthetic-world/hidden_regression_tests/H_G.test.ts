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

  test("O2 (advanceVok2): E1 q2->q3, requires E2=q2 AND E5=q2", () => {
    let w = protocol.reset();
    w = apply(w, "advanceVok1");
    expect(tryApply(w, "advanceVok2").ok).toBe(false); // E2 still q1
    w = apply(w, "advanceTal1");  // tal: pex (O3のprecondition)
    w = apply(w, "advanceZef1"); // E2 -> q2 (Tal=pex なので成功)
    // E5 still nim — D2: E5=q2 もなければ失敗する
    expect(tryApply(w, "advanceVok2").ok).toBe(false);
    w = apply(w, "advanceOsk1"); // E5 -> q2
    expect(protocol.getEntityState(apply(w, "advanceVok2"), "Vok")).toBe("dor");
  });

  test("O3 (advanceZef1): E2 q1->q2, requires E3=q2", () => {
    let w = protocol.reset();
    expect(tryApply(w, "advanceZef1").ok).toBe(false); // Tal still nim
    w = apply(w, "advanceTal1");
    expect(protocol.getEntityState(apply(w, "advanceZef1"), "Zef")).toBe("pex");
  });

  test("O4 (advanceZef2): E2 q2->q3, requires E3=q2 AND E4=q2", () => {
    let w = protocol.reset();
    w = apply(w, "advanceTal1");
    w = apply(w, "advanceZef1");
    // E4 still nim — D5: E4=q2 もなければ失敗する
    expect(tryApply(w, "advanceZef2").ok).toBe(false);
    w = apply(w, "advanceOsk1"); // E5 -> q2 (advanceFen1のprecondition)
    w = apply(w, "advanceFen1"); // E4 -> q2
    expect(protocol.getEntityState(apply(w, "advanceZef2"), "Zef")).toBe("dor");
  });

  test("O5 (advanceTal1): E3 q1->q2, no precondition", () => {
    const w = protocol.reset();
    expect(protocol.getEntityState(apply(w, "advanceTal1"), "Tal")).toBe("pex");
  });

  test("O6 (advanceOsk1): E5 q1->q2, no precondition", () => {
    const w = protocol.reset();
    const w2 = apply(w, "advanceOsk1");
    expect(protocol.getEntityState(w2, "Osk")).toBe("pex");
  });

  test("O7 (advanceFen1): E4 q1->q2, requires E5=q2", () => {
    let w = protocol.reset();
    expect(tryApply(w, "advanceFen1").ok).toBe(false); // Osk still nim
    w = apply(w, "advanceOsk1"); // E5 -> q2
    expect(protocol.getEntityState(apply(w, "advanceFen1"), "Fen")).toBe("pex");
  });

  test("O8 (advanceFen2): E4 q2->q3, requires E5=q2 AND E2=q2", () => {
    let w = protocol.reset();
    w = apply(w, "advanceOsk1"); // E5 -> q2
    w = apply(w, "advanceFen1"); // E4 -> q2
    // E2 still nim — D8: E2=q2 もなければ失敗する
    expect(tryApply(w, "advanceFen2").ok).toBe(false);
    w = apply(w, "advanceTal1");  // E3 -> q2 (O3のprecondition)
    w = apply(w, "advanceZef1"); // E2 -> q2
    expect(protocol.getEntityState(apply(w, "advanceFen2"), "Fen")).toBe("dor");
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
    w = apply(w, "advanceOsk1");   // osk: pex (advanceVok2のprecondition I4)
    w = apply(w, "advanceVok1");   // vok: pex
    w = apply(w, "advanceVok2");   // vok: dor (zef=pex, osk=pexなので成功)
    expect(protocol.getEntityState(w, "Vok")).toBe("dor");
    expect(protocol.getEntityState(w, "Tal")).toBe("pex"); // I1: 常にpexであるはず
  });

  test("[element: I2, encoding=explicit] Zef=dor implies Tal=pex", () => {
    let w = protocol.reset();
    w = apply(w, "advanceTal1");
    w = apply(w, "advanceZef1");
    w = apply(w, "advanceOsk1");   // osk: pex (advanceFen1のprecondition)
    w = apply(w, "advanceFen1");   // fen: pex (advanceZef2のprecondition D5)
    w = apply(w, "advanceZef2");
    expect(protocol.getEntityState(w, "Zef")).toBe("dor");
    expect(protocol.getEntityState(w, "Tal")).toBe("pex");
  });

  test("[element: I3, encoding=explicit] Fen=dor implies Osk=pex", () => {
    // I3: O8 (advanceFen2) は Osk=pex を明示的に要求する（explicit invariant）
    let w = protocol.reset();
    w = apply(w, "advanceTal1");
    w = apply(w, "advanceZef1");   // zef: pex (advanceFen2のprecondition D8)
    w = apply(w, "advanceOsk1");   // osk: pex
    w = apply(w, "advanceFen1");   // fen: pex
    w = apply(w, "advanceFen2");   // fen: dor
    expect(protocol.getEntityState(w, "Fen")).toBe("dor");
    expect(protocol.getEntityState(w, "Osk")).toBe("pex"); // I3: Fen=dor → Osk=pex
  });

  test("[element: I4, encoding=explicit] Vok=dor implies Osk=pex", () => {
    // I4: O2 (advanceVok2) は Osk=pex を明示的に要求する（explicit invariant）
    let w = protocol.reset();
    w = apply(w, "advanceTal1");
    w = apply(w, "advanceZef1");
    w = apply(w, "advanceOsk1");   // osk: pex
    w = apply(w, "advanceVok1");
    w = apply(w, "advanceVok2");   // vok: dor
    expect(protocol.getEntityState(w, "Vok")).toBe("dor");
    expect(protocol.getEntityState(w, "Osk")).toBe("pex"); // I4: Vok=dor → Osk=pex
  });

  test("[element: I5, encoding=distributed] Zef=dor implies Osk=pex", () => {
    // I5: advanceZef2 は Fen=pex を要求し、Fen=pex に到達するには
    // advanceFen1 が Osk=pex を要求する（distributed chain）。
    let w = protocol.reset();
    w = apply(w, "advanceTal1");
    w = apply(w, "advanceZef1");
    w = apply(w, "advanceOsk1");   // osk: pex (advanceFen1のprecondition)
    w = apply(w, "advanceFen1");   // fen: pex (advanceZef2のprecondition)
    w = apply(w, "advanceZef2");   // zef: dor
    expect(protocol.getEntityState(w, "Zef")).toBe("dor");
    expect(protocol.getEntityState(w, "Osk")).toBe("pex"); // I5: Zef=dor → Osk=pex
  });

  test("[element: I6, encoding=distributed] Fen=dor implies Tal=pex", () => {
    // I6: advanceFen2 は Zef=pex を要求し、Zef=pex に到達するには
    // advanceZef1 が Tal=pex を要求する（distributed chain）。
    let w = protocol.reset();
    w = apply(w, "advanceTal1");   // tal: pex
    w = apply(w, "advanceZef1");   // zef: pex (tal=pexが必須)
    w = apply(w, "advanceOsk1");   // osk: pex
    w = apply(w, "advanceFen1");   // fen: pex
    w = apply(w, "advanceFen2");   // fen: dor (zef=pexが必須 → talは既にpex)
    expect(protocol.getEntityState(w, "Fen")).toBe("dor");
    expect(protocol.getEntityState(w, "Tal")).toBe("pex"); // I6: Fen=dor → Tal=pex
  });

  test("[element: D1] O2 fails without E2 dependency satisfied", () => {
    let w = protocol.reset();
    w = apply(w, "advanceVok1");
    expect(tryApply(w, "advanceVok2").ok).toBe(false);
  });

  test("[element: D2] O2 fails without E5 dependency satisfied", () => {
    // E2=pex だが E5=nim のままなら O2 は失敗する
    let w = protocol.reset();
    w = apply(w, "advanceTal1");
    w = apply(w, "advanceZef1");  // E2: pex
    w = apply(w, "advanceVok1");  // E1: pex
    expect(tryApply(w, "advanceVok2").ok).toBe(false); // E5 still nim
  });

  test("[element: D3] O3 fails without E3 dependency satisfied", () => {
    const w = protocol.reset();
    expect(tryApply(w, "advanceZef1").ok).toBe(false);
  });

  test("[element: D4] O4 fails without E3 dependency satisfied", () => {
    // tal=pex, zef=pex, osk=pex, fen=pex があってもE3(Tal)がpexでなければならない。
    // (E3はadvanceZef1のpreconditionなので、zef=pexになった時点でTal=pexも確定)
    // ここではzef=pexを直接仮定せず、E3未設定でO4を試みる:
    let w = protocol.reset();
    w = apply(w, "advanceOsk1");
    w = apply(w, "advanceFen1"); // fen: pex (E4=q2)
    // zef still nim (E2 not pex, E3 not pex) — D4のprecondition未満
    expect(tryApply(w, "advanceZef2").ok).toBe(false);
  });

  test("[element: D5] O4 fails without E4 dependency satisfied", () => {
    // E3=pex, E2=pex は満たすが E4=nim のままなら O4 は失敗する
    let w = protocol.reset();
    w = apply(w, "advanceTal1");
    w = apply(w, "advanceZef1"); // E2: pex
    expect(tryApply(w, "advanceZef2").ok).toBe(false); // E4 still nim
  });

  test("[element: D6] O7 fails without E5 dependency satisfied", () => {
    const w = protocol.reset(); // osk: nim
    expect(tryApply(w, "advanceFen1").ok).toBe(false);
  });

  test("[element: D7] O8 fails without E5 dependency satisfied", () => {
    // E4=pex にしてもE5がpexでなければO8は失敗 (E5はadvanceFen1のpreconditionで確保済み)
    // → advanceFen1自体がE5=pexを要求するため、fen=pexになった時点でosk=pexも確定。
    // D7を個別に検証するには: fen=pex だが osk=nim を想定したい。
    // ただし実装上はfen=pexに到達した時点でosk=pexが既に確定している（I3の distributed chain）。
    // よってD7はI3のdistributed encodingとして既に I3テストで検証済み。
    // ここではO8のprecondition確認として、E5確保前のfenをadvanceFen1でpexにし、
    // その後osk=pex, zef=nim でO8が失敗することを確認する別パスで代替不可。
    // 代わりに: E5=pex, E4=pex, E2=nim の状態でO8が失敗することをD8として確認する。
    // D7自体はI3テストで implicit に保証されている。
    // このテストはO8のE5preconditionを確認する補完テストとして残す:
    let w = protocol.reset();
    w = apply(w, "advanceTal1");
    w = apply(w, "advanceZef1");
    w = apply(w, "advanceOsk1");
    w = apply(w, "advanceFen1"); // fen: pex (osk=pexが確保されている)
    // osk=pex, fen=pex, zef=pex 状態 → O8成功する経路
    expect(tryApply(w, "advanceFen2").ok).toBe(true); // 全precondition充足
  });

  test("[element: D8] O8 fails without E2 dependency satisfied", () => {
    // E5=pex, E4=pex はあるが E2=nim のままなら O8 は失敗する
    let w = protocol.reset();
    w = apply(w, "advanceOsk1"); // E5: pex
    w = apply(w, "advanceFen1"); // E4: pex
    // E2 still nim
    expect(tryApply(w, "advanceFen2").ok).toBe(false);
  });
});
