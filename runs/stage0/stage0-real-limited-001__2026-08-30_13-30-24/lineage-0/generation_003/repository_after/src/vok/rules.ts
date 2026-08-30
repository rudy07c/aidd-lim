import { WorldState } from "../world";

/**
 * advanceVok1 (= O1): Vok: nim -> pex, no preconditions
 */
export function advanceVok1(w: WorldState): WorldState {
  if (w.vok !== "nim") {
    throw new Error("advanceVok1 requires vok to be 'nim'");
  }
  return { ...w, vok: "pex" };
}

/**
 * advanceVok2 (= O2): Vok: pex -> dor, requires Zef to be 'pex'
 */
export function advanceVok2(w: WorldState): WorldState {
  if (w.vok !== "pex") {
    throw new Error("advanceVok2 requires vok to be 'pex'");
  }
  if (w.zef !== "pex") {
    throw new Error("advanceVok2 requires zef to be 'pex'");
  }
  return { ...w, vok: "dor" };
}

/**
 * forceAdvanceVok: Force advance Vok to next state regardless of preconditions
 */
export function forceAdvanceVok(w: WorldState): WorldState {
  let nextState: "pex" | "dor";
  if (w.vok === "nim") {
    nextState = "pex";
  } else if (w.vok === "pex") {
    nextState = "dor";
  } else {
    throw new Error("forceAdvanceVok: vok is already in final state 'dor'");
  }
  return { ...w, vok: nextState };
}
