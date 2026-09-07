import { WorldState, FenState } from "../world";

// advanceFen1: nim -> pex
export function advanceFen1(w: WorldState): WorldState {
  if (w.fen !== "nim") {
    throw new Error("advanceFen1: fen must be nim");
  }
  return { ...w, fen: "pex" };
}

// advanceFen2: pex -> dor
export function advanceFen2(w: WorldState): WorldState {
  if (w.fen !== "pex") {
    throw new Error("advanceFen2: fen must be pex");
  }
  return { ...w, fen: "dor" };
}
