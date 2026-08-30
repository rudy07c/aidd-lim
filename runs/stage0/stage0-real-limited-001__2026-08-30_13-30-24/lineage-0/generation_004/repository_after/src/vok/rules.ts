import { WorldState } from "../world";

/**
 * advanceVok1 (= O1): Vok: nim -> pex, no preconditions
 */
export function advanceVok1(w: WorldState): WorldState {
  if (w.vok !== "nim") {
    throw new Error("advanceVok1: Vok must be 'nim'");
  }
  return { ...w, vok: "pex" };
}

/**
 * advanceVok2 (= O2): Vok: pex -> dor, requires Zef to be 'pex'
 */
export function advanceVok2(w: WorldState): WorldState {
  if (w.vok !== "pex") {
    throw new Error("advanceVok2: Vok must be 'pex'");
  }
  if (w.zef !== "pex") {
    throw new Error("advanceVok2: Zef must be 'pex'");
  }
  return { ...w, vok: "dor" };
}

/**
 * forceAdvanceVok: Vok: nim -> dor, no preconditions (forced operation)
 */
export function forceAdvanceVok(w: WorldState): WorldState {
  if (w.vok !== "nim") {
    throw new Error("forceAdvanceVok: Vok must be 'nim'");
  }
  return { ...w, vok: "dor" };
}
