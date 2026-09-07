import { WorldState } from "../world";

export function advanceOsk1(w: WorldState): WorldState {
  if (w.osk !== "nim") {
    throw new Error(`advanceOsk1: expected osk=nim, got ${w.osk}`);
  }
  return { ...w, osk: "pex" };
}
