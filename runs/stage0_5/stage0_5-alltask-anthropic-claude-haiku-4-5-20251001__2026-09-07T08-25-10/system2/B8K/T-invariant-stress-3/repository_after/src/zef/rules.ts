import { WorldState } from "../world";

/**
 * advanceZef1 (= O3): Zef: nim -> pex, requires Tal === "pex"
 * (D2: O3 depends on E3)
 *
 * このpreconditionが、Invariant I1（Vok=dor ならば Tal=pex）を
 * "distributed" に成立させる根拠の一部である。advanceVok2自体はTalを
 * 一切参照しないが、advanceVok2の前提であるZef=pexへ到達するには
 * 必ずこのpreconditionを経由するため、結果としてTal=pexが連鎖的に
 * 保証される（Talは後退しないため、一度pexになれば恒久的に成立する）。
 */
export function advanceZef1(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("advanceZef1: Zef must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("advanceZef1: requires Tal to be 'pex'");
  }
  return { ...world, zef: "pex" };
}

/**
 * advanceZef2 (= O4): Zef: pex -> dor, requires Tal === "pex" AND Fen === "pex"
 * (D4: O4 depends on E3 — Invariant I2: Zef=dor → Tal=pex, explicit)
 * (D5: O4 depends on E4 — Invariant I5: Zef=dor → Osk=pex, distributed via Fen=pex → Osk=pex chain)
 */
export function advanceZef2(world: WorldState): WorldState {
  if (world.zef !== "pex") {
    throw new Error("advanceZef2: Zef must be in state 'pex'");
  }
  if (world.tal !== "pex") {
    throw new Error("advanceZef2: requires Tal to be 'pex'");
  }
  if (world.fen !== "pex") {
    throw new Error("advanceZef2: requires Fen to be 'pex'");
  }
  return { ...world, zef: "dor" };
}

/**
 * rushZefFen (performance optimization): Zef: nim -> dor AND Fen: nim -> dor simultaneously,
 * bypassing intermediate 'pex' states.
 * Requires: Tal === "pex" AND Osk === "pex"
 * (Preserves invariants: I1, I2, I3, I4, I5, I6)
 */
export function rushZefFen(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("rushZefFen: Zef must be in state 'nim'");
  }
  if (world.fen !== "nim") {
    throw new Error("rushZefFen: Fen must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("rushZefFen: requires Tal to be 'pex'");
  }
  if (world.osk !== "pex") {
    throw new Error("rushZefFen: requires Osk to be 'pex'");
  }
  return { ...world, zef: "dor", fen: "dor" };
}
