// これらは "visible tests" — worker agentに見え、artifactの一部として
// 世代を越えて継承されうる（計画書1.7節）。評価専用のhidden regression tests
// （H(G)、worker agentには非露出）とは別物である。

import { createInitialWorld } from "../src/world";
import { advanceVok1, advanceVok2 } from "../src/vok/rules";
import { advanceZef1, advanceZef2 } from "../src/zef/rules";
import { advanceTal1 } from "../src/tal/rules";
import { advanceOsk1 } from "../src/osk/rules";
import { advanceFen1, advanceFen2 } from "../src/fen/rules";

test("advanceVok1: nim -> pex succeeds from initial state", () => {
  const w = createInitialWorld();
  const w2 = advanceVok1(w);
  expect(w2.vok).toBe("pex");
});

test("advanceVok2: fails if Zef is not 'pex'", () => {
  let w = createInitialWorld();
  w = advanceVok1(w); // vok: pex
  expect(() => advanceVok2(w)).toThrow();
});

test("advanceZef1: fails if Tal is not 'pex'", () => {
  const w = createInitialWorld();
  expect(() => advanceZef1(w)).toThrow(); // tal still nim
});

test("advanceVok2: succeeds once Zef is 'pex' and Osk is 'pex'", () => {
  // advanceVok2 requires Zef=pex AND Osk=pex (D1: O2 depends on E2, D2: O2 depends on E5)
  let w = createInitialWorld();
  w = advanceTal1(w);   // tal: pex (advanceZef1の前提)
  w = advanceZef1(w);   // zef: pex
  w = advanceOsk1(w);   // osk: pex (advanceVok2の前提 I4)
  w = advanceVok1(w);   // vok: pex
  const w2 = advanceVok2(w);
  expect(w2.vok).toBe("dor");
});

test("advanceZef2: fails if Tal is not 'pex'", () => {
  const w = createInitialWorld();
  expect(() => advanceZef2(w)).toThrow(); // tal still nim, zef also still nim
});

test("advanceZef2: succeeds once Tal is 'pex' and Fen is 'pex'", () => {
  // advanceZef2 requires Tal=pex AND Fen=pex (D4: O4 depends on E3, D5: O4 depends on E4)
  // Fen=pex requires Osk=pex (advanceFen1のprecondition)
  let w = createInitialWorld();
  w = advanceTal1(w);   // tal: pex
  w = advanceZef1(w);   // zef: pex (tal=pexなので成功)
  w = advanceOsk1(w);   // osk: pex (advanceFen1の前提)
  w = advanceFen1(w);   // fen: pex (osk=pexなので成功)
  const w2 = advanceZef2(w);
  expect(w2.zef).toBe("dor");
});

test("full valid sequence reaches Vok=dor, Zef=dor, Tal=pex", () => {
  // 順序に注意: advanceVok2 は Zef が "pex" である間にしか成功しない
  // （Zef が "dor" になった後では失敗する）。advanceZef2 は Fen=pex を要求する。
  let w = createInitialWorld();
  w = advanceTal1(w);   // tal: pex
  w = advanceZef1(w);   // zef: pex (tal=pexなので成功)
  w = advanceOsk1(w);   // osk: pex
  w = advanceFen1(w);   // fen: pex (osk=pexなので成功、advanceZef2の前提)
  w = advanceVok1(w);   // vok: pex
  w = advanceVok2(w);   // vok: dor (zef=pex, osk=pexなので成功)
  w = 