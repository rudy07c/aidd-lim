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
 * advanceTalOsk: Tal: nim -> pex AND Osk: nim -> pex simultaneously, no preconditions
 * This is a cross-entity operation that advances both Tal and Osk in a single transaction.
 */
export function advanceTalOsk(world: WorldState): WorldState {
  if (world.tal !== "nim") {
    throw new Error("advanceTalOsk: Tal must be in state 'nim'");
  }
  if (world.osk !== "nim") {
    throw new Error("advanceTalOsk: Osk must be in state 'nim'");
  }
  return { ...world, tal: "pex", osk: "pex" };
}
