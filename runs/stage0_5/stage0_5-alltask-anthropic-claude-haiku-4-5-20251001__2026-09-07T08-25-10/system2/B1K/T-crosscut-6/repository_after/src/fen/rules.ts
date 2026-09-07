import { WorldState } from "../world";

export function advanceFen1(w: WorldState): WorldState {
  if (w.fen !== "nim") throw new Error("advanceFen1 requires fen to be 'nim'");
  return { ...w, fen: "pex" };
}

export function advanceFen2(w: WorldState): WorldState {
  if (w.fen !== "pex") throw new Error("advanceFen2 requires fen to be 'pex'");
  return { ...w, fen: "dor" };
}
