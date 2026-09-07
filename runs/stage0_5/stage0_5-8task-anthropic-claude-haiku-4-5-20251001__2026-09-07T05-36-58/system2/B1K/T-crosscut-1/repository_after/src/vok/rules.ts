import { WorldState } from "../world";

export function advanceVok1(w: WorldState): WorldState {
  if (w.vok !== "nim") throw new Error("Vok is not in nim state");
  return { ...w, vok: "pex" };
}

export function advanceVok2(w: WorldState): WorldState {
  if (w.vok !== "pex") throw new Error("Vok is not in pex state");
  return { ...w, vok: "dor" };
}
