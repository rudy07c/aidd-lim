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
 * advanceVok2 (= O2): Vok: pex -> dor, requires Zef === "pex"
 * (D1: O2 depends on E2)
 */
export function advanceVok2(world: WorldState): WorldState {
  if (world.vok !== "pex") {
    throw new Error("advanceVok2: Vok must be in state 'pex'");
  }
  if (world.zef !== "pex") {
    throw new Error("advanceVok2: Zef must be in state 'pex'");
  }
  return { ...world, vok: "dor" };
}

/**
 * forceAdvanceVok: Vok: nim -> dor, bypassing intermediate pex state
 * Requires Zef === "pex" (same dependency as advanceVok2)
 */
export function forceAdvanceVok(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error("forceAdvanceVok: Vok must be in state 'nim'");
  }
  if (world.zef !== "pex") {
    throw new Error("forceAdvanceVok: Zef must be in state 'pex'");
  }
  return { ...world, vok: "dor" };
}

/**
 * kindleBoth: A combined operation that advances both Vok and Zef if conditions are met
 */
export function kindleBoth(world: WorldState): WorldState {
  if (world.vok !== "pex") {
    throw new Error("kindleBoth: Vok must be in state 'pex'");
  }
  if (world.zef !== "pex") {
    throw new Error("kindleBoth: Zef must be in state 'pex'");
  }
  if (world.tal !== "pex") {
    throw new Error("kindleBoth: Tal must be in state 'pex'");
  }
  return { ...world, vok: "dor", zef: "dor" };
}
