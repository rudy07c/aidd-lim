import { WorldState } from "../world";

export function advanceOsk1(w: WorldState): WorldState {
  if (w.osk !== "nim") throw new Error("Osk is not in nim state");
  return { ...w, osk: "pex" };
}
