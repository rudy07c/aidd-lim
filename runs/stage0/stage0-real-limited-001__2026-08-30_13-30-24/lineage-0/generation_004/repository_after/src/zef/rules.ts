import { WorldState } from "../world";

/**
 * advanceZef1 (= O3): Zef: nim -> pex, requires Tal to be 'pex'
 */
export function advanceZef1(w: WorldState): WorldState {
  if (w.zef !== "nim") {
    throw new Error("advanceZef1: Zef must be 'nim'");
  }
  if (w.tal !== "pex") {
    throw new Error("advanceZef1: Tal must be 'pex'");
  }
  return { ...w, zef: "pex" };
}

/**
 * advanceZef2 (= O4): Zef: pex -> dor, requires Tal to be 'pex'
 */
export function advanceZef2(w: WorldState): WorldState {
  if (w.zef !== "pex") {
    throw new Error("advanceZef2: Zef must be 'pex'");
  }
  if (w.tal !== "pex") {
    throw new Error("advanceZef2: Tal must be 'pex'");
  }
  return { ...w, zef: "dor" };
}

/**
 * resetZef: Reset Zef back to 'nim'
 */
export function resetZef(w: WorldState): WorldState {
  return { ...w, zef: "nim" };
}

/**
 * fastTrackZef: Force Zef to 'dor' directly
 */
export function fastTrackZef(w: WorldState): WorldState {
  if (w.zef !== "nim") {
    throw new Error("fastTrackZef: Zef must be 'nim'");
  }
  return { ...w, zef: "dor" };
}
