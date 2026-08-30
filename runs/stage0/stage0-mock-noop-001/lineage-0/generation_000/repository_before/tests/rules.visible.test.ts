// これらは "visible tests" — worker agentに見え、artifactの一部として
// 世代を越えて継承されうる（計画書1.7節）。評価専用のhidden regression tests
// （H(G)、worker agentには非露出）とは別物である。

import { createInitialWorld } from "../src/world";
import { advanceVok1, advanceVok2 } from "../src/vok/rules";
import { advanceZef1, advanceZef2 } from "../src/zef/rules";
import { advanceTal1 } from "../src/tal/rules";

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

test("advanceVok2: succeeds once Zef is 'pex' (which itself requires Tal 'pex')", () => {
  let w = createInitialWorld();
  w = advanceVok1(w);       // vok: pex
  w = advanceTal1(w);       // tal: pex (advanceZef1の前提)
  w = advanceZef1(w);       // zef: pex
  const w2 = advanceVok2(w);
  expect(w2.vok).toBe("dor");
});

test("advanceZef2: fails if Tal is not 'pex'", () => {
  const w = createInitialWorld();
  expect(() => advanceZef2(w)).toThrow(); // tal still nim, zef also still nim
});

test("advanceZef2: succeeds once Tal is 'pex'", () => {
  let w = createInitialWorld();
  w = advanceTal1(w); // tal: pex
  w = advanceZef1(w); // zef: pex (tal=pexなので成功)
  const w2 = advanceZef2(w);
  expect(w2.zef).toBe("dor");
});

test("full valid sequence reaches Vok=dor, Zef=dor, Tal=pex", () => {
  // 順序に注意: advanceVok2 は Zef が "pex" である間にしか成功しない
  // （Zef が "dor" になった後では失敗する）。またadvanceZef1自体が
  // Tal="pex"を要求する（O3のprecondition）。
  let w = createInitialWorld();
  w = advanceTal1(w);       // tal: pex
  w = advanceZef1(w);       // zef: pex (tal=pexなので成功)
  w = advanceVok1(w);       // vok: pex
  w = advanceVok2(w);       // vok: dor  (zefはまだ"pex"なので成功)
  w = advanceZef2(w);       // zef: dor  (tal="pex"なので成功)
  expect(w.vok).toBe("dor");
  expect(w.zef).toBe("dor");
  expect(w.tal).toBe("pex");
});
