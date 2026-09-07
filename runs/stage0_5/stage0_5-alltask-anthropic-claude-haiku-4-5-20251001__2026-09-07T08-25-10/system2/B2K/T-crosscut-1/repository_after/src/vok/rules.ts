import { WorldState } from "../world";

/**
 * advanceVok1 (= O1): Vok: nim -> pex, no dependencies
 */
export function advanceVok1(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error("advanceVok1: Vok must be in state 'nim'");
  }
  return { ...world, vok: "pex" };
}

/**
 * advanceVok2 (= O2): Vok: pex -> dor, requires Zef === "pex" AND Osk === "pex"
 * (D1: O2 depends on E2, D2: O2 depends on E5)
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
 * kindleBoth: simultaneously advance both Zef and Tal from nim -> pex
 * This is a coordinated operation that advances both entities at once.
 */
export function kindleBoth(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("kindleBoth: Zef must be in state 'nim'");
  }
  if (world.tal !== "nim") {
    throw new Error("kindleBoth: Tal must be in state 'nim'");
  }
  return { ...world, zef: "pex", tal: "pex" };
}
