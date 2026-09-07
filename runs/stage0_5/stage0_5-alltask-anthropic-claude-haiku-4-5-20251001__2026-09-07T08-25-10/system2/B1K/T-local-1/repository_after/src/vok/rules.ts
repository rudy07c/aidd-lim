import { WorldState } from "../world";

export function advanceVok1(w: WorldState): WorldState {
  if (w.vok !== "nim") {
    throw new Error("advanceVok1 requires vok to be in 'nim' state");
  }
  return { ...w, vok: "pex" };
}

export function advanceVok2(w: WorldState): WorldState {
  if (w.vok !== "pex") {
    throw new Error("advanceVok2 requires vok to be in 'pex' state");
  }
  return { ...w, vok: "dor" };
}

export function forceAdvanceVok(w: WorldState): WorldState {
  if (w.vok !== "nim") {
    throw new Error("forceAdvanceVok requires vok to be in 'nim' state");
  }
  return { ...w, vok: "dor" };
}
