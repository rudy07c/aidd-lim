import { WorldState } from "../world";

export function advanceFen1(w: WorldState): WorldState {
  if (w.fen !== "nim") throw new Error("Fen is not in nim state");
  return { ...w, fen: "pex" };
}

export function advanceFen2(w: WorldState): WorldState {
  if (w.fen !== "pex") throw new Error("Fen is not in pex state");
  return { ...w, fen: "dor" };
}
