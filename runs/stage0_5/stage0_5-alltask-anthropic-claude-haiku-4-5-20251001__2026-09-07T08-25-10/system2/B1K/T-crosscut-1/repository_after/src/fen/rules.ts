import { WorldState } from "../world";

export function advanceFen1(w: WorldState): WorldState {
  if (w.fen !== "nim") {
    throw new Error(`advanceFen1: expected fen=nim, got ${w.fen}`);
  }
  return { ...w, fen: "pex" };
}

export function advanceFen2(w: WorldState): WorldState {
  if (w.fen !== "pex") {
    throw new Error(`advanceFen2: expected fen=pex, got ${w.fen}`);
  }
  return { ...w, fen: "dor" };
}
