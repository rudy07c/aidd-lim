import { WorldState } from "../world";

/**
 * advanceVok1 (= O1): Vok: nim -> pex
 * Precondition: none
 */
export function advanceVok1(w: WorldState): WorldState {
  if (w.vok !== "nim") {
    throw new Error("advanceVok1: vok must be 'nim'");
  }
  return { ...w, vok: "pex" };
}

/**
 * advanceVok2 (= O2): Vok: pex -> dor
 * Precondition: Zef must be 'pex'
 */
export function advanceVok2(w: WorldState): WorldState {
  if (w.vok !== "pex") {
    throw new Error("advanceVok2: vok must be 'pex'");
  }
  if (w.zef !== "pex") {
    throw new Error("advanceVok2: zef must be 'pex'");
  }
  return { ...w, vok: "dor" };
}

/**
 * forceAdvanceVok: Vok: nim -> dor (in one step, bypassing all preconditions)
 * Precondition: Vok must be 'nim'
 */
export function forceAdvanceVok(w: WorldState): WorldState {
  if (w.vok !== "nim") {
    throw new Error("forceAdvanceVok: vok must be 'nim'");
  }
  return { ...w, vok: "dor" };
}
