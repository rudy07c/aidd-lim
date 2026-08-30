import { WorldState } from "../world";

/**
 * advanceZef1 (= O2): Zef: nim -> pex
 * Precondition: Tal must be 'pex'
 */
export function advanceZef1(w: WorldState): WorldState {
  if (w.tal !== "pex") {
    throw new Error("advanceZef1 requires Tal to be 'pex'");
  }
  if (w.zef !== "nim") {
    throw new Error("advanceZef1 requires Zef to be 'nim'");
  }
  return { ...w, zef: "pex" };
}

/**
 * advanceZef2 (= O4): Zef: pex -> dor
 * Precondition: Tal must be 'pex'
 */
export function advanceZef2(w: WorldState): WorldState {
  if (w.tal !== "pex") {
    throw new Error("advanceZef2 requires Tal to be 'pex'");
  }
  if (w.zef !== "pex") {
    throw new Error("advanceZef2 requires Zef to be 'pex'");
  }
  return { ...w, zef: "dor" };
}

/**
 * resetZef: Zef: pex -> nim
 * Precondition: Zef must be 'pex'
 */
export function resetZef(w: WorldState): WorldState {
  if (w.zef !== "pex") {
    throw new Error("resetZef requires Zef to be 'pex'");
  }
  return { ...w, zef: "nim" };
}
