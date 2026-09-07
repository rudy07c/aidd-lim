import { WorldState } from "../world";

export function advanceVok1(w: WorldState): WorldState {
  if (w.vok !== "nim") {
    throw new Error(`advanceVok1: expected vok=nim, got ${w.vok}`);
  }
  return { ...w, vok: "pex" };
}

export function advanceVok2(w: WorldState): WorldState {
  if (w.vok !== "pex") {
    throw new Error(`advanceVok2: expected vok=pex, got ${w.vok}`);
  }
  return { ...w, vok: "dor" };
}
