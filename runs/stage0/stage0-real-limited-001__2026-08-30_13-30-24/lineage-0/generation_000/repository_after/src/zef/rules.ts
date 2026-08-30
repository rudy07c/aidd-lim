import { WorldState } from "../world";

/**
 * advanceZef1 (= O3): Zef: nim -> pex
 * Precondition: Tal must be 'pex'
 */
export function advanceZef1(w: WorldState): WorldState {
  if (w.zef !== "nim") {
    throw new Error("advanceZef1: zef must be 'nim'");
  }
  if (w.tal !== "pex") {
    throw new Error("advanceZef1: tal must be 'pex'");
  }
  return { ...w, zef: "pex" };
}

/**
 * advanceZef2 (= O4): Zef: pex -> dor
 * Precondition: Tal must be 'pex'
 */
export function advanceZef2(w: WorldState): WorldState {
  if (w.zef !== "pex") {
    throw new Error("advanceZef2: zef must be 'pex'");
  }
  if (w.tal !== "pex") {
    throw new Error("advanceZef2: tal must be 'pex'");
  }
  return { ...w, zef: "dor" };
}
