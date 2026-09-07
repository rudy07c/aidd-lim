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
 * kindleBoth: Advance both Tal and Zef to 'pex' simultaneously.
 * Tal: nim -> pex (no preconditions)
 * Zef: nim -> pex (requires Tal === "pex", which is satisfied by advancing Tal first)
 */
export function kindleBoth(world: WorldState): WorldState {
  if (world.tal !== "nim") {
    throw new Error("kindleBoth: Tal must be in state 'nim'");
  }
  if (world.zef !== "nim") {
    throw new Error("kindleBoth: Zef must be in state 'nim'");
  }
  // Advance Tal first, then Zef (which now has Tal=pex as required)
  return { ...world, tal: "pex", zef: "pex" };
}
