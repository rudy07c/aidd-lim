import { WorldState, ZefState } from "../world";

// advanceZef1: nim -> pex
export function advanceZef1(w: WorldState): WorldState {
  if (w.zef !== "nim") {
    throw new Error("advanceZef1: zef must be nim");
  }
  return { ...w, zef: "pex" };
}

// advanceZef2: pex -> dor
export function advanceZef2(w: WorldState): WorldState {
  if (w.zef !== "pex") {
    throw new Error("advanceZef2: zef must be pex");
  }
  return { ...w, zef: "dor" };
}
