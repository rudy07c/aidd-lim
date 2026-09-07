import { WorldState } from "../world";

/**
 * advanceVok1 (= O1): Vok: nim -> pex, no preconditions
 */
export function advanceVok1(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error("advanceVok1: Vok must be in state 'nim'");
  }
  return { ...world, vok: "pex" };
}

/**
 * advanceVok2 (= O2): Vok: pex -> dor, requires Zef === "pex" AND Osk === "pex"
 * (D1: O2 depends on E2)
 * (D2: O2 depends on E5 — Invariant I4: Vok=dor → Osk=pex, explicit cross-chain)
 */
export function advanceVok2(world: WorldState): WorldState {
  if (world.vok !== "pex") {
    throw new Error("advanceVok2: Vok must be in state 'pex'");
  }
  if (world.zef !== "pex") {
    throw new Error("advanceVok2: requires Zef to be 'pex'");
  }
  if (world.osk !== "pex") {
    throw new Error("advanceVok2: requires Osk to be 'pex'");
  }
  return { ...world, vok: "dor" };
}

/**
 * rushZefFen: Zef and Fen: nim -> dor directly, skipping intermediate 'pex' state
 * Requires Tal === "pex" AND Osk === "pex"
 * This is a performance optimization that combines:
 *   - advanceZef1: Zef nim -> pex (requires Tal=pex)
 *   - advanceZef2: Zef pex -> dor (requires Tal=pex, Fen=pex)
 *   - advanceFen1: Fen nim -> pex (requires Osk=pex)
 *   - advanceFen2: Fen pex -> dor (requires Osk=pex, Zef=pex)
 * Into a single atomic operation.
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
