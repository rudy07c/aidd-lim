import { WorldState } from "../world";

export function advanceTal1(w: WorldState): WorldState {
  if (w.tal !== "nim") throw new Error("Tal is not in nim state");
  return { ...w, tal: "pex" };
}
