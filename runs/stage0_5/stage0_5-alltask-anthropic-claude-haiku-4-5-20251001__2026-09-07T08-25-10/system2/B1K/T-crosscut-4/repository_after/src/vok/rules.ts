// vok/rules.ts
import { WorldState } from "../world";

// Vok advancement rules
export function advanceVok1(w: WorldState): WorldState {
  if (w.vok !== "nim") throw new Error("Vok must be in nim state");
  return { ...w, vok: "pex" };
}

export function advanceVok2(w: WorldState): WorldState {
  if (w.vok !== "pex") throw new Error("Vok must be in pex state");
  return { ...w, vok: "dor" };
}

// Combined operation: advance both Fen and Zef from pex to dor
export function lockFenZef(w: WorldState): WorldState {
  if (w.fen !== "pex") throw new Error("Fen must be in pex state");
  if (w.zef !== "pex") throw new Error("Zef must be in pex state");
  return { ...w, fen: "dor", zef: "dor" };
}
