import { WorldState } from "../world";

/**
 * Advance Vok from nim to pex
 */
export function advanceVok1(w: WorldState): WorldState {
  if (w.vok !== "nim") {
    throw new Error("advanceVok1: Vok must be in nim state");
  }
  return { ...w, vok: "pex" };
}

/**
 * Advance Vok from pex to dor
 */
export function advanceVok2(w: WorldState): WorldState {
  if (w.vok !== "pex") {
    throw new Error("advanceVok2: Vok must be in pex state");
  }
  return { ...w, vok: "dor" };
}

/**
 * Reset Vok from pex back to nim
 */
export function resetVok(w: WorldState): WorldState {
  if (w.vok !== "pex") {
    throw new Error("resetVok: Vok must be in pex state");
  }
  return { ...w, vok: "nim" };
}
