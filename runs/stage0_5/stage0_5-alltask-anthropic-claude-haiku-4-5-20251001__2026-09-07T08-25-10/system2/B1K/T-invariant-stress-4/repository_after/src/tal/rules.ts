import { WorldState, TalState } from "../world";

// advanceTal1: nim -> pex
export function advanceTal1(w: WorldState): WorldState {
  if (w.tal !== "nim") {
    throw new Error("advanceTal1: tal must be nim");
  }
  return { ...w, tal: "pex" };
}
