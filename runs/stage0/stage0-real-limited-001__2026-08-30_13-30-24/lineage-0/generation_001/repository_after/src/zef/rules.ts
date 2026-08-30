import { WorldState } from "../world";

/**
 * advanceZef1 (= O3): Zef: nim -> pex, requires Tal to be 'pex'
 */
export function advanceZef1(w: WorldState): WorldState {
  if (w.zef !== "nim") {
    throw new Error("advanceZef1 requires zef to be 'nim'");
  }
  if (w.tal !== "pex") {
    throw new Error("advanceZef1 requires tal to be 'pex'");
  }
  return { ...w, zef: "pex" };
}

/**
 * advanceZef2 (= O4): Zef: pex -> dor, requires Tal to be 'pex'
 */
export function advanceZef2(w: WorldState): WorldState {
  if (w.zef !== "pex") {
    throw new Error("advanceZef2 requires zef to be 'pex'");
  }
  if (w.tal !== "pex") {
    throw new Error("advanceZef2 requires tal to be 'pex'");
  }
  return { ...w, zef: "dor" };
}
