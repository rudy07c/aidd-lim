import { WorldState } from "../world";

export function advanceFen1(w: WorldState): WorldState {
  if (w.fen !== "nim") {
    throw new Error(`advanceFen1: fen must be nim, got ${w.fen}`);
  }
  return { ...w, fen: "pex" };
}

export function advanceFen2(w: WorldState): WorldState {
  if (w.fen !== "pex") {
    throw new Error(`advanceFen2: fen must be pex, got ${w.fen}`);
  }
  return { ...w, fen: "dor" };
}

export function recoverFen(w: WorldState): WorldState {
  if (w.fen !== "dor") {
    throw new Error(`recoverFen: fen must be dor, got ${w.fen}`);
  }
  return { ...w, fen: "pex" };
}
