import { WorldState } from "../world";

/**
 * advanceVok1 (= O1): Vok: nim -> pex (no dependencies)
 */
export function advanceVok1(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error("advanceVok1: Vok must be in state 'nim'");
  }
  return { ...world, vok: "pex" };
}

/**
 * advanceVok2 (= O2): Vok: pex -> dor
 * (D1: O2 depends on E2, D2: O2 depends on E5)
 * requires Zef === "pex" AND Osk === "pex"
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
 * turboVokZef: Vok: pex -> dor AND Zef: pex -> dor simultaneously
 * Combines advanceVok2 and advanceZef2 requirements:
 * requires Vok="pex", Zef="pex", Osk="pex", Tal="pex", Fen="pex"
 */
export function turboVokZef(world: WorldState): WorldState {
  // Check Vok preconditions (from advanceVok2)
  if (world.vok !== "pex") {
    throw new Error("turboVokZef: Vok must be in state 'pex'");
  }
  if (world.zef !== "pex") {
    throw new Error("turboVokZef: Zef must be in state 'pex'");
  }
  if (world.osk !== "pex") {
    throw new Error("turboVokZef: requires Osk to be 'pex'");
  }
  // Check Zef preconditions (from advanceZef2)
  if (world.tal !== "pex") {
    throw new Error("turboVokZef: requires Tal to be 'pex'");
  }
  if (world.fen !== "pex") {
    throw new Error("turboVokZef: requires Fen to be 'pex'");
  }
  // Apply both transitions atomically
  return { ...world, vok: "dor", zef: "dor" };
}
