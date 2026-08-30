import { WorldState } from "../world";

/**
 * advanceZef1 (= O2): Zef: nim -> pex, requires Tal='pex'
 */
export function advanceZef1(w: WorldState): WorldState {
  if (w.tal !== "pex") {
    throw new Error(`advanceZef1 requires tal='pex', but got tal='${w.tal}'`);
  }
  return { ...w, zef: "pex" };
}

/**
 * advanceZef2 (= O4): Zef: pex -> dor, requires Tal='pex'
 */
export function advanceZef2(w: WorldState): WorldState {
  if (w.tal !== "pex") {
    throw new Error(`advanceZef2 requires tal='pex', but got tal='${w.tal}'`);
  }
  return { ...w, zef: "dor" };
}

/**
 * fastTrackZef: Zef: nim -> dor (skip pex), requires Tal='pex'
 * Performance optimization: advances Zef directly to 'dor' without intermediate state
 */
export function fastTrackZef(w: WorldState): WorldState {
  if (w.tal !== "pex") {
    throw new Error(`fastTrackZef requires tal='pex', but got tal='${w.tal}'`);
  }
  if (w.zef !== "nim") {
    throw new Error(`fastTrackZef requires zef='nim', but got zef='${w.zef}'`);
  }
  return { ...w, zef: "dor" };
}

/**
 * resetZef (= reset operation for Zef): Zef: any -> nim
 */
export function resetZef(w: WorldState): WorldState {
  return { ...w, zef: "nim" };
}
