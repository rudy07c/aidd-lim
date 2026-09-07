import { WorldState, VokState } from "../world";

// advanceVok1: nim -> pex
export function advanceVok1(w: WorldState): WorldState {
  if (w.vok !== "nim") {
    throw new Error("advanceVok1: vok must be nim");
  }
  return { ...w, vok: "pex" };
}

// advanceVok2: pex -> dor
export function advanceVok2(w: WorldState): WorldState {
  if (w.vok !== "pex") {
    throw new Error("advanceVok2: vok must be pex");
  }
  return { ...w, vok: "dor" };
}
