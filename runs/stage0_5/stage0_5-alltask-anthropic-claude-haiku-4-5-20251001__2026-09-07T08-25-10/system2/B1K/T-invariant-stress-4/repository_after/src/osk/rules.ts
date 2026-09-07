import { WorldState, OskState } from "../world";

// advanceOsk1: nim -> pex
export function advanceOsk1(w: WorldState): WorldState {
  if (w.osk !== "nim") {
    throw new Error("advanceOsk1: osk must be nim");
  }
  return { ...w, osk: "pex" };
}
