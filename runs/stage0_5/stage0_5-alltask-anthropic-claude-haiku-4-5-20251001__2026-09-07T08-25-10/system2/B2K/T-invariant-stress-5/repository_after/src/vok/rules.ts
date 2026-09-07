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
 * advanceVok2 (= O2): Vok: pex -> dor
 * (D1: O2 depends on E2=Zef, D2: O2 depends on E5=Osk)
 * Requires Zef === "pex" AND Osk === "pex"
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
 * advanceVokSkip: Vok: pex -> dor (fast operation, no dependency checks)
 * Provides an alternative path to 'dor' state without requiring Zef and Osk preconditions
 */
export function advanceVokSkip(world: WorldState): WorldState {
  if (world.vok !== "pex") {
    throw new Error("advanceVokSkip: Vok must be in state 'pex'");
  }
  return { ...world, vok: "dor" };
}
